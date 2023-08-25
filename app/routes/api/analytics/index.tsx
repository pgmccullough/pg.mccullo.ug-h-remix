import type { ActionArgs } from "@remix-run/node";

import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const visitorJSON = (await request.formData()).get("visitor")?.toString();
  const visitor = JSON.parse(visitorJSON!);
  const client = await clientPromise;
  const db = client.db("user_posts");
  let targetUser;
  targetUser = visitor.user.length && await db.collection('myVisitors').find({"user.id" : visitor.user.at("-1").id}).toArray();
  if(!await targetUser.length) {
    targetUser = visitor.guestUUID && await db.collection('myVisitors').find({guestUUID : {$all: visitor.guestUUID}}).toArray();
  }
  if(!await targetUser.length) {
    targetUser = visitor.ip.length && await db.collection('myVisitors').find({ip : {$all: visitor.ip}}).toArray();
  }
  if(!await targetUser.length) {
    await db.collection('myVisitors').insertOne(visitor);
  } else {
    const [ userToUpdate ] = await targetUser;
    userToUpdate.history = [...userToUpdate.history, ...visitor.history];
    userToUpdate.ip = [...userToUpdate.ip, ...visitor.ip];
    userToUpdate.ipData = [...userToUpdate.ipData, ...visitor.ipData];
    userToUpdate.guestUUID = [...userToUpdate.guestUUID, ...visitor.guestUUID];
    userToUpdate.user = [...userToUpdate.user, ...visitor.user];

    let updates = {...userToUpdate}
    delete updates._id;
    const setUpdates = {
      $set: updates
    }
    await db.collection('myVisitors').updateOne({_id : new ObjectId(userToUpdate._id)}, setUpdates);


  }
  return { msg: "ok" };
}