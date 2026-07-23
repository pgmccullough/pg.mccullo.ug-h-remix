import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { publishSideEffects } from "~/utils/post-publish.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  const postFormData = await request.formData();
  const newPostString = postFormData.get("newPost")?.toString() || null;
  const newPost = JSON.parse(newPostString!);
  let insertedPost;
  newPost.created = Math.floor(Date.now() / 1000);
  newPost.lastEdited = Math.floor(Date.now() / 1000);
  delete newPost._id;

  // Normalize the state field. Legacy posts (no state) are treated as
  // "published" for backward compat. New posts default to "published"
  // unless the client explicitly asks for draft or scheduled.
  const rawState = typeof newPost.state === "string" ? newPost.state : "published";
  const state: "draft" | "scheduled" | "published" =
    rawState === "draft" || rawState === "scheduled" ? rawState : "published";
  newPost.state = state;
  // If it's marked scheduled but the time has already passed, promote
  // it straight to published — no reason to wait for the next cron.
  if (state === "scheduled") {
    const scheduledFor = Number(newPost.scheduledFor);
    if (!Number.isFinite(scheduledFor)) {
      newPost.state = "draft";
      delete newPost.scheduledFor;
    } else if (scheduledFor <= Math.floor(Date.now() / 1000)) {
      newPost.state = "published";
      delete newPost.scheduledFor;
    }
  } else {
    // Drop scheduledFor for anything that isn't scheduled.
    delete newPost.scheduledFor;
  }

  if (user?.role === "administrator") {
    const client = await clientPromise;
    const db = client.db("user_posts");
    insertedPost = await db.collection("myPosts").insertOne(newPost);

    if (insertedPost.insertedId) {
      const origin = new URL(request.url).origin;
      const postId = insertedPost.insertedId.toString();
      // Federation, Bluesky cross-post, alt-gen, seo-meta, webmention
      // send — all handled by the shared helper so /api/micropub can
      // reuse the same downstream behavior.
      await publishSideEffects({ client, origin, postId, post: newPost });
    }
  }

  return { newPost, insertedPost };
};
