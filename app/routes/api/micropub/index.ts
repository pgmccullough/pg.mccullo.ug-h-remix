/**
 * Micropub endpoint — /api/micropub  (Phase 1: create only)
 *
 * Handles h-entry creates from IndieWeb Micropub clients (Quill,
 * Indigenous, iA Writer, micro.blog, etc.).
 *
 * GET  ?q=config → configuration document (syndicate-to, media-endpoint)
 * GET  ?q=source&url=<permalink> → 501 for Phase 1
 * POST → create h-entry, returns 201 with Location header
 * POST action=update|delete → 501 for Phase 1
 *
 * Auth: Bearer token issued by /api/indieauth/token.
 *
 * Spec: https://www.w3.org/TR/micropub/
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { clientPromise } from "~/lib/mongodb";
import {
  extractBearer,
  getToken,
  scopeIncludes,
  SITE_URL,
} from "~/utils/indieauth.server";
import {
  basenameFromMediaUrl,
  normalizeTag,
  parseMicropubBody,
} from "~/utils/micropub.server";
import { publishSideEffects } from "~/utils/post-publish.server";

function err(code: string, description: string, status = 400): Response {
  return Response.json(
    { error: code, error_description: description },
    { status }
  );
}

// ---------------------------------------------------------------------------
// GET — configuration + future source/syndication queries
// ---------------------------------------------------------------------------

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const token = extractBearer(request);
  const auth = await getToken(token ?? "");
  if (!auth) return err("unauthorized", "Missing or invalid bearer token", 401);

  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  if (q === "config") {
    return Response.json({
      // Media endpoint arrives in Phase 3; for Phase 1 the client is
      // expected to upload via /api/upload/presign then reference the
      // resulting URL in the Micropub `photo` property.
      "media-endpoint": null,
      // Syndication targets — clients can surface these as checkboxes.
      // Values match what a later `mp-syndicate-to` handler could use
      // to selectively fan out (currently we fan out to all by default).
      "syndicate-to": [
        {
          uid: "https://bsky.app/profile/mccullo.ug",
          name: "Bluesky (@mccullo.ug)",
        },
        {
          uid: "https://pg.mccullo.ug/users/patrick",
          name: "Fediverse followers",
        },
      ],
    });
  }

  if (q === "source") {
    return err(
      "not_implemented",
      "Source query is Phase 2",
      501
    );
  }

  if (q === "syndicate-to") {
    return Response.json({
      "syndicate-to": [
        {
          uid: "https://bsky.app/profile/mccullo.ug",
          name: "Bluesky (@mccullo.ug)",
        },
      ],
    });
  }

  return err("invalid_request", `Unknown q value: ${q ?? "(none)"}`);
};

// ---------------------------------------------------------------------------
// POST — create (Phase 1) / update / delete (both 501 for now)
// ---------------------------------------------------------------------------

export const action = async ({ request }: ActionFunctionArgs) => {
  const token = extractBearer(request);
  const auth = await getToken(token ?? "");
  if (!auth) return err("unauthorized", "Missing or invalid bearer token", 401);

  const parsed = await parseMicropubBody(request);

  if (parsed.errors?.length) {
    return err("invalid_request", parsed.errors.join("; "));
  }

  if (parsed.action === "update" || parsed.action === "delete") {
    return err(
      "not_implemented",
      `${parsed.action} is Phase 2 — not yet supported`,
      501
    );
  }

  if (parsed.action !== "create" || !parsed.entry) {
    return err("invalid_request", "Expected h-entry create");
  }

  if (!scopeIncludes(auth.scope, "create")) {
    return err(
      "insufficient_scope",
      "Token does not have `create` scope",
      403
    );
  }

  if (parsed.photoFiles?.length || parsed.videoFiles?.length) {
    // Phase 3 will handle multipart-uploaded media inline. For now,
    // reject rather than silently drop — clients should upload via
    // the (soon-to-exist) media endpoint or /api/upload/presign first.
    return err(
      "not_implemented",
      "Inline multipart uploads land in Phase 3. Upload to /api/upload/presign first, then send the resulting URL in `photo`.",
      501
    );
  }

  const entry = parsed.entry;
  const now = Math.floor(Date.now() / 1000);

  // Build the internal post shape. Match what /api/post/create
  // produces so downstream consumers (feed, permalink, federation)
  // see identical documents regardless of source.
  const post: any = {
    content: entry.contentHtml ?? "",
    created: entry.publishedSeconds ?? now,
    lastEdited: now,
    state: "published",
    privacy: entry.visibility === "private" ? "Self" : "Public",
    feedback: {
      commentsOn: true,
      sharesOn: true,
      likesOn: true,
      likes: [],
      shares: [],
      comments: [],
    },
    media: {
      audio: null,
      files: null,
      images: [] as string[],
      links: null,
      videos: [] as string[],
    },
  };

  // Category → tags (normalized to match LLM-generated ones)
  if (entry.category?.length) {
    const tags = entry.category
      .map((t) => normalizeTag(t))
      .filter((t): t is string => Boolean(t));
    if (tags.length) post.tags = tags;
  }

  // in-reply-to → inReplyTo (used by the reply-parent snippet
  // renderer + u-in-reply-to microformat).
  if (entry.inReplyTo) post.inReplyTo = entry.inReplyTo;

  // mp-slug → seoMeta.slug (canonical redirect will pick it up on
  // the permalink route; generate-seo-meta backfill respects it and
  // won't overwrite).
  if (entry.slug) {
    const cleaned = entry.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (cleaned) post.seoMeta = { slug: cleaned };
  }

  // photo URLs — extract basenames when they point at our own media
  // proxy (i.e., client uploaded via presign flow first). External
  // URLs get dropped for Phase 1 (see error above about multipart).
  for (const u of entry.photoUrls ?? []) {
    const base = basenameFromMediaUrl(u, "images");
    if (base) post.media.images.push(base);
  }

  // Empty media arrays would break some consumers. Match the shape
  // legacy posts have — null instead of empty array — when nothing
  // was attached.
  if (!post.media.images.length) post.media.images = null;
  if (!post.media.videos.length) post.media.videos = null;

  const client = await clientPromise;
  const db = client.db("user_posts");
  const result = await db.collection("myPosts").insertOne(post);
  const postId = result.insertedId.toString();

  // Fire all the standard downstream jobs (federation, Bluesky,
  // alt-gen, seo-meta backfill, webmention send) — same helper the
  // browser composer uses, so Micropub posts behave identically.
  const origin = new URL(request.url).origin;
  try {
    await publishSideEffects({ client, origin, postId, post });
  } catch (e) {
    // Never let a downstream failure fail the Micropub create — the
    // post is already in Mongo, we just log and move on. The client
    // needs the Location header to succeed.
    console.error("[micropub] side-effects failed:", e);
  }

  const permalink = post?.seoMeta?.slug
    ? `${SITE_URL}/h/post/${postId}/${encodeURIComponent(post.seoMeta.slug)}`
    : `${SITE_URL}/h/post/${postId}`;

  return new Response(null, {
    status: 201,
    headers: { Location: permalink },
  });
};
