import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Image } from "../Media/Image/Image";

export const StoryPost: React.FC<{
  storyImageURL: string,
  setStoryImageVisibility: Dispatch<SetStateAction<boolean>>,
}> = ({ storyImageURL, setStoryImageVisibility }) => {

  const [ storyViewTime, setStoryViewTime ] = useState<number>(100);

  useEffect(() => {
    const timer = setInterval(() => {
      setStoryViewTime((prev:number) => {
        if(prev>0) {
          return prev-1;
        } else {
          return 0;
        }
      })
    },70)
    return () => {clearInterval(timer)}
  },[])

  useEffect(() => {
    if(storyViewTime===0) setStoryImageVisibility(false)
  },[storyViewTime])

  return (
    <>
      <div className="story-post__background" />
        <div className="story-post__content" onClick={() => setStoryImageVisibility(false)}>
          <div className="story-post__image">
            <Image src={storyImageURL} alt="" />
            <div className="story-post__time-bar" style={{width: (100-storyViewTime)+"%"}} />
          </div>
        </div>
        
    </>
  )
}