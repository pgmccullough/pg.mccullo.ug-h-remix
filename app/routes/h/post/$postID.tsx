import { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import * as postmark from "postmark";
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
  let emails: any[] = [];
  let sentEmails: any[] = [];
  if(user?.role!=="administrator") {
    [post] = await db.collection("myPosts").find({ privacy : "Public", _id: new ObjectId(postID) }).toArray();
  } else {
    [post] = await db.collection("myPosts").find({ _id: new ObjectId(postID) }).toArray();
    emails = await db.collection('myEmails').find({MessageStream:"inbound"}).sort({created:-1}).limit(7).toArray();
    sentEmails = await db.collection('myEmails').find({MessageStream:"outbound"}).sort({created:-1}).limit(7).toArray();
    if(!process.env.POSTMARK_TOKEN) return {response: "Postmark token required."};
    const emailClient = new postmark.ServerClient(process.env.POSTMARK_TOKEN);
    sentEmails.forEach((sentEmail:any) => {
      if(sentEmail.MessageId&&!sentEmail.Opened) {
        emailClient.getOutboundMessageDetails(sentEmail.MessageId)
          .then((sentDetails:any) => {
            const wasOpened = sentDetails.MessageEvents.find((msgEvent:any) => msgEvent.Type==="Opened");
            if(wasOpened) {
              sentEmail.Opened = wasOpened.ReceivedAt;
              db.collection('myEmails').updateOne({_id: sentEmail._id},{$set:{Opened: wasOpened.ReceivedAt}});
            }
          })
          .catch((error:any) => {
            console.error("Unable to store sent email time to database.");
          })
      }
    })
  }
  if(!post) post = {error: 1}
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();
  // return { emails, post, siteData:{...siteData[0]}, user };
  return { post, emails, sentEmails, siteData:{...siteData[0]}, user };
}

export default function SinglePost() {
  const { post } = useLoaderData();
 
  const [ editState, setEditState ] = useState<{
    isOn: boolean, id: string|null
  }>({ isOn: false, id: null })
  
  return (
    <>
      <Header />
      <div className="content">
        <Sidebar />
        <div className="right-column">
          {post&&!post.error?
            <PostCard 
                key={post._id} 
                editState={editState}
                setEditState={setEditState}
                post={post}

            />:
            "To do: add error component ;)"}
        </div>
      </div>
    </>
  );
}