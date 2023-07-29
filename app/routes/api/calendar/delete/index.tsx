import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise, ObjectId } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  if(user?.role==="administrator") {
    const idsAndToken = await request.formData();
    const dbId = idsAndToken.get("deleteDbId")?.toString();
    const gId = idsAndToken.get("deleteGId")?.toString();
    const accessToken = idsAndToken.get("accessToken")?.toString();
    const client = await clientPromise;
    const db = client.db("user_posts");
    let googleDelete;
    try {
      googleDelete = await fetch(`https://www.googleapis.com/calendar/v3/calendars/patrick.g.mccullough@gmail.com/events/${gId}?access_token=${accessToken}`, {
        method: 'DELETE'
      });
    } catch(error) {
      googleDelete = error;
      return { deletedEvent: { error: "Unable to delete event in Google" }};
    }
    const outcome = await db.collection('myDates').deleteOne({_id : new ObjectId(dbId)});
    return { deletedEvent: { dbId: dbId, db: outcome, google: googleDelete }};
  }
}