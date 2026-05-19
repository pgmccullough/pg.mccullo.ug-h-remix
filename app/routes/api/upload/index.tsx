import type { ActionFunctionArgs } from "react-router";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

import { uploadFileToS3 } from "~/utils/s3.server";

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY!,
    secretAccessKey: S3_SECRET!,
  },
});

export const action = async ({ request }: ActionFunctionArgs) => {
  // RR7 removed the Remix v1 unstable_* upload-handler API. Use the
  // standard Web FormData API; the request body is parsed for us and the
  // file comes back as a File instance.
  const formData = await request.formData();
  const file = formData.get("img");

  if (!(file instanceof File)) {
    return Response.json({
      errorMsg: "Something went wrong while uploading",
    });
  }

  const { Location } = await uploadFileToS3(file);

  // For email attachments, look up the file's content length so the composer
  // can match content back to attachment metadata.
  if (Location.includes("/images/emailAttachments/")) {
    const key = Location.replace(
      `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`,
      ""
    );
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
        file: Location,
        ContentLength: contentLength,
      },
    });
  }

  return Response.json({ imgSrc: Location });
};
