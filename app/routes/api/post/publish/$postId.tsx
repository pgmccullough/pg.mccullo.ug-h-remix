/**
 * Publish a draft or scheduled post now.
 *
 * Two entry points share this endpoint:
 *   1. Admin action from /h/drafts ("Publish now" button) — cookie auth.
 *   2. Cron worker (/api/cron/publish-scheduled) — bearer token auth,
 *      posts here internally when a scheduled post's time arrives.
 *
 * The state flips to "published", scheduledFor is cleared, `created`
 * bumps to now (so it lands at the top of the feed as if written now),
 * and the full federation + Bluesky cross-post pipeline fires as it
 * would on a fresh /api/post/create.
 */

import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { federatePostToFollowers } from "~/utils/federation-posts.server";
import { postToBluesky, blueskyEnabled } from "~/utils/bluesky.server";

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

export const action = async ({ request, params }: ActionFunctionArgs) => {
  // Two auth modes: admin cookie OR internal token (used by the cron
  // publisher). The internal token comes from the same env var as the
  // Bluesky-deferred flow.
  const bearer = request.headers.get("x-internal-token") ?? "";
  const isInternal =
    !!bearer && bearer === (process.env.INTERNAL_API_TOKEN ?? "");
  if (!isInternal) {
    const user = await getUser(request);
    if (user?.role !== "administrator") {
      return Response.json({ error: "Admin only." }, { status: 403 });
    }
  }

  const { postId } = params;
  if (!postId || !ObjectId.isValid(postId)) {
    return Response.json({ error: "Invalid postId" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");
  const col = db.collection("myPosts");

  const existing = await col.findOne({ _id: new ObjectId(postId) });
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.state === "published") {
    return Response.json({ ok: true, alreadyPublished: true });
  }

  const now = Math.floor(Date.now() / 1000);
  await col.updateOne(
    { _id: new ObjectId(postId) },
    {
      $set: {
        state: "published",
        created: now,
        lastEdited: now,
      },
      $unset: { scheduledFor: "" },
    }
  );

  const federatable = existing.privacy === "Public";
  if (!federatable) {
    return Response.json({ ok: true, published: true, federated: false });
  }

  const origin = new URL(request.url).origin;
  try {
    await federatePostToFollowers({ client, origin, postId });
  } catch (err) {
    console.error("[publish] Mastodon federation failed:", err);
  }

  // Bluesky cross-post — reuse the same fast-path as /api/post/create:
  // video posts get deferred, everything else goes inline.
  if (blueskyEnabled()) {
    // Re-read to get the freshly-persisted fields.
    const fresh = await col.findOne({ _id: new ObjectId(postId) });
    const hasVideo = Array.isArray(fresh?.media?.videos) && fresh!.media!.videos.length > 0;
    if (hasVideo) {
      const internalToken = process.env.INTERNAL_API_TOKEN;
      if (internalToken) {
        const body = `postId=${encodeURIComponent(postId)}`;
        void fetch(`${origin}/api/bluesky/post-deferred`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Internal-Token": internalToken,
          },
          body,
        }).catch((err) => console.error("[publish] deferred bsky kickoff failed:", err));
      }
    } else {
      try {
        const result = await postToBluesky({
          text: fresh?.content ?? "",
          permalinkUrl: `${origin}/h/post/${postId}`,
          imageUrls: mediaUrlsFromBucket(fresh?.media, "images"),
        });
        if (result) {
          await col.updateOne(
            { _id: new ObjectId(postId) },
            { $set: { blueskyUri: result.uri, blueskyCid: result.cid } }
          );
        }
      } catch (err) {
        console.error("[publish] Bluesky cross-post failed:", err);
      }
    }
  }

  return Response.json({ ok: true, published: true, federated: true });
};
