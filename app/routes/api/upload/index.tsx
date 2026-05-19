import type { ActionFunctionArgs, UploadHandler } from "react-router";
import {
  unstable_composeUploadHandlers as composeUploadHandlers,
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
  unstable_parseMultipartFormData as parseMultipartFormData,
} from "@react-router/node";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

import { s3UploadHandler } from "~/utils/s3.server";

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY!,
    secretAccessKey: S3_SECRET!,
  },
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const uploadHandler: UploadHandler = composeUploadHandlers(
    s3UploadHandler,
    createMemoryUploadHandler()
  );
  const formData = await parseMultipartFormData(request, uploadHandler);
  const imgSrc = formData.get("img");

  if (!imgSrc) {
    return Response.json({
      errorMsg: "Something went wrong while uploading",
    });
  }

  // For email attachments, look up the file's content length so the composer
  // can match content back to attachment metadata.
  if (imgSrc.toString().includes("/images/emailAttachments/")) {
    const key = imgSrc
      .toString()
      .replace("https://s3.amazonaws.com/pg.mccullo.ug/", "");
    let contentLength: number | undefined;
    try {
      const head = await s3Client.send(
        new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: key })
      );
      contentLength = head.ContentLength;
    } catch (_err) {
      contentLength = undefined;
    }
    return Response.json({
      imgSrc: {
        file: imgSrc,
        ContentLength: contentLength,
      },
    });
  }

  return Response.json({ imgSrc });
};
