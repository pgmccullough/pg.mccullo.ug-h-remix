import type { ActionArgs, UploadHandler } from "@remix-run/node";
import {
  json,
  unstable_composeUploadHandlers as composeUploadHandlers,
  unstable_createMemoryUploadHandler as createMemoryUploadHandler,
  unstable_parseMultipartFormData as parseMultipartFormData,
} from "@remix-run/node";
import AWS from "aws-sdk";

import { s3UploadHandler } from "~/utils/s3.server";

export const action = async ({ request }: ActionArgs) => {
  const uploadHandler: UploadHandler = composeUploadHandlers(
    s3UploadHandler,
    createMemoryUploadHandler()
  );
  const formData = await parseMultipartFormData(request, uploadHandler);
  const imgSrc = formData.get("img");


  const {
    S3_BUCKET,
    S3_KEY,
    S3_SECRET,
  } = process.env;

  const s3 = new AWS.S3({
    accessKeyId: S3_KEY,
    secretAccessKey: S3_SECRET
  });

  const s3params = {
    Bucket: S3_BUCKET!,
    Key: imgSrc?.toString().replace("https://s3.amazonaws.com/pg.mccullo.ug/","")!
  }

  let baseOutput = await s3.getObject(s3params).promise()

  if (!imgSrc) {
    return json({
      errorMsg: "Something went wrong while uploading",
    });
  }
  if(imgSrc.toString().includes('/images/emailAttachments/')) {
    return json({
      imgSrc: {
        file: imgSrc,
        ContentLength: baseOutput.ContentLength
      },
    });  
  }
  return json({
    imgSrc,
  });
};