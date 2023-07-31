import { Link } from 'react-router-dom';
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from 'react';
import { Post, SiteData, User } from '~/common/types';
import { stampToTime } from '~/functions/functions';
import { PostCreator } from '../PostCreator/PostCreator';
import { StoryPost } from '../StoryPost/StoryPost';
import { v4 as uuidv4 } from 'uuid';
import { gps as getGPS } from 'exifr';
import Pusher from "pusher-js";

export const Header: React.FC<{
  manualSiteData?: SiteData,
  manualUser?: User,
  setNewPost?: any,
  storyPost?: any
}> = ({ manualSiteData, manualUser, setNewPost, storyPost }) => {

  const fetcher = useFetcher();

  let loadData;
  if(!manualSiteData) {
    loadData = useLoaderData<{user: User, siteData: SiteData}>();
  }
  const user = loadData?.user||manualUser;
  const siteData = loadData?.siteData||manualSiteData;

  const [ canShowDate, setCanShowDate ] = useState<boolean>(false);
  const [ inEdit, toggleInEdit ] = useState<boolean>(false);
  const [ watchWordActive, setWatchWordActive ] = useState<{ inEdit: boolean, watchword: string|undefined }>({ inEdit: false,  watchword: siteData?.watchword.word });
  const [ storyImageURL, setStoryImageURL ] = useState<string>(storyPost[0].media.images[0]||"");
  const [ storyImageVisibility, setStoryImageVisibility ] = useState<boolean>(false);
  const watchWordRef = useRef<HTMLDivElement>(null);

  const storyImageSubmit = useRef<HTMLButtonElement>(null);
  const storyImageInput = useRef<HTMLInputElement>(null);
  const storyImage = useRef<HTMLImageElement>(null);
  const storyTimestamp = useRef<HTMLSpanElement>(null);

  const profileImageSubmit = useRef<HTMLButtonElement>(null);
  const profileImageInput = useRef<HTMLInputElement>(null);
  const profileImage = useRef<HTMLImageElement>(null)
  const profTimestamp = useRef<HTMLSpanElement>(null);

  const uploadStoryImg = () => {
    if(storyImageInput.current) storyImageInput.current.click();
  }

  const uploadProfileImg = () => {
    if(profileImageInput.current) profileImageInput.current.click();
  }

  const blurWatchWord = () => {
    if(watchWordRef.current) {
      watchWordRef.current.contentEditable = "false";
      if(watchWordActive.watchword) {
        fetcher.submit(
          { watchword: watchWordActive.watchword, 
            siteData: JSON.stringify(siteData)
          },
          { method: "post", action: "/api/siteData/watchword?index" }
        );
      }
      setWatchWordActive({...watchWordActive, inEdit: false});
    }
  }

  const setWatchword = () => {
    if(watchWordRef.current) {
      watchWordRef.current.contentEditable = "true";
      watchWordRef.current.focus();
      toggleInEdit(false);
      setWatchWordActive({...watchWordActive,inEdit: true});
    }
  }

  const s3Upload = (s3Path:string, fileRef:React.RefObject<HTMLInputElement>) => {
    if(fileRef.current&&fileRef.current.files?.length) {
      s3Path = s3Path.replaceAll("/","_"); // can't pass slashes so '_' is replaced in s3.server.ts
      const dataTransfer = new DataTransfer();
      const profileImg = fileRef.current.files[0];
      const blob = profileImg.slice(0, profileImg.size, profileImg.type); 
      const imgExtension = profileImg.name.split(".").at(-1);
      const newFileName = s3Path + uuidv4() + "." + imgExtension;
      const newFile = new File([blob], newFileName, {type: profileImg.type});
      dataTransfer.items.add(newFile);
      fileRef.current!.files = dataTransfer.files;
      return newFile;
    }
    return false;
  }

  const handleStoryChange = () => {
    const fileRenamed:Blob|false = s3Upload("images/user/cover/", storyImageInput)
    if( fileRenamed && storyImageSubmit.current && storyImage.current ) {
      const reader = new FileReader();
      reader.readAsDataURL(fileRenamed);
      reader.onload = function(e:any) {
          storyImage.current!.src = e.target!.result;
      }
      storyImageSubmit.current.click();
      toggleInEdit(false);
    }
  }

  const handleProfileChange = () => {
    const fileRenamed:Blob|false = s3Upload("images/user/profile/", profileImageInput)
    if( fileRenamed && profileImageSubmit.current && profileImage.current ) {
      const reader = new FileReader();
      reader.readAsDataURL(fileRenamed);
      reader.onload = function(e:any) {
        profileImage.current!.style.backgroundImage = `url(${e.target!.result})`;
      }
      profileImageSubmit.current.click();
      toggleInEdit(false);
    }
  }

  const gpsFromImg = async(img:string) => {
    const { latitude, longitude } = (await getGPS(img))||{latitude: null, longitude: null};
    return { latitude, longitude };
  }

  if(fetcher.data?.imgSrc?.length) {
    const imgName = fetcher.data.imgSrc.split("/").slice(4);
    if(imgName[2]==="cover") {
      const permaName = "/api/media/"+imgName.join("/");
      gpsFromImg(permaName).then(({ latitude, longitude }) => {
        fetcher.submit(
          {
            gps: JSON.stringify({ latitude, longitude }),
            image: permaName,
            siteData: JSON.stringify(siteData)
          },
          { method: "post", action: "/api/siteData/storyImage?index" }
        );
        fetcher.data.imgSrc = "";
      });
    }
    else if(imgName[2]==="profile") {
      const permaName = "/api/media/"+imgName.join("/");
      gpsFromImg(permaName).then(({ latitude, longitude }) => {
        fetcher.submit(
          {
            gps: JSON.stringify({ latitude, longitude }),
            image: permaName,
            siteData: JSON.stringify(siteData)
          },
          { method: "post", action: "/api/siteData/profileImage?index" }
        );
        fetcher.data.imgSrc = "";
      });
    }
  }


  useEffect(() => {
    const pusher = new Pusher('1463cc5404c5aa8377ba', {
      cluster: 'mt1'
    });

    const watchwordChannel = pusher.subscribe("client-change-watchword");
    watchwordChannel.bind("refresh", (watchword: { watchword: string }) => {
      if(watchWordRef.current) watchWordRef.current.innerText = watchword.watchword;
    });

    const storyImgChannel = pusher.subscribe("client-change-storyImg");
    storyImgChannel.bind("refresh", (storyImgData: { storyImg: { gps: string|null, timestamp: number, image: string } }) =>  {
      storyImage.current!.src = storyImgData.storyImg.image;
      storyTimestamp.current!.innerText = stampToTime(storyImgData.storyImg.timestamp);
    });

    const profileImgChannel = pusher.subscribe("client-change-profileImg");
    profileImgChannel.bind("refresh", (profImgData: { profileImg: { gps: string|null, timestamp: number, image: string } }) =>  {
      profileImage.current!.style.backgroundImage = `url(${profImgData.profileImg.image})`;
      profTimestamp.current!.innerText = stampToTime(profImgData.profileImg.timestamp);
    });

    setCanShowDate(true);

    return () => {
      watchwordChannel.unbind_all();
      watchwordChannel.unsubscribe();
      storyImgChannel.unbind_all();
      storyImgChannel.unsubscribe();
      profileImgChannel.unbind_all();
      profileImgChannel.unsubscribe();
    };
  }, []);

  return (
    <header className="header">
      <fetcher.Form 
        method="post" 
        action="/api/upload?index" 
        encType="multipart/form-data"
        style={{display: "none"}}
      >
        <input 
          type="file"
          name="img" 
          accept="image/*"
          onChange={handleStoryChange}
          ref={storyImageInput}
        />
        <button ref={storyImageSubmit}></button>
      </fetcher.Form>

      <fetcher.Form 
        method="post" 
        action="/api/upload?index" 
        encType="multipart/form-data"
        style={{display: "none"}}
      >
        <input 
          type="file"
          name="img" 
          accept="image/*"
          onChange={handleProfileChange}
          ref={profileImageInput}
        />
        <button ref={profileImageSubmit}></button>
      </fetcher.Form>

      <div className="header__cover">
        <img 
          src={siteData?.cover_image?.image} 
          width="100%" 
          alt={siteData?.site_name}
          ref={storyImage}
        />
        <div className="header__text">
          {user?.role==="administrator"
            ?<h1 
              className="header__h1"
              onBlur={blurWatchWord}
              onInput={() => setWatchWordActive({...watchWordActive, watchword: watchWordRef.current?.innerText})}
              ref={watchWordRef}
            >
              {siteData?.watchword?.word}
            </h1>
            :<h1 
              className="header__h1" 
              ref={watchWordRef}
            >
              {siteData?.watchword?.word}
            </h1>
          }
          {siteData&&siteData.cover_image?
          <div className="header__p">
            cover: <span ref={storyTimestamp}>{canShowDate?stampToTime(siteData?.cover_image?.timestamp/1000):""}</span>
            {siteData?.cover_image?.gps?.lat
              ?<>
                <a 
                  className="gpsPinLink" 
                  href={`https://www.google.com/maps/search/${siteData?.cover_image?.gps?.lat},${siteData?.cover_image?.gps?.long}`} 
                  rel="noreferrer"
                  target="_BLANK"
                >
                  <div className="gpsPin" />
                </a>
                <div className="gpsCoords">
                  <a 
                      href={`https://www.google.com/maps/search/${siteData?.cover_image?.gps?.lat},${siteData?.cover_image?.gps?.long}`}
                      rel="noreferrer"
                      target="_BLANK"
                  >
                      {siteData?.cover_image?.gps?.string}
                  </a>
                </div>
              </>
              :""}
          </div>
          :""}
          {siteData&&siteData.profile_image?
          <div className="header__p">
            profile: <span ref={profTimestamp}>{canShowDate?stampToTime(siteData?.profile_image?.timestamp/1000):""}</span>
            {siteData?.profile_image?.gps?.lat
              ?<>
                <a 
                  className="gpsPinLink" 
                  href={`https://www.google.com/maps/search/${siteData?.profile_image?.gps?.lat},${siteData?.profile_image?.gps?.long}`} 
                  rel="noreferrer"
                  target="_BLANK"
                >
                  <div className="gpsPin" />
                </a>
                <div className="gpsCoords">
                  <a 
                    href={`https://www.google.com/maps/search/${siteData?.profile_image?.gps?.lat},${siteData?.profile_image?.gps?.long}`} 
                    rel="noreferrer"
                    target="_BLANK"
                  >
                    {siteData?.profile_image?.gps?.string}
                  </a>
                </div>
              </>
              :""}
          </div>
          :""}
        </div>
        {user?.role==="administrator"
            ?<div 
              className="postcard__time__option"
              onClick={() => toggleInEdit(!inEdit)}
            >
              <p className="postcard__time__option__chevron">^</p>
            </div>
            :""
        }
        {inEdit
          ?<>
            <div 
              className="postcard__content__modal__background"
              onClick={() => toggleInEdit(false)}
              style={{zIndex: 110}}
            />
            <div 
              className="postcard__content__modal"
              style={{marginTop: "47px", zIndex: 111, paddingTop: 0}}
            >
              <div className="postcard__content__headerOptionH1">Header Options</div>
              <ul className="postcard__content__headerOptionUL">
                <li 
                  className="postcard__content__headerOption"
                  onClick={uploadProfileImg}
                >Upload Profile Image</li>
                <li 
                  className="postcard__content__headerOption"
                  onClick={uploadStoryImg}
                >Upload Story Image</li>
                <li
                  className="postcard__content__headerOption"
                  onClick={setWatchword}
                >Set Watchword</li>
              </ul>
            </div>
          </>
          :""
        }
      </div>
      <div className="header__bar">
        {user?.role==="administrator"
          ?<PostCreator
            setNewPost={setNewPost}
          />
          :siteData?.site_name}
      </div>
      {storyPost.length
        ?<div 
          style={{cursor: "pointer"}} 
          onClick={() => setStoryImageVisibility(true)}
        >
          <div className="header__profile--story" />
          <div 
            className="header__profile" 
            style={{
              backgroundImage: `url('${siteData?.profile_image?.image}')`
            }}
            ref={profileImage}
          />
        </div>
        :<Link to="/h/">
          <div 
            className="header__profile" 
            style={{
              backgroundImage: `url('${siteData?.profile_image?.image}')`
            }}
            ref={profileImage}
          />
        </Link>
      }
      {storyImageVisibility?<StoryPost 
        storyImageURL={storyImageURL} 
        setStoryImageVisibility={setStoryImageVisibility}
      />:""}
    </header>
  )
}