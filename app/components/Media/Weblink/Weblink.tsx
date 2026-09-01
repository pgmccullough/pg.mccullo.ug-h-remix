import { useEffect, useState } from 'react';
import { useFetcher } from "react-router";

/**
 * Turn any YouTube-family URL into an embed URL. Handles:
 *   - youtu.be/VIDEO_ID
 *   - www.youtube.com/watch?v=VIDEO_ID
 *   - youtube.com/watch?v=VIDEO_ID&list=LIST_ID   (previously broken —
 *     old split("=")[1] returned "VIDEO_ID&list")
 *   - music.youtube.com/watch?v=VIDEO_ID&list=LIST_ID
 *   - music.youtube.com/playlist?list=LIST_ID     (no video id at all —
 *     embed via videoseries)
 *   - youtube.com/shorts/VIDEO_ID
 * Returns null if the URL doesn't match any recognized YouTube shape.
 */
function youTubeEmbedUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (
      u.hostname === "youtube.com" ||
      u.hostname.endsWith(".youtube.com")
    ) {
      // /shorts/VIDEO_ID
      const shortsMatch = u.pathname.match(/^\/shorts\/([^/?#]+)/);
      if (shortsMatch) {
        return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      }
      // /watch?v=VIDEO_ID  (preserve list + start if present)
      const videoId = u.searchParams.get("v");
      if (videoId) {
        const params = new URLSearchParams();
        const list = u.searchParams.get("list");
        if (list) params.set("list", list);
        const start = u.searchParams.get("t") ?? u.searchParams.get("start");
        if (start) params.set("start", String(parseInt(start, 10) || 0));
        const qs = params.toString();
        return `https://www.youtube.com/embed/${videoId}${qs ? `?${qs}` : ""}`;
      }
      // /playlist?list=LIST_ID  → videoseries embed
      const listId = u.searchParams.get("list");
      if (u.pathname.startsWith("/playlist") && listId) {
        return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(
          listId
        )}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export const Weblink: React.FC<{src:string|any,alt:string}>  = ({src,alt}) => {
  // Legacy posts stored media.links as bare strings instead of the
  // {video, show, meta} object shape the composer produces today. If
  // the string is a recognizable YouTube URL, short-circuit and
  // embed directly — skipping the scrape roundtrip that (a) costs a
  // request and (b) fails outright when music.youtube.com blocks
  // OG scrapers.
  if (typeof src === "string") {
    const embed = youTubeEmbedUrl(src);
    if (embed) {
      return (
        <div className="postcard__content__media__slider__weblink__video-container">
          <iframe
            className="postcard__content__media__slider__weblink__video-container__iframe"
            src={embed}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }
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
            scrapeData['og:url'] && youTubeEmbedUrl(scrapeData['og:url'])?
            <div className="postcard__content__media__slider__weblink__video-container">
                <iframe className="postcard__content__media__slider__weblink__video-container__iframe" src={youTubeEmbedUrl(scrapeData['og:url'])!} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
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
    // src is the stored {video, show, meta} object from PostCreator's
    // youTubePreviews. src.video is the full URL — extract via helper
    // so URL variants (music.youtube.com, ?list=, /playlist, /shorts)
    // all produce a valid embed. Falls back to a plain link if the
    // shape isn't recognizable (rare — shouldn't happen since only
    // YouTube URLs get pushed into youTubePreviews).
    const embed = youTubeEmbedUrl(src.video);
    if (!embed) {
      return (
        <a href={src.video} target="_blank" rel="noopener noreferrer">
          {src.video}
        </a>
      );
    }
    return (
      <div className="postcard__content__media__slider__weblink__video-container">
        <iframe className="postcard__content__media__slider__weblink__video-container__iframe" src={embed} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
      </div>
    )
  }
}