/**
 * Internal: generate LLM alt text for every image on a post that
 * doesn't already have one, and persist to post.media.imageAlts.
 *
 * Same deferred pattern as /api/bluesky/post-deferred — fires from
 * /api/post/create so the user's create response isn't blocked by
 * OpenAI's 5-15s vision latency. Own function invocation, own budget.
 *
 * Auth: X-Internal-Token must match INTERNAL_API_TOKEN. If unset,
 * refuses (safer default).
 *
 * Idempotent + additive: existing alts on media.imageAlts are
 * respected; only missing entries get generated. Re-running the
 * endpoint is a cheap no-op.
 */

import type { ActionFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { generateAltText, openAiConfigured } from "~/utils/openai.server";

const MAX_IMAGES_PER_RUN = 6;

export const action = async ({ request }: ActionFunctionArgs) => {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) {
    return Response.json(
      { error: "INTERNAL_API_TOKEN not configured" },
      { status: 500 }
    );
  }
  const token = request.headers.get("x-internal-token") ?? "";
  if (token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!openAiConfigured()) {
    return Response.json({ ok: true, skipped: "OPENAI_API_KEY not configured" });
  }

  const form = await request.formData();
  const postId = form.get("postId")?.toString().trim();
  if (!postId || !ObjectId.isValid(postId)) {
    return Response.json({ error: "Missing or invalid postId" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection("myPosts");
  const post = await col.findOne({ _id: new ObjectId(postId) });
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });

  const images: any[] = Array.isArray(post.media?.images) ? post.media.images : [];
  if (images.length === 0) return Response.json({ ok: true, count: 0 });

  const origin = new URL(request.url).origin;
  const existing = (post.media?.imageAlts ?? {}) as Record<string, string>;

  // Only fetch alt text for images that don't already have one, and
  // bound the fan-out so a post with dozens of images doesn't burn
  // the function budget. Any leftovers will be picked up on a future
  // manual re-run (or we could add a small backfill cron later).
  const targets: string[] = [];
  for (const item of images) {
    const filename = typeof item === "string" ? item : item?.url || item?.file;
    if (typeof filename !== "string" || !filename.length) continue;
    if (existing[filename]) continue;
    targets.push(filename);
    if (targets.length >= MAX_IMAGES_PER_RUN) break;
  }

  if (targets.length === 0) {
    return Response.json({ ok: true, count: 0, note: "all already alt-ed" });
  }

  // Fire vision calls in parallel — OpenAI can handle it and it keeps
  // wall-clock down. Any single failure is null and we skip the write.
  const results = await Promise.allSettled(
    targets.map(async (filename) => {
      const url = /^https?:\/\//.test(filename)
        ? filename
        : `${origin}/api/media/images/${filename}`;
      const alt = await generateAltText({ imageUrl: url, timeoutMs: 20000 });
      return { filename, alt };
    })
  );

  const newAlts: Record<string, string> = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.alt) {
      newAlts[r.value.filename] = r.value.alt;
    }
  }

  const written = Object.keys(newAlts).length;
  if (written > 0) {
    // Mongo $set on a nested object merges non-destructively at the
    // field level via a build-and-set approach.
    const setDoc: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...existing, ...newAlts })) {
      setDoc[`media.imageAlts.${k}`] = v;
    }
    await col.updateOne({ _id: new ObjectId(postId) }, { $set: setDoc });
  }

  console.log(`[alt-gen] post ${postId}: generated ${written}/${targets.length}`);
  return Response.json({
    ok: true,
    attempted: targets.length,
    written,
  });
};
