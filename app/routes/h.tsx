import { json, LoaderFunction } from "@remix-run/node";
import { Outlet, Scripts, useCatch, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { getUser } from "~/utils/session.server";
import { Header } from "~/components/Header/Header";
import { Sidebar } from '~/components/Sidebar/Sidebar';
import { PostCard } from "~/components/PostCard/PostCard";
import { Analytics } from "~/components/Analytics/Analytics";
import { clientPromise } from "~/lib/mongodb";
import * as postmark from "postmark"
import { Job, Post } from "~/common/types";

export const loader: LoaderFunction = async ({ request }) => {
  const IPSTACK_APIKEY = process.env.IPSTACK_APIKEY;
  const user = await getUser(request)||{user_name: null, role: null};
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();  
  let notes: any[] = [];
  let emails: any[] = [];
  let sentEmails: any[] = [];
  let calDates: any[] = [];
  let jobs: any[] = [];
  let visitors: any[] = [];
  if(user?.role==="administrator") {
    visitors = await db.collection('myVisitors').find().sort({created:-1}).limit(25).toArray();
    notes = await db.collection('myNotes').find().sort({created:-1}).toArray();
    calDates = await db.collection('myDates').find().sort({created:-1}).toArray();
    emails = await db.collection('myEmails').find({MessageStream:"inbound"}).sort({created:-1}).limit(25).toArray();
    sentEmails = await db.collection('myEmails').find({MessageStream:"outbound"}).sort({created:-1}).limit(25).toArray();
    jobs = await db.collection("myJobs").find().sort({created:-1}).toArray();
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
  const wishList = await db.collection("myWishList").find().sort({created:-1}).toArray();
  const storyPost = await db.collection("myPosts").find({ privacy : "Story", created: { $gt: (new Date().getTime()/1000)-86400 } }).sort({created:-1}).toArray();
  return { calDates, emails, IPSTACK_APIKEY, jobs, notes, sentEmails, siteData:{...siteData[0]}, storyPost, user, visitors, wishList };
}

export function CatchBoundary() {
  const caught = useCatch();
  const caughtData = JSON.parse(caught.data);
  const { siteData, user } = caughtData;
  
  return (
    <>
      <Header manualUser={user} manualSiteData={siteData[0]} />
      <div className="content">
        <Sidebar manualUser={user} manualSiteData={siteData[0]} />
        <div className="right-column">
          <PostCard 
            post={null}
            editState={null}
            setEditState={null}
            title={`${caught.status} Error`}
            message={caught.statusText}
          />
        </div>
      </div>
    </>
  );
}

export default function Index() {
  const { IPSTACK_APIKEY, storyPost, user } = useLoaderData();
  const [ newPost, setNewPost ] = useState<Post>();
  return (
    <>
      {/* <Analytics IPSTACK_APIKEY={IPSTACK_APIKEY} /> */}
      {user?.role==="administrator"
        ?<Header
          setNewPost={setNewPost}
          storyPost={storyPost} 
        />
        :<Header
          storyPost={storyPost} 
        />}
      <div className="content">
        <Sidebar />
        <div className="right-column">
          {user?.role==="administrator"
            ?<Outlet context={newPost} />
            :<Outlet />
          }
        </div>
      </div>
    </>
  );
}