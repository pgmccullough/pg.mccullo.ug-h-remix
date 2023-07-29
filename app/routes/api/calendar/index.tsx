import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  if(user?.role==="administrator") {
    const eventsJSON = (await request.formData()).get("events")?.toString();
    const eventsArr = JSON.parse(eventsJSON!);
    const client = await clientPromise;
    const db = client.db("user_posts");
    const outcome = {updated: 0, added: 0};
    for(const event of eventsArr) {
      const eventToUpdate = await db.collection('myDates').find({gId : event.gId}).toArray();
      if(eventToUpdate.length) {
        outcome.updated++;
        await db.collection('myDates').updateOne(eventToUpdate[0], {$set:event});
      } else {
        outcome.added++;
        await db.collection('myDates').insertOne(event);
      }
    }
    return { events: outcome };
  }
}