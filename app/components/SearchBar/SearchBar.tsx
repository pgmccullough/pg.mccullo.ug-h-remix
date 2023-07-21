import { SetStateAction, useEffect, useState } from "react"
import { useFetcher } from "@remix-run/react"

export const SearchBar: React.FC<{
  alterPostArray: SetStateAction<any>,
  setPostSearchResults: SetStateAction<any>
}> = ({alterPostArray, setPostSearchResults}) => {

  const mongoFetch = useFetcher();
  const [ searchQuery, setSearchQuery ] = useState<string>("");

  useEffect(() => {
    if(mongoFetch.type==="done") {
      setPostSearchResults(mongoFetch.data.searchResults);
      alterPostArray(mongoFetch.data.searchResults);
    }
  },[mongoFetch])

  const searchPosts = () => {
    mongoFetch.submit(
      { searchQuery },
      { method: "post", action: `/api/post/search?index` }
    );
  }

  return (
    <div className="search">
      <input 
        className="search__input"
        type="text"
        placeholder="Search posts"
        value={searchQuery}
        onChange={(e) => {setSearchQuery(e.target.value)}} 
        onKeyDown={(e) => {if(e.key==="Enter") {e.preventDefault(); searchPosts()}}}
      />
      <button 
        className="search__button"
        onClick={searchPosts}
      >SEARCH</button>
      <button 
        className="search__button search__button--clear"
        onClick={() => {
          setSearchQuery(""); 
          alterPostArray([]); 
          setPostSearchResults(null)
        }}
      >CLEAR</button>
    </div>
  )
}