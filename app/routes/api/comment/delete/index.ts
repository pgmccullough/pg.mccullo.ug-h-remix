import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import type { CommentI } from "~/components/Comments/Comments";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let prevComments;
  let prevFeedback;
  let deleteCommentResponse;
  const deleteCommentData = await request.formData();
  const parentId = deleteCommentData.get("parentId")?.toString()||null;
  // parentId is never used to delete child comment 
  const commentId = deleteCommentData.get("commentId")!.toString();
  const postId = deleteCommentData.get("postId")!.toString();
  // userId should be used to check proper authority to delete
  const userId = deleteCommentData.get("userId")?.toString()||"anon";
  const client = await clientPromise;
  const db = client.db("user_posts");
  try{
    prevFeedback = await db.collection('myPosts').find({_id : new ObjectId(postId)}).toArray();
    prevFeedback = prevFeedback[0].feedback;
    prevComments = prevFeedback.comments;
    prevComments = prevComments.filter((comment: CommentI) => comment.id !== commentId);
    const updates:any = {
      $set: {feedback: {...prevFeedback, comments: [ ...prevComments ]}}
    }
    try {
      deleteCommentResponse = await db.collection('myPosts').updateOne({_id : new ObjectId(postId)}, updates);
      return {deleteCommentObj: prevComments};
    } catch (err) {
      deleteCommentResponse = err;
      return {deleteCommentObj: []};
    }
  } catch (err) {
    deleteCommentResponse = false;
    return {deleteCommentObj: []};
  }
}