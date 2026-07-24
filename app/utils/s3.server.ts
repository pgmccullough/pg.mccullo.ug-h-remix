import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

if (!(S3_KEY && S3_SECRET && S3_REGION && S3_BUCKET)) {
  throw new Error(`S3 is missing required configuration.`);
}

// One client per server instance. v3's S3Client is thread-safe and caches
// connections internally.
//
// `requestChecksumCalculation: "WHEN_REQUIRED"` is critical for presigned
// PUT URLs: the default ("WHEN_SUPPORTED") makes the SDK precompute a
// CRC32 of an EMPTY body and sign it into the URL — then when the browser
// uploads real bytes the server-computed checksum doesn't match and S3
// rejects the PUT with 400. Same hazard with response checksums.
const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_KEY,
    secretAccessKey: S3_SECRET,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const publicLocation = (key: string) =>
  `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;

const streamToBuffer = async (
  stream: AsyncIterable<Uint8Array>
): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

/**
 * Upload a single File to S3, keyed by its filename. The Header client
 * encodes the S3 key in `file.name` using underscores in place of slashes
 * (because browsers won't accept slashes in File names); we reverse that
 * here before upload.
 *
 * For user/cover and user/profile images we also generate a sharp-resized
 * variant and overwrite the original in-place (matching the legacy behavior).
 */
export async function uploadFileToS3(
  file: File
): Promise<{ Key: string; Location: string }> {
  const key = file.name.replaceAll("_", "/");
  const body = new Uint8Array(await file.arrayBuffer());

  // For tiny/medium files just PutObject; for large ones (>5MB) use the
  // multipart Upload helper so we don't have to hold the whole thing in
  // memory unnecessarily.
  if (body.byteLength > 5 * 1024 * 1024) {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: S3_BUCKET!,
        Key: key,
        Body: body,
        ContentType: file.type || undefined,
      },
    });
    await upload.done();
  } else {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET!,
        Key: key,
        Body: body,
        ContentType: file.type || undefined,
      })
    );
  }

  // Cover/profile post-processing (same logic the old s3UploadHandler ran).
  const parts = file.name.split("_");
  if (parts[1] === "user" && (parts[2] === "cover" || parts[2] === "profile")) {
    try {
      const obj = await s3Client.send(
        new GetObjectCommand({ Bucket: S3_BUCKET!, Key: key })
      );
      if (obj.Body) {
        const buf = await streamToBuffer(obj.Body as AsyncIterable<Uint8Array>);
        // animated: true preserves multi-page GIF/WebP animation
        // through the resize. No-op for static images.
        const sharped = await sharp(buf, { animated: true })
          .resize(
            parts[2] === "cover"
              ? 1600
              : { width: 110, height: 110, fit: sharp.fit.cover }
          )
          .toBuffer();
        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET!,
            Key: key,
            Body: sharped,
            ContentType: file.type || undefined,
          })
        );
      }
    } catch (_err) {
      console.error("Something went wrong with the resize.");
    }
  }

  return { Key: key, Location: publicLocation(key) };
}

/**
 * Read an S3 object's bytes directly. Used by server-side code that
 * needs the raw content (e.g. cross-posting a video to Bluesky) and
 * would otherwise have to fetch its own `/api/media/...` proxy URL —
 * paying a Vercel→Vercel HTTP hop that easily costs 2-3 seconds.
 * Returns null if the object is missing or unreadable.
 */
export async function getObjectBytes(key: string): Promise<{
  bytes: Uint8Array;
  contentType?: string;
  contentLength?: number;
} | null> {
  try {
    const obj = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET!, Key: key })
    );
    if (!obj.Body) return null;
    const buf = await streamToBuffer(obj.Body as AsyncIterable<Uint8Array>);
    return {
      bytes: new Uint8Array(buf),
      contentType: obj.ContentType,
      contentLength: obj.ContentLength,
    };
  } catch (err) {
    console.error(`[s3] getObjectBytes failed for ${key}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Presigned uploads — used for media that can't fit through a Vercel
// serverless function body (cap ~4.5 MB). The browser PUTs the bytes
// directly to S3; our function only signs the URL.
//
// Single-PUT supports up to 5 GB per object. Anything bigger would
// need multipart-from-the-browser (createMultipartUpload + multiple
// signed UploadPart URLs + completeMultipartUpload). For phone-shot
// video, single PUT is plenty.
// ---------------------------------------------------------------------------

export interface PresignedPut {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
}

/**
 * Create a presigned PUT URL for direct-to-S3 upload from the browser.
 * The caller is expected to set the same Content-Type when PUTing as it
 * passed to this function — S3 signs against it.
 */
export async function createPresignedPutUrl(args: {
  key: string;
  contentType: string;
  /** Optional: signal the S3 storage class, content disposition, etc. */
  cacheControl?: string;
  /** URL TTL in seconds. Default 5 minutes. */
  expiresInSeconds?: number;
}): Promise<PresignedPut> {
  const expiresInSeconds = args.expiresInSeconds ?? 300;
  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET!,
    Key: args.key,
    ContentType: args.contentType,
    CacheControl: args.cacheControl,
  });
  const uploadUrl = await getSignedUrl(s3Client, cmd, { expiresIn: expiresInSeconds });
  return {
    key: args.key,
    uploadUrl,
    publicUrl: publicLocation(args.key),
    expiresInSeconds,
  };
}
