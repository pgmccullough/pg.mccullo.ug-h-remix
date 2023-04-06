import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const singleEmailId = (await request.formData()).get("singleEmailId")?.toString();
  let fetchedSingle;
  if(user?.role==="administrator") {
    const client = await clientPromise;
    const db = client.db("user_posts");
    try{
      fetchedSingle = await db.collection('myEmails').find({_id : new ObjectId(singleEmailId)}).toArray();
    } catch (err) {
      fetchedSingle = false;
    }
  }
  return { fetchedSingle };
}

export default function deleteEmail() {
  return 400;
}