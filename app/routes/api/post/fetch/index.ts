import type { ActionFunctionArgs, LoaderFunction, LoaderFunctionArgs } from "react-router";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";

export const loader: LoaderFunction = async({request}: LoaderFunctionArgs) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const url = new URL(request.url)
  const loadOffset = url.searchParams.get('offset')||0;
  let additionalPosts;
  try{
    additionalPosts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).skip(Number(loadOffset)).limit(25).toArray();
  } catch (err) {
    additionalPosts = null;
  }
  return { additionalPosts: additionalPosts ? serializeDocs(additionalPosts) : null };
}

export const action = async ({ request }: ActionFunctionArgs) => {
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
  return { additionalPosts: additionalPosts ? serializeDocs(additionalPosts) : null };
}