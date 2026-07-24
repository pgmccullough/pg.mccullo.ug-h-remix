/**
 * Internal: generate a semantic embedding for a post that lacks one,
 * and persist to post.embedding (float[512], L2-normalized).
 *
 * Fires from:
 *   1. publishSideEffects after publish (new posts get their vector
 *      as part of the standard downstream fan-out).
 *   2. /h/post/:id loader when any visitor lands on an older post
 *      that hasn't been backfilled yet (invisible backfill).
 *
 * Embedding is IDEMPOTENT with respect to the "does this post have
 * an embedding at all" check — we don't overwrite existing vectors
 * on every backfill run. Content edits can trigger a refresh by
 * $unset-ing post.embedding manually or via a future refresh path.
 *
 * Auth: X-Internal-Token header. Never called from client JS.
 */

import type { ActionFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import {
  EMBEDDING_DIMENSIONS,
  generateEmbedding,
  openAiConfigured,
} from "~/utils/openai.server";

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

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
    return Response.json({
      ok: true,
      skipped: "OPENAI_API_KEY not configured",
    });
  }

  const form = await request.formData();
  const postId = form.get("postId")?.toString().trim();
  if (!postId || !ObjectId.isValid(postId)) {
    return Response.json(
      { error: "Missing or invalid postId" },
      { status: 400 }
    );
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection("myPosts");
  const post = await col.findOne({ _id: new ObjectId(postId) });
  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }

  // Idempotency check: skip if a properly-sized embedding is already
  // there. A malformed cached embedding (wrong dims) re-generates.
  const existing = (post as any).embedding;
  if (
    Array.isArray(existing) &&
    existing.length === EMBEDDING_DIMENSIONS
  ) {
    return Response.json({ ok: true, skipped: "already embedded" });
  }

  const text = stripHtml(String(post.content ?? ""));
  if (!text) {
    return Response.json({ ok: true, skipped: "empty content" });
  }

  // Enrich the embedding input with tags — those are curated topical
  // labels and pull the vector toward the right semantic neighborhood.
  const tags: string[] = Array.isArray((post as any).tags)
    ? (post as any).tags
    : [];
  const input = tags.length ? `${text}\n\nTags: ${tags.join(", ")}` : text;

  const embedding = await generateEmbedding({
    content: input,
    timeoutMs: 20000,
  });
  if (!embedding) {
    return Response.json({ ok: false, error: "generation failed" });
  }

  await col.updateOne(
    { _id: new ObjectId(postId) },
    { $set: { embedding } }
  );

  console.log(`[embedding] post ${postId}: ${embedding.length} dims stored`);
  return Response.json({ ok: true, dimensions: embedding.length });
};
