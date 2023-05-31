export const UploadPreview: React.FC<{
  file: {data: any, meta: any}, imagesUploading: number, removeFile: any
}> = ({ file, imagesUploading, removeFile }) => {
  return (
    <div className={`upload__file-preview__file${imagesUploading?" upload__file-preview__file--uploading":""}${!imagesUploading?" upload__file-preview__file--done":""}`} style={{backgroundImage: `url(${file.data})`}}>
      {imagesUploading?"":<div className="upload__file-preview__file--close" onClick={(() => removeFile(file.meta.name))} />}
    </div>
  )
}