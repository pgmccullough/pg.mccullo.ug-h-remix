import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";

export const WishList: React.FC<{}> = () => {

  const [ newWishes, setNewWishes ] = useState<string[]>([""]);

  const isUrl = (str: string) => {
    if(str.slice(0,4)!=="http") str = "https://"+str;
    return /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/.test(str);
  }

  const scrape = (i:number) => {
    console.log(newWishes[i],isUrl(newWishes[i]))
  }

  const updateWish = (i: number, val: string) => {
    const wishesClone = [...newWishes];
    wishesClone[i] = val;
    if(wishesClone.at(-1)!="") wishesClone.push("");
    wishesClone.forEach((wish: string, i: number) => {
      if(wish.length===0&&i!==wishesClone.length-1) wishesClone.splice(i,1);
    })
    setNewWishes(wishesClone);
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
          </div>
        </div>
      </article>
    </>
  )
}