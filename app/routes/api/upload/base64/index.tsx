import type { ActionArgs, ActionFunction } from "@remix-run/node";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from 'uuid';

export const action: ActionFunction = async ({ request }: ActionArgs) => {
  
  const formData = await request.formData();
  const uploadArray = JSON.parse(formData.get("uploads")!.toString());
  const uploadResponse: any[] = [];

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

  const uploadAttachment = async(
    base64:string, contentName:string, contentType:string, contentID:string
  ) => {
    let uploadResponse;
    const base64Data = new (Buffer as any).from(base64, 'base64');
    const contentNameBits:String[] = contentName.split(".");
    const contentExt = contentNameBits.at(-1);
    const params = {
      Bucket: S3_BUCKET!,
      Key: `images/${contentID}.${contentExt}`,
      Body: base64Data,
      ContentEncoding: 'base64',
      ContentType: contentType
    }
    uploadResponse = await s3.upload(params, (err:any, data:any) => {
      if (err) {
        return err
      } else {
        uploadResponse = data;
        return data
      }
    }).promise();
    return uploadResponse;
  }

  for(const file of uploadArray) {
    let { fileData, fileMeta } = file;
    fileData = fileData.replace(/^data:.*?;base64,/, "");
    fileMeta = JSON.parse(fileMeta);
    const fileName = fileMeta.name;
    const fileType = fileMeta.type;
    try {
      const awsUuid = uuidv4();
      let uploadRes = await uploadAttachment(fileData, fileName, fileType, awsUuid);
      uploadResponse.push({name: fileName, type: fileType, uploadRes});
    } catch(err) {
      throw new Response("Error storing email.", {
        status: 400
      });
    }
  }
  return {uploaded: uploadResponse};
}