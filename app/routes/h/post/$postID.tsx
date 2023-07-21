import { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const loader: LoaderFunction = async ({ params, request }) => {
  const { postID = "" } = params;
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();  
  let post;
  if(user?.role!=="administrator") {
    [ post ] = await db.collection("myPosts").find({ privacy : "Public", _id: new ObjectId(postID) }).toArray();
  } else {
    [ post ] = await db.collection("myPosts").find({ _id: new ObjectId(postID) }).toArray();
  }
  if(!post) {
    throw new Response(JSON.stringify({user,siteData}), {
      status: 404,
      statusText: "Sorry, this page either doesn't exist (check the spelling in the URL?) or maybe it does and you're just not allowed to see it...",
    });
  }
  return { post, user };
}

export default function SinglePost() {
  const { post } = useLoaderData();
 
  const [ editState, setEditState ] = useState<{
    isOn: boolean, id: string|null
  }>({ isOn: false, id: null })

  return (
    <>
      {post&&!post.error?
        <PostCard 
            key={post._id} 
            editState={editState}
            setEditState={setEditState}
            post={post}
        />:
        "To do: add error component ;)"}
    </>
  );
}