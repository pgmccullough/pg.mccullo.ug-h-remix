export const UploadPreview: React.FC<{
  file: {data: any, meta: any, kind?: string, alreadyUploaded?: boolean},
  imagesUploading: number,
  removeFile: any,
}> = ({ file, imagesUploading, removeFile }) => {
  // Image branch still carries a base64 data URL we can render as the
  // background. Video/audio/etc. went direct-to-S3 so we don't have a
  // local data URL; show a labeled placeholder instead.
  const isImageThumb = !!file.data && typeof file.data === "string"
    && file.data.startsWith("data:image/");
  const label =
    file.kind === "videos" ? "🎬"
    : file.kind === "audio" ? "🎵"
    : file.kind === "files" ? "📄"
    : "";
  return (
    <div
      className={
        `upload__file-preview__file${imagesUploading?" upload__file-preview__file--uploading":""}${!imagesUploading?" upload__file-preview__file--done":""}`
      }
      style={isImageThumb ? {backgroundImage: `url(${file.data})`} : undefined}
    >
      {!isImageThumb ? (
        <div style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          height: "100%", padding: 8, textAlign: "center",
          fontSize: 12, color: "#506982", background: "#f3f3f3",
        }}>
          <div style={{fontSize: 28, lineHeight: 1, marginBottom: 4}}>{label}</div>
          <div style={{maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
            {file.meta?.name ?? "attachment"}
          </div>
          {file.alreadyUploaded ? (
            <div style={{fontSize: 10, opacity: 0.6, marginTop: 4}}>uploaded</div>
          ) : null}
        </div>
      ) : null}
      {imagesUploading?"":<div className="upload__file-preview__file--close" onClick={(() => removeFile(file.meta.name))} />}
    </div>
  )
}