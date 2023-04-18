import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { v4 as uuidv4 } from 'uuid';
import type { CommentI } from "~/components/Comments/Comments";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let newComment: CommentI = {id: uuidv4(), parentId: "", body: "", userId: "", timestamp: Date.now()};
  let prevComments;
  let prevFeedback;
  let newCommentResponse;
  const newCommentData = await request.formData();
  newComment.body = newCommentData.get("commentBody")?.toString()||"";
  // parentId is never used to add child comment 
  newComment.parentId = newCommentData.get("parentId")?.toString()||null;
  const postId = newCommentData.get("postId")!.toString();
  newComment.userId = newCommentData.get("userId")?.toString()||"anon";
  const client = await clientPromise;
  const db = client.db("user_posts");
  try{
    prevFeedback = await db.collection('myPosts').find({_id : new ObjectId(postId)}).toArray();
    prevFeedback = prevFeedback[0].feedback;
    prevComments = prevFeedback.comments||[];
    const updates:any = {
      $set: {feedback: {...prevFeedback, comments: [ ...prevComments, newComment ]}}
    }
    try {
      newCommentResponse = await db.collection('myPosts').updateOne({_id : new ObjectId(postId)}, updates);
    } catch (err) {
      newCommentResponse = err;
    }
  } catch (err) {
    newCommentResponse = false;
  }
  return {newCommentObj: [ ...prevComments, newComment ]};
}