import {
  Outlet,
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { getUser } from "~/utils/session.server";
import { Header } from "~/components/Header/Header";
import { Sidebar } from "~/components/Sidebar/Sidebar";
import { PostCard } from "~/components/PostCard/PostCard";
// import { Analytics } from "~/components/Analytics/Analytics";
import { clientPromise } from "~/lib/mongodb";
import * as postmark from "postmark";
import type { Post } from "~/common/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const IPSTACK_APIKEY = process.env.IPSTACK_APIKEY;
  const user =
    (await getUser(request)) || { user_name: null, role: null };
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db
    .collection("myUsers")
    .find({ user_name: "PGMcCullough" })
    .toArray();
  const serverTime = new Date();
  let notes: any[] = [];
  let emails: any[] = [];
  let rentalProperties: any[] = [];
  let sentEmails: any[] = [];
  let calDates: any[] = [];
  let jobs: any[] = [];
  let visitors: any[] = [];
  if (user?.role === "administrator") {
    visitors = await db
      .collection("myVisitors")
      .find()
      .sort({ created: -1 })
      .limit(25)
      .toArray();
    notes = await db.collection("myNotes").find().sort({ created: -1 }).toArray();
    calDates = await db.collection("myDates").find().sort({ created: -1 }).toArray();
    rentalProperties = await db
      .collection("myProperties")
      .find()
      .sort({ created: -1 })
      .toArray();
    emails = await db
      .collection("myEmails")
      .find({ MessageStream: "inbound" })
      .sort({ created: -1 })
      .limit(25)
      .toArray();
    sentEmails = await db
      .collection("myEmails")
      .find({ MessageStream: "outbound" })
      .sort({ created: -1 })
      .limit(25)
      .toArray();
    jobs = await db.collection("myJobs").find().sort({ created: -1 }).toArray();
    // Postmark "opened" backfill — only runs for admin sessions. Currently
    // disabled because the email client UI is also disabled; re-enable when
    // re-enabling the email feature.
    if (process.env.POSTMARK_TOKEN && process.env.ENABLE_POSTMARK_BACKFILL === "1") {
      const emailClient = new postmark.ServerClient(process.env.POSTMARK_TOKEN);
      sentEmails.forEach((sentEmail: any) => {
        if (sentEmail.MessageId && !sentEmail.Opened) {
          emailClient
            .getOutboundMessageDetails(sentEmail.MessageId)
            .then((sentDetails: any) => {
              const wasOpened = sentDetails.MessageEvents.find(
                (msgEvent: any) => msgEvent.Type === "Opened"
              );
              if (wasOpened) {
                sentEmail.Opened = wasOpened.ReceivedAt;
                db.collection("myEmails").updateOne(
                  { _id: sentEmail._id },
                  { $set: { Opened: wasOpened.ReceivedAt } }
                );
              }
            })
            .catch(() => {
              console.error("Unable to store sent email time to database.");
            });
        }
      });
    }
  }
  const wishList = await db
    .collection("myWishList")
    .find()
    .sort({ created: -1 })
    .toArray();
  const storyPost = await db
    .collection("myPosts")
    .find({
      privacy: "Story",
      created: { $gt: new Date().getTime() / 1000 - 86400 },
    })
    .sort({ created: -1 })
    .toArray();
  return {
    calDates,
    emails,
    IPSTACK_APIKEY,
    jobs,
    notes,
    rentalProperties,
    sentEmails,
    serverTime,
    siteData: { ...siteData[0] },
    storyPost,
    user,
    visitors,
    wishList,
  };
};

// React Router v7 replaces CatchBoundary with ErrorBoundary + useRouteError.
// Renders the same fallback UI the old CatchBoundary produced.
export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Error";
  let message = "Something went wrong.";
  if (isRouteErrorResponse(error)) {
    title = `${error.status} Error`;
    message = error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <>
      <Header />
      <div className="content">
        <Sidebar />
        <div className="right-column">
          <PostCard
            post={null}
            editState={null}
            setEditState={null}
            title={title}
            message={message}
          />
        </div>
      </div>
    </>
  );
}

export default function Index() {
  const { storyPost, user } = useLoaderData<typeof loader>();
  const [newPost, setNewPost] = useState<Post | undefined>();
  return (
    <>
      {/* <Analytics IPSTACK_APIKEY={IPSTACK_APIKEY} /> */}
      {user?.role === "administrator" ? (
        <Header setNewPost={setNewPost} storyPost={storyPost} />
      ) : (
        <Header storyPost={storyPost} />
      )}
      <div className="content">
        <Sidebar />
        <div className="right-column">
          {user?.role === "administrator" ? (
            <Outlet context={newPost} />
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </>
  );
}
