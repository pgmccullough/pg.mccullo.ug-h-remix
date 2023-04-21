import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let bioRes = null;
  if(user?.role==="administrator") {
    const newBio = (await request.formData()).get("bioData")?.toString();
    const client = await clientPromise;
    const db = client.db("user_posts");
    const updates = {
      $set: {site_description: newBio}
    }
    try {
      bioRes = await db.collection('myUsers').updateOne({ user_name : "PGMcCullough" },updates);
    } catch (err) {
      bioRes = err;
    }
  }
  return { bioRes };
}