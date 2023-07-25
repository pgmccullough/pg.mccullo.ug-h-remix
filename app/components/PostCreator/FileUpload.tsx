import { LinkPreview, UploadPreview } from ".";
import { SetStateAction, useCallback } from "react";
import type { YouTubeVideo } from "~/common/types";
// import { readAndCompressImage } from 'browser-image-resizer';

export const FileUpload: React.FC<{
  fileInputRef: any,
  imagesUploading: number,
  pendingUploads: {data: any, meta: any}[],
  setPendingUploads: SetStateAction<any>,
  youTubePreviews: YouTubeVideo[],
  setYouTubePreviews: SetStateAction<any>
}> = ({ fileInputRef, imagesUploading, pendingUploads, setPendingUploads, youTubePreviews, setYouTubePreviews }) => {

  const imgResize = useCallback(async(file:any, config?:any) => {
    const resize = require('browser-image-resizer');
    return await resize.readAndCompressImage(file,config);
  },[])

  const removeFile = (name: string) => {
    const filteredUploads = [...pendingUploads].filter((file:{data: any, meta: any}) => file.meta.name !== name);
    setPendingUploads(filteredUploads);
  }

  const attachmentHandler = async (e:React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    let files = e.target.files;
    for(const file of Object.entries(files!)) {
      //console.log(file[1].type.split("/")[0]);
      const reader = new FileReader();
      const [,value] = file;
      let resizedImage = await imgResize(value,{maxWidth:600});
      resizedImage.name = value.name;
      reader.readAsDataURL(resizedImage);
      reader.onload = function(e) {
        setPendingUploads((prev:{data: any, meta: any}[]) => {
          const deDuplicated = prev.filter((file:{data: any, meta: any}) => file.data!==e.target!.result)
          const newFile = {data: e.target!.result, meta: resizedImage};
          return [...deDuplicated, newFile];
        })
      }
    }
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