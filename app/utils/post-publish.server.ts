/**
 * Shared publish side-effects — fires everything that has to happen
 * after a public, published post lands in Mongo.
 *
 * Callers today:
 *   - /api/post/create        (browser composer)
 *   - /api/micropub           (IndieWeb clients)
 *
 * What we do:
 *   1. Federate to Mastodon followers via ActivityPub (await; needs
 *      to run inside the request budget so signed HTTP sigs happen).
 *   2. Fire-and-forget deferred kickoffs (alt-gen, seo-meta, wm-send).
 *      Each gets its own function invocation via an internal HTTP
 *      hop so we don't spend budget on OpenAI + link discovery here.
 *   3. Cross-post to Bluesky. Inline for image-only posts (fast);
 *      deferred to another function for video posts (slow encode).
 *
 * Refactored out of /api/post/create so both create surfaces produce
 * identical downstream behavior — one code path, one place to fix
 * bugs.
 */

import type { MongoClient } from "mongodb";
import { ObjectId } from "~/lib/mongodb";
import { federatePostToFollowers } from "~/utils/federation-posts.server";
import { blueskyEnabled, postToBluesky } from "~/utils/bluesky.server";

const DOMAIN = "pg.mccullo.ug";
const MEDIA_BASE = `https://${DOMAIN}/api/media/`;

/**
 * Build absolute URLs from a post's media bucket, matching how the
 * <Image>/<Video> components render on-site. Handles legacy formats
 * (plain filenames, wrapped objects, already-absolute URLs).
 */
function mediaUrlsFromBucket(
  media: any,
  kind: "images" | "videos"
): string[] {
  const arr = media?.[kind];
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item: any) => {
      const url =
        typeof item === "string"
          ? item
          : item?.url || item?.file || item?.src;
      if (typeof url !== "string" || !url.length) return null;
      const trimmed = url.trim();
      if (/^https?:\/\//.test(trimmed)) return trimmed;
      if (trimmed.startsWith("/")) return `https://${DOMAIN}${trimmed}`;
      return `${MEDIA_BASE}${kind}/${trimmed}`;
    })
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

export interface PublishSideEffectsArgs {
  client: MongoClient;
  origin: string;
  postId: string;
  post: any;
}

export async function publishSideEffects(
  args: PublishSideEffectsArgs
): Promise<void> {
  const { client, origin, postId, post } = args;

  // Guardrails — non-public / non-published posts never fan out.
  if (post?.privacy !== "Public") return;
  if (post?.state && post.state !== "published") return;

  // 1. Federate to Mastodon followers.
  try {
    await federatePostToFollowers({ client, origin, postId });
  } catch (err) {
    console.error("[federation] post-publish federation failed:", err);
  }

  const internalToken = process.env.INTERNAL_API_TOKEN;
  const hasImages =
    Array.isArray(post.media?.images) && post.media.images.length > 0;
  const hasVideo =
    Array.isArray(post.media?.videos) && post.media.videos.length > 0;
  const body = `postId=${encodeURIComponent(postId)}`;

  // 2. Fire-and-forget LLM + webmention kickoffs.
  if (internalToken) {
    if (hasImages) {
      void fetch(`${origin}/api/media/generate-alts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Internal-Token": internalToken,
        },
        body,
      }).catch((err) => {
        console.error("[alt-gen] deferred kickoff failed:", err);
      });
    }
    void fetch(`${origin}/api/post/generate-seo-meta`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Internal-Token": internalToken,
      },
      body,
    }).catch((err) => {
      console.error("[seo-meta] deferred kickoff failed:", err);
    });
    void fetch(`${origin}/api/webmention/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Internal-Token": internalToken,
      },
      body,
    }).catch((err) => {
      console.error("[webmention] send kickoff failed:", err);
    });
  }

  // 3. Bluesky cross-post.
  if (blueskyEnabled()) {
    if (hasVideo) {
      // Video encoding routinely blows past Vercel's 10s budget;
      // hand off to a dedicated function so it has its own budget.
      if (internalToken) {
        void fetch(`${origin}/api/bluesky/post-deferred`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Internal-Token": internalToken,
          },
          body,
        }).catch((err) => {
          console.error("[bluesky] deferred kickoff failed:", err);
        });
      } else {
        console.warn(
          "[bluesky] post has video but INTERNAL_API_TOKEN is not set — skipping deferred cross-post"
        );
      }
    } else {
      // No video — the inline path is fast enough to stay within
      // budget and avoids a needless second function invocation.
      try {
        const result = await postToBluesky({
          text: post.content ?? "",
          permalinkUrl: `${origin}/h/post/${postId}`,
          imageUrls: mediaUrlsFromBucket(post.media, "images"),
        });
        if (result) {
          await client
            .db("user_posts")
            .collection("myPosts")
            .updateOne(
              { _id: new ObjectId(postId) },
              { $set: { blueskyUri: result.uri, blueskyCid: result.cid } }
            );
          console.log(`[bluesky] cross-posted ${postId} → ${result.uri}`);
        }
      } catch (err) {
        console.error("[bluesky] cross-post failed:", err);
      }
    }
  }
}
