import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const loadOffset = (await request.formData()).get("loadOffset")?.toString();
  let additionalPosts;
  if(user?.role==="administrator") {
    try{
      additionalPosts = await db.collection("myPosts").find({}).sort({created:-1}).skip(Number(loadOffset)).limit(25).toArray();
    } catch (err) {
      additionalPosts = null;
    }
  } else {
    try{
      additionalPosts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).skip(Number(loadOffset)).limit(25).toArray();
    } catch (err) {
      additionalPosts = null;
    }    
  }
  return { additionalPosts };
}