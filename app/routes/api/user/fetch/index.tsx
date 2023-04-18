import type { ActionArgs } from "@remix-run/node";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  let userObj = null;
  const userId = (await request.formData()).get("userId")?.toString();
  const client = await clientPromise;
  const db = client.db("user_posts");
  try {
    [ userObj ] = await db.collection('myUsers').find({_id : new ObjectId(userId)}).toArray();
    return { userObj };
  } catch (err) {
    userObj = null;
    return { userObj };
  }
}