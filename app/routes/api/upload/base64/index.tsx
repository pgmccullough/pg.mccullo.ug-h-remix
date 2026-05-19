import type { ActionFunctionArgs } from "react-router";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

import sharp from "sharp";

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY!,
    secretAccessKey: S3_SECRET!,
  },
});

const streamToBuffer = async (stream: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const uploadArray = JSON.parse(formData.get("uploads")!.toString());
  const uploadResponse: any[] = [];

  const uploadAttachment = async (
    base64: string,
    contentName: string,
    contentType: string,
    contentID: string
  ) => {
    const base64Data = Buffer.from(base64, "base64");
    const contentExt = contentName.split(".").at(-1);
    const key = `images/${contentID}.${contentExt}`;

    const putResult = await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET!,
        Key: key,
        Body: base64Data,
        ContentEncoding: "base64",
        ContentType: contentType,
      })
    );

    // Fire-and-forget the 600w resize so the caller doesn't wait on it.
    void (async () => {
      try {
        const obj = await s3Client.send(
          new GetObjectCommand({ Bucket: S3_BUCKET!, Key: key })
        );
        if (!obj.Body) return;
        const body = await streamToBuffer(obj.Body as AsyncIterable<Uint8Array>);
        const sharped = await sharp(body).resize(600).toBuffer();
        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET!,
            Key: `images/${contentID}_600w.${contentExt}`,
            Body: sharped,
          })
        );
      } catch (_err) {
        console.error("Something went wrong with the resize.");
      }
    })();

    // Mirror the v2 SDK's response shape that the original caller relied on.
    return {
      Key: key,
      ETag: putResult.ETag,
      Location: `https://s3.${S3_REGION}.amazonaws.com/${S3_BUCKET}/${key}`,
    };
  };

  for (const file of uploadArray) {
    let { fileData, fileMeta } = file;
    fileData = fileData.replace(/^data:.*?;base64,/, "");
    fileMeta = JSON.parse(fileMeta);
    const fileName = fileMeta.name;
    const fileType = fileMeta.type;
    try {
      const awsUuid = uuidv4();
      const uploadRes = await uploadAttachment(
        fileData,
        fileName,
        fileType,
        awsUuid
      );
      uploadResponse.push({ name: fileName, type: fileType, uploadRes });
    } catch (_err) {
      throw new Response("Error storing email.", { status: 400 });
    }
  }
  return { uploaded: uploadResponse };
};
