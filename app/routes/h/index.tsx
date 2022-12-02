import { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { clientPromise } from "~/lib/mongodb";

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  let posts;
  if(user?.role!=="administrator") {
    posts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).limit(25).toArray();
  } else {
    posts = await db.collection("myPosts").find({}).sort({created:-1}).limit(25).toArray();
  }
  return { posts };
}

export default function Index() {
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
