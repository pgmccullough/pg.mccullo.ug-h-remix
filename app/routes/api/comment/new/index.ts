import type { ActionFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { sanitizeCommentHtml } from "~/utils/sanitize.server";
import { v4 as uuidv4 } from "uuid";
import type { CommentI } from "~/components/Comments/Comments";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Auth: must be signed in to comment. Server-side userId is the source of
  // truth — anything the client puts in form data is ignored for identity.
  const user = await getUser(request);
  if (!user?.id) {
    return Response.json({ error: "You must be signed in to comment." }, { status: 401 });
  }

  const newCommentData = await request.formData();
  const rawBody = newCommentData.get("commentBody")?.toString() ?? "";
  const cleanBody = sanitizeCommentHtml(rawBody);

  // Reject if sanitization stripped everything (empty or all-disallowed-tags).
  if (!cleanBody.replace(/<[^>]+>/g, "").trim()) {
    return Response.json({ error: "Comment is empty." }, { status: 400 });
  }

  // Validate post + check the post actually accepts comments.
  const postId = newCommentData.get("postId")?.toString();
  if (!postId || !ObjectId.isValid(postId)) {
    return Response.json({ error: "Invalid post." }, { status: 400 });
  }

  // parentId is optional; only accept if it's a valid string (used for replies).
  const parentIdRaw = newCommentData.get("parentId")?.toString();
  const parentId = parentIdRaw && parentIdRaw.length > 0 ? parentIdRaw : null;

  const client = await clientPromise;
  const db = client.db("user_posts");

  const post = await db
    .collection("myPosts")
    .findOne({ _id: new ObjectId(postId) });
  if (!post) {
    return Response.json({ error: "Post not found." }, { status: 404 });
  }
  if (!post.feedback?.commentsOn) {
    return Response.json({ error: "Comments are closed on this post." }, { status: 403 });
  }

  const newComment: CommentI = {
    id: uuidv4(),
    parentId,
    body: cleanBody,
    userId: String(user.id),
    timestamp: Date.now(),
  };

  const prevFeedback = post.feedback ?? {};
  const prevComments: CommentI[] = prevFeedback.comments ?? [];
  const nextComments = [...prevComments, newComment];

  await db.collection("myPosts").updateOne(
    { _id: new ObjectId(postId) },
    { $set: { feedback: { ...prevFeedback, comments: nextComments } } }
  );

  return { newCommentObj: nextComments };
};
