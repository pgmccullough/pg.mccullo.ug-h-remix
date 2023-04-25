import { useEffect, useState } from "react";
import { TextEditor } from "../TextEditor/TextEditor";
import type { Post } from "~/common/types";
import { PostOptions } from "./PostOptions";

export const PostCreator: React.FC = () => {

  const [ isFocused, setIsFocused ] = useState<boolean>(false);
  const [ isActive, setIsActive ] = useState<boolean>(false);
  const [ postText, setPostText ] = useState<string>("");
  const [ tbProps, setTbProps ] = useState<{hidden:boolean, sticky:boolean}>({hidden:true, sticky:false})
  
  const blurEditor = () => {
    const htmlTags = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
    if(!postText.replace(htmlTags,'')) {
      setIsActive(false); 
      setTbProps({hidden:true, sticky:false});
    }
  }

  useEffect(() => {
    if(isFocused) {
      setIsActive(true);
      setTbProps({hidden:false, sticky:false});
    }
  },[isFocused])

  return (
    <>
      {isActive?<div className="active-upload-background" onClick={blurEditor}></div>:<></>}
      <div className={`upload${isActive?" upload--active":""}`}>
        <TextEditor 
          // attachmentAction={() => attInput.current?.click()}
          contentStateSetter={setPostText}
          // htmlString={cleanEmail}
          placeholderText={`Go ahead...`}
          setIsFocused={setIsFocused}
          styleClass="upload__editable"
          tbProps={tbProps}
        />
        <PostOptions />
      </div>
    </>
  )

}