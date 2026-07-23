import { Link, useFetcher, useLoaderData } from "react-router";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSwipe } from '~/utils/hooks/useSwipe';
import { stampToTime } from '../../functions/functions';
import { Audio } from '../Media/Audio/Audio';
import { File } from '../Media/File/File';
import { Image } from '../Media/Image/Image';
import { Video } from '../Media/Video/Video';
import { Weblink } from '../Media/Weblink/Weblink';
import { EmojiReact } from '../EmojiReact/EmojiReact';
import { Comments } from "../Comments/Comments";
import { TextEditor } from '../TextEditor/TextEditor';
import type { Post } from "~/common/types";

import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
dayjs.extend(localizedFormat)
dayjs().format();

export interface PostParentSnippet {
  authorActorUri: string;
  displayName?: string;
  handle?: string;
  fqHandle?: string;
  avatarUrl?: string;
  content: string;          // HTML
  publishedMs?: number;
  url?: string;             // human-facing URL of the parent
}

export const PostCard: React.FC<{
  editState: any, setEditState: any, post: Post | null, title?: string, message?: string,
  parent?: PostParentSnippet | null,
}> = ({ editState, setEditState, post, title, message, parent }) => {
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
    const [ editPostText, setEditPostText ] = useState(post.content);
    const [ bodyEditActive, setBodyEditActive ] = useState(false);
    const [ postFeedback, setPostFeedback ] = useState<{commentsOn: any, sharesOn: any, likesOn: any }>(feedback)
    const [ canShowDate, setCanShowDate ] = useState<boolean>(false);
    // Carousel height tracking: when set, the slider is locked to the
    // active slide's natural height so a short YouTube embed doesn't
    // leave a tall portrait-video-sized gray box around it.
    const [ sliderHeight, setSliderHeight ] = useState<number | null>(null);
    const [ swipe, setSwipe ] = useSwipe(
      () => gallerySlide("right"),
      () => gallerySlide("left")
    );

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
          setMediaSlides((prev: {currentSlide: number, itemLength: number}) => {
            if(prev.currentSlide > 0) {
              galSlide.current!.style.marginLeft = "-"+((prev.currentSlide-1)*galWid.current.offsetWidth)+"px";
              return {...prev,currentSlide:prev.currentSlide-1}
            }
            return prev;
          })
        } else {
          setMediaSlides((prev: {currentSlide: number, itemLength: number}) => {
            if(prev.currentSlide<prev.itemLength-1) {
              galSlide.current!.style.marginLeft = "-"+((prev.currentSlide+1)*galWid.current.offsetWidth)+"px";
              return {...prev,currentSlide:prev.currentSlide+1}
            }
            return prev;
          })
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

    // Measure the currently-active slide and use its height as the
    // carousel container height. Triggered on:
    //   - currentSlide changes (user navigated)
    //   - itemLength changes (slides mounted)
    //   - content inside any slide resizes (video metadata arrives,
    //     iframe finishes laying out) — handled via ResizeObserver
    useEffect(() => {
      const measureActive = () => {
        const slider = galSlide.current;
        if (!slider) return;
        const active = slider.children[mediaSlides.currentSlide] as
          | HTMLElement
          | undefined;
        if (active && active.offsetHeight > 0) {
          setSliderHeight(active.offsetHeight);
        }
      };
      measureActive();
      // Catch the case where the slide's content (video / iframe)
      // hasn't sized yet at the moment the effect fires.
      const t = setTimeout(measureActive, 250);

      const slider = galSlide.current;
      let observer: ResizeObserver | undefined;
      if (slider && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => {
          // Re-measure the active slide whenever ANY slide changes
          // size — the active one might be the one growing.
          measureActive();
        });
        Array.from(slider.children).forEach((child) =>
          observer!.observe(child as Element)
        );
      }
      return () => {
        clearTimeout(t);
        observer?.disconnect();
      };
    }, [mediaSlides.currentSlide, mediaSlides.itemLength]);

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
                      className="postcard__select"
                      name="privacy"
                      defaultValue={post.privacy}
                    >
                      {privacyOptions.map((privacy:string) =>
                        <option key={privacy}>
                          {privacy}
                        </option>
                      )}
                    </select>
                    <div className="postcard__checkbox">
                      <input 
                        type="checkbox"
                        name="commentsOn"
                        checked={!postFeedback.commentsOn||postFeedback.commentsOn==="false"?false:true}
                        onChange={(e) => {setPostFeedback({...postFeedback, commentsOn: e.target.value==="true"?"false":"true"})}}
                        value={postFeedback.commentsOn?"true":"false"}
                      /> Comments
                    </div>
                    <div className="postcard__checkbox">
                      <input 
                        type="checkbox"
                        name="sharesOn"
                        checked={!postFeedback.sharesOn||postFeedback.sharesOn==="false"?false:true}
                        onChange={(e) => {setPostFeedback({...postFeedback, sharesOn: e.target.value==="true"?"false":"true"})}}
                        value={postFeedback.sharesOn?"true":"false"}
                      /> Shares
                    </div>
                    <div className="postcard__checkbox">
                      <input 
                        type="checkbox"
                        name="likesOn"
                        checked={!postFeedback.likesOn||postFeedback.likesOn==="false"?false:true}
                        onChange={(e) => {setPostFeedback({...postFeedback, likesOn: e.target.value==="true"?"false":"true"})}}
                        value={postFeedback.likesOn?"true":"false"}
                      /> Likes
                    </div>
                    {/* Hidden: the post's edited HTML content. Without
                        this, SAVE only updates privacy/feedback. */}
                    <input
                      type="hidden"
                      name="content"
                      value={editPostText}
                    />
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
            {parent ? (
              <>
                <style>{`
                  .reply-parent {
                    margin: 10px 12px 0;
                    border: 1px solid #ccd5e1;
                    border-radius: 6px;
                    background: #f4f7fb;
                    padding: 8px 10px;
                    font-size: 13px;
                    text-decoration: none;
                    color: inherit;
                    display: block;
                  }
                  .reply-parent:hover { background: #ecf1f8; }
                  .reply-parent__caption {
                    color: #777;
                    font-size: 11px;
                    margin-bottom: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                  }
                  .reply-parent__head {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 4px;
                  }
                  .reply-parent__avatar {
                    width: 22px; height: 22px; border-radius: 50%;
                    object-fit: cover; background: #ddd;
                  }
                  .reply-parent__name { font-weight: 600; color: #506982; }
                  .reply-parent__handle { color: #888; font-size: 11px; }
                  .reply-parent__content {
                    color: #444;
                    line-height: 1.35;
                    max-height: 4.5em;
                    overflow: hidden;
                    position: relative;
                  }
                  .reply-parent__content p { margin: 0.15rem 0; }
                `}</style>
                <a
                  className="reply-parent"
                  href={parent.url || parent.authorActorUri}
                  target="_blank"
                  rel="noreferrer"
                  title="View original post"
                >
                  <div className="reply-parent__caption">
                    Replying to{" "}
                    {parent.fqHandle || parent.handle || parent.authorActorUri}
                  </div>
                  <div className="reply-parent__head">
                    {parent.avatarUrl ? (
                      <img className="reply-parent__avatar" src={parent.avatarUrl} alt="" />
                    ) : (
                      <div className="reply-parent__avatar" />
                    )}
                    <span className="reply-parent__name">
                      {parent.displayName || parent.fqHandle || "?"}
                    </span>
                    {parent.fqHandle && parent.fqHandle !== parent.displayName && (
                      <span className="reply-parent__handle">{parent.fqHandle}</span>
                    )}
                  </div>
                  <div
                    className="reply-parent__content fake-p"
                    dangerouslySetInnerHTML={{ __html: parent.content }}
                  />
                </a>
              </>
            ) : null}
            <div
              className="postcard__content__media"
              ref={galWid}
            >
              <figure 
                className="postcard__content__media__slider"
                onTouchStart={setSwipe} 
                onTouchMove={setSwipe}
                onTouchEnd={setSwipe}
                ref={galSlide}
                style={{
                  // Height the slider — not the container — so the
                  // container auto-sizes around it. Centering the
                  // container itself (justify-content: center in CSS)
                  // pushes the slide's top above the visible area if
                  // its content overflows. Letting the container fit
                  // the slider sidesteps that entirely; the active
                  // slide is always anchored at the top.
                  height: sliderHeight != null ? sliderHeight : undefined,
                  transition: sliderHeight != null ? "height 0.3s ease" : undefined,
                  ...(mediaSlides.itemLength > 1
                    ? {
                        transform: `translateX(${
                          (Number(galSlide.current?.style.marginLeft.replace('px',''))*-1+swipe) > -1
                          && (Number(galSlide.current?.style.marginLeft.replace('px',''))) > (galWid.current?.offsetWidth*(mediaSlides.itemLength-1)*-1)
                          ? swipe*-1 : 0
                        }px)`,
                      }
                    : {}),
                }}
              >
                {
                  // The carousel relies on every slide being inline-block
                  // at 100% width so the children sit side-by-side under
                  // `white-space: nowrap` and translateX scrolls between
                  // them. <Image> is naturally inline (<img>), but <Video>
                  // and <Weblink> render block-level wrappers that broke
                  // the layout — wrapping them all in this slide div
                  // normalizes the geometry.
                  Object.keys(post.media).map(key => {
                    const DynamicComponent = mediaComponents.find(match => match.db_prop === key);
                    if (!Array.isArray(post.media[key]) || !DynamicComponent) return null;
                    // Fallback alt text from the post's own body — a
                    // generic-but-honest description for screen readers
                    // and search engines when no explicit alt is stored.
                    const fallbackAlt = post.content
                      ? String(post.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)
                      : "";
                    // Alt lookup map populated by the LLM alt-gen worker
                    // (/api/media/generate-alts). Keyed by filename.
                    const altMap: Record<string, string> =
                      (post.media?.imageAlts && typeof post.media.imageAlts === "object")
                        ? post.media.imageAlts
                        : {};
                    return post.media[key].map((item: any, i: number) => {
                      // Items can be strings or objects (e.g. YouTube links).
                      const slideKey =
                        typeof item === "string"
                          ? `${key}-${i}-${item}`
                          : `${key}-${i}-${item?.video ?? item?.url ?? i}`;
                      // Alt priority:
                      //   1. item.alt (stored on the item itself)
                      //   2. media.imageAlts[filename] (LLM-generated)
                      //   3. stripped post content (context fallback)
                      const filename = typeof item === "string" ? item : "";
                      const itemAlt =
                        (typeof item === "object" && item?.alt && String(item.alt)) ||
                        (filename && altMap[filename]) ||
                        fallbackAlt;
                      return (
                        <div
                          key={slideKey}
                          className="postcard__content__media__slider__slide"
                          style={{
                            display: "inline-block",
                            width: "100%",
                            verticalAlign: "top",
                            whiteSpace: "normal",
                          }}
                        >
                          <DynamicComponent.component
                            src={item}
                            alt={itemAlt}
                          />
                        </div>
                      );
                    });
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
                    onClick={() => gallerySlide("left")}
                  />
                  :""
              }
              {
                mediaSlides.itemLength>1&&mediaSlides.currentSlide<mediaSlides.itemLength-1
                  ?<div 
                    className="postcard__content__media__slide--right" 
                    onClick={() => gallerySlide("right")}
                  />
                  :""
              }                                                           
            </div>
            {post.content?.replace(/(<([^>]+)>)/gi, "")
              ?editMode
                ?<div 
                  onMouseEnter={() => setBodyEditActive(true)}
                  onMouseLeave={() => setBodyEditActive(false)}
                >
                  <TextEditor
                    htmlString={editPostText}
                    contentStateSetter={setEditPostText}
                    styleClass={`postcard__content-edit${bodyEditActive?"--active":""}`}
                  />
                </div>
                :<div className="postcard__content__text">
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