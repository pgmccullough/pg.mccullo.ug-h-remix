import { LinkPreview, UploadPreview } from ".";
import { SetStateAction, useCallback } from "react";
import type { YouTubeVideo } from "~/common/types";
// browser-image-resizer is browser-only (references `self` at module load),
// so it can't be imported statically — that would pull it into the SSR
// bundle and crash. Loaded via dynamic import() inside the resize callback,
// which only runs after the user picks a file in the browser.

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

  const removeFile = (name: string) => {
    const filteredUploads = [...pendingUploads].filter((file:{data: any, meta: any}) => file.meta.name !== name);
    setPendingUploads(filteredUploads);
  }

  /**
   * Handle a freshly-picked file. Branch on MIME type:
   *
   *   image/*  -> resize client-side, base64 it, queue for the
   *               existing /api/upload/base64 path
   *   video/*  -> presign a PUT URL, upload the bytes directly to
   *               S3 (Vercel never sees them — required for >4.5 MB),
   *               then queue a pending entry that already has its
   *               final basename + kind so PostCreator doesn't re-
   *               upload it.
   *   other    -> treated like video for the purposes of bypassing
   *               the 4.5 MB function body cap, just stored under the
   *               kind that matches the MIME family (audio/* -> audio,
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
          setPendingUploads((prev:{data: any, meta: any}[]) => {
            const deDuplicated = prev
              .filter((f:{data: any, meta: any}) => f.data !== ev.target!.result);
            return [
              ...deDuplicated,
              { data: ev.target!.result, meta: resized, kind: "images" },
            ];
          });
        };
      } else {
        // Direct-to-S3 path. Get a presigned URL, then PUT the file
        // straight to S3 from the browser — bypassing the Vercel
        // serverless body cap entirely.
        const kind =
          mime.startsWith("video/") ? "videos" :
          mime.startsWith("audio/") ? "audio" : "files";
        try {
          const presignFd = new FormData();
          presignFd.set("filename", value.name);
          presignFd.set("contentType", mime);
          presignFd.set("kind", kind);
          const presignRes = await fetch("/api/upload/presign", {
            method: "POST",
            body: presignFd,
          });
          if(!presignRes.ok) {
            console.error("[upload] presign failed:", await presignRes.text());
            continue;
          }
          const presign = await presignRes.json() as {
            ok: boolean; uploadUrl: string; basename: string; kind: string;
          };
          if(!presign.ok) {
            console.error("[upload] presign response not ok:", presign);
            continue;
          }
          const putRes = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": mime },
            body: value,
          });
          if(!putRes.ok) {
            console.error("[upload] direct PUT failed:", putRes.status, await putRes.text());
            continue;
          }
          // Already uploaded — queue a pending entry with no data blob,
          // just the final basename. PostCreator will recognize the
          // alreadyUploaded flag and skip re-uploading.
          setPendingUploads((prev:{data: any, meta: any}[]) => [
            ...prev,
            {
              data: null,
              meta: { name: value.name, type: mime, size: value.size },
              kind: presign.kind,
              alreadyUploaded: true,
              basename: presign.basename,
            },
          ]);
        } catch(err) {
          console.error("[upload] direct-to-S3 failed:", err);
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
          key={file.meta.name}
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