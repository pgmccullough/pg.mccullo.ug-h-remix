import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const deleteEmailId = (await request.formData()).get("deleteEmailId")?.toString();
  let response;
  if(user?.role==="administrator") {
    const client = await clientPromise;
    const db = client.db("user_posts");
    try{
      response = await db.collection('myEmails').deleteOne({_id : new ObjectId(deleteEmailId)});
    } catch (err) {
      response = false;
    }
  }
  return { response, deleteEmailId };
}

export default function deleteEmail() {
  return 400;
}