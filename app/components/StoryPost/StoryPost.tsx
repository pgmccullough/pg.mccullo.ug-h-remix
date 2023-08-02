import { Post } from '~/common/types';
import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { useSwipe } from '~/utils/hooks/useSwipe';
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
  const [ _swipe, setSwipe ] = useSwipe(
    () => changeSlide("right"),
    () => changeSlide("left")
  );

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

  const changeSlide = (dir: "right"|"left") => {
    if(dir==="right"&&currentStory >= (storyImages.length-1)) return;
    if(dir==="left"&&currentStory <= 0) return;
    setCurrentStory(currentStory+(dir==="right"?1:-1));
    setStoryViewTime(100);
  }

  return (
    <>
      <div className="story-post__background" />
        <div className="story-post__content" onClick={() => setStoryImageVisibility(false)}>
          <div className="story-post__image"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={setSwipe}
            onTouchMove={setSwipe}
            onTouchEnd={setSwipe}
          >
            {storyImages?.map((img: string, i: number) =>
              <Image src={img} key={img} alt="" display={i===currentStory} />
            )}
            {
              currentStory>0
                ?<div 
                  className="postcard__content__media__slide--left"
                  onClick={() => changeSlide("left")}
                />
                :""
            }
            {currentStory < (storyImages.length-1)
              ?<div 
                className="postcard__content__media__slide--right"
                onClick={() => changeSlide("right")}
              />
              :""
            }
            <div className="postcard__content__media__counter">{currentStory+1} / {storyImages.length}</div>
            <div className="story-post__time-bar" style={{width: (100-storyViewTime)+"%"}} />
          </div>
        </div>
    </>
  )
}