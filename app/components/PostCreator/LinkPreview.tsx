import type { SetStateAction } from "react";
import type { YouTubeVideo } from "~/common/types";

export const LinkPreview: React.FC<{
  title: string, thumbnail: string, setYouTubePreviews: SetStateAction<any>
}> = ({ title, thumbnail, setYouTubePreviews }) => {
  const removePreview = () => {
    setYouTubePreviews((videos: YouTubeVideo[]) => {
      const videoToRemove = videos.find((vid: YouTubeVideo) => vid.meta?.title===title);
      const otherVideos = videos.filter((vid: YouTubeVideo) => vid.meta?.title!==title);
      if(videoToRemove) videoToRemove.show = false;
      return [...otherVideos, videoToRemove];
    })
  }
  return (
    <div className={`upload__file-preview__file`} style={{backgroundImage: `url(${thumbnail})`}}>
      {<div className="upload__file-preview__file--close" onClick={removePreview} />}
    </div>
  )
}