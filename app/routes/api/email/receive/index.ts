import type { ActionArgs, ActionFunction } from "@remix-run/node";
import { clientPromise } from "~/lib/mongodb";
import AWS from "aws-sdk";
import { receiveEmail } from "~/utils/pusher.server";
import { v4 as uuidv4 } from 'uuid';

export const action: ActionFunction = async ({ request }: ActionArgs) => {
  
  const postData = await request.json();
  const reqBody:any = postData;
  const { OriginalRecipient } = reqBody;

  if(request.method!=="POST"
    ||OriginalRecipient!==process.env.POSTMARK_INBOUND_ADDRESS
  ) {
    throw new Response("Unauthorized", {
      status: 401
    });
  };

  const client = await clientPromise;
  const db = client.db("user_posts");

  const {
    S3_BUCKET,
    S3_REGION,
    S3_KEY,
    S3_SECRET,
  } = process.env;

  const s3 = new AWS.S3({
    credentials: {
      accessKeyId: S3_KEY!,
      secretAccessKey: S3_SECRET!,
    },
    region: S3_REGION,
  });

  const uploadAttachment = (
    base64:string, contentName:string, contentType:string, contentID:string
  ) => {
    const base64Data = new (Buffer as any).from(base64, 'base64');
    const contentNameBits:String[] = contentName.split(".");
    const contentExt = contentNameBits.at(-1);
    const params = {
      Bucket: S3_BUCKET!,
      Key: `images/emailAttachments/${contentID}.${contentExt}`,
      Body: base64Data,
      ContentEncoding: 'base64',
      ContentType: contentType
    }
    s3.upload(params, (err:any, data:any) => {
      if (err) {
        console.error("Email Attachment Error", err);
      }
    });
  }
  
  const newEmail = {...reqBody,unread:1,created:Date.now()};
  newEmail.Attachments?.forEach((attach:any) => {
    uploadAttachment(attach.Content,attach.Name,attach.ContentType,attach.ContentID||uuidv4());
    delete attach.Content;
  })
  delete newEmail.Headers;

  try {
    const sendEmail = await db.collection('myEmails').insertOne(newEmail);
    await receiveEmail(sendEmail);
    return { sendEmail };
  } catch(err) {
    throw new Response("Error storing email.", {
      status: 400
    });
  }
}