import type { ActionArgs } from "@remix-run/node";

import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const visitorJSON = (await request.formData()).get("visitor")?.toString();
  const visitor = JSON.parse(visitorJSON!);
  const client = await clientPromise;
  const db = client.db("user_posts");
  let targetUser;
  targetUser = visitor.user && await db.collection('myVisitors').find({userId : visitor.user.id}).toArray();
  if(!await targetUser.length) {
    targetUser = visitor.guestUUID && await db.collection('myVisitors').find({guestUUID : visitor.guestUUID}).toArray();
  }
  if(!await targetUser.length) {
    targetUser = visitor.ip && await db.collection('myVisitors').find({ip : visitor.ip}).toArray();
  }
  if(!await targetUser.length) {
    await db.collection('myVisitors').insertOne(visitor);
  } else {
    const userToUpdate = await targetUser;
    console.log("You should update",userToUpdate);
  }
  return { msg: "ok" };
}