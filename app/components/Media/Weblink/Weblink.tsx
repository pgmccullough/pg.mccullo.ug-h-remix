import { LoaderFunction } from "@remix-run/node";
import { useActionData } from "@remix-run/react";
import { PostCard } from "../../../components/PostCard/PostCard";
import { clientPromise } from "../../../lib/mongodb";
import axios from 'axios';
import { useState } from 'react';
const SERVER_URI = process.env.REACT_APP_SERVER_URI;

export const Weblink: React.FC<{src:string,alt:string}>  = ({src,alt}) => {
    
    const [scrapeData, getScrapeData] = useState({});

    async function grabData() {
        const res = await axios.get(`${SERVER_URI}media/scrape/${encodeURIComponent("music.youtube.com/watch?v=_C5jzm6Y3wE")}`);
        console.log("DIED!",res.data[0]);
        await res.data.map((ogTag:any) => {
            let keyName = Object.getOwnPropertyNames(ogTag)[0];
            getScrapeData(prev => {
                return {...prev,[keyName]:ogTag[keyName]}
            })
        })
    }

    grabData();

    return (    
        <>
        {console.log("FUDGY",scrapeData)}
        {/* <a href={scrapeData['og:url']} className="postcard__content__media__slider__weblink__anchor" target="_blank" rel="noopener noreferrer">
            {
            scrapeData['og:url']?.includes("youtube.com")?
            <div className="postcard__content__media__slider__weblink__video-container">
                <iframe className="postcard__content__media__slider__weblink__video-container__iframe" src={`https://www.youtube.com/embed/${scrapeData['og:url'].split("=")[1]}`} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
            </div>:
                scrapeData['og:image']?
                <img src={scrapeData['og:image']} width="100%" alt={scrapeData['og:title']} />
                :""
            }
            <div className="postcard__content__media__slider__weblink__container">
                <div className="postcard__content__media__slider__weblink__container__site">{scrapeData['og:site_name']?.toUpperCase()}</div>
                <div className="postcard__content__media__slider__weblink__container__title">{scrapeData['og:title']}</div>
                <div className="postcard__content__media__slider__weblink__container__desc">{scrapeData['og:description']?.replaceAll("&hellip;","...")}</div>
            </div>
        </a> */}
        </>
    );
}