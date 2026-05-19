import type { ActionFunctionArgs } from "react-router";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { clientPromise } from "~/lib/mongodb";
import { receiveEmail } from "~/utils/pusher.server";
import { v4 as uuidv4 } from "uuid";

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY!,
    secretAccessKey: S3_SECRET!,
  },
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const postData = await request.json();
  const reqBody: any = postData;
  const { OriginalRecipient } = reqBody;

  if (
    request.method !== "POST" ||
    OriginalRecipient !== process.env.POSTMARK_INBOUND_ADDRESS
  ) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db("user_posts");

  const uploadAttachment = async (
    base64: string,
    contentName: string,
    contentType: string,
    contentID: string
  ) => {
    const base64Data = Buffer.from(base64, "base64");
    const contentExt = contentName.split(".").at(-1);
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET!,
          Key: `images/emailAttachments/${contentID}.${contentExt}`,
          Body: base64Data,
          ContentEncoding: "base64",
          ContentType: contentType,
        })
      );
    } catch (err) {
      console.error("Email Attachment Error", err);
    }
  };

  const newEmail = { ...reqBody, unread: 1, created: Date.now() };
  if (newEmail.Attachments?.length) {
    // Fire all attachment uploads in parallel; we don't need to await here
    // because the email body itself is already stored without the base64
    // content.
    await Promise.all(
      newEmail.Attachments.map((attach: any) => {
        const promise = uploadAttachment(
          attach.Content,
          attach.Name,
          attach.ContentType,
          attach.ContentID || uuidv4()
        );
        delete attach.Content;
        return promise;
      })
    );
  }
  delete newEmail.Headers;

  try {
    const sendEmail = await db.collection("myEmails").insertOne(newEmail);
    await receiveEmail(sendEmail);
    return { sendEmail };
  } catch (_err) {
    throw new Response("Error storing email.", { status: 400 });
  }
};
