export const UploadPreview: React.FC<{
  file: {
    data: any;
    meta: any;
    kind?: string;
    alreadyUploaded?: boolean;
    uploading?: boolean;
    progress?: number;
    uploadId?: string;
    thumbDataUrl?: string;
  },
  imagesUploading: number,
  removeFile: (key: string) => void,
}> = ({ file, imagesUploading, removeFile }) => {
  // Image branch carries a base64 data URL we can render as the
  // background. Direct-to-S3 entries (video/audio/etc.) get a
  // client-extracted JPEG thumbnail once it's ready — until then
  // we fall back to a labeled placeholder.
  const isImageDataUrl = !!file.data && typeof file.data === "string"
    && file.data.startsWith("data:image/");
  const isVideoThumb = !!file.thumbDataUrl;
  const thumbSrc = isImageDataUrl ? file.data : isVideoThumb ? file.thumbDataUrl : null;
  const showThumb = !!thumbSrc;

  const label =
    file.kind === "videos" ? "🎬"
    : file.kind === "audio" ? "🎵"
    : file.kind === "files" ? "📄"
    : "";

  // Per-file uploading state takes precedence over the legacy
  // global `imagesUploading` count. While uploading, swap in a
  // progress bar overlay and suppress the close button (avoids
  // half-uploaded zombies on S3 if you click it mid-flight).
  const isUploading = file.uploading === true || imagesUploading > 0;
  const progress = typeof file.progress === "number"
    ? Math.max(0, Math.min(100, file.progress))
    : 0;

  // Identifier passed to removeFile — uploadId for direct uploads,
  // filename for the legacy image path.
  const removeKey = file.uploadId ?? file.meta?.name ?? "";

  return (
    <div
      className={
        `upload__file-preview__file${file.uploading ? " upload__file-preview__file--uploading" : ""}${!file.uploading ? " upload__file-preview__file--done" : ""}`
      }
      style={{
        position: "relative",
        ...(showThumb ? { backgroundImage: `url(${thumbSrc})` } : {}),
      }}
    >
      {!showThumb ? (
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          height: "100%", padding: 8, textAlign: "center",
          fontSize: 12, color: "#506982", background: "#f3f3f3",
        }}>
          <div style={{fontSize: 28, lineHeight: 1, marginBottom: 4}}>{label}</div>
          <div style={{
            maxWidth: "100%", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {file.meta?.name ?? "attachment"}
          </div>
          {file.alreadyUploaded ? (
            <div style={{fontSize: 10, opacity: 0.6, marginTop: 4}}>uploaded</div>
          ) : null}
        </div>
      ) : null}

      {file.uploading ? (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.65)", color: "#fff",
          padding: "4px 6px",
          fontFamily: "'PGM Sans', sans-serif",
        }}>
          <div style={{
            fontSize: 10, display: "flex",
            justifyContent: "space-between", marginBottom: 2,
          }}>
            <span>Uploading</span>
            <span>{progress}%</span>
          </div>
          <div style={{
            height: 4, background: "rgba(255,255,255,0.25)",
            borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: "#4A6CBA",
              transition: "width 0.15s ease",
            }} />
          </div>
        </div>
      ) : null}

      {/* Hide the close button while uploading — clicking it would
          orphan the upload on S3 with no easy way to clean it up. */}
      {!isUploading ? (
        <div
          className="upload__file-preview__file--close"
          onClick={() => removeFile(removeKey)}
        />
      ) : null}
    </div>
  );
};
