import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { stampToTime } from '../../functions/functions';
import { Audio } from '../Media/Audio/Audio';
import { File } from '../Media/File/File';
import { Image } from '../Media/Image/Image';
import { Video } from '../Media/Video/Video';
import { Weblink } from '../Media/Weblink/Weblink';

export const PostCard: React.FC<{ post:any }> = ({ post }) => {

    delete post.media.directory;

    const mediaComponents = [
        {db_prop: "audio", component: Audio},
        {db_prop: "files", component: File},
        {db_prop: "images", component: Image},
        {db_prop: "links", component: Weblink},
        {db_prop: "videos", component: Video},
    ]

    const gallerySlide = (dir:"left"|"right") => {
        if(dir==="left") {
            galSlide.current.style.marginLeft = "-"+((mediaSlides.currentSlide-1)*galWid.current.offsetWidth)+"px";
            setMediaSlides({...mediaSlides,currentSlide:mediaSlides.currentSlide-1})
        } else {
            galSlide.current.style.marginLeft = "-"+((mediaSlides.currentSlide+1)*galWid.current.offsetWidth)+"px";
            setMediaSlides({...mediaSlides,currentSlide:mediaSlides.currentSlide+1})
        }
    }

    const galSlide = useRef<any>();
    const galWid = useRef<any>();

    const [mediaSlides, setMediaSlides] = useState({
        currentSlide: 0,
        itemLength: Object.keys(post.media).map(key => post.media[key]?.length).reduce((a, b) => a + b, 0)
    })

    return(
        <article className="postcard" key={post._id}>
            <div className="postcard__time">
                <Link className="postcard__time__link" to={`/h/post/${post._id}`}>
                    <time dateTime={post.created}>{stampToTime(post.created)}</time>
                </Link>
            </div>
            <div className="postcard__content">
                <div className="postcard__content__media" ref={galWid}>
                    <figure className="postcard__content__media__slider" ref={galSlide}>
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
                                    className="postcard__content__media__slide--right shuk" 
                                    onClick={()=>{gallerySlide("right")}}
                                />
                                :""
                        }
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
                </div>
                <div className="postcard__content__text">
                    <p dangerouslySetInnerHTML={{__html: post.content}} />
                </div>
                <div className="postcard__content__meta">
                </div>
            </div>
        </article>
    )
}