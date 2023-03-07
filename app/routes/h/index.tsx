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
  }
  return { onThisDay, posts };
}

export default function Index() {
  const { onThisDay, posts } = useLoaderData();
  return (
    <>
      {onThisDay.length?<div className="onThisDay__label">On this Day</div>:""}
      {onThisDay?.map((thisDay:any, i:number) =>
          <PostCard 
            key={thisDay._id} 
            post={thisDay}
          />
      )}
      {posts?.map((post:any) =>
        <PostCard 
          key={post._id} 
          post={post}
        />
      )}
    </>
  );
}
