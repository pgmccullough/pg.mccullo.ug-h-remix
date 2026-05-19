import { LinkPreview, UploadPreview } from ".";
import { SetStateAction, useCallback } from "react";
// browser-image-resizer is CJS-only — `import { readAndCompressImage }` only
// resolves once Vite bundles the module (see noExternal in vite.config.ts).
// Importing the default and reading the property off it is robust either way.
import bir from "browser-image-resizer";
import type { YouTubeVideo } from "~/common/types";
const { readAndCompressImage } =
  bir as unknown as { readAndCompressImage: (file: File, config: any) => Promise<Blob> };

export const FileUpload: React.FC<{
  fileInputRef: any,
  imagesUploading: number,
  pendingUploads: {data: any, meta: any}[],
  setPendingUploads: SetStateAction<any>,
  youTubePreviews: YouTubeVideo[],
  setYouTubePreviews: SetStateAction<any>
}> = ({ fileInputRef, imagesUploading, pendingUploads, setPendingUploads, youTubePreviews, setYouTubePreviews }) => {

  const imgResize = useCallback(async(file:File, config: {maxWidth: number}) => {
    return await readAndCompressImage(file, config);
  },[])

  const removeFile = (name: string) => {
    const filteredUploads = [...pendingUploads].filter((file:{data: any, meta: any}) => file.meta.name !== name);
    setPendingUploads(filteredUploads);
  }

  const attachmentHandler = async (e:React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    let files = e.target.files;
    for(const file of Object.entries(files!)) {
      const reader = new FileReader();
      const [,value] = file;
      let resizedImage = await imgResize(value,{maxWidth:1200});
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