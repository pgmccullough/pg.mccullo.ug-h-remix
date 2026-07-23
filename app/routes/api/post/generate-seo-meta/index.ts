/**
 * Internal: generate LLM slug + meta description for a post that
 * doesn't have them yet, and persist to post.seoMeta.
 *
 * Fires from:
 *   1. /api/post/create after publish (new posts get slug immediately)
 *   2. /h/post/:id loader when any visitor lands on an older post
 *      that lacks seoMeta (invisible backfill)
 *
 * Slugs are IDEMPOTENT — once set, we never overwrite. Regenerating
 * would change the URL and break existing shares / backlinks. Same
 * rule for description (keep the original wording once written).
 *
 * Auth: X-Internal-Token header. Never called from client JS.
 */

import type { ActionFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { generateSeoMeta, openAiConfigured } from "~/utils/openai.server";

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

  const existing = (post.seoMeta ?? {}) as { slug?: string; description?: string };
  const needsSlug = !existing.slug;
  const needsDesc = !existing.description;
  if (!needsSlug && !needsDesc) {
    return Response.json({ ok: true, skipped: "already generated" });
  }

  const text = stripHtml(String(post.content ?? ""));
  if (!text) {
    return Response.json({ ok: true, skipped: "empty content" });
  }

  const generated = await generateSeoMeta({ content: text, timeoutMs: 20000 });
  if (!generated) {
    return Response.json({ ok: false, error: "generation failed" });
  }

  const merged = {
    // Never overwrite an existing slug — idempotent for URL stability.
    slug: existing.slug ?? generated.slug,
    // Same for description (edits could refresh, but by default keep).
    description: existing.description ?? generated.description,
  };

  await col.updateOne(
    { _id: new ObjectId(postId) },
    { $set: { seoMeta: merged } }
  );

  console.log(`[seo-meta] post ${postId}: slug="${merged.slug}"`);
  return Response.json({ ok: true, seoMeta: merged });
};
