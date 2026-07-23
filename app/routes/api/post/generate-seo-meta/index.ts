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
  const existingTags: string[] = Array.isArray((post as any).tags)
    ? (post as any).tags
    : [];
  const needsSlug = !existing.slug;
  const needsDesc = !existing.description;
  const needsTags = existingTags.length === 0;
  if (!needsSlug && !needsDesc && !needsTags) {
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

  const mergedMeta = {
    // Never overwrite an existing slug — idempotent for URL stability.
    slug: existing.slug ?? generated.slug,
    // Same for description (edits could refresh, but by default keep).
    description: existing.description ?? generated.description,
  };
  // Tags follow the same idempotent rule: once an author-visible tag
  // set exists, don't clobber it with fresh LLM output on next backfill.
  const mergedTags = needsTags ? generated.tags : existingTags;

  const setFields: Record<string, unknown> = { seoMeta: mergedMeta };
  if (needsTags && mergedTags.length > 0) {
    setFields.tags = mergedTags;
  }

  await col.updateOne(
    { _id: new ObjectId(postId) },
    { $set: setFields }
  );

  console.log(
    `[seo-meta] post ${postId}: slug="${mergedMeta.slug}", tags=[${mergedTags.join(",")}]`
  );
  return Response.json({ ok: true, seoMeta: mergedMeta, tags: mergedTags });
};
