import type { LoaderArgs, LoaderFunction } from '@remix-run/node';
import { createReadableStreamFromReadable } from '@remix-run/node';
import AWS from "aws-sdk";

export const loader: LoaderFunction = async ({ params }: LoaderArgs) => {

  const {
    S3_BUCKET,
    S3_REGION,
    S3_KEY,
    S3_SECRET,
  } = process.env;

  const s3 = new AWS.S3({
    accessKeyId: S3_KEY,
    secretAccessKey: S3_SECRET
  });

  const {filePath,['*']:rest} = params;
  const fullPath = rest?`${filePath}/${rest}`:filePath;

  const s3params = {
    Bucket: S3_BUCKET!,
    Key: fullPath!
  }

  let baseOutput = s3.getObject(s3params)
  .createReadStream()

  return new Response(createReadableStreamFromReadable(baseOutput))
}