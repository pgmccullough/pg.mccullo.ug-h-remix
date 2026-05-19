import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import sharp from "sharp";

const { S3_BUCKET, S3_REGION, S3_KEY, S3_SECRET } = process.env;

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
        const sharped = await sharp(buf)
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
