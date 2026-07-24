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
  // Signals whether we restored content from a localStorage autosave
  // on mount. Drives the small "unsaved from earlier" banner + its
  // Discard button.
  const [ autosaveRestored, setAutosaveRestored ] = useState<boolean>(false);
  const [ tbProps, setTbProps ] = useState<{hidden:boolean, sticky:boolean}>({hidden:true, sticky:false});
  const [ postObject, setPostObject ] = useState<Post>(BlankPost);
  const [ pendingUploads, setPendingUploads ] = useState<{data: any, meta: any}[]>([]);
  // const [ imagesUploading, setImagesUploading ] = useState<null|"uploading"|"done"|"error">(null);
  const [ imagesUploading, setImagesUploading ] = useState<number>(0);
  const [ youTubePreviews, setYouTubePreviews ] = useState<YouTubeVideo[]>([]);
  // "Expanded" swaps the compact inline composer for a full-viewport
  // overlay that gives the editor much more room — for writing longer
  // pieces instead of tweet-length blurbs.
  const [ expanded, setExpanded ] = useState<boolean>(false);
  
  const fileUploadForm = useFetcher();
  const submitPostForm = useFetcher();
  // Stashes the state/scheduledFor requested by the user's click while
  // the image-upload roundtrip is in flight. Read by the fileUploadForm
  // useEffect below when it finalizes the create.
  const pendingSubmitOpts = useRef<{ state?: "draft" | "scheduled"; scheduledFor?: number }>({});
  const focusedOverlay = useRef<HTMLDivElement>(null) // I would rather not use this
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const words = postText.split(" ");
    words.pop();
    // The editor wraps URLs in `<a href="...">…</a>`. Splitting on
    // whitespace gives us things like `href="https://youtu.be/abc"`,
    // so when we slice off `https://you...` we still need to stop at
    // the next quote/angle-bracket, otherwise the trailing `"` gets
    // baked into the URL and the iframe ends up with `…?v=abc%22`.
    const cleanUrlFrom = (word: string): string | null => {
      const idx = word.indexOf("https://you");
      if (idx < 0) return null;
      const tail = word.slice(idx + "https://you".length);
      const ended = tail.split(/[\s"'<>]/)[0];
      return "https://you" + ended;
    };
    if((words.join("").includes('https://youtu.be/'))||(words.join("").includes('youtube.com/watch'))) {
      words.forEach(rawWord => {
        let word = rawWord;
        if(word.includes("https://youtu.be/")) {
          const cleaned = cleanUrlFrom(word);
          if (!cleaned) return;
          setYouTubePreviews((prev: YouTubeVideo[]) =>
              prev.find((video: YouTubeVideo) => video.video===cleaned)
                ?[...prev]
                :[...prev, {video: cleaned, show: true, meta: null}]
          )
        }
        if(word.includes("youtube.com")) {
          word = word.replace("://www.","://");
          word = word.replace("://music.","://");
          const cleaned = cleanUrlFrom(word);
          if (!cleaned) return;
          setYouTubePreviews((prev: YouTubeVideo[]) =>
              prev.find((video: YouTubeVideo) => video.video===cleaned)
                ?[...prev]
                :[...prev, {video: cleaned, show: true, meta: null}]
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
        {
          newPost: JSON.stringify({
            ...postObject,
            content: postText,
            media,
            // Apply the state/scheduledFor the user picked back at
            // click time — otherwise the base64-upload path always
            // publishes immediately regardless of the button used.
            state: pendingSubmitOpts.current.state ?? "published",
            scheduledFor: pendingSubmitOpts.current.scheduledFor,
          }),
        },
        { method: "post", action: "/api/post/create?index" }
      );
      pendingSubmitOpts.current = {};
    }
  },[fileUploadForm])

  const submitPost = (opts?: { state?: "draft" | "scheduled"; scheduledFor?: number }) => {
    // Block submit while any direct-to-S3 upload is still in flight.
    // Without this guard, in-flight videos get silently excluded from
    // the post (collectDirectUploads filters on alreadyUploaded).
    const stillUploading = pendingUploads.some((f: any) => f.uploading);
    if (stillUploading) {
      console.warn("[PostCreator] submit blocked: upload still in progress");
      return;
    }
    // Stash the button's intent for the base64-upload async path to
    // read when it finalizes the create. Direct path uses it inline.
    pendingSubmitOpts.current = opts ?? {};
    const submitState = opts?.state ?? "published";
    const submitScheduledFor = opts?.scheduledFor;

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
            state: submitState,
            scheduledFor: submitScheduledFor,
          }),
        },
        { method: "post", action: "/api/post/create?index" }
      );
      pendingSubmitOpts.current = {};
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

  // ----- Autosave -------------------------------------------------
  //
  // The composer buffers unsaved drafts to localStorage every few
  // seconds. If the browser crashes / the tab closes / focus is
  // lost mid-thought, the next composer mount restores the content
  // silently and shows a small "restored" banner.
  //
  // localStorage is client-only + per-browser. That's fine for a
  // single-admin site — cross-device recovery isn't needed. Skips
  // SSR because window doesn't exist there.
  //
  // Storage key + shape:
  //   pgm.composerAutosave → JSON: { content: string, updated: number }
  //
  // TTL: 24h. Older snapshots are ignored so a stale draft from a
  // week ago doesn't ambush you when you sit down to write.

  const AUTOSAVE_KEY = "pgm.composerAutosave";
  const AUTOSAVE_TTL_MS = 24 * 60 * 60 * 1000;
  const AUTOSAVE_DEBOUNCE_MS = 3000;

  // Mount-only: restore from a recent snapshot, if any.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as { content?: string; updated?: number };
      if (
        typeof snap?.content === "string" &&
        snap.content.trim().length > 0 &&
        typeof snap?.updated === "number" &&
        Date.now() - snap.updated < AUTOSAVE_TTL_MS
      ) {
        setLexicalFromDraft(snap.content);
        setPostText(snap.content);
        setAutosaveRestored(true);
      } else {
        // Stale or empty — drop it so we don't keep pinging on future
        // mounts.
        window.localStorage.removeItem(AUTOSAVE_KEY);
      }
    } catch { /* corrupt JSON or unavailable storage — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced snapshot on every content change. Empty content clears
  // the snapshot rather than saving an empty one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        const stripped = postText.replace(/<[^>]+>/g, "").trim();
        if (!stripped) {
          window.localStorage.removeItem(AUTOSAVE_KEY);
          return;
        }
        window.localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({ content: postText, updated: Date.now() })
        );
      } catch { /* quota exceeded, etc. — best-effort */ }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [postText]);

  // Discard the restored draft without publishing.
  const discardAutosave = () => {
    try {
      if (typeof window !== "undefined")
        window.localStorage.removeItem(AUTOSAVE_KEY);
    } catch { /* silent */ }
    setLexicalFromDraft("");
    setPostText("");
    setClearPostContent(true);
    setAutosaveRestored(false);
  };
  // ----- End autosave --------------------------------------------


  useEffect(() => {
    if(submitPostForm.data?.newPost) {
      setNewPost(submitPostForm.data?.newPost);
      setPendingUploads([]);
      setYouTubePreviews([]);
      setClearPostContent(true);
      setPostText("");
      // Publish committed — drop the autosave snapshot so the next
      // composer mount starts clean instead of restoring the just-
      // published content.
      try {
        if (typeof window !== "undefined")
          window.localStorage.removeItem(AUTOSAVE_KEY);
      } catch { /* silent */ }
      setAutosaveRestored(false);
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

  // On successful publish, close the expanded view too so the admin
  // lands back on the feed rather than staring at an empty modal.
  useEffect(() => {
    if(submitPostForm.data?.newPost) setExpanded(false);
  },[ submitPostForm.data?.newPost ]);

  const editorBlock = (
    <>
      {autosaveRestored ? (
        <div className="upload__autosave-banner">
          <span>Restored unsaved draft from earlier.</span>
          <button
            type="button"
            onClick={discardAutosave}
            className="upload__autosave-discard"
          >
            Discard
          </button>
        </div>
      ) : null}
      <TextEditor
        attachmentAction={() => fileInputRef.current?.click()}
        clearContent={clearPostContent}
        contentStateSetter={setPostText}
        htmlString={lexicalFromDraft||""}
        placeholderText={expanded ? `Write something…` : `Go ahead...`}
        setIsFocused={setIsFocused}
        styleClass={expanded ? "upload__editable upload__editable--expanded" : "upload__editable"}
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
    </>
  );

  return (
    <>
      <style>{`
        /* Expand-toggle: a small button anchored top-right of the
           composer. Uses "⤢" for the expand icon and "×" for close. */
        .upload__expand {
          position: absolute;
          top: 6px; right: 8px;
          z-index: 3;
          background: transparent;
          border: 0;
          font-size: 18px;
          line-height: 1;
          color: #506982;
          cursor: pointer;
          padding: 4px 6px;
          height: auto;
        }
        .upload__expand:hover { color: #4A6CBA; }
        .upload { position: relative; }

        /* Expanded overlay — near-fullscreen modal with a much taller
           editor so long-form composing feels natural. */
        .upload--expanded__backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.55);
          /* Must sit above the profile pic (z:100) and the header bar
             (z:100) so it truly covers everything, not just render
             behind them. */
          z-index: 150;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .upload--expanded__frame {
          background: #fff;
          border: 1px solid #979997;
          border-radius: 6px;
          width: 100%;
          max-width: 900px;
          max-height: 92vh;
          overflow-y: auto;
          padding: 40px 24px 24px;
          position: relative;
          box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        }
        .upload__editable--expanded {
          min-height: 60vh !important;
          font-size: 16px !important;
          line-height: 1.6;
        }
      `}</style>

      {expanded ? (
        <div
          className="upload--expanded__backdrop"
          onClick={(e) => {
            // Click outside the frame closes; click inside doesn't.
            if (e.target === e.currentTarget) setExpanded(false);
          }}
        >
          <div className="upload--expanded__frame">
            <button
              className="upload__expand"
              type="button"
              onClick={() => setExpanded(false)}
              title="Collapse editor"
              aria-label="Collapse editor"
            >×</button>
            {editorBlock}
          </div>
        </div>
      ) : (
        <>
          {isActive?<div className="active-upload-background" ref={focusedOverlay} onClick={blurEditor}></div>:<></>}
          <div className={`upload${isActive?" upload--active":""}`}>
            <button
              className="upload__expand"
              type="button"
              onClick={() => setExpanded(true)}
              title="Expand editor for long-form writing"
              aria-label="Expand editor"
            >⤢</button>
            {editorBlock}
          </div>
        </>
      )}
    </>
  )
}