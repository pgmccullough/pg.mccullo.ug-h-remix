import { ActionFunction, LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createUserSession, login } from "~/utils/session.server";
import { PostCard } from "~/components/PostCard/PostCard";
import { SignInModal } from "~/components/SignInModal/SignInModal";
import { clientPromise } from "~/lib/mongodb";

export const loader: LoaderFunction = async ({ request }) => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const posts = await db.collection("myPosts").find({ privacy : "Public" }).sort({created:-1}).limit(25).toArray();
  return { posts };
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
  const { posts } = useLoaderData();

  return (
    <>
      <SignInModal 
        registerOrLoginInit={2}
      />
      {posts?.map((post:any) =>
          <PostCard 
              key={post._id} 
              post={post}
          />
      )}
    </>
  );
}