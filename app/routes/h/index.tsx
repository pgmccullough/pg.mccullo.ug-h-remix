import { LoaderFunction } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { getUser } from "~/utils/session.server";
import { Header } from "~/components/Header/Header";
import { Sidebar } from '~/components/Sidebar/Sidebar';
import { PostCard } from "~/components/PostCard/PostCard";
import { clientPromise, ObjectId } from "~/lib/mongodb";
import * as postmark from "postmark"
import type { Post } from "~/common/types";

import styles from "~/styles/App.css";

export const links = () => {
  return [{ rel: "stylesheet", href: styles }];
}

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();  
  let posts;
  let emails: any[] = [];
  let sentEmails: any[] = [];

  /* On This Day Calculations */
  let onThisDay;
  const date = new Date();
  const formattedMonth = Number(("0" + (date.getMonth() + 1)).slice(-2));
  const formattedDate = Number(("0" + date.getDate()).slice(-2));
  const curYear = date.getFullYear();
  let twentyFiveYears = [];
  for(let i=curYear-1;i>=curYear-25;i--) {
    let datenew = new Date(i,formattedMonth-1,formattedDate);
    twentyFiveYears.push(datenew.getTime()/1000)
  }
  let mongoOrArray:{created: {}}[] = [];
  twentyFiveYears.forEach(thisDate =>
    mongoOrArray.push({created : {$gt: thisDate,$lt:thisDate+86400}})
  )
  /* End On This Day Calculations */
  if(user?.role!=="administrator") {
    onThisDay = await db.collection('myPosts').find({$or: mongoOrArray, privacy : "Public"}).sort({created:-1}).toArray();
    posts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).limit(25).toArray();
  } else {
    onThisDay = await db.collection('myPosts').find({$or: mongoOrArray}).sort({created:-1}).toArray();
    posts = await db.collection("myPosts").find({}).sort({created:-1}).limit(25).toArray();
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
            console.error("Unable to store sent email time to database.",error);
          })
      }
    }) 
  }
  
  return { onThisDay, posts, emails, sentEmails, siteData:{...siteData[0]}, user };
}

export default function Index() {
  const { onThisDay, posts } = useLoaderData();
  const fetcher = useFetcher();

  const scrollerBottom = useRef<any>(null);
  const previousVisibility = useRef<any>(true);

  const [ editState, setEditState ] = useState<{
    isOn: boolean, id: string|null
  }>({ isOn: false, id: null })

  const [ siteNotification, setsiteNotification ] = useState<{
    msg:string,visible:boolean
  }>({ msg: "Loading", visible: false })

  const [ postArray, alterPostArray ] = useState<Post[]>(posts);
  const [ postCount, setPostCount ] = useState<number>(0);
  const [ loadMoreInView, setLoadMoreInView ] = useState(false);

  const cb = (entries:any) => {
    const [ entry ] = entries;
    setLoadMoreInView(entry.isIntersecting);
  }

  const options = {
    root: null,
    rootMargin: "0px",
    threshold: 0.1,
  };

  useEffect(() => {
    const observer = new IntersectionObserver(cb, options);
    if(scrollerBottom.current) observer.observe(scrollerBottom.current);
    if(!previousVisibility.current&&loadMoreInView) {
      setsiteNotification({ msg: "Loading more posts", visible: true });
      fetcher.submit(
        { loadOffset: (postCount+25).toString() },
        { method: "post", action: `/api/post/fetch?index` }
      );
      setPostCount(postCount+25);
    }
    previousVisibility.current = loadMoreInView;
    return () => {
      if(scrollerBottom.current) observer.unobserve(scrollerBottom.current);
    }
  },[scrollerBottom, options])

  useEffect(() => {
    if(fetcher.data?.additionalPosts) {
      let newPosts:Post[] = [...fetcher.data.additionalPosts];
      alterPostArray(prev=>[...prev,...newPosts]);
      fetcher.data.additionalPosts = null;
      setsiteNotification({ ...siteNotification, visible: false });
    }
  }, [fetcher]);

  return (
    <>
      <Header />
      <div className="content">
        <Sidebar />
        <div className="right-column">
          {onThisDay.length?<div className="onThisDay__label">On this Day</div>:""}
          {onThisDay?.map((thisDay: Post) =>
              <PostCard 
                key={thisDay._id}
                editState={editState}
                setEditState={setEditState}
                post={thisDay}
              />
          )}
          {postArray?.map((post: Post) =>
            <PostCard 
              key={post._id}
              editState={editState}
              setEditState={setEditState}
              post={post}
            />
          )}
          <div ref={scrollerBottom}>&nbsp;</div>
        </div>
      </div>
      <div className={`site-notifications ${siteNotification.visible?"site-notifications--active":""}`}>
        <div className="loader"/>
        {siteNotification.msg}
      </div>
    </>
  );
}
