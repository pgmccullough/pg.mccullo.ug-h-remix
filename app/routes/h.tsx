import { LoaderFunction } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { useState } from "react";
import { getUser } from "~/utils/session.server";
import { Header } from "~/components/Header/Header";
import { Sidebar } from '~/components/Sidebar/Sidebar';
import { clientPromise } from "~/lib/mongodb";
import * as postmark from "postmark"

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();  
  let emails: any[] = [];
  let sentEmails: any[] = [];
  if(user?.role==="administrator") {
    emails = await db.collection('myEmails').find({MessageStream:"inbound"}).sort({created:-1}).limit(25).toArray();
    sentEmails = await db.collection('myEmails').find({MessageStream:"outbound"}).sort({created:-1}).limit(25).toArray();
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
  return { emails, sentEmails, siteData:{...siteData[0]}, user };
}

export default function Index() {

  return (
    <>
      <Header />
      <div className="content">
        <Sidebar />
        <div className="right-column">
          <Outlet />
        </div>
      </div>
    </>
  );
}