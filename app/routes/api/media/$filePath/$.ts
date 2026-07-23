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

import sharp from "sharp";

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

// File extensions we'll attempt to sharp-resize. Anything else (videos,
// audio, PDFs, etc.) should never go through sharp — it'd just throw.
const IMAGE_EXTS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "tif", "tiff",
]);

function looksLikeImagePath(p: string): boolean {
  const ext = p.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTS.has(ext);
}

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

  // Probe original + resize. Only try sharp on actual image extensions
  // — videos/audio/PDFs don't have an _600w variant and shouldn't waste
  // a sharp call on every fetch.
  let resizeImage;
  const isImage = looksLikeImagePath(fullPath);
  try {
    // headObject on the original — throws if missing.
    await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: fullPath })
    );
    if (isImage) {
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
    }
  } catch {
    /* original missing — fall through and let getObject throw */
  }

  const keyToServe = resizeImage ? desiredPath : fullPath;

  // Honor HTTP Range so the browser can scrub video / resume large
  // downloads. Without this, <video> playback either re-downloads the
  // whole file on every seek or just doesn't work past the first chunk.
  // We forward the Range header straight to S3, which speaks Range
  // natively, and return 206 + Content-Range when the response is partial.
  const rangeHeader = request.headers.get("range") ?? undefined;
  const obj = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET!,
      Key: keyToServe,
      Range: rangeHeader,
    })
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

  // Content-Type: prefer whatever S3 stamped on upload, but many older
  // uploads have no ContentType or a generic application/octet-stream.
  // Fall back to a sensible guess from the file extension so image /
  // video / audio scrapers accept the response.
  const ext = keyToServe.split(".").pop()?.toLowerCase() ?? "";
  const extToMime: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", avif: "image/avif",
    svg: "image/svg+xml", bmp: "image/bmp",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    m4v: "video/x-m4v",
    mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4", wav: "audio/wav",
    pdf: "application/pdf",
  };
  const guessed = extToMime[ext];
  const sourceCT = obj.ContentType && obj.ContentType !== "application/octet-stream"
    ? obj.ContentType
    : undefined;
  const finalCT = sourceCT ?? guessed ?? "application/octet-stream";
  const headers = new Headers();
  headers.set("Content-Type", finalCT);
  if (obj.ContentLength) headers.set("Content-Length", String(obj.ContentLength));
  if (obj.ETag) headers.set("ETag", obj.ETag);
  // Always advertise Range support so the browser knows it can seek.
  headers.set("Accept-Ranges", "bytes");
  if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);
  // Cache resized variants and user assets aggressively. Skip the
  // immutable cache directive on partial responses — caches handle 206
  // independently and we don't want to pollute the full-response cache.
  if (!obj.ContentRange) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  const status = obj.ContentRange ? 206 : 200;
  return new Response(createReadableStreamFromReadable(nodeStream), {
    status,
    headers,
  });
};
