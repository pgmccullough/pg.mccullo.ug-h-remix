import axios from 'axios';
import { useEffect, useState } from 'react';
const SERVER_URI = 'https://api.mccullo.ug/';

export const Weblink: React.FC<{src:string,alt:string}>  = ({src,alt}) => {

    let scrapeURL = src;
    scrapeURL = scrapeURL.replace("http://","");
    scrapeURL = scrapeURL.replace("https://","");

    const [scrapeData, getScrapeData] = useState<any>({});

    async function grabData() {
        const res = await axios.get(`${SERVER_URI}media/scrape/${encodeURIComponent(scrapeURL)}`);
        await res.data.map((ogTag:any) => {
            let keyName = Object.getOwnPropertyNames(ogTag)[0];
            getScrapeData((prev:any) => {
              if(keyName==="og:description") {
                let trimDesc = ogTag[keyName];
                if(trimDesc.length > 300) {
                  let commaTrimDesc = trimDesc.slice(0,300).split(", ");
                  commaTrimDesc.pop();
                  commaTrimDesc = commaTrimDesc.join(", ").trim();
                  let periodTrimDesc = trimDesc.slice(0,300).split(". ");
                  periodTrimDesc.pop();
                  periodTrimDesc = periodTrimDesc.join(", ").trim();
                  trimDesc = commaTrimDesc.length > periodTrimDesc.length 
                    ? commaTrimDesc+"..."
                    : periodTrimDesc+".";
                }
                return {...prev,[keyName]:trimDesc}
              }
              return {...prev,[keyName]:ogTag[keyName]}
            });
        })
    }

    useEffect(() => {
        grabData();
    },[]);

    return (    
        <a href={scrapeData['og:url']} className="postcard__content__media__slider__weblink__anchor" target="_blank" rel="noopener noreferrer">
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
        </a>
    );
}