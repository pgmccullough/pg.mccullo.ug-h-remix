import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { federatePostDelete } from "~/utils/federation-posts.server";
import { deleteBlueskyPost, blueskyEnabled } from "~/utils/bluesky.server";

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { postId } = params;
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return { postDeleted: false };
  }
  if (!postId || !ObjectId.isValid(postId)) {
    return { postDeleted: false };
  }

  const client = await clientPromise;
  const db = client.db("user_posts");

  let postDeleted;
  let wasPublic = false;
  let blueskyUri: string | undefined;
  try {
    // Read the post BEFORE deleting so we know whether to federate.
    const existing = await db
      .collection("myPosts")
      .findOne({ _id: new ObjectId(postId) });
    wasPublic = existing?.privacy === "Public";
    blueskyUri = existing?.blueskyUri;

    postDeleted = await db
      .collection("myPosts")
      .deleteOne({ _id: new ObjectId(postId) });
  } catch (err) {
    console.error("[post/delete] failed:", err);
    postDeleted = false;
  }

  // Tell followers' servers if the post was public. Fire-and-forget;
  // errors are logged but don't fail the user-facing delete.
  if (wasPublic) {
    try {
      const origin = new URL(request.url).origin;
      await federatePostDelete({ client, origin, postId });
    } catch (err) {
      console.error("[post/delete] federation failed:", err);
    }
  }

  // Also delete the Bluesky cross-post if we have one. Best-effort.
  if (blueskyUri && blueskyEnabled()) {
    try {
      const ok = await deleteBlueskyPost(blueskyUri);
      console.log(`[bluesky] delete ${blueskyUri}: ${ok ? "ok" : "failed"}`);
    } catch (err) {
      console.error("[bluesky] delete failed:", err);
    }
  }

  return { postDeleted };
};
