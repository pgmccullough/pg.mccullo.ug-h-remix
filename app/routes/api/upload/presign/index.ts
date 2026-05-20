/**
 * Admin-only: issue a presigned PUT URL so the browser can upload large
 * media (videos, etc.) directly to S3 — bypassing Vercel's serverless
 * function body cap (~4.5 MB).
 *
 * Request: POST with form fields
 *   filename     - original filename (used only to derive an extension)
 *   contentType  - MIME type the browser will use when PUTing
 *   kind         - "videos" | "images" | "audio" | "files" (folder + media key)
 *
 * Response: { ok, key, uploadUrl, publicUrl, basename, kind }
 *
 *   - basename is the file's portion of the S3 key (e.g. "<uuid>.mp4"),
 *     which is what we store in post.media.<kind> arrays.
 */

import type { ActionFunctionArgs } from "react-router";
import { v4 as uuidv4 } from "uuid";

import { getUser } from "~/utils/session.server";
import { createPresignedPutUrl } from "~/utils/s3.server";

const ALLOWED_KINDS = new Set(["videos", "images", "audio", "files"]);

function safeExtension(filename: string, contentType: string): string {
  // Prefer the filename's extension when it looks reasonable; fall back
  // to mapping a few common MIME types.
  const fromName = filename.includes(".")
    ? filename.split(".").pop()!.toLowerCase()
    : "";
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
  };
  return map[contentType] ?? "bin";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "Admin only." }, { status: 403 });
  }

  const form = await request.formData();
  const filename = form.get("filename")?.toString() ?? "";
  const contentType = form.get("contentType")?.toString() ?? "";
  const kind = (form.get("kind")?.toString() ?? "").toLowerCase();

  if (!filename || !contentType) {
    return Response.json(
      { error: "Missing filename or contentType." },
      { status: 400 }
    );
  }
  if (!ALLOWED_KINDS.has(kind)) {
    return Response.json(
      { error: "Invalid or missing kind." },
      { status: 400 }
    );
  }

  const ext = safeExtension(filename, contentType);
  const basename = `${uuidv4()}.${ext}`;
  const key = `${kind}/${basename}`;

  try {
    const signed = await createPresignedPutUrl({
      key,
      contentType,
      // Long cache on the public URL so playback doesn't re-fetch every load.
      cacheControl: "public, max-age=31536000, immutable",
    });
    return Response.json({
      ok: true,
      key: signed.key,
      uploadUrl: signed.uploadUrl,
      publicUrl: signed.publicUrl,
      basename,
      kind,
    });
  } catch (err) {
    console.error("[upload/presign] signing failed:", err);
    return Response.json({ error: "Could not presign upload." }, { status: 500 });
  }
};
