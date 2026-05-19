import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

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
  // Only treat content as "submitted" if the form actually included the
  // field — distinguish "no field" from "empty string".
  const newContent =
    newContentRaw !== null ? newContentRaw.toString() : null;

  const client = await clientPromise;
  const db = client.db("user_posts");

  let privacyUpdated;
  try {
    const existing = await db
      .collection("myPosts")
      .findOne({ _id: new ObjectId(postId) });
    if (!existing) return { privacyUpdated: false };

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
  } catch (err) {
    console.error("[post/update] failed:", err);
    privacyUpdated = false;
  }
  return { privacyUpdated };
};
