import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { federatePostToFollowers } from "~/utils/federation-posts.server";

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

    // Federate to followers if the post is Public. We await this so
    // delivery actually starts before the response goes out — but
    // federatePostToFollowers uses Promise.allSettled internally so one
    // slow follower won't block the others. We don't surface failures to
    // the client; they're logged for the operator to see in Vercel logs.
    if (newPost.privacy === "Public" && insertedPost.insertedId) {
      const origin = new URL(request.url).origin;
      try {
        await federatePostToFollowers({
          client,
          origin,
          postId: insertedPost.insertedId.toString(),
        });
      } catch (err) {
        console.error("[federation] post-create federation failed:", err);
      }
    }
  }

  return { newPost, insertedPost };
};
