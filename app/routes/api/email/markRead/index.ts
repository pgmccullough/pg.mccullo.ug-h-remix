import type { ActionArgs } from "@remix-run/node";
import { readEmail } from "~/utils/pusher.server";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const rawArray = (await request.formData()).get("readEmails")?.toString();
  const markEmParsedArray:string[] = JSON.parse(rawArray!);
  const idArray = markEmParsedArray.map(id => new ObjectId(id));
  let multiMarkReadEmails;
  if(user?.role==="administrator") {
    try{
      multiMarkReadEmails = await db.collection('myEmails').updateMany({_id : {$in:idArray}},{$set: {unread:0,Headers:[]}});
    } catch (err) {
      multiMarkReadEmails = false;
    }
  }
  await readEmail(markEmParsedArray);
  return { multiMarkReadEmails, markEmParsedArray };
}