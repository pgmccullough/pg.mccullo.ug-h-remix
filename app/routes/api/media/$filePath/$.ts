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

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Serve a 1200x630 landscape crop of the original image, generated
 * with Sharp and cached to S3 as `<original-without-ext>_og.jpg`.
 * If the cached variant exists, we serve it. Otherwise generate,
 * write to S3, and stream back the buffer.
 *
 * `fit: cover` + `position: attention` picks the most interesting
 * region of the image (Sharp's built-in feature-detection) rather
 * than a naive centre crop, so portrait/tall images don't lose the
 * subject.
 */
async function serveOgCrop(fullPath: string): Promise<Response> {
  const baseKey = fullPath.replace(/\.[^.]+$/, "");
  const cachedKey = `${baseKey}_og.jpg`;

  // Cached path — serve directly if it already exists.
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: cachedKey }));
    const cached = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET!, Key: cachedKey }));
    if (cached.Body) {
      const nodeStream = cached.Body instanceof Readable
        ? cached.Body
        : Readable.from(cached.Body as AsyncIterable<Uint8Array>);
      return new Response(createReadableStreamFromReadable(nodeStream), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          ...(cached.ContentLength ? { "Content-Length": String(cached.ContentLength) } : {}),
        },
      });
    }
  } catch { /* cache miss — fall through to generate */ }

  // Generate: fetch original, crop with Sharp, put back to S3.
  try {
    const original = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET!, Key: fullPath })
    );
    if (!original.Body) {
      return new Response("Not Found", { status: 404 });
    }
    const buf = await streamToBuffer(original.Body as AsyncIterable<Uint8Array>);
    const cropped = await sharp(buf)
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover", position: "attention" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    // Fire-and-forget cache write — we don't want to block the response.
    void s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET!,
        Key: cachedKey,
        Body: cropped,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      })
    ).catch((err) => console.error("[og-crop] cache write failed:", err));

    return new Response(cropped, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(cropped.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[og-crop] generation failed:", err);
    return new Response("OG crop failed", { status: 500 });
  }
}

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const user = await getUser(request);

  // RR7 splat param is exposed as params["*"] (same as Remix v1).
  const { filePath } = params;
  const rest = params["*"];
  const fullPath = rest ? `${filePath}/${rest}` : filePath;

  // ?og=1 flag — social platforms want a 1200x630 (1.91:1) landscape
  // crop. We generate one on demand via Sharp and cache to S3 as
  // <original>_og.jpg so subsequent scrapes are cheap. Only applies
  // to images.
  const urlObj = new URL(request.url);
  const wantsOg = urlObj.searchParams.get("og") === "1";
  if (wantsOg && fullPath && looksLikeImagePath(fullPath)) {
    return await serveOgCrop(fullPath);
  }

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
      // Animated GIFs: skip Sharp resize entirely and never cache a
      // _600w variant. Sharp's animated-GIF re-encode is fragile
      // (loses frames on some inputs even with `animated: true`),
      // and GIFs are the one format where preserving animation is
      // more valuable than saving bytes. The media proxy will
      // continue serving the original directly.
      if ((contentExt ?? "").toLowerCase() === "gif") {
        return;
      }
      // `animated: true` still applied to non-GIF multi-page inputs
      // (animated WebP, etc.) so those keep animation through resize.
      const sharped = await sharp(buf, { animated: true })
        .resize(600)
        .toBuffer();
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

  // Historic Instagram-backup files were uploaded to S3 with their
  // spaces URL-encoded as %20 in the actual object key (e.g.
  // "Instagram%20Backup" literal characters). But RR v7 URL-decodes
  // params["*"] on the way in, so we always start with a space in
  // fullPath. Probe both forms; whichever HEAD succeeds becomes the
  // key we use for the rest of the request.
  let effectivePath = fullPath;
  const hasSpaces = fullPath!.includes(" ");
  const encodedSpaceVariant = hasSpaces
    ? fullPath!.replace(/ /g, "%20")
    : null;

  // Probe original + resize. Only try sharp on actual image extensions
  // — videos/audio/PDFs don't have an _600w variant and shouldn't waste
  // a sharp call on every fetch.
  let resizeImage;
  const isImage = looksLikeImagePath(fullPath);
  try {
    // headObject on the original — throws if missing.
    try {
      await s3Client.send(
        new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: effectivePath })
      );
    } catch (headErr: any) {
      // First HEAD failed — if we have a spaces-in-path candidate,
      // try the %20 variant before giving up. Fixes historic
      // uploads whose keys were URL-encoded at upload time.
      if (encodedSpaceVariant) {
        try {
          await s3Client.send(
            new HeadObjectCommand({
              Bucket: S3_BUCKET!,
              Key: encodedSpaceVariant,
            })
          );
          effectivePath = encodedSpaceVariant;
        } catch {
          throw headErr;
        }
      } else {
        throw headErr;
      }
    }
    // GIFs bypass the _600w cache lookup entirely — even if a stale
    // single-frame _600w exists in S3 from before the fix, we ignore
    // it and serve the original animated file.
    const isGif = fullPath.split(".").pop()?.toLowerCase() === "gif";
    if (isImage && !isGif) {
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

  // Use effectivePath (which was updated above if the encoded-space
  // variant was the one that actually exists in S3). Only images have
  // a `desiredPath` _600w variant; videos/audio serve at effectivePath.
  const keyToServe = resizeImage ? desiredPath : effectivePath;

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
