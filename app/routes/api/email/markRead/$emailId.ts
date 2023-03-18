import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const readEmailId = (await request.formData()).get("readEmailId")?.toString();
  let response;
  if(user?.role==="administrator") {
    try{
      response = await db.collection('myEmails').updateOne({_id : new ObjectId(readEmailId)},{$set: {unread:0,Headers:[]}});
    } catch (err) {
      response = false;
    }
  }
  return { response, readEmailId };
}