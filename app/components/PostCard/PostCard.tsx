import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { stampToTime } from '../../functions/functions';
import { Audio } from '../Media/Audio/Audio';
import { File } from '../Media/File/File';
import { Image } from '../Media/Image/Image';
import { Video } from '../Media/Video/Video';
import { Weblink } from '../Media/Weblink/Weblink';
import { Post } from '~/common/types';

export const PostCard: React.FC<{
  editState: any, setEditState: any, post: any
}> = ({ editState, setEditState, post }) => {

  const { user } = useLoaderData();
  const fetcher = useFetcher();

  const galSlide = useRef<HTMLElement>(null);
  const galWid = useRef<any>(null);

  const [mediaSlides, setMediaSlides] = useState({
    currentSlide: 0,
    itemLength: Object.keys(post.media).map((key:any) => post.media[key]?.length).reduce((a, b) => a + b, 0)
  })

  const [ editMode, setEditMode ] = useState(false);

  const [touchStart, setTouchStart] = useState<number|null>(null);
  const [touchEnd, setTouchEnd] = useState<number|null>(null);
  const [touchDistance, setTouchDistance] = useState<number>(0);

  delete post.media.directory;

  const mediaComponents = [
    {db_prop: "audio", component: Audio},
    {db_prop: "files", component: File},
    {db_prop: "images", component: Image},
    {db_prop: "links", component: Weblink},
    {db_prop: "videos", component: Video},
  ]

  const privacyOptions = [
    "Public",
    "Followers",
    "Friends",
    "Self",
    "Save Media"
  ]

  const gallerySlide = (dir:"left"|"right") => {
    if(galSlide.current) {
      if(dir==="left") {
        galSlide.current.style.marginLeft = "-"+((mediaSlides.currentSlide-1)*galWid.current.offsetWidth)+"px";
        setMediaSlides({...mediaSlides,currentSlide:mediaSlides.currentSlide-1})
      } else {
        galSlide.current.style.marginLeft = "-"+((mediaSlides.currentSlide+1)*galWid.current.offsetWidth)+"px";
        setMediaSlides({...mediaSlides,currentSlide:mediaSlides.currentSlide+1})
      }
    }
  }

  const editPostCard = () => {
    setEditMode(true);
  }

  const deletePostCard = () => {
    fetcher.data.postDeleted = null;
  }

  const postUpdatedCleanUp = () => {
    setEditMode(false);
    setEditState({ isOn: false, id: null });
    fetcher.data.privacyUpdated = null;
  }

  const onTouchStart = (e: any) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }
  
  const onTouchMove = (e: any) => {
    if(touchStart) {
      setTouchDistance(touchStart - e.targetTouches[0].clientX)
      setTouchEnd(e.targetTouches[0].clientX)
    }
  };
  
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    setTouchDistance(0);
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 150
    const isRightSwipe = distance < -150
    if (isLeftSwipe) {
      if((mediaSlides.itemLength-mediaSlides.currentSlide)>=2) gallerySlide("right");
    } else if(isRightSwipe) {
      if(mediaSlides.currentSlide >= 1) gallerySlide("left");
    }
  }

  useEffect(() => {
    console.log(post._id);
    console.log(mediaSlides)
  },[mediaSlides])

  return(
    <article 
      className="postcard"
      key={post._id}
    >
      <div className="postcard__time">
        <Link className="postcard__time__link" to={`/h/post/${post._id}`}>
          <time dateTime={post.created}>{stampToTime(post.created)}</time>
        </Link>
        <div style={{display: "flex"}}>
          {user?.role==="administrator"
            ?<div className="postcard__privacy">{post.privacy}</div>
            :""
          }
          {new Date().getFullYear()!==new Date(post.created*1000).getFullYear()?<div className="postcard__time__onThisDay">{(new Date().getFullYear())-(new Date(post.created*1000).getFullYear())} years ago</div>:""}
          {user?.role==="administrator"
            ?<div 
              className="postcard__time__option"
              onClick={() => {
                setEditMode(false);
                setEditState((prev: any) => 
                  prev.id===post._id
                    ?{ isOn: !editState.isOn, id: post._id }
                    :{ isOn: true, id: post._id }
                  )
                }
              }
            >
              <p className="postcard__time__option__chevron">^</p>
            </div>
            :""
          }
        </div>
          
      </div>
      <div className="postcard__content">
        {editState?.isOn&&editState?.id===post._id
          ?editMode
            ?<>
              <div 
                className="postcard__content__modal__background"
                onClick={() => {
                  setEditMode(false);
                  setEditState({ isOn: false, id: null })
                }}
              />
              <div className="postcard__content__modal">
                <div>Post Options</div>
                <fetcher.Form 
                  method="post"
                  action={`/api/post/update/${post._id}`}
                >
                  <select name="privacy">
                    {privacyOptions.map((privacy:string) =>
                      <option selected={
                        privacy===post.privacy
                          ?true
                          :false
                      }>
                        {privacy}
                      </option>
                    )
                    }
                  </select>
                  <button>SAVE</button>
                </fetcher.Form>
                <>
                {fetcher.data?.privacyUpdated
                  ?postUpdatedCleanUp()
                  :""
                }
                </>
              </div>
            </>
            :<>
            <div 
              className="postcard__content__modal__background"
              onClick={() => {
                setEditMode(false);
                setEditState({ isOn: false, id: null })
              }}
            />
            <div className="postcard__content__modal">
              <div>Post Options</div>
              <button 
                className="postcard__content__modal--button__edit"
                onClick={editPostCard}
              >EDIT</button>
              <fetcher.Form 
                method="post"
                action={`/api/post/delete/${post._id}`}
                style={{display: "inline"}}
              >
                <button 
                  className="postcard__content__modal--button__delete" 
                >DELETE</button>
              </fetcher.Form>
              <>
                {fetcher.data?.postDeleted
                  ?deletePostCard()
                  :""
                }
              </>
            </div>
          </>
          :""
        }
          <div className="postcard__content__media" ref={galWid}>
            <figure 
              className="postcard__content__media__slider"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              ref={galSlide}
              style={{transform: `translateX(${touchDistance*-1}px`}}
            >
              {
                Object.keys(post.media).map(key => {
                  const DynamicComponent = mediaComponents.find(match => match.db_prop === key);
                  return(
                    Array.isArray(post.media[key])&&DynamicComponent
                      ?post.media[key].map((item:string) =>
                        <DynamicComponent.component
                          key={item} 
                          src={item} 
                          alt=""
                        />
                      )
                      :null
                  )
                })
              }
            </figure>
            {
              mediaSlides.itemLength>1
                ?<div className="postcard__content__media__counter">{mediaSlides.currentSlide+1} / {mediaSlides.itemLength}</div>
                :""
            }
            {
              mediaSlides.currentSlide!==0
                ?<div 
                  className="postcard__content__media__slide--left"
                  onClick={()=>{gallerySlide("left")}}
                />
                :""
            }
            {
              mediaSlides.itemLength>1&&mediaSlides.currentSlide<mediaSlides.itemLength-1
                ?<div 
                  className="postcard__content__media__slide--right" 
                  onClick={()=>{gallerySlide("right")}}
                />
                :""
            }                                                           
          </div>
          {post.content?.replace(/(<([^>]+)>)/gi, "")
            ?<div className="postcard__content__text">
              <p dangerouslySetInnerHTML={{__html: post.content}} />
            </div>
            :""
          }
          <div className="postcard__content__meta">
          </div>
      </div>
    </article>
  )
}