import { PassThrough } from "node:stream";

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { UploadHandler } from "react-router";
import { writeAsyncIterableToWritable } from "@react-router/node";

const sharp = require("sharp");

const {
  S3_BUCKET,
  S3_REGION,
  S3_KEY,
  S3_SECRET,
} = process.env;

if (!(S3_KEY && S3_SECRET && S3_REGION && S3_BUCKET)) {
  throw new Error(`S3 is missing required configuration.`);
}

// One client per server instance. v3's S3Client is thread-safe and caches
// connections internally.
const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY,
    secretAccessKey: S3_SECRET,
  },
});

/**
 * Streaming upload to S3. Returns a writable PassThrough and a promise that
 * resolves to the uploaded object's metadata (including a `Location` URL).
 */
const uploadStream = ({ Key }: { Key: string }) => {
  const pass = new PassThrough();
  const upload = new Upload({
    client: s3Client,
    params: { Bucket: S3_BUCKET!, Key, Body: pass },
  });
  return {
    writeStream: pass,
    promise: upload.done(),
  };
};

export async function uploadStreamToS3(data: AsyncIterable<Uint8Array>, filename: string) {
  const stream = uploadStream({ Key: filename });
  await writeAsyncIterableToWritable(data, stream.writeStream);
  const file = await stream.promise;
  // The Upload.done() result has Location/Key/Bucket/ETag.
  return file as { Location?: string; Key?: string; Bucket?: string; ETag?: string };
}

// Helper: read an entire S3 object body into a Buffer. v3 streams are
// AsyncIterable<Uint8Array>; we collect chunks.
const streamToBuffer = async (stream: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const s3UploadHandler: UploadHandler = async ({ name, filename, data }) => {
  if (name !== "img") {
    return undefined;
  }

  const uploadedFileLocation = await uploadStreamToS3(
    data as AsyncIterable<Uint8Array>,
    filename?.replaceAll("_", "/")!
  );

  // For user cover / profile images, also generate a resized variant in the
  // background and overwrite the original with the sharpened/resized version.
  // (This preserves the behavior of the old code.)
  if (
    filename?.split("_")[1] === "user" &&
    (filename?.split("_")[2] === "cover" || filename?.split("_")[2] === "profile")
  ) {
    const key = uploadedFileLocation.Key!;
    try {
      const obj = await s3Client.send(
        new GetObjectCommand({ Bucket: S3_BUCKET!, Key: key })
      );
      if (obj.Body) {
        const body = await streamToBuffer(obj.Body as AsyncIterable<Uint8Array>);
        const sharped = await sharp(body)
          .resize(
            filename?.split("_")[2] === "cover"
              ? 1600
              : { width: 110, height: 110, fit: sharp.fit.cover }
          )
          .toBuffer();
        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET!,
            Key: filename!.replaceAll("_", "/"),
            Body: sharped,
          })
        );
      }
    } catch (_err) {
      console.error("Something went wrong with the resize.");
    }
  }

  return uploadedFileLocation.Location;
};
