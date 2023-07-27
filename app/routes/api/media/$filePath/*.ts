import type { LoaderArgs, LoaderFunction } from '@remix-run/node';
import { createReadableStreamFromReadable } from '@remix-run/node';
import { getUser } from "~/utils/session.server";
import AWS from "aws-sdk";
const sharp = require('sharp');

export const loader: LoaderFunction = async ({ params, request }: LoaderArgs) => {

  const user = await getUser(request);

  const {
    S3_BUCKET,
    S3_KEY,
    S3_SECRET,
  } = process.env;

  const s3 = new AWS.S3({
    accessKeyId: S3_KEY,
    secretAccessKey: S3_SECRET
  });

  const {filePath,['*']:rest} = params;
  const fullPath = rest?`${filePath}/${rest}`:filePath;
  let desiredPath: string[] | string = fullPath?.split(".")!;
  desiredPath = `${desiredPath[0]}_600w.${desiredPath[1]}`;


  if(fullPath?.split("/").includes("emailAttachments")&&!(user?.role==="administrator")) {
    throw new Response("Unauthorized", {
      status: 401
    });
  }

  const imageResizer = () => {
    try {
      const contentExt = fullPath?.split(".").at(-1);
      const contentID = fullPath?.replace(`.${contentExt}`,'');
      s3.getObject({ Bucket: S3_BUCKET!, Key: `${contentID}.${contentExt}` }, (_err, data) => {
        data
        ?sharp(data?.Body)
        .resize(600)
        .toBuffer()
        .then((sharped: any) => {
          const resizeAndUploadToS3 = async () => {
            await s3.upload({
              Bucket: S3_BUCKET!,
              Key: `${contentID}_600w.${contentExt}`,
              Body: sharped
            }).promise();
          }
          resizeAndUploadToS3();
        })
        .catch((_err: any)  => {
          console.error("Something went wrong with the resize.",);
        })
        :console.error("no data returned from S3");
      });
    } catch(_err) {
      console.error("No file returned.");
    }
  }

  const s3paramsOriginal = {
    Bucket: S3_BUCKET!,
    Key: fullPath!
  }

  const s3paramsResize = {
    Bucket: S3_BUCKET!,
    Key: desiredPath!
  }

  let originalImage;
  let resizeImage;
  try {
    originalImage = await s3.headObject(s3paramsOriginal).promise();
    try {
      resizeImage = await s3.headObject(s3paramsResize).promise();
    } catch(err) {
      if(!(fullPath?.split("/")[1]==="user"
      && (fullPath?.split("/")[2]==="cover"
        || fullPath?.split("/")[2]==="profile"
        )
      )) {
        imageResizer()
      }
    }
  } catch(err) {}
  
  
  const baseOutput = s3.getObject(resizeImage?s3paramsResize:s3paramsOriginal)
  .createReadStream();

  return new Response(createReadableStreamFromReadable(baseOutput))
}