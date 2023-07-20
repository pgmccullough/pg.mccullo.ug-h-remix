import { PassThrough } from "stream";

import AWS from "aws-sdk";
import type { UploadHandler } from "@remix-run/node";
import { writeAsyncIterableToWritable } from "@remix-run/node";

const sharp = require('sharp');

const {
  S3_BUCKET,
  S3_REGION,
  S3_KEY,
  S3_SECRET,
} = process.env;

if (
  !(S3_KEY && S3_SECRET && S3_REGION && S3_BUCKET)
) {
  throw new Error(`S3 is missing required configuration.`);
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
  return file;
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
  if(filename?.split("_")[1]==="user"
  && (filename?.split("_")[2]==="cover"
    || filename?.split("_")[2]==="profile"
  )) {
    const params = { Bucket: S3_BUCKET, Key: uploadedFileLocation.Key };
    const s3 = new AWS.S3({
      credentials: {
        accessKeyId: S3_KEY,
        secretAccessKey: S3_SECRET,
      },
      region: S3_REGION,
    });

    s3.getObject(params, (_err, data) => {
      sharp(data.Body)
      .resize(filename?.split("_")[2]==="cover"
        ?1600
        :{width: 110,height: 110, fit: sharp.fit.cover}
      )
      .toBuffer()
      .then((sharped: any) => {
        const resizeAndUploadToS3 = async () => {
          await s3.upload({
            Bucket: S3_BUCKET,
            Key: filename!.replaceAll("_","/"),
            Body: sharped
          }).promise();
        }
        resizeAndUploadToS3();
      })
      .catch((_err: any)  => {
        console.error("Something went wrong with the resize.");
      });
    });
  }

  return uploadedFileLocation.Location;
};