import type { ActionArgs } from "@remix-run/node";

import * as postmark from "postmark"
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { sendEmail } from "~/utils/pusher.server";
import AWS from "aws-sdk";

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
    let newAttachments;
    if(outgoingEmail.Attachments) {
      const {
        S3_BUCKET,
        S3_KEY,
        S3_SECRET,
      } = process.env;
    
      const s3 = new AWS.S3({
        accessKeyId: S3_KEY,
        secretAccessKey: S3_SECRET
      });
      
      outgoingEmail.Attachments = JSON.parse(outgoingEmail.Attachments);
      newAttachments = await outgoingEmail.Attachments.map((att: {ContentLength: number, Name: string, ContentType: string, ContentID: string}) => {
        const fileLoc = "images/emailAttachments/"+att.ContentID+"."+att.Name.split(".").at(-1);
      
        const s3params = {
          Bucket: S3_BUCKET!,
          Key: fileLoc
        }
      
        return s3.getObject(s3params).promise();
      })
    }
    const emailClient = new postmark.ServerClient(process.env.POSTMARK_TOKEN);
    const images = await Promise.all(newAttachments);
    const updatedAttachments = outgoingEmail.Attachments.map(
      (att: {ContentLength: number, Name: string, ContentType: string, ContentID: string}) => {
        return {...att, Content: images.find(img => img.ContentLength===att.ContentLength).Body.toString('base64')};
      }
    )
    outgoingEmail.Attachments = updatedAttachments;
    if(!outgoingEmail.TextBody&&!outgoingEmail.HtmlBody) outgoingEmail.TextBody = " ";
    const genEmail = await emailClient.sendEmail(outgoingEmail)
    outgoingEmail.Attachments.forEach((indAtt:{Content?: string, ContentLength: number, file: string, name: string, Name: string, ContentID: string }) =>
      delete indAtt.Content
    );
    newEmail = {
      created: Date.now(),
      MessageStream: "outbound",
      Attachments: outgoingEmail.Attachments,
      To: outgoingEmail.To,
      Cc: outgoingEmail.Cc,
      Bcc: outgoingEmail.Bcc,
      From: outgoingEmail.From,
      Subject: outgoingEmail.Subject,
      MessageId: genEmail.MessageID,
      TextBody: outgoingEmail.HtmlBody?.replace(/(<([^>]+)>)/gi, ""),
      HtmlBody: outgoingEmail.HtmlBody,
      Opened: 0
    };
    newEmail = await db.collection('myEmails').insertOne(newEmail);
    await sendEmail(newEmail);
  }
  return { newEmail };
}