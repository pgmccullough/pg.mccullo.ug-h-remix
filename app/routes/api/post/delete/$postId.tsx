import type { ActionArgs } from "@remix-run/node";
import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ params, request }: ActionArgs) => {
  const { postId } = params;
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  let postDeleted;
  if(user?.role === "administrator") {
    try{
      postDeleted = await db.collection('myPosts').deleteOne( { _id : new ObjectId(postId) } );
    } catch (err) {
      postDeleted = false;
    }
  }
  return { postDeleted };
}