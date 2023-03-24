import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const loadOffset = (await request.formData()).get("loadOffset")?.toString();
  let additionalEmails;
  if(user?.role==="administrator") {
    try{
      additionalEmails = await db.collection('myEmails').find({MessageStream:"inbound"}).sort({created:-1}).limit(25).skip(Number(loadOffset)).toArray();
    } catch (err) {
      additionalEmails = null;
    }
  }
  return { additionalEmails };
}