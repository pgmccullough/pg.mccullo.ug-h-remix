import { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PostCard } from "~/components/PostCard/PostCard";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const loader: LoaderFunction = async ({params}) => {
  const { postID = "" } = params;
  const client = await clientPromise;
  const db = client.db("user_posts");
  const [post] = await db.collection("myPosts").find({ privacy : "Public", _id: new ObjectId(postID) }).sort({created:-1}).limit(25).toArray();
  return post;
}

export default function SinglePost() {
  const post = useLoaderData();
  
  return (
    <>
      <PostCard 
          key={post._id} 
          post={post}
      />
    </>
  );
}