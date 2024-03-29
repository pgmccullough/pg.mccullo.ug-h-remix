import { LoaderFunction } from "@remix-run/node";
import { useFetcher, useLoaderData, useCatch } from "@remix-run/react";
import { useEffect, useCallback, useRef, useState } from "react";
import { getUser } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { SearchBar } from "~/components/SearchBar/SearchBar";
import { clientPromise } from "~/lib/mongodb";
import { v4 as uuidv4 } from 'uuid';
import type { Post } from "~/common/types";

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();  
  let posts;

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
    posts = await db.collection("myPosts").find({ privacy : { $not: { $eq: "Story" } } }).sort({created:-1}).limit(25).toArray();
  }
  
  return { onThisDay, posts, siteData:{...siteData[0]}, user };
}

export default function Index() {
  const { onThisDay, posts } = useLoaderData();
  const fetcher = useFetcher();

  const scrollerBottom = useRef<any>(null);
  const previousVisibility = useRef<any>(true);

  const [ editState, setEditState ] = useState<{
    isOn: boolean, id: string|null
  }>({ isOn: false, id: null })

  const [ postSearchResults, setPostSearchResults ] = useState<Post[]|null>(null)
  const [ siteNotification, setsiteNotification ] = useState<{ msg:string, visible:boolean }>({ msg: "Loading", visible: false })

  const [ postArray, alterPostArray ] = useState<Post[]>([]);
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
    if(!localStorage.guestUUID) localStorage.guestUUID = uuidv4();
  },[])

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
      // posts.push(...newPosts);
      fetcher.data.additionalPosts = null;
      setsiteNotification({ ...siteNotification, visible: false });
    }
  }, [fetcher]);

  return (
  <>
    <SearchBar
      alterPostArray={alterPostArray}
      setPostSearchResults={setPostSearchResults}
    />
      {postSearchResults&&!postSearchResults.length
        ?<PostCard 
          post={null}
          editState={null}
          setEditState={null}
          title="Error"
          message="Sorry, no posts were found that matched your search. 😞"
        />
        :""
      }
      {onThisDay.length&&!postSearchResults
        ?<div className="onThisDay__label">On this Day</div>
        :""}
      <div className={`onThisDay__wrapper ${onThisDay.length?"onThisDay__wrapper--display":""}`}>
        {!postSearchResults&&onThisDay?.map((thisDay: Post) =>
          <PostCard 
            key={thisDay._id}
            editState={editState}
            setEditState={setEditState}
            post={thisDay}
          />
        )}
      </div>
    {!postSearchResults&&posts?.map((post: Post) =>
      <PostCard 
        key={post._id}
        editState={editState}
        setEditState={setEditState}
        post={post}
      />
    )}
    {/* Using state here for infinite scroll loads. Ideally would push these into posts from loaderdata, but 
    rerender resets the count to 25 */}
    {postArray?.map((post: Post) =>
      <PostCard 
        key={post._id}
        editState={editState}
        setEditState={setEditState}
        post={post}
      />
    )}
    {!postSearchResults
      ?<><div ref={scrollerBottom}>&nbsp;</div>
        <div className={`site-notifications ${siteNotification.visible?"site-notifications--active":""}`}>
        <div className="loader"/>
          {siteNotification.msg}
        </div></>
      :""
    }
  </>
)};