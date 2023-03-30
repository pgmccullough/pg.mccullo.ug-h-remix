import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const rawArray = (await request.formData()).get("deleteEmails")?.toString();
  const delEmParsedArray:string[] = JSON.parse(rawArray!);
  const idArray = delEmParsedArray.map(id => new ObjectId(id));
  let multiDeleteEmails;
  if(user?.role==="administrator") {
    const client = await clientPromise;
    const db = client.db("user_posts");
    try{
      multiDeleteEmails = await db.collection('myEmails').deleteMany({_id : {$in:idArray}});
    } catch (err) {
      multiDeleteEmails = false;
    }
  }
  return { multiDeleteEmails, delEmParsedArray };
}