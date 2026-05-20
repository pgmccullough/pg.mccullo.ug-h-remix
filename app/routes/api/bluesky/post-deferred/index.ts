/**
 * Internal: cross-post an already-created local post to Bluesky.
 *
 * Why a separate endpoint? Bluesky's video encoder usually takes
 * 5-15 seconds and we can't fit that synchronously inside
 * /api/post/create on Vercel's 10s function budget. So when the
 * create endpoint sees a video, it fires a non-awaited request to
 * THIS endpoint and returns to the user immediately. This endpoint
 * gets its own fresh 10s budget for the upload + polling.
 *
 * Auth is via a shared secret in the `X-Internal-Token` header,
 * matched against `INTERNAL_API_TOKEN`. The token is set in Vercel
 * env vars; same value passed in via the originating fetch from
 * /api/post/create. If the env var is unset the endpoint refuses
 * the call — safer than a permanent 200.
 *
 * On success, writes blueskyUri/blueskyCid back onto the post doc
 * (same as the inline cross-post does today).
 */

import type { ActionFunctionArgs } from "react-router";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { postToBluesky, blueskyEnabled } from "~/utils/bluesky.server";
import { getObjectBytes } from "~/utils/s3.server";

const DOMAIN = "pg.mccullo.ug";
const MEDIA_BASE = `https://${DOMAIN}/api/media/`;

function mediaUrlsFromBucket(
  media: any,
  kind: "images" | "videos"
): string[] {
  const arr = media?.[kind];
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item: any) => {
      const url =
        typeof item === "string" ? item : item?.url || item?.file || item?.src;
      if (typeof url !== "string" || !url.length) return null;
      const trimmed = url.trim();
      if (/^https?:\/\//.test(trimmed)) return trimmed;
      if (trimmed.startsWith("/")) return `https://${DOMAIN}${trimmed}`;
      return `${MEDIA_BASE}${kind}/${trimmed}`;
    })
    .filter((u): u is string => typeof u === "string" && u.length > 0);
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
  if (!blueskyEnabled()) {
    return Response.json({ ok: true, skipped: "bluesky not configured" });
  }

  const form = await request.formData();
  const postId = form.get("postId")?.toString().trim();
  if (!postId || !ObjectId.isValid(postId)) {
    return Response.json({ error: "Missing or invalid postId" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const post = await db
    .collection("myPosts")
    .findOne({ _id: new ObjectId(postId) });
  if (!post) {
    return Response.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.privacy !== "Public") {
    return Response.json({ ok: true, skipped: "post not public" });
  }
  if (post.blueskyUri) {
    return Response.json({ ok: true, skipped: "already cross-posted" });
  }

  // Pre-fetch the first video's bytes via the S3 SDK (no HTTP hop
  // through our media proxy — see s3.server.ts:getObjectBytes).
  let videoSource: {
    bytes: Uint8Array;
    contentType: string;
    filename: string;
  } | undefined;
  const videoBasenames: string[] = Array.isArray(post.media?.videos)
    ? post.media.videos.filter((v: any) => typeof v === "string")
    : [];
  if (videoBasenames.length) {
    const first = videoBasenames[0];
    const ext = first.split(".").pop()?.toLowerCase() ?? "";
    const mimeByExt: Record<string, string> = {
      mp4: "video/mp4", mov: "video/quicktime",
      webm: "video/webm", m4v: "video/x-m4v",
    };
    const fetched = await getObjectBytes(`videos/${first}`);
    if (fetched) {
      videoSource = {
        bytes: fetched.bytes,
        contentType: fetched.contentType ?? mimeByExt[ext] ?? "video/mp4",
        filename: first,
      };
    }
  }

  const origin = new URL(request.url).origin;
  const result = await postToBluesky({
    text: post.content ?? "",
    permalinkUrl: `${origin}/h/post/${postId}`,
    imageUrls: mediaUrlsFromBucket(post.media, "images"),
    videoUrls: mediaUrlsFromBucket(post.media, "videos"),
    videoSource,
  });

  if (!result) {
    return Response.json({ error: "Bluesky cross-post failed" }, { status: 502 });
  }

  await db.collection("myPosts").updateOne(
    { _id: new ObjectId(postId) },
    { $set: { blueskyUri: result.uri, blueskyCid: result.cid } }
  );

  console.log(`[bluesky deferred] cross-posted ${postId} → ${result.uri}`);
  return Response.json({ ok: true, uri: result.uri, cid: result.cid });
};
