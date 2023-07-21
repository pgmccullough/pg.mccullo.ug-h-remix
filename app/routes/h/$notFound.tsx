import { LoaderArgs, LoaderFunction } from "@remix-run/node";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const loader: LoaderFunction = async ({ request }: LoaderArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();  
  throw new Response(JSON.stringify({user,siteData}), {
    status: 404,
    statusText: "Sorry, this page either doesn't exist (check the spelling in the URL?) or maybe it does and you're just not allowed to see it...",
  });
}

export default () => <></>