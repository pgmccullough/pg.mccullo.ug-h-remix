import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { federatePostToFollowers } from "~/utils/federation-posts.server";
import { postToBluesky, blueskyEnabled } from "~/utils/bluesky.server";
import { getObjectBytes } from "~/utils/s3.server";

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
        try {
          // For videos, read the bytes straight from S3 with the SDK
          // instead of letting postToBluesky go back through our own
          // /api/media/... proxy. That round-trip cost ~3s on Vercel
          // and was the proximate cause of post-create timeouts.
          let videoSource: {
            bytes: Uint8Array;
            contentType: string;
            filename: string;
          } | undefined;
          const videoBasenames: string[] = Array.isArray(newPost.media?.videos)
            ? newPost.media.videos.filter((v: any) => typeof v === "string")
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
                contentType:
                  fetched.contentType ?? mimeByExt[ext] ?? "video/mp4",
                filename: first,
              };
            }
          }

          const result = await postToBluesky({
            text: newPost.content ?? "",
            permalinkUrl: `${origin}/h/post/${postId}`,
            imageUrls: mediaUrlsFromBucket(newPost.media, "images"),
            // Pre-fetched bytes preferred; videoUrls left in as fallback.
            videoUrls: mediaUrlsFromBucket(newPost.media, "videos"),
            videoSource,
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

  return { newPost, insertedPost };
};
