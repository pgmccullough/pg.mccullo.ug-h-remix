import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import {
  federatePostToFollowers,
  federatePostUpdate,
  federatePostDelete,
} from "~/utils/federation-posts.server";

export const action = async ({ params, request }: ActionFunctionArgs) => {
  const { postId } = params;
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return { privacyUpdated: false };
  }
  if (!postId || !ObjectId.isValid(postId)) {
    return { privacyUpdated: false };
  }

  const postData = await request.formData();
  const postPrivacyData = postData.get("privacy")?.toString();
  const commentsOnStr = postData.get("commentsOn")?.toString();
  const commentsOn =
    !commentsOnStr || commentsOnStr === "false" ? false : true;
  const likesOnStr = postData.get("likesOn")?.toString();
  const likesOn = !likesOnStr || likesOnStr === "false" ? false : true;
  const sharesOnStr = postData.get("sharesOn")?.toString();
  const sharesOn = !sharesOnStr || sharesOnStr === "false" ? false : true;
  const newContentRaw = postData.get("content");
  const newContent =
    newContentRaw !== null ? newContentRaw.toString() : null;

  const client = await clientPromise;
  const db = client.db("user_posts");

  let privacyUpdated;
  let federationAction: "update" | "delete" | "create" | "none" = "none";
  try {
    const existing = await db
      .collection("myPosts")
      .findOne({ _id: new ObjectId(postId) });
    if (!existing) return { privacyUpdated: false };

    const wasPublic = existing.privacy === "Public";
    const isPublic = postPrivacyData === "Public";
    const contentChanged =
      newContent !== null && newContent !== existing.content;

    const prevFeedback = existing.feedback ?? {};
    const nextFeedback = { ...prevFeedback, commentsOn, likesOn, sharesOn };

    const updates: Record<string, unknown> = {
      privacy: postPrivacyData,
      feedback: nextFeedback,
    };
    if (newContent !== null && newContent !== existing.content) {
      updates.content = newContent;
      updates.lastEdited = Math.floor(Date.now() / 1000);
    }

    privacyUpdated = await db
      .collection("myPosts")
      .updateOne({ _id: new ObjectId(postId) }, { $set: updates });

    // Decide what to tell followers.
    if (wasPublic && isPublic && contentChanged) {
      federationAction = "update";
    } else if (wasPublic && !isPublic) {
      federationAction = "delete";
    } else if (!wasPublic && isPublic) {
      federationAction = "create";
    }
  } catch (err) {
    console.error("[post/update] failed:", err);
    privacyUpdated = false;
  }

  // Fire-and-forget federation. Errors are logged but don't fail the
  // user-facing save.
  if (federationAction !== "none") {
    const origin = new URL(request.url).origin;
    try {
      if (federationAction === "update") {
        await federatePostUpdate({ client, origin, postId });
      } else if (federationAction === "delete") {
        await federatePostDelete({ client, origin, postId });
      } else if (federationAction === "create") {
        await federatePostToFollowers({ client, origin, postId });
      }
    } catch (err) {
      console.error(
        `[post/update] federation (${federationAction}) failed:`,
        err
      );
    }
  }

  return { privacyUpdated };
};
