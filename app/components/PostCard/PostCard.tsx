import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from 'react';
import { useSwipe } from '~/utils/hooks/useSwipe';
import { stampToTime } from '../../functions/functions';
import { Audio } from '../Media/Audio/Audio';
import { File } from '../Media/File/File';
import { Image } from '../Media/Image/Image';
import { Video } from '../Media/Video/Video';
import { Weblink } from '../Media/Weblink/Weblink';
import { EmojiReact } from '../EmojiReact/EmojiReact';
import { Comments } from "../Comments/Comments";
import type { Post } from "~/common/types";

import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(localizedFormat)
dayjs().format();

export const PostCard: React.FC<{
  editState: any, setEditState: any, post: Post | null, title?: string, message?: string
}> = ({ editState, setEditState, post, title, message }) => {
  if(post) {
    const { feedback } = post;

    const { user } = useLoaderData();
    const fetcher = useFetcher();

    const galSlide = useRef<HTMLElement>(null);
    const galWid = useRef<any>(null);

    const [mediaSlides, setMediaSlides] = useState<{currentSlide: number, itemLength: number}>({
      currentSlide: 0,
      itemLength: 0
    })
    const [ editMode, setEditMode ] = useState(false);
    const [ postFeedback, setPostFeedback ] = useState<{commentsOn: any, sharesOn: any, likesOn: any }>(feedback)
    const [ canShowDate, setCanShowDate ] = useState<boolean>(false);
    const [ swipe, setSwipe ] = useSwipe();

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
      "Save Media",
      "Story"
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

    useEffect(() => {
      setMediaSlides((prev: {currentSlide: number, itemLength: number}) => {
        return {...prev, itemLength: Object.keys(post.media).map((key:any) => post.media[key]?.length||0).reduce((a, b) => a + b, 0)}
      })
      setCanShowDate(true);
    },[])

    return (
      (<article 
        className="postcard"
        key={post._id}
      >
        <div className="postcard__time">
          <Link className="postcard__time__link" to={`/h/post/${post._id}`}>
            {canShowDate?<time dateTime={post.created.toString()}>{stampToTime(post.created)}</time>:""}
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
                    <select 
                      name="privacy"
                      defaultValue={post.privacy}
                    >
                      {privacyOptions.map((privacy:string) =>
                        <option key={privacy}>
                          {privacy}
                        </option>
                      )}
                    </select>
                    <input 
                      type="checkbox"
                      name="commentsOn"
                      checked={!postFeedback.commentsOn||postFeedback.commentsOn==="false"?false:true}
                      onChange={(e) => {setPostFeedback({...postFeedback, commentsOn: e.target.value==="true"?"false":"true"})}}
                      value={postFeedback.commentsOn?"true":"false"}
                    /> Comments
                    <input 
                      type="checkbox"
                      name="sharesOn"
                      checked={!postFeedback.sharesOn||postFeedback.sharesOn==="false"?false:true}
                      onChange={(e) => {setPostFeedback({...postFeedback, sharesOn: e.target.value==="true"?"false":"true"})}}
                      value={postFeedback.sharesOn?"true":"false"}
                    /> Shares
                    <input 
                      type="checkbox"
                      name="likesOn"
                      checked={!postFeedback.likesOn||postFeedback.likesOn==="false"?false:true}
                      onChange={(e) => {setPostFeedback({...postFeedback, likesOn: e.target.value==="true"?"false":"true"})}}
                      value={postFeedback.likesOn?"true":"false"}
                    /> Likes
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
                onTouchStart={setSwipe("start")} 
                onTouchMove={setSwipe("move")} 
                onTouchEnd={() => setSwipe("end")(
                  (mediaSlides.itemLength-mediaSlides.currentSlide) >= 2?()=>gallerySlide("right"):()=>{},
                  mediaSlides.currentSlide >= 1?()=>gallerySlide("left"):()=>{}
                )}
                ref={galSlide}
                style={{transform: `translateX(${swipe*-1}px`}}
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
                <div className="fake-p" dangerouslySetInnerHTML={{__html: post.content}} />
              </div>
              :""
            }
            <div className="postcard__content__meta">
              {post.feedback?.likesOn
                ?<EmojiReact
                  likes={post.feedback.likes}
                  postId={post._id}
                />
                :<></>
              }
              {post.feedback?.commentsOn
                ?<Comments 
                  comments={post.feedback?.comments||""} 
                  postId={post._id}
                />
                :""
              }
            </div>
        </div>
      </article>)
    );
  } else {
    return (
      <article className="postcard--left">
        <div className="postcard__time" style={{ justifyContent: "center" }}>
          <div className="postcard__time__link--unlink">
            {title||""}
          </div>
        </div>
        <div className="postcard__content">
          <div className="postcard__content__media"></div>
          <div className="postcard__content__text">{message||""}</div>
        </div>
      </article>
    )
  }
}