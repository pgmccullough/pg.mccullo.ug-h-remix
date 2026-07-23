/**
 * Internal: send outgoing webmentions for a just-published post.
 *
 * Fires from /api/post/create after a public post is inserted. Parses
 * the post's HTML for external <a href="https://...">, discovers each
 * target's webmention endpoint per W3C spec, POSTs source + target.
 *
 * Auth: X-Internal-Token (never called from client JS).
 * Fire-and-forget from the caller — own function budget.
 */

import type { ActionFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import {
  discoverWebmentionEndpoint,
  extractExternalLinks,
  sendWebmention,
} from "~/utils/webmention.server";

const MAX_LINKS_PER_POST = 12;

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

  const form = await request.formData();
  const postId = form.get("postId")?.toString().trim();
  if (!postId || !ObjectId.isValid(postId)) {
    return Response.json({ error: "Invalid postId" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const post = await db
    .collection("myPosts")
    .findOne({ _id: new ObjectId(postId) });
  if (!post) return Response.json({ error: "Post not found" }, { status: 404 });
  if (post.privacy !== "Public") {
    return Response.json({ ok: true, skipped: "not public" });
  }
  if (post.state && post.state !== "published") {
    return Response.json({ ok: true, skipped: "not published" });
  }

  const origin = new URL(request.url).origin;
  const slug = (post as any)?.seoMeta?.slug;
  const source = slug
    ? `${origin}/h/post/${postId}/${encodeURIComponent(slug)}`
    : `${origin}/h/post/${postId}`;

  const content = String(post.content ?? "");
  const links = extractExternalLinks(content, origin).slice(0, MAX_LINKS_PER_POST);
  if (links.length === 0) {
    return Response.json({ ok: true, sent: 0 });
  }

  const results: Array<{ target: string; delivered: boolean; endpoint?: string }> = [];
  await Promise.allSettled(
    links.map(async (target) => {
      const endpoint = await discoverWebmentionEndpoint(target);
      if (!endpoint) {
        results.push({ target, delivered: false });
        return;
      }
      const ok = await sendWebmention({ endpoint, source, target });
      results.push({ target, delivered: ok, endpoint });
    })
  );

  const delivered = results.filter((r) => r.delivered).length;
  console.log(
    `[webmention/send] post ${postId}: ${delivered}/${links.length} delivered`
  );
  return Response.json({ ok: true, attempted: links.length, delivered, results });
};
