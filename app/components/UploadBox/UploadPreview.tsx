export const UploadPreview: React.FC<{
  file: {data: any, meta: any}, removeFile: any
}> = ({ file, removeFile }) => {
  return (
    <div className="upload__file-preview__file" style={{backgroundImage: `url(${file.data})`}}>
      <div className="upload__file-preview__file--close" onClick={(() => removeFile(file.meta.name))} />
    </div>
  )
}