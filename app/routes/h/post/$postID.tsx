import { LoaderFunction } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import { Header } from "~/components/Header/Header";
import { Sidebar } from "~/components/Sidebar/Sidebar";

import styles from "~/styles/App.css";

export const links = () => {
  return [{ rel: "stylesheet", href: styles }];
}

export const loader: LoaderFunction = async ({ params, request }) => {
  const { postID = "" } = params;
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  let post;
  let emails = {};
  if(user?.role!=="administrator") {
    [post] = await db.collection("myPosts").find({ privacy : "Public", _id: new ObjectId(postID) }).toArray();
  } else {
    [post] = await db.collection("myPosts").find({ _id: new ObjectId(postID) }).toArray();
    emails = await db.collection('myEmails').find({MessageStream:"inbound"}).sort({created:-1}).limit(25).toArray();
  }
  if(!post) post = {error: 1}
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();
  return { emails, post, siteData:{...siteData[0]}, user };
}

export default function SinglePost() {
  const { post } = useLoaderData();
  
  return (
    <>
      <Header />
      <div className="content">
        <Sidebar />
        <div className="right-column">
          {post&&!post.error?
            <PostCard 
                key={post._id} 
                post={post}
            />:
            "To do: add error component ;)"}
        </div>
      </div>
    </>
  );
}