import { useFetcher } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { TextEditor } from "../TextEditor/TextEditor";
import { BlankPost, Post } from "~/common/types";
import { PostOptions } from "./PostOptions";

export const PostCreator: React.FC<{setNewPost?: any}> = ({setNewPost}) => {

  const [ clearPostContent, setClearPostContent ] = useState<boolean>(false);
  const [ isFocused, setIsFocused ] = useState<boolean>(false);
  const [ isActive, setIsActive ] = useState<boolean>(false);
  const [ postText, setPostText ] = useState<string>("");
  const [ tbProps, setTbProps ] = useState<{hidden:boolean, sticky:boolean}>({hidden:true, sticky:false});
  const [ postObject, setPostObject ] = useState<Post>(BlankPost);
  
  const submitPostForm = useFetcher();
  const focusedOverlay = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if(submitPostForm.data?.newPost) {
      setNewPost(submitPostForm.data?.newPost);
      setClearPostContent(true);
      setPostText("");
      submitPostForm.data.newPost = null;
    }
  },[ submitPostForm ]);

  useEffect(() => {
    const checkBlur = setTimeout(() => {
      focusedOverlay.current?.click();
    }, 100);
    return () => clearTimeout(checkBlur);
  },[clearPostContent])

  const submitPost = () => {
    submitPostForm.submit(
      { newPost: JSON.stringify({...postObject, content: postText }) },
      { method: "post", action: "/api/post/create?index" }
    );
  }

  const blurEditor = () => {
    const htmlTags = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
    if(!postText.replace(htmlTags,'')) {
      setIsActive(false); 
      setTbProps({hidden:true, sticky:false});
    }
  }

  const setPostPrivacy = (
    property:"commentsOn"|"likesOn"|"sharesOn"|"privacy",
    value:Post["privacy"]|boolean|any
  ) => {
    property==="privacy"
      ?setPostObject({...postObject, [property]: value})
      :setPostObject({...postObject, feedback:{...postObject.feedback, [property]: value}})
  }

  useEffect(() => {
    if(isFocused) {
      setIsActive(true);
      setTbProps({hidden:false, sticky:false});
    }
  },[isFocused])

  return (
    <>
      {isActive?<div className="active-upload-background" ref={focusedOverlay} onClick={blurEditor}></div>:<></>}
      <div className={`upload${isActive?" upload--active":""}`}>
        <TextEditor 
          clearContent={clearPostContent}
          contentStateSetter={setPostText}
          placeholderText={`Go ahead...`}
          setIsFocused={setIsFocused}
          styleClass="upload__editable"
          tbProps={tbProps}
        />
        <PostOptions
          postObject={postObject}
          setPostPrivacy={setPostPrivacy}
          submitPost={submitPost}
        />
      </div>
    </>
  )
}