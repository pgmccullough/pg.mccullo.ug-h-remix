import type { LoaderFunctionArgs } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { Readable } from "node:stream";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getUser } from "~/utils/session.server";

const sharp = require("sharp");

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

// Single client per server instance.
const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY!,
    secretAccessKey: S3_SECRET!,
  },
});

// Collect an AWS SDK v3 streaming Body into a Buffer.
const streamToBuffer = async (stream: AsyncIterable<Uint8Array>): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const user = await getUser(request);

  // RR7 splat param is exposed as params["*"] (same as Remix v1).
  const { filePath } = params;
  const rest = params["*"];
  const fullPath = rest ? `${filePath}/${rest}` : filePath;

  if (!fullPath) {
    throw new Response("Bad Request", { status: 400 });
  }

  // Build the resized key by inserting _600w before the extension.
  const lastDot = fullPath.lastIndexOf(".");
  const desiredPath =
    lastDot === -1
      ? `${fullPath}_600w`
      : `${fullPath.slice(0, lastDot)}_600w${fullPath.slice(lastDot)}`;

  // Email attachments require admin auth.
  if (
    fullPath.split("/").includes("emailAttachments") &&
    !(user?.role === "administrator")
  ) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Background lazy-resize: if the user didn't ask for one of the user/cover
  // or user/profile assets (which are pre-sized at upload time), and the
  // _600w variant doesn't exist yet, generate it for next time.
  const imageResizer = async () => {
    try {
      const contentExt = fullPath.split(".").at(-1);
      const contentID = fullPath.replace(`.${contentExt}`, "");
      const obj = await s3Client.send(
        new GetObjectCommand({ Bucket: S3_BUCKET!, Key: `${contentID}.${contentExt}` })
      );
      if (!obj.Body) {
        console.error("no data returned from S3");
        return;
      }
      const buf = await streamToBuffer(obj.Body as AsyncIterable<Uint8Array>);
      const sharped = await sharp(buf).resize(600).toBuffer();
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET!,
          Key: `${contentID}_600w.${contentExt}`,
          Body: sharped,
        })
      );
    } catch (_err) {
      console.error("Something went wrong with the resize.");
    }
  };

  // Probe original + resize.
  let resizeImage;
  try {
    // headObject on the original — throws if missing.
    await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: fullPath })
    );
    try {
      resizeImage = await s3Client.send(
        new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: desiredPath })
      );
    } catch {
      const isUserAsset =
        fullPath.split("/")[1] === "user" &&
        (fullPath.split("/")[2] === "cover" ||
          fullPath.split("/")[2] === "profile");
      if (!isUserAsset) {
        // Fire-and-forget the background resize for next request.
        void imageResizer();
      }
    }
  } catch {
    /* original missing — fall through and let getObject throw */
  }

  const keyToServe = resizeImage ? desiredPath : fullPath;
  const obj = await s3Client.send(
    new GetObjectCommand({ Bucket: S3_BUCKET!, Key: keyToServe })
  );

  if (!obj.Body) {
    throw new Response("Not Found", { status: 404 });
  }

  // v3 Body is a Node.js Readable in Lambda/Node contexts. createReadable
  // StreamFromReadable expects a Node Readable.
  const nodeStream =
    obj.Body instanceof Readable
      ? obj.Body
      : Readable.from(obj.Body as AsyncIterable<Uint8Array>);

  const headers = new Headers();
  if (obj.ContentType) headers.set("Content-Type", obj.ContentType);
  if (obj.ContentLength) headers.set("Content-Length", String(obj.ContentLength));
  if (obj.ETag) headers.set("ETag", obj.ETag);
  // Cache resized variants and user assets aggressively.
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(createReadableStreamFromReadable(nodeStream), { headers });
};
