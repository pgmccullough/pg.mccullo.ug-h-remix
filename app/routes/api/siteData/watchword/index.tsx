import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let watchwordRes = null;
  const watchwordData:any = {}
  if(user?.role==="administrator") {
    const pastwords = await request.formData();
    const client = await clientPromise;
    const db = client.db("user_posts");
    for (const pair of pastwords.entries()) {
      watchwordData[pair[0]] = pair[1];
    }
    let parsedSiteData = JSON.parse(watchwordData.siteData);
    let updatedPast = parsedSiteData.past_watchwords;
    updatedPast.push(parsedSiteData.watchword);
    parsedSiteData.watchword = {word: watchwordData.watchword, timestamp: Date.now()};
    delete parsedSiteData._id;
    const updates = {
      $set: {...parsedSiteData}
    }
    try {
      watchwordRes = await db.collection('myUsers').updateOne({ user_name : "PGMcCullough" },updates);
    } catch (err) {
      watchwordRes = err;
    }
  }
  return { watchwordRes };
}