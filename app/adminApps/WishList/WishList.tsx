import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";

interface WishItem {
  url: string,
  ['og:title']: string,
  ['og:description']: string,
  ['og:url']: string,
  ['og:site_name']: string,
  ['og:image']: string,
  ['og:image:alt']: string
}

export const WishList: React.FC<{}> = () => {

  const [ newWishes, setNewWishes ] = useState<string[]>([""]);
  const [ scraped, setScraped ] = useState<string[]>([]);
  const [ items, setItems ] = useState<WishItem []>([])

  const fetchFromURL = useFetcher();

  const isUrl = (str: string) => {
    return !!str.split(".")[1] && Number(str.split(".").at(-1)?.length) > 1;
  }

  const scrape = (i:number) => {
    if(!isUrl(newWishes[i])) return;
    const stateSet = new Set([...scraped]);
    if(stateSet.has(newWishes[i])) return;
    setItems([...items, {
      url: newWishes[i],
      ['og:title']: "Loading",
      ['og:description']: "",
      ['og:url']: "",
      ['og:site_name']: "",
      ['og:image']: "",
      ['og:image:alt']: ""
    }])
    fetchFromURL.submit(
      { url: newWishes[i] },
      { method: "post", action: `/api/scraper?index` }
    );
    setScraped([...scraped,newWishes[i]])
  }

  const updateWish = (i: number, val: string) => {
    val = val.replaceAll(" ","");
    const wishesClone = [...newWishes];
    wishesClone[i] = val;
    if(isUrl(wishesClone.at(-1)!.toString())) wishesClone.push("");
    wishesClone.forEach((wish: string, i: number) => {
      if(wish.length===0&&i!==wishesClone.length-1) wishesClone.splice(i,1);
    })
    setNewWishes(wishesClone);
  }

  useEffect(() => {
    if(fetchFromURL?.data?.scrapeRes) {
      const cleanObj = {...fetchFromURL?.data?.scrapeRes};
      delete fetchFromURL.data.scrapeRes;
      cleanObj['og:title'] = cleanObj['og:title']||"Thing I want";
      cleanObj['og:description'] = cleanObj['og:description']||"";
      cleanObj['og:url'] = cleanObj['og:url']||"#";
      cleanObj['og:site_name'] = cleanObj['og:site_name']||"";
      cleanObj['og:image'] = cleanObj['og:image']||"";
      cleanObj['og:image:alt'] = cleanObj['og:image:alt']||cleanObj['og:title'];
      const updatedItems = [...items].map(item => {
        if(item.url===cleanObj.url) return cleanObj;
        return item
      })
      setItems(updatedItems);
    }
  },[ fetchFromURL ])

  return (
    <>
      <article className="postcard--left">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink">
            Wish List
          </div>
        </div>
        <div className="postcard__content">
          <div className="postcard__content__media"/>
          <div className="wish-list">
            {newWishes.map((_wish: string, i: number) => 
              <input 
                key={`wishList-${i}`}
                className="wish-list__input" 
                onChange={(e) => updateWish(i,e.target.value)}
                onBlur={() => scrape(i)}
                placeholder="Item URL"
                value={newWishes[i]}
              />
            )}
            <div className="wish-list__item-container">
              {items.map((item: WishItem) => 
                <div key={item["og:description"]} className="wish-list__item">
                  <a href={item["og:url"]} target="_BLANK">
                    <img 
                      src={item["og:image"]} 
                      alt={item["og:image:alt"]}
                      className="wish-list__image"
                    />
                    <p className="wish-list__source">{item["og:site_name"]}</p>
                    <p className="wish-list__title">{item["og:title"]}</p>
                    <p className="wish-list__description">{item["og:description"]}</p>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </article>
    </>
  )
}