export const UploadPreview: React.FC<{
  file: {data: any, meta: any}, imagesUploading: null|"uploading"|"done"|"error", removeFile: any
}> = ({ file, imagesUploading, removeFile }) => {
  return (
    <div className={`upload__file-preview__file${imagesUploading==="uploading"?" upload__file-preview__file--uploading":""}${imagesUploading==="done"?" upload__file-preview__file--done":""}`} style={{backgroundImage: `url(${file.data})`}}>
      {imagesUploading==="uploading"||imagesUploading==="done"?"":<div className="upload__file-preview__file--close" onClick={(() => removeFile(file.meta.name))} />}
    </div>
  )
}