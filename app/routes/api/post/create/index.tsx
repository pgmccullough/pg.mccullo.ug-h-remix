import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  const postFormData = await request.formData();
  const newPostString = postFormData.get("newPost")?.toString()||null;
  const newPost = JSON.parse(newPostString!);
  let insertedPost;
  newPost.created = Math.floor(Date.now()/1000);
  newPost.lastEdited = Math.floor(Date.now()/1000);
  delete newPost._id;
  if(user?.role==="administrator") {
    const client = await clientPromise;
    const db = client.db("user_posts");
    insertedPost = await db.collection('myPosts').insertOne(newPost);
  }
  // return redirect(`/h/post/${newPost._id}`);
  return { newPost, insertedPost };
}