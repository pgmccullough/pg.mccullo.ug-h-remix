import { useEffect, useState } from 'react';
import { useFetcher } from "@remix-run/react";

export const Weblink: React.FC<{src:string|any,alt:string}>  = ({src,alt}) => {
  if(!src.video) {
    const fetcher = useFetcher();

    let scrapeURL = src;
    scrapeURL = scrapeURL.replace("http://","");
    scrapeURL = scrapeURL.replace("https://","");

    const [scrapeData, setScrapeData] = useState<any>({});

    useEffect(() => {
      if(fetcher.data?.scrapeObject) {
        setScrapeData(fetcher.data.scrapeObject);
        fetcher.data.scrapeObject = null;
      }
    },[fetcher])

    useEffect(() => {
      fetcher.submit(
        { scrapeURL: encodeURIComponent(scrapeURL) },
        { method: "post", action: `/api/media/scrape?index` }
      );  
    },[]);

    return (
      Object.keys(scrapeData).length
        ?<a href={scrapeData['og:url']} className="postcard__content__media__slider__weblink__anchor" target="_blank" rel="noopener noreferrer">
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
        :<></>
    );
  } else {
    return (
      <div className="postcard__content__media__slider__weblink__video-container">
        <iframe className="postcard__content__media__slider__weblink__video-container__iframe" src={`https://www.youtube.com/embed/${src.video.split("=")[1]}`} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
      </div>
    )
  }
}