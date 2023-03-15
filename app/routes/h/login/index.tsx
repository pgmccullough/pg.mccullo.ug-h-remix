import { ActionFunction, LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createUserSession, getUser, login } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { SignInModal } from "~/components/SignInModal/SignInModal";
import { clientPromise } from "~/lib/mongodb";
import { Header } from "~/components/Header/Header";
import { Sidebar } from "~/components/Sidebar/Sidebar";

import styles from "~/styles/App.css";

export const links = () => {
  return [{ rel: "stylesheet", href: styles }];
}

export const loader: LoaderFunction = async ({ request }) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).limit(25).toArray();
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();
  return { posts, siteData:{...siteData[0]} };
}

export const action: ActionFunction = async ({ request }) => {
  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");
  const redirectTo = form.get("redirectTo") || "/h/"

  const user = await login({ username, password });
  console.log({ user });
  if (!user) {
    return "error";
  }
  return createUserSession(user.id, redirectTo);

}

export default function Index() {
  const { posts, user } = useLoaderData();
  return (
    <>
      <Header />
      <div className="content">
        <Sidebar />
        <div className="right-column">
          <SignInModal 
            registerOrLoginInit={2}
          />
          {posts?.map((post:any) =>
              <PostCard 
                  key={post._id} 
                  post={post}
              />
          )}
        </div>
      </div>
    </>
  );
}