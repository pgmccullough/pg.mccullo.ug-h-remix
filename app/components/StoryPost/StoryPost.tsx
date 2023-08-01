import { Post } from '~/common/types';
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Image } from "../Media/Image/Image";

export const StoryPost: React.FC<{
  storyPosts: Post[] | undefined,
  setStoryImageVisibility: Dispatch<SetStateAction<boolean>>,
}> = ({ storyPosts, setStoryImageVisibility }) => {
  
  const justImages: string[] = [];
  storyPosts?.map((story: Post) => {
    justImages.push(...story.media.images);
  })

  const [ storyViewTime, setStoryViewTime ] = useState<number>(100);
  const [ currentStory, setCurrentStory ] = useState<number>(0);
  const [ storyImages, setStoryImages ] = useState<string[]>(justImages);

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
    if(storyViewTime===0) {
      if((currentStory+1)>=storyImages.length) {
        setStoryImageVisibility(false)
      } else {
        setCurrentStory(currentStory+1);
        setStoryViewTime(100);
      }
    }
  },[storyViewTime])

  return (
    <>
      <div className="story-post__background" />
        <div className="story-post__content" onClick={() => setStoryImageVisibility(false)}>
          <div className="story-post__image">
            {storyImages?.map((img: string, i: number) =>
              i===currentStory?<Image src={img} key={img} alt="" />:""
            )}
            <div className="story-post__time-bar" style={{width: (100-storyViewTime)+"%"}} />
          </div>
        </div>
    </>
  )
}