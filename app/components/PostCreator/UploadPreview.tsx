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
  // global `imagesUploading` count.
  const isUploading = file.uploading === true || imagesUploading > 0;
  const progress = typeof file.progress === "number"
    ? Math.max(0, Math.min(100, file.progress))
    : 0;

  // Identifier passed to removeFile — uploadId for direct uploads,
  // filename for the legacy image path.
  const removeKey = file.uploadId ?? file.meta?.name ?? "";

  // The inner ".upload__file-preview__file--uploading" class applies a
  // CSS `filter: blur(3px)`. Filters on a parent affect every child
  // visually, with no way to "unblur" a descendant. So we wrap the
  // blurred tile and render the progress overlay + close button as
  // SIBLINGS of it — outside the blur scope but still inside the
  // wrapper's positioning context.
  return (
    <div style={{
      position: "relative",
      display: "inline-block",
      verticalAlign: "top",
      width: 92,
      height: 92,
      margin: 2,
    }}>
      <div
        className={
          `upload__file-preview__file${file.uploading ? " upload__file-preview__file--uploading" : ""}${!file.uploading ? " upload__file-preview__file--done" : ""}`
        }
        style={{
          // Override the class's own width/height/margin so the inner
          // tile fills the wrapper exactly.
          margin: 0,
          width: "100%",
          height: "100%",
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
      </div>

      {file.uploading ? (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", color: "#fff",
          padding: "4px 6px",
          fontFamily: "'PGM Sans', sans-serif",
          // Belt-and-suspenders: keep this overlay above the blurred tile.
          zIndex: 2,
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

      {/* Play-icon overlay for video tiles once the upload completes —
          makes it visually distinct from an uploaded image. Rendered
          as a sibling of the blurred tile so it stays sharp. */}
      {file.kind === "videos" && !file.uploading ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            width: 32, height: 32,
            marginTop: -16, marginLeft: -16,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          {/* CSS triangle pointing right. Width/height of the triangle
              come from the border trick — width 0, transparent left,
              white right. The 2px marginLeft optically centers it
              (otherwise the triangle's mass biases left). */}
          <div style={{
            width: 0, height: 0,
            borderTop: "7px solid transparent",
            borderBottom: "7px solid transparent",
            borderLeft: "11px solid #fff",
            marginLeft: 3,
          }} />
        </div>
      ) : null}

      {/* Hide the close button while uploading — clicking it would
          orphan the upload on S3 with no easy way to clean it up. */}
      {!isUploading ? (
        <div
          className="upload__file-preview__file--close"
          style={{ zIndex: 2 }}
          onClick={() => removeFile(removeKey)}
        />
      ) : null}
    </div>
  );
};
