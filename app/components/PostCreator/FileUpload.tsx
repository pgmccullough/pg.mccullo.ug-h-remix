import { LinkPreview, UploadPreview } from ".";
import { SetStateAction, useCallback } from "react";
import type { YouTubeVideo } from "~/common/types";
// browser-image-resizer is browser-only (references `self` at module load),
// so it can't be imported statically — that would pull it into the SSR
// bundle and crash. Loaded via dynamic import() inside the resize callback,
// which only runs after the user picks a file in the browser.

/**
 * Capture a frame from a video File using a <video> + canvas. Returns
 * a JPEG data URL the UploadPreview can render as a thumbnail, or null
 * if anything goes wrong. Best-effort — failure just means the preview
 * falls back to its filename / icon placeholder.
 */
function extractVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    // Don't actually attach to the DOM — we just need the decoder.
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      try { URL.revokeObjectURL(url); } catch {}
    };
    const fail = () => {
      cleanup();
      resolve(null);
    };
    const grab = () => {
      try {
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        cleanup();
        resolve(dataUrl);
      } catch {
        fail();
      }
    };
    video.onloadeddata = () => {
      // Seek a fraction in so we don't grab a black first frame.
      const target = Math.min(0.5, (video.duration || 1) * 0.1);
      if (Number.isFinite(target) && target > 0) {
        try {
          video.currentTime = target;
        } catch {
          grab();
        }
      } else {
        grab();
      }
    };
    video.onseeked = grab;
    video.onerror = fail;
    // Safety net — give up after 5s.
    setTimeout(fail, 5000);
    video.src = url;
  });
}

/**
 * PUT a File to S3 via a presigned URL, reporting upload progress.
 * Resolves on a 2xx response, rejects otherwise. Returns nothing —
 * the caller already knows the basename it presigned.
 */
function putWithProgress(args: {
  url: string;
  body: Blob;
  contentType: string;
  onProgress: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        args.onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        args.onProgress(100);
        resolve();
      } else {
        reject(new Error(`PUT ${xhr.status}: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("PUT network error"));
    xhr.ontimeout = () => reject(new Error("PUT timeout"));
    xhr.open("PUT", args.url);
    xhr.setRequestHeader("Content-Type", args.contentType);
    xhr.send(args.body);
  });
}

export const FileUpload: React.FC<{
  fileInputRef: any,
  imagesUploading: number,
  pendingUploads: {data: any, meta: any}[],
  setPendingUploads: SetStateAction<any>,
  youTubePreviews: YouTubeVideo[],
  setYouTubePreviews: SetStateAction<any>
}> = ({ fileInputRef, imagesUploading, pendingUploads, setPendingUploads, youTubePreviews, setYouTubePreviews }) => {

  const imgResize = useCallback(async(file:File, config: {maxWidth: number}) => {
    const bir = (await import("browser-image-resizer")) as unknown as {
      readAndCompressImage: (file: File, config: any) => Promise<Blob>;
    } & { default?: { readAndCompressImage: (file: File, config: any) => Promise<Blob> } };
    const readAndCompressImage = bir.readAndCompressImage ?? bir.default!.readAndCompressImage;
    return await readAndCompressImage(file, config);
  },[])

  const removeFile = (key: string) => {
    setPendingUploads((prev: any[]) =>
      prev.filter((file: any) =>
        // Try uploadId first (direct-to-S3), fall back to filename (image branch).
        file.uploadId ? file.uploadId !== key : file.meta?.name !== key
      )
    );
  }

  /**
   * Handle a freshly-picked file. Branch on MIME type:
   *
   *   image/*  -> resize client-side, base64 it, queue for the
   *               existing /api/upload/base64 path. (No progress UI
   *               here — the resize + base64 round-trip is fast.)
   *   video/*  -> presign a PUT URL, upload the bytes directly to S3
   *               with progress reporting + a client-extracted thumb.
   *   other    -> same direct-to-S3 path, just stored under whichever
   *               kind matches the MIME family (audio/* -> audio,
   *               everything else -> files).
   */
  const attachmentHandler = async (e:React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const files = e.target.files;
    if(!files) return;
    for(const value of Array.from(files)) {
      const mime = value.type || "application/octet-stream";
      if(mime.startsWith("image/")) {
        // Existing path: client-resize + base64 queue. Pass through
        // PostCreator's submit, which posts to /api/upload/base64.
        const resized = await imgResize(value, {maxWidth: 1200});
        (resized as any).name = value.name;
        const reader = new FileReader();
        reader.readAsDataURL(resized);
        reader.onload = (ev) => {
          setPendingUploads((prev: any[]) => {
            const deDuplicated = prev
              .filter((f: any) => f.data !== ev.target!.result);
            return [
              ...deDuplicated,
              { data: ev.target!.result, meta: resized, kind: "images" },
            ];
          });
        };
      } else {
        // Direct-to-S3 path, async with live progress.
        const kind =
          mime.startsWith("video/") ? "videos" :
          mime.startsWith("audio/") ? "audio" : "files";
        const uploadId =
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Push an immediate placeholder so the user gets visual
        // feedback the moment they pick the file. Marked as
        // `uploading` with progress 0; we update both as the
        // upload proceeds.
        setPendingUploads((prev: any[]) => [
          ...prev,
          {
            data: null,
            meta: { name: value.name, type: mime, size: value.size },
            kind,
            uploadId,
            uploading: true,
            progress: 0,
            alreadyUploaded: false,
          },
        ]);

        // Kick off thumbnail extraction in parallel for videos. We
        // don't await it before starting the upload — the upload is
        // the long pole, no reason to delay it.
        if (mime.startsWith("video/")) {
          extractVideoThumbnail(value).then((thumb) => {
            if (!thumb) return;
            setPendingUploads((prev: any[]) =>
              prev.map((p: any) =>
                p.uploadId === uploadId ? { ...p, thumbDataUrl: thumb } : p
              )
            );
          });
        }

        // Presign and upload. Wrap the whole thing in try/catch so
        // a failure removes the placeholder rather than leaving a
        // stuck-uploading entry.
        try {
          const presignFd = new FormData();
          presignFd.set("filename", value.name);
          presignFd.set("contentType", mime);
          presignFd.set("kind", kind);
          const presignRes = await fetch("/api/upload/presign", {
            method: "POST",
            body: presignFd,
          });
          if (!presignRes.ok) {
            throw new Error(`presign failed: ${presignRes.status}`);
          }
          const presign = await presignRes.json() as {
            ok: boolean; uploadUrl: string; basename: string; kind: string;
          };
          if (!presign.ok) throw new Error("presign response not ok");

          await putWithProgress({
            url: presign.uploadUrl,
            body: value,
            contentType: mime,
            onProgress: (pct) => {
              setPendingUploads((prev: any[]) =>
                prev.map((p: any) =>
                  p.uploadId === uploadId ? { ...p, progress: pct } : p
                )
              );
            },
          });

          // Mark the upload as complete: drop the uploading flag,
          // set alreadyUploaded so PostCreator includes the basename
          // when the post is submitted.
          setPendingUploads((prev: any[]) =>
            prev.map((p: any) =>
              p.uploadId === uploadId
                ? {
                    ...p,
                    uploading: false,
                    progress: 100,
                    alreadyUploaded: true,
                    basename: presign.basename,
                  }
                : p
            )
          );
        } catch (err) {
          console.error("[upload] direct-to-S3 failed:", err);
          // Yank the failed placeholder out of the queue so the
          // user can retry.
          setPendingUploads((prev: any[]) =>
            prev.filter((p: any) => p.uploadId !== uploadId)
          );
        }
      }
    }
    // Clear the input so picking the same file again re-fires onChange.
    if(e.target) e.target.value = "";
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="upload__addfile"
        onChange={attachmentHandler}
        multiple
      />
      {pendingUploads.map((file: any) =>
        <UploadPreview
          key={file.uploadId ?? file.meta.name}
          file={file}
          imagesUploading={imagesUploading}
          removeFile={removeFile}
        />
      )}
      {youTubePreviews
        .filter((file: YouTubeVideo) => file.meta?.title&&file.show)
        .map((file: YouTubeVideo) =>
          <LinkPreview
            key={file.meta?.title}
            title={file.meta!.title}
            thumbnail={file.meta!.thumbnail}
            setYouTubePreviews={setYouTubePreviews}
          />
        )}
    </>
  )
}
