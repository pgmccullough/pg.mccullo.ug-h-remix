import type { ActionArgs } from "@remix-run/node";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ params, request }: ActionArgs) => {
  const { postId } = params;
  const user = await getUser(request);
  let prevFeedback;
  const postData = await request.formData();
  const postPrivacyData = postData.get("privacy")?.toString();
  const commentsOnStr = postData.get("commentsOn")?.toString();
    const commentsOn = !commentsOnStr||commentsOnStr==="false"?false:true;
  const likesOnStr = postData.get("likesOn")?.toString();
    const likesOn = !likesOnStr||likesOnStr==="false"?false:true;
  const sharesOnStr = postData.get("sharesOn")?.toString();
    const sharesOn = !sharesOnStr||sharesOnStr==="false"?false:true;
  const client = await clientPromise;
  const db = client.db("user_posts");
  let privacyUpdated;
  if(user?.role==="administrator") {
    try{
      prevFeedback = await db.collection('myPosts').find({_id : new ObjectId(postId)}).toArray();
      prevFeedback = prevFeedback[0].feedback;
      prevFeedback = { ...prevFeedback, commentsOn, likesOn, sharesOn };
      console.log("HEY WAIT WAT ",prevFeedback)
      privacyUpdated = await db.collection('myPosts').updateOne({ _id : new ObjectId(postId)}, { $set: { privacy: postPrivacyData, feedback: prevFeedback } });
    } catch (err) {
      privacyUpdated = false;
    }
  }
  return { privacyUpdated };
}