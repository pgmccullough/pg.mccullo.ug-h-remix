import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { federatePostToFollowers } from "~/utils/federation-posts.server";
import { postToBluesky, blueskyEnabled } from "~/utils/bluesky.server";

const DOMAIN = "pg.mccullo.ug";
const MEDIA_BASE = `https://${DOMAIN}/api/media/`;

/**
 * Build absolute URLs from a post's media bucket (images, videos, ...),
 * matching the way each <Media> component renders them on the site
 * (`/api/media/<kind>/<file>`).
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
  const user = await getUser(request);
  const postFormData = await request.formData();
  const newPostString = postFormData.get("newPost")?.toString() || null;
  const newPost = JSON.parse(newPostString!);
  let insertedPost;
  newPost.created = Math.floor(Date.now() / 1000);
  newPost.lastEdited = Math.floor(Date.now() / 1000);
  delete newPost._id;

  if (user?.role === "administrator") {
    const client = await clientPromise;
    const db = client.db("user_posts");
    insertedPost = await db.collection("myPosts").insertOne(newPost);

    if (newPost.privacy === "Public" && insertedPost.insertedId) {
      const origin = new URL(request.url).origin;
      const postId = insertedPost.insertedId.toString();

      // Federate to Mastodon followers.
      try {
        await federatePostToFollowers({ client, origin, postId });
      } catch (err) {
        console.error("[federation] post-create federation failed:", err);
      }

      // Cross-post to Bluesky (if credentials are set). Best-effort —
      // failures don't fail the user-facing save. Store the at:// URI on
      // the post doc so future delete/edit ops can also touch Bluesky.
      if (blueskyEnabled()) {
        const hasVideo = Array.isArray(newPost.media?.videos)
          && newPost.media.videos.length > 0;

        if (hasVideo) {
          // Bluesky's video encoder routinely runs past Vercel's 10s
          // function budget. Hand off to a separate function instance
          // so the upload + encode polling gets its own fresh budget,
          // and return to the user immediately. Fire-and-forget — we
          // can't await it without re-introducing the timeout.
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
            }).catch((err) => {
              console.error("[bluesky] deferred kickoff failed:", err);
            });
          } else {
            console.warn(
              "[bluesky] post has video but INTERNAL_API_TOKEN is not set — skipping deferred cross-post"
            );
          }
        } else {
          // No video — keep the existing inline cross-post path. Fast
          // enough to stay within budget and avoids a needless second
          // function invocation.
          try {
            const result = await postToBluesky({
              text: newPost.content ?? "",
              permalinkUrl: `${origin}/h/post/${postId}`,
              imageUrls: mediaUrlsFromBucket(newPost.media, "images"),
            });
            if (result) {
              await db
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
  }

  return { newPost, insertedPost };
};
