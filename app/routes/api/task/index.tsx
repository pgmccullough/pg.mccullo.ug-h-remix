import type { ActionArgs } from "@remix-run/node";
import { ObjectId } from "~/lib/mongodb";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let task = null;
  if(user?.role==="administrator") {
    const taskData = await request.formData();
    const taskAction = taskData.get("taskAction")?.toString();
    const taskObj = JSON.parse(taskData.get("taskObj")?.toString()!);
    const client = await clientPromise;
    const db = client.db("user_posts");
    if(taskAction==="addTask") {
      delete taskObj._id;
      task = await db.collection('myJobs').insertOne(taskObj);
      return { task };
    }
    if(taskAction==="archiveTask") {
      const archived = await db.collection('myJobs').updateOne({ _id : new ObjectId(taskObj._id)}, { $set: { archive: true } });
      return { archived: {...archived, archivedId: taskObj._id} };
    }
    if(taskAction==="deleteTask") {
      const deleted = await db.collection('myJobs').deleteOne({ _id : new ObjectId(taskObj._id)});
      return { deleted: {...deleted, deletedId: taskObj._id} };
    }
    if(taskAction==="updateTask") {
      const yearNow = new Date().getFullYear();
      const monthNow = (new Date().getMonth() + 1).toString().padStart(2,"0");
      const dateNow = (new Date().getDate()).toString().padStart(2,"0");
      taskObj.dailies = {...taskObj.dailies, [`${dateNow}-${monthNow}-${yearNow}`]: taskObj.curCount };
      const updated = await db.collection('myJobs').updateOne({ _id : new ObjectId(taskObj._id)}, { $set: { dailies: taskObj.dailies, curCount: taskObj.curCount } });
      return { updated: {...updated, updatedId: taskObj._id} };
    }
    return { error: "No data sent"}
  } else {
    return { error: "Unauthorized"}
  }
}