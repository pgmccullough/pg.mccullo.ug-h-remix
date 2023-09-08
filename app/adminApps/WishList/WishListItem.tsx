import { WishItem, User } from "~/common/types"

export const WishListItem: React.FC<{ deleteItem: (id: string) => void, item: WishItem, user: User }> = ({ deleteItem, item, user }) => {

  const extractSiteName = (url: string) => {
    const bits = url?.split("//");
    const domain = bits[1]?.split(".");
    if(!domain||!domain.length) return "";
    return domain[0]==="www"?domain[1]:domain[0];
  }

  let price = item.offers?item.offers.price:item["og:product:price:amount"]

  return (
    <div className="wish-list__item">
      {user.role==="administrator"?<div className="wish-list__delete" onClick={() => deleteItem(item._id)}>+</div>:""}
      <a href={item["og:url"]||item["url"]} target="_BLANK">
        <img 
          src={item?.image?.length?item["image"][0]:item["og:image"]} 
          alt={item["og:image:alt"]||item["name"]}
          className="wish-list__image"
        />
        <p className="wish-list__source">{item["og:site_name"]||extractSiteName(item["og:url"]||item["url"])}</p>
        {price?<p className="wish-list__price">${Number(price).toFixed(2)}</p>:""}
        <p className="wish-list__title">{item["og:title"]||item["name"]}</p>
        <p className="wish-list__description">{item["og:description"]||item["description"]}</p>
      </a>
    </div>
  )
}