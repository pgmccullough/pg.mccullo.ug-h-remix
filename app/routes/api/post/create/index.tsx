import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { federatePostToFollowers } from "~/utils/federation-posts.server";
import { postToBluesky, blueskyEnabled } from "~/utils/bluesky.server";

const DOMAIN = "pg.mccullo.ug";
const MEDIA_BASE = `https://${DOMAIN}/api/media/`;

/**
 * Build absolute image URLs from a post's media object, matching the way
 * the <Image> component renders them on the site (`/api/media/images/<file>`).
 */
function imageUrlsFromMedia(media: any): string[] {
  const images = media?.images;
  if (!Array.isArray(images)) return [];
  return images
    .map((item: any) => {
      const url =
        typeof item === "string" ? item : item?.url || item?.file || item?.src;
      if (typeof url !== "string" || !url.length) return null;
      const trimmed = url.trim();
      if (/^https?:\/\//.test(trimmed)) return trimmed;
      if (trimmed.startsWith("/")) return `https://${DOMAIN}${trimmed}`;
      return `${MEDIA_BASE}images/${trimmed}`;
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
          const result = await postToBluesky({
            text: newPost.content ?? "",
            permalinkUrl: `${origin}/h/post/${postId}`,
            imageUrls: imageUrlsFromMedia(newPost.media),
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
