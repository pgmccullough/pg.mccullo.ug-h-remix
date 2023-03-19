import { PassThrough } from "stream";

import AWS from "aws-sdk";
import type { UploadHandler } from "@remix-run/node";
import { writeAsyncIterableToWritable } from "@remix-run/node";

const {
  S3_BUCKET,
  S3_REGION,
  S3_KEY,
  S3_SECRET,
} = process.env;

if (
  !(S3_KEY && S3_SECRET && S3_REGION && S3_BUCKET)
) {
  throw new Error(`Storage is missing required configuration.`);
}

const uploadStream = ({ Key }: Pick<AWS.S3.Types.PutObjectRequest, "Key">) => {
  const s3 = new AWS.S3({
    credentials: {
      accessKeyId: S3_KEY,
      secretAccessKey: S3_SECRET,
    },
    region: S3_REGION,
  });
  const pass = new PassThrough();
  return {
    writeStream: pass,
    promise: s3.upload({ Bucket: S3_BUCKET, Key, Body: pass }).promise(),
  };
};

export async function uploadStreamToS3(data: any, filename: string) {
  const stream = uploadStream({
    Key: filename,
  });
  await writeAsyncIterableToWritable(data, stream.writeStream);
  const file = await stream.promise;
  return file.Location;
}

export const s3UploadHandler: UploadHandler = async ({
  name,
  filename,
  data
}) => {
  if (name !== "img") {
    return undefined;
  }
  const uploadedFileLocation = await uploadStreamToS3(data, filename?.replaceAll("_","/")!);
  return uploadedFileLocation;
};