import { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PostCard } from "~/components/PostCard/PostCard";
import { SignInModal } from "~/components/SignInModal/SignInModal";
import { clientPromise } from "~/lib/mongodb";

export const loader: LoaderFunction = async () => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).limit(25).toArray();
  return { posts };
}

export default function Index() {
  const { posts } = useLoaderData();
  return (
    <>
      <SignInModal 
        registerOrLoginInit={2}
      />
      {posts?.map((post:any) =>
          <PostCard 
              key={post._id} 
              post={post}
          />
      )}
    </>
  );
}