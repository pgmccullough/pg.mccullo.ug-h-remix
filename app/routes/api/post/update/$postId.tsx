import type { ActionArgs } from "@remix-run/node";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ params, request }: ActionArgs) => {
  const { postId } = params;
  const user = await getUser(request);
  const postPrivacyData = (await request.formData()).get("privacy")?.toString();
  const client = await clientPromise;
  const db = client.db("user_posts");
  let privacyUpdated;
  if(user?.role==="administrator") {
    try{
      privacyUpdated = await db.collection('myPosts').updateOne({ _id : new ObjectId(postId)}, { $set: { privacy: postPrivacyData } });
    } catch (err) {
      privacyUpdated = false;
    }
  }
  return { privacyUpdated };
}