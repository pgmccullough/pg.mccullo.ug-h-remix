import { SetStateAction, useEffect, useState } from "react"
import { useFetcher } from "@remix-run/react"
import type { Post } from "~/common/types"

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

  const searchPosts = (e:React.FormEvent) => {
    e.preventDefault();
    mongoFetch.submit(
      { searchQuery },
      { method: "post", action: `/api/post/search?index` }
    );
  }

  return (
    <div>
      <form onSubmit={searchPosts}>
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => {setSearchQuery(e.target.value)}} 
        />
        <div onClick={() => {setSearchQuery(""); alterPostArray([]); setPostSearchResults(null)}}>CLEAR</div>
        <button>SEARCH</button>
      </form>
    </div>
  )
}