import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import type { CommentI } from "~/components/Comments/Comments";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Auth: must be signed in. Only the comment's author or an administrator
  // may delete.
  const user = await getUser(request);
  if (!user?.id) {
    return Response.json({ error: "You must be signed in." }, { status: 401 });
  }

  const form = await request.formData();
  const commentId = form.get("commentId")?.toString();
  const postId = form.get("postId")?.toString();

  if (!commentId) {
    return Response.json({ error: "Missing commentId." }, { status: 400 });
  }
  if (!postId || !ObjectId.isValid(postId)) {
    return Response.json({ error: "Invalid post." }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");

  const post = await db
    .collection("myPosts")
    .findOne({ _id: new ObjectId(postId) });
  if (!post) {
    return Response.json({ error: "Post not found." }, { status: 404 });
  }

  const prevFeedback = post.feedback ?? {};
  const prevComments: CommentI[] = prevFeedback.comments ?? [];

  const target = prevComments.find((c) => c.id === commentId);
  if (!target) {
    return Response.json({ error: "Comment not found." }, { status: 404 });
  }

  const isAuthor = String(target.userId) === String(user.id);
  const isAdmin = user.role === "administrator";
  if (!isAuthor && !isAdmin) {
    return Response.json({ error: "You can only delete your own comments." }, { status: 403 });
  }

  // Also remove any direct replies to this comment so the thread doesn't
  // leave orphaned children.
  const nextComments = prevComments.filter(
    (c) => c.id !== commentId && c.parentId !== commentId
  );

  await db.collection("myPosts").updateOne(
    { _id: new ObjectId(postId) },
    { $set: { feedback: { ...prevFeedback, comments: nextComments } } }
  );

  return { deleteCommentObj: nextComments };
};
