import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const search = (await request.formData()).get("search")?.toString();
  let matchingEmails;
  let caseInsensitiveSearch = new RegExp(search!,"i");
  if(user?.role==="administrator") {
    try{
      matchingEmails = await db.collection('myEmails')
        .find( { $or: [ 
          { From: caseInsensitiveSearch },
          { Subject: caseInsensitiveSearch },
          { TextBody: caseInsensitiveSearch },
        ] } )
        .sort({created:-1})
        .toArray();
    } catch (err) {
      matchingEmails = false;
    }
  }
  return { matchingEmails };
}