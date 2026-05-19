import type { ActionFunctionArgs } from "react-router";

import * as postmark from "postmark";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";
import { sendEmail } from "~/utils/pusher.server";

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY!,
    secretAccessKey: S3_SECRET!,
  },
});

// Read an S3 streaming Body into a Buffer.
const streamToBuffer = async (stream: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

interface AttachmentMeta {
  ContentLength: number;
  Name: string;
  ContentType: string;
  ContentID: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  let newEmail: any = null;
  const emailFormData = await request.formData();
  if (user?.role === "administrator") {
    if (!process.env.POSTMARK_TOKEN)
      return { response: "Postmark token required." };
    const client = await clientPromise;
    const db = client.db("user_posts");

    const outgoingEmail: any = { From: "p@mccullo.ug" };
    for (const pair of emailFormData.entries()) {
      outgoingEmail[pair[0]] = pair[1];
    }

    if (outgoingEmail.Attachments) {
      outgoingEmail.Attachments = JSON.parse(outgoingEmail.Attachments);
      const attachmentBodies = await Promise.all(
        outgoingEmail.Attachments.map(async (att: AttachmentMeta) => {
          const fileLoc =
            "images/emailAttachments/" +
            att.ContentID +
            "." +
            att.Name.split(".").at(-1);
          const obj = await s3Client.send(
            new GetObjectCommand({ Bucket: S3_BUCKET!, Key: fileLoc })
          );
          const body = obj.Body
            ? await streamToBuffer(obj.Body as AsyncIterable<Uint8Array>)
            : Buffer.alloc(0);
          return { ContentLength: obj.ContentLength, Body: body };
        })
      );
      outgoingEmail.Attachments = outgoingEmail.Attachments.map(
        (att: AttachmentMeta) => {
          const match = attachmentBodies.find(
            (img) => img.ContentLength === att.ContentLength
          );
          return {
            ...att,
            Content: match ? match.Body.toString("base64") : "",
          };
        }
      );
    }

    const emailClient = new postmark.ServerClient(process.env.POSTMARK_TOKEN);
    if (!outgoingEmail?.TextBody && !outgoingEmail.HtmlBody)
      outgoingEmail.TextBody = " ";
    const genEmail = await emailClient.sendEmail(outgoingEmail);
    outgoingEmail.Attachments?.forEach((indAtt: any) => delete indAtt.Content);
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
      Opened: 0,
    };
    newEmail = await db.collection("myEmails").insertOne(newEmail);
    await sendEmail(newEmail);
  }
  return { newEmail };
};
