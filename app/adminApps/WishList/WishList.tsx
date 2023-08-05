import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";

interface WishItem {
  url: string,
  _id: string,
  ['og:title']: string,
  ['og:description']: string,
  ['og:url']: string,
  ['og:site_name']: string,
  ['og:image']: string,
  ['og:image:alt']: string
  ['og:product:price:amount']: string
  ['image']?: string[],
  ['name']?: string,
  ['offers']?: {price: string},
  ['description']?: string
}

export const WishList: React.FC<{}> = () => {

  let { user, wishList } = useLoaderData();

  if(!user) {
    user = {}
  }

  const [ newWishes, setNewWishes ] = useState<string[]>([""]);
  const [ scraped, setScraped ] = useState<string[]>([]);
  const [ items, setItems ] = useState<WishItem []>(wishList)

  console.log(wishList);

  const fetchFromURL = useFetcher();
  const fetchDelete = useFetcher();

  const isUrl = (str: string) => {
    return !!str.split(".")[1] && Number(str.split(".").at(-1)?.length) > 1;
  }

  const scrape = (i:number) => {
    if(!isUrl(newWishes[i])) return;
    const stateSet = new Set([...scraped]);
    if(stateSet.has(newWishes[i])) return;
    setItems([...items, {
      url: newWishes[i],
      _id: "",
      ['og:title']: "Loading",
      ['og:description']: "",
      ['og:url']: "",
      ['og:site_name']: "",
      ['og:image']: "",
      ['og:image:alt']: "",
      ['og:product:price:amount']: ""
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

  const deleteItem = (id: string) => {
    fetchDelete.submit(
      { idToDelete: id },
      { method: "post", action: `/api/scraper/delete?index` }
    );
  }

  if(user.role==="administrator") {
    useEffect(() => {
      if(fetchDelete?.data?.deletedId) {
        console.log(fetchDelete.data.deletedId);
        const filteredItems = [...items].filter((item) => item._id !== fetchDelete.data.deletedId);
        setItems(filteredItems);
      }
    },[ fetchDelete ])

    useEffect(() => {
      if(fetchFromURL?.data?.scrapeRes) {
        const cleanObj = {...fetchFromURL?.data?.scrapeRes};
        const schemaBackup = {...fetchFromURL?.data?.schemaResults[0]}
        console.log(fetchFromURL?.data);
        delete fetchFromURL.data.scrapeRes;
        cleanObj['_id'] = fetchFromURL.data.dbEntry.insertedId;
        cleanObj['og:title'] = cleanObj['og:title']||schemaBackup['name']||"Thing I want";
        cleanObj['og:description'] = cleanObj['og:description']||schemaBackup['description']||"";
        cleanObj['og:url'] = cleanObj['og:url']||schemaBackup['url']||"#";
        cleanObj['og:site_name'] = cleanObj['og:site_name']||"";
        cleanObj['og:image'] = cleanObj['og:image']||schemaBackup['image'][0]||"";
        cleanObj['og:image:alt'] = cleanObj['og:image:alt']||cleanObj['og:title']||schemaBackup['name'];
        cleanObj['og:product:price:amount'] = Number(cleanObj['og:product:price:amount'])||schemaBackup['offers']['price']||"";
        const updatedItems = [...items].map(item => {
          if(item.url===cleanObj.url) return cleanObj;
          return item
        })
        setItems(updatedItems);
      }
    },[ fetchFromURL ])
  }

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
            {user.role==="administrator"&&newWishes.map((wish: string, i: number) => 
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
                <div key={item["_id"]} className="wish-list__item">
                  <div className="wish-list__delete" onClick={() => deleteItem(item._id)}>+</div>
                  <a href={item["og:url"]||item["url"]} target="_BLANK">
                    <img 
                      src={item["og:image"]||item["image"]![0]} 
                      alt={item["og:image:alt"]||item["name"]}
                      className="wish-list__image"
                    />
                    <p className="wish-list__source">{item["og:site_name"]}</p>
                    <p className="wish-list__price">${Number(item["og:product:price:amount"]||item["offers"]!["price"]).toFixed(2)}</p>
                    <p className="wish-list__title">{item["og:title"]||item["name"]}</p>
                    <p className="wish-list__description">{item["og:description"]||item["description"]}</p>
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