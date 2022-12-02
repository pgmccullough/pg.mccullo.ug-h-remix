import { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const loader: LoaderFunction = async ({ params, request }) => {
  const { postID = "" } = params;
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  let post;
  if(user?.role!=="administrator") {
    [post] = await db.collection("myPosts").find({ privacy : "Public", _id: new ObjectId(postID) }).toArray();
  } else {
    [post] = await db.collection("myPosts").find({ _id: new ObjectId(postID) }).toArray();
  }
  if(!post) post = {error: 1}
  return post;
}

export default function SinglePost() {
  const post = useLoaderData();
  
  return (
    <>
    {post&&!post.error?
      <PostCard 
          key={post._id} 
          post={post}
      />:
      "To do: add error component ;)"}
    </>
  );
}