import { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PostCard } from "~/components/PostCard/PostCard";
import { clientPromise } from "~/lib/mongodb";
import axios from "axios";

export const loader: LoaderFunction = async () => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).limit(25).toArray();
  return { posts };
}

export default function Index() {
  axios("http://localhost:8080/post/",{
    headers: {
      authorization: null
    }
  }).then(
    res => {
      console.log("rando test",res.data);
    }
  ).catch(err => {})
  const { posts } = useLoaderData();
  return (
    <>
      {posts?.map((post:any) =>
          <PostCard 
              key={post._id} 
              post={post}
          />
      )}
    </>
  );
}
