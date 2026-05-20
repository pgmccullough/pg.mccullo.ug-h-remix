import { useFetcher } from "react-router";
import { useEffect, useRef, useState } from "react";
import { TextEditor } from "../TextEditor/TextEditor";
import { BlankPost, Post, YouTubeVideo } from "~/common/types";
import { FileUpload, PostOptions } from ".";

/**
 * Pull out already-uploaded entries (videos/audio/other that went
 * direct-to-S3 via /api/upload/presign) and bucket them by media kind.
 * Returns plain arrays of basenames suitable for storing on
 * `post.media.<kind>`.
 */
const collectDirectUploads = (uploads: any[]) => {
  const buckets: { images: string[]; videos: string[]; audio: string[]; files: string[] } = {
    images: [], videos: [], audio: [], files: [],
  };
  for(const u of uploads) {
    if(!u.alreadyUploaded || !u.basename) continue;
    const k: keyof typeof buckets =
      u.kind === "videos" ? "videos" :
      u.kind === "audio"  ? "audio"  :
      u.kind === "images" ? "images" : "files";
    buckets[k].push(u.basename);
  }
  return buckets;
}

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
      // Defensive: the server response shape has shifted between AWS SDK
      // versions (key vs Key, location vs Location). Read whichever is
      // present, and skip the upload silently rather than crashing the
      // whole page if a match wasn't found.
      const imagesBasenames = [...pendingUploads]
        // Only the image branch goes through /api/upload/base64; everything
        // else was already PUT directly to S3 and carries its own basename.
        .filter((file:any) => file.kind === "images" && !file.alreadyUploaded)
        .map((file:{data: any, meta: any}) => {
          const match = uploadsServer.find(
            (upload:{name: string, upload: string, uploadRes: any}) =>
              file.meta.name === upload.name
          );
          const res = match?.uploadRes;
          const keyish: string | undefined =
            res?.key ?? res?.Key ?? res?.location ?? res?.Location;
          if (!keyish || typeof keyish !== "string") {
            console.warn("[PostCreator] upload result missing key/location:", res);
            return null;
          }
          return keyish.split("/").pop();
        })
        .filter((x): x is string => typeof x === "string" && x.length > 0);
      fileUploadForm.data.uploaded = null;
      // Bring in files that went direct-to-S3 (videos / audio / other).
      const direct = collectDirectUploads(pendingUploads);
      const media = {
        ...postObject.media,
        directory: "",
        images: [...(direct.images ?? []), ...imagesBasenames],
        videos: direct.videos,
        audio: direct.audio,
        files: direct.files,
      };
      submitPostForm.submit(
        { newPost: JSON.stringify({...postObject, content: postText, media }) },
        { method: "post", action: "/api/post/create?index" }
      );
    }
  },[fileUploadForm])

  const submitPost = () => {
    // Block submit while any direct-to-S3 upload is still in flight.
    // Without this guard, in-flight videos get silently excluded from
    // the post (collectDirectUploads filters on alreadyUploaded).
    const stillUploading = pendingUploads.some((f: any) => f.uploading);
    if (stillUploading) {
      console.warn("[PostCreator] submit blocked: upload still in progress");
      return;
    }

    const clonePostObject = {...postObject};
    if(youTubePreviews.filter((video:YouTubeVideo) => video.show).length) {
      const media = {...postObject.media, links: youTubePreviews.filter((video:YouTubeVideo) => video.show)}
      clonePostObject.media = media;
      setPostObject(postObject);
    }

    // Only the image-branch uploads still need the server round-trip
    // to /api/upload/base64. Direct-to-S3 uploads (videos/audio/etc.)
    // are already done and just need to ride along on the post.
    const needsBase64 = pendingUploads
      .filter((file: any) => file.kind === "images" && !file.alreadyUploaded);

    if(needsBase64.length) {
      setImagesUploading(needsBase64.length);
      const filesToUpload = needsBase64.map((file: any) => ({
        fileData: file.data,
        fileMeta: JSON.stringify({name: file.meta.name, type: file.meta.type}),
      }));
      /* eventually these need to be done individually, one file per request, so
      I can better track progress/errors */
      fileUploadForm.submit(
        { uploads: JSON.stringify(filesToUpload) },
        { method: "post", encType: "multipart/form-data", action: "/api/upload/base64?index" }
      );
    } else {
      // No base64 work needed. If we have direct-to-S3 uploads though,
      // we still need to attach them to the post media.
      const direct = collectDirectUploads(pendingUploads);
      const hasDirect =
        direct.images.length || direct.videos.length ||
        direct.audio.length || direct.files.length;
      const media = hasDirect
        ? {
            ...clonePostObject.media,
            directory: "",
            images: direct.images,
            videos: direct.videos,
            audio: direct.audio,
            files: direct.files,
          }
        : clonePostObject.media;
      submitPostForm.submit(
        {
          newPost: JSON.stringify({
            ...clonePostObject,
            media,
            content: postText,
          }),
        },
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