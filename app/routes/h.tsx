import {
  Link,
  Outlet,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
} from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { getUser } from "~/utils/session.server";
import { Header } from "~/components/Header/Header";
import { Sidebar } from "~/components/Sidebar/Sidebar";
import { SiteActivity } from "~/adminApps/SiteActivity/SiteActivity";
import { PostCard } from "~/components/PostCard/PostCard";
import { Analytics } from "~/components/Analytics/Analytics";
import { clientPromise } from "~/lib/mongodb";
import { serializeDocs } from "~/utils/serialize.server";
import { countUnreadNotifications } from "~/utils/federation-interactions.server";
import * as postmark from "postmark";
import type { Post } from "~/common/types";

/**
 * Race a promise against a timeout. Never rejects — resolves with
 * `fallback` if the promise doesn't settle in `ms`. Duplicated
 * from post/$postID.tsx; keeps each route's timeout handling
 * self-contained and easy to reason about.
 */
function raceOr<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const IPSTACK_APIKEY = process.env.IPSTACK_APIKEY;
  const client = await clientPromise;
  const db = client.db("user_posts");
  const serverTime = new Date();

  // Parallelize the always-needed queries. `getUser` is a Mongo hit
  // itself so it goes in the parallel wave alongside the collection
  // reads instead of blocking them. All four are independent, so
  // total latency ≈ slowest single query instead of the sum.
  const [rawUser, siteData, wishList, storyPost] = await Promise.all([
    raceOr(getUser(request), 2500, null),
    raceOr(
      db.collection("myUsers").find({ user_name: "PGMcCullough" }).toArray(),
      2500,
      [] as any[]
    ),
    raceOr(
      db.collection("myWishList").find().sort({ created: -1 }).toArray(),
      2000,
      [] as any[]
    ),
    raceOr(
      db.collection("myPosts")
        .find({
          privacy: "Story",
          created: { $gt: new Date().getTime() / 1000 - 86400 },
        })
        .sort({ created: -1 })
        .toArray(),
      2000,
      [] as any[]
    ),
  ]);
  const user = rawUser || { user_name: null, role: null };
  let notes: any[] = [];
  let emails: any[] = [];
  let rentalProperties: any[] = [];
  let sentEmails: any[] = [];
  let calDates: any[] = [];
  let jobs: any[] = [];
  let visitors: any[] = [];
  if (user?.role === "administrator") {
    // Datacenter-visitor cleanup used to run here as a deleteMany
    // on every admin pageview — that was a write + collection scan
    // every navigation, which under M0 shared-tier contention
    // stacked into 504s. Move to a one-off script / cron when
    // needed; the /api/analytics filter already prevents new
    // datacenter records from landing, so the leftover set is
    // capped and doesn't grow.
    //
    // Run all admin-scoped fetches in PARALLEL via Promise.all so
    // slow-Mongo latency doesn't multiply. Was 9 sequential awaits
    // ≈ 4.5s under contention; now bounded by the slowest single
    // query. Also added defensive limits to the previously-unbounded
    // fetches (myNotes, myDates, myProperties, myJobs) — sidebar
    // widgets don't need every record ever, and hundreds of docs
    // wire-transferred per pageview is wasteful.
    // Each admin fetch bounded at 2.5s. myVisitors is the known
    // slow one — sort on unindexed lastSeen against a collection
    // that bloated during yesterday's bot burst. Timing out returns
    // an empty widget rather than 504'ing the whole page. Fix at
    // the DB layer: add an index on myVisitors.lastSeen (see
    // Atlas → Collections → myVisitors → Indexes → Create Index).
    [
      visitors,
      notes,
      calDates,
      rentalProperties,
      emails,
      sentEmails,
      jobs,
    ] = await Promise.all([
      raceOr(
        db.collection("myVisitors").find().sort({ lastSeen: -1 }).limit(50).toArray(),
        2500,
        [] as any[]
      ),
      raceOr(db.collection("myNotes").find().sort({ created: -1 }).limit(100).toArray(), 2000, [] as any[]),
      raceOr(db.collection("myDates").find().sort({ created: -1 }).limit(100).toArray(), 2000, [] as any[]),
      raceOr(db.collection("myProperties").find().sort({ created: -1 }).limit(50).toArray(), 2000, [] as any[]),
      raceOr(db.collection("myEmails").find({ MessageStream: "inbound" }).sort({ created: -1 }).limit(25).toArray(), 2000, [] as any[]),
      raceOr(db.collection("myEmails").find({ MessageStream: "outbound" }).sort({ created: -1 }).limit(25).toArray(), 2000, [] as any[]),
      raceOr(db.collection("myJobs").find().sort({ created: -1 }).limit(50).toArray(), 2000, [] as any[]),
    ]);
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
  // wishList + storyPost fetched in the parallel Promise.all above.
  return {
    // Exposed so SiteActivity can subscribe the browser to Web Push.
    // Safe to hand to the client — VAPID public keys are meant to be
    // shared. The private key stays server-side.
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    calDates,
    emails,
    IPSTACK_APIKEY,
    jobs,
    notes,
    rentalProperties,
    sentEmails,
    serverTime,
    siteData: { ...siteData[0] },
    storyPost: serializeDocs(storyPost),
    user,
    // serializeDocs stringifies Mongo ObjectIds so they survive the
    // loader boundary — without this, _id lands on the client as {}
    // and String(v._id) becomes "[object Object]".
    visitors: serializeDocs(visitors),
    wishList,
    unreadNotifications:
      user?.role === "administrator"
        ? await raceOr(countUnreadNotifications(), 1500, 0)
        : 0,
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
  const location = useLocation();
  // navigation.state === "loading" during route transitions (loader
  // running). `.location.pathname` is the destination — we use it to
  // instantly mark the clicked tab active while the loader fetches.
  const navigation = useNavigation();
  const pendingPath = navigation.state === "loading"
    ? navigation.location?.pathname
    : undefined;

  // The Me/Friends toggle is admin-only (only admin has a friends feed
  // page to switch to). It also only makes sense on those two routes —
  // hide it on single-post pages, login, the book, etc.
  const rawIsOnMe = location.pathname === "/h" || location.pathname === "/h/";
  const rawIsOnFriends = location.pathname.startsWith("/h/friends");

  // Optimistic active state: while a nav is in flight to the OTHER
  // feed, treat the destination as "active" for both the tab styling
  // and the outlet-vs-loading-placeholder swap.
  const pendingIsFriends = pendingPath?.startsWith("/h/friends");
  const pendingIsMe = pendingPath === "/h" || pendingPath === "/h/";
  const isOnMe = pendingIsMe ? true : pendingIsFriends ? false : rawIsOnMe;
  const isOnFriends = pendingIsFriends ? true : pendingIsMe ? false : rawIsOnFriends;

  // True when the pending destination is a different feed than the
  // current — swap the Outlet for a loading placeholder so the old
  // feed doesn't sit there stale while the loader runs.
  const swappingFeeds =
    !!pendingPath &&
    ((rawIsOnMe && pendingIsFriends) || (rawIsOnFriends && pendingIsMe));

  const showToggle =
    user?.role === "administrator" && (isOnMe || isOnFriends);

  return (
    <>
      <Analytics />
      {user?.role === "administrator" ? <SiteActivity /> : null}
      {user?.role === "administrator" ? (
        <Header setNewPost={setNewPost} storyPost={storyPost} />
      ) : (
        <Header storyPost={storyPost} />
      )}
      <div className="content">
        <Sidebar />
        <div className="right-column">
          {showToggle && (
            <>
              <style>{`
                .feed-toggle {
                  display: flex;
                  background: #fff;
                  border: 1px solid #979997;
                  border-radius: 999px;
                  padding: 4px;
                  margin-bottom: 1rem;
                  width: fit-content;
                  margin-left: auto;
                  margin-right: auto;
                }
                .feed-toggle__tab,
                .feed-toggle__tab:visited {
                  display: inline-block;
                  padding: 6px 22px;
                  border-radius: 999px;
                  font: 600 14px 'PGM Sans', sans-serif;
                  color: #4A6CBA;
                  text-decoration: none;
                  letter-spacing: 0.02em;
                  transition: background-color 0.15s ease, color 0.15s ease;
                }
                .feed-toggle__tab:hover {
                  color: #506982;
                }
                .feed-toggle__tab--active,
                .feed-toggle__tab--active:visited {
                  background: #4A6CBA;
                  color: #fff;
                }
                .feed-toggle__tab--active:hover {
                  color: #fff;
                }
              `}</style>
              <nav className="feed-toggle" aria-label="Feed">
                <Link
                  to="/h"
                  className={`feed-toggle__tab${isOnMe ? " feed-toggle__tab--active" : ""}`}
                >
                  Me
                </Link>
                <Link
                  to="/h/friends"
                  className={`feed-toggle__tab${isOnFriends ? " feed-toggle__tab--active" : ""}`}
                >
                  Friends
                </Link>
              </nav>
            </>
          )}
          {swappingFeeds ? (
            <>
              <style>{`
                .feed-loading {
                  text-align: center;
                  padding: 40px 16px;
                  color: #506982;
                  font: 600 14px 'PGM Sans', sans-serif;
                  letter-spacing: 0.05em;
                }
                .feed-loading__dots::after {
                  content: "";
                  display: inline-block;
                  width: 1.2em;
                  text-align: left;
                  animation: feed-loading-dots 1s steps(4, end) infinite;
                }
                @keyframes feed-loading-dots {
                  0%   { content: ""; }
                  25%  { content: "."; }
                  50%  { content: ".."; }
                  75%  { content: "..."; }
                  100% { content: ""; }
                }
              `}</style>
              <div className="feed-loading">
                <span>Loading</span>
                <span className="feed-loading__dots" aria-hidden="true" />
                <span className="visually-hidden">…</span>
              </div>
            </>
          ) : user?.role === "administrator" ? (
            <Outlet context={newPost} />
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </>
  );
}
