import { LinkPreview, UploadPreview } from ".";
import type { SetStateAction } from "react";
import type { YouTubeVideo } from "~/common/types";

export const FileUpload: React.FC<{
  fileInputRef: any,
  imagesUploading: number,
  pendingUploads: {data: any, meta: any}[],
  setPendingUploads: SetStateAction<any>,
  youTubePreviews: YouTubeVideo[],
  setYouTubePreviews: SetStateAction<any>
}> = ({ fileInputRef, imagesUploading, pendingUploads, setPendingUploads, youTubePreviews, setYouTubePreviews }) => {

  const removeFile = (name: string) => {
    const filteredUploads = [...pendingUploads].filter((file:{data: any, meta: any}) => file.meta.name !== name);
    setPendingUploads(filteredUploads);
  }

  const attachmentHandler = (e:React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    let files = e.target.files;
    Object.entries(files!).forEach(file => {
      const reader = new FileReader();
      const [,value] = file;
      reader.readAsDataURL(value);
      reader.onload = function(e) {
        setPendingUploads((prev:{data: any, meta: any}[]) => {
          const deDuplicated = prev.filter((file:{data: any, meta: any}) => file.data!==e.target!.result)
          const newFile = {data: e.target!.result, meta: value};
          return [...deDuplicated, newFile];
        })
      }
    })
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