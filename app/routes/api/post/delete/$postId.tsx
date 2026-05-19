import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { federatePostDelete } from "~/utils/federation-posts.server";

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
  try {
    // Read the post BEFORE deleting so we know whether to federate.
    const existing = await db
      .collection("myPosts")
      .findOne({ _id: new ObjectId(postId) });
    wasPublic = existing?.privacy === "Public";

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

  return { postDeleted };
};
