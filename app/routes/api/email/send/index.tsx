import type { ActionArgs } from "@remix-run/node";

import * as postmark from "postmark"
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let newEmail = null;
  const emailFormData = await request.formData();
  if(user?.role==="administrator") {
    if(!process.env.POSTMARK_TOKEN) return {response: "Postmark token required."};
    const client = await clientPromise;
    const db = client.db("user_posts");
    let outgoingEmail:any = {};
    outgoingEmail.From = "p@mccullo.ug";
    for (const pair of emailFormData.entries()) {
      outgoingEmail[pair[0]] = pair[1];
    }
    const emailClient = new postmark.ServerClient(process.env.POSTMARK_TOKEN);
    const genEmail = await emailClient.sendEmail(outgoingEmail)
    newEmail = {
      created: Date.now(),
      MessageStream: "outbound",
      To: outgoingEmail.To,
      Cc: outgoingEmail.Cc,
      Bcc: outgoingEmail.Bcc,
      From: outgoingEmail.From,
      Subject: outgoingEmail.Subject,
      MessageId: genEmail.MessageID,
      TextBody: outgoingEmail.HtmlBody?.replace(/(&lt;([^>]+)>)/gi, ""),
      HtmlBody: outgoingEmail.HtmlBody,
      Opened: 0
    };
    newEmail = await db.collection('myEmails').insertOne(newEmail);
  }
  return { newEmail };
}