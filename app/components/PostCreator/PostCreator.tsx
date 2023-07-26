import { useFetcher } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { TextEditor } from "../TextEditor/TextEditor";
import { BlankPost, Post, YouTubeVideo } from "~/common/types";
import { FileUpload, PostOptions } from ".";

export const PostCreator: React.FC<{setNewPost?: any}> = ({setNewPost}) => {

  const [ clearPostContent, setClearPostContent ] = useState<boolean>(false);
  const [ isFocused, setIsFocused ] = useState<boolean>(false);
  const [ isActive, setIsActive ] = useState<boolean>(false);
  const [ postText, setPostText ] = useState<string>("");
  const [ lexicalFromDraft, setLexicalFromDraft ] = useState<string>("");
  const [ tbProps, setTbProps ] = useState<{hidden:boolean, sticky:boolean}>({hidden:true, sticky:false});
  const [ postObject, setPostObject ] = useState<Post>(BlankPost);
  const [ pendingUploads, setPendingUploads ] = useState<{data: any, meta: any}[]>([]);
  // const [ imagesUploading, setImagesUploading ] = useState<null|"uploading"|"done"|"error">(null);
  const [ imagesUploading, setImagesUploading ] = useState<number>(0);
  const [ youTubePreviews, setYouTubePreviews ] = useState<YouTubeVideo[]>([]);
  
  const fileUploadForm = useFetcher();
  const submitPostForm = useFetcher();
  const focusedOverlay = useRef<HTMLDivElement>(null) // I would rather not use this
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const words = postText.split(" ");
    words.pop();
    if((words.join("").includes('https://youtu.be/'))||(words.join("").includes('youtube.com/watch'))) {
      words.forEach(word => {
        if(word.includes("https://youtu.be/")) {
          word = "https://you"+word.split("https://you")[1];
          setYouTubePreviews((prev: YouTubeVideo[]) => 
              prev.find((video: YouTubeVideo) => video.video===word)
                ?[...prev]
                :[...prev, {video: word, show: true, meta: null}]
          )
        }
        if(word.includes("youtube.com")) {
          word = word.replace("://www.","://");
          word = word.replace("://music.","://");
          console.log("@",word);
          word = "https://you"+word.split("https://you")[1];
          setYouTubePreviews((prev: YouTubeVideo[]) => 
              prev.find((video: YouTubeVideo) => video.video===word)
                ?[...prev]
                :[...prev, {video: word, show: true, meta: null}]
          )
        }
      })
    }
  },[postText])

  const getYouTubePreview = async (url: string) => {
    console.log("1",url);
    let ytId = url.split("be/").at(-1);
    if(!url.split("be/").at(1)) {
      ytId = url.split("?v=").at(-1);
    }
    const raw = await fetch(`http://youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
    const metadata = await raw.json();
    const { title, thumbnail_url } = metadata;
    let ytPrevClone = [...youTubePreviews];
    const unscraped = ytPrevClone.find((video: YouTubeVideo) => video.video===url&&!video.meta)
    if(unscraped) {
      ytPrevClone = ytPrevClone.filter((preview: YouTubeVideo) => preview.video!==url);
      setYouTubePreviews([...ytPrevClone, {video: url, show: true, meta: {title, thumbnail: thumbnail_url}}])
    }
  }

  useEffect(() => {
    const unscraped = youTubePreviews
      .find((preview: YouTubeVideo) => preview.show&&!preview.meta);
    if(unscraped) getYouTubePreview(unscraped.video);
  },[youTubePreviews])

  useEffect(() => {
    if(fileUploadForm.data?.uploaded) {
      setImagesUploading(imagesUploading-1)
      const uploadsServer = [...fileUploadForm.data.uploaded];
      const uploadsClient = [...pendingUploads].map((file:{data: any, meta: any}) => {
        return uploadsServer.find(
          (upload:{name: string, upload: string, uploadRes: any}) => 
          file.meta.name === upload.name
        ).uploadRes.key.split("/").pop();
      })
      fileUploadForm.data.uploaded = null;
      const media = {...postObject.media, directory: "images/", images: uploadsClient}
      // Not currently evaluating file types to organize into videos/images/autio/files
      // Just assuming images
      submitPostForm.submit(
        { newPost: JSON.stringify({...postObject, content: postText, media }) },
        { method: "post", action: "/api/post/create?index" }
      );
    }
  },[fileUploadForm])

  const submitPost = () => {
    const filesToUpload: {fileData: string, fileMeta: string}[] = [];
    const clonePostObject = {...postObject};
    if(youTubePreviews.filter((video:YouTubeVideo) => video.show).length) {
      const media = {...postObject.media, links: youTubePreviews.filter((video:YouTubeVideo) => video.show)}
      clonePostObject.media = media;
      setPostObject(postObject);
    }
    if(pendingUploads.length) {
      setImagesUploading(pendingUploads.length);
      pendingUploads.forEach((file: {data: any, meta: any}) => {
        filesToUpload.push({ fileData: file.data, fileMeta: JSON.stringify({name: file.meta.name, type: file.meta.type}) });
      })
      /* eventually these need to be done individually, one file per request, so
      I can better track progress/errors */
      fileUploadForm.submit(
        { uploads: JSON.stringify(filesToUpload) },
        { method: "post", encType: "multipart/form-data", action: "/api/upload/base64?index" }
      );
    } else {
      submitPostForm.submit(
        { newPost: JSON.stringify({...clonePostObject, content: postText }) },
        { method: "post", action: "/api/post/create?index" }
      );
    }
  }

  const blurEditor = () => {
    const htmlTags = /<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>/g;
    if(!postText.replace(htmlTags,'') && !pendingUploads.length) {
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
  },[ isFocused ])

  useEffect(() => {
    if(submitPostForm.data?.newPost) {
      setNewPost(submitPostForm.data?.newPost);
      setPendingUploads([]);
      setYouTubePreviews([]);
      setClearPostContent(true);
      setPostText("");
      submitPostForm.data.newPost = null;
    }
  },[ submitPostForm ]);

  useEffect(() => {
    // I dislike this approach to collapsing the texteditor on submitting a post
    const checkBlur = setTimeout(() => {
      focusedOverlay.current?.click();
    }, 100);
    return () => clearTimeout(checkBlur);
  },[ clearPostContent ])

  return (
    <>
      {isActive?<div className="active-upload-background" ref={focusedOverlay} onClick={blurEditor}></div>:<></>}
      <div className={`upload${isActive?" upload--active":""}`}>
        <TextEditor 
          attachmentAction={() => fileInputRef.current?.click()}
          clearContent={clearPostContent}
          contentStateSetter={setPostText}
          htmlString={lexicalFromDraft||""}
          placeholderText={`Go ahead...`}
          setIsFocused={setIsFocused}
          styleClass="upload__editable"
          tbProps={tbProps}
        />
        <FileUpload
          fileInputRef={fileInputRef}
          imagesUploading={imagesUploading}
          pendingUploads={pendingUploads}
          setPendingUploads={setPendingUploads}
          youTubePreviews={youTubePreviews}
          setYouTubePreviews={setYouTubePreviews}
        />
        <PostOptions
          setPostPrivacy={setPostPrivacy}
          submitPost={submitPost}
        />
      </div>
    </>
  )
}