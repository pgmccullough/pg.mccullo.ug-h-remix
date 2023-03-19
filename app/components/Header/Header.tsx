import { Link } from 'react-router-dom';
import { Form, useFetcher, useLoaderData } from "@remix-run/react";
import { useRef, useState } from 'react';
import { SiteData } from '~/common/types';
import { stampToTime } from '~/functions/functions';
import { UploadBox } from '../UploadBox/UploadBox';

export const Header: React.FC<{}> = () => {
    
  const fetcher = useFetcher();
  const { user, siteData } = useLoaderData<{
    user: {user_name: string,role: string},
    siteData: SiteData
  }>();
  const [ inEdit, toggleInEdit ] = useState<boolean>(false);
  const [ watchWordActive, setWatchWordActive ] = useState<{ inEdit: boolean, watchword: string|undefined }>({ inEdit: false,  watchword: siteData.watchword.word });
  const watchWordRef = useRef<HTMLDivElement>(null);
  const profileImageSubmit = useRef<HTMLButtonElement>(null);
  const profileImageInput = useRef<HTMLInputElement>(null);

  const uploadProfileImg = () => {

  }

  const uploadStoryImg = () => {
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

  const handleProfileChange = (e:any) => {
    if(profileImageSubmit.current) {
      profileImageSubmit.current.click();
    }
  }

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
          onChange={handleProfileChange}
          ref={profileImageInput}
        />
        <button ref={profileImageSubmit}></button>
      </fetcher.Form>
      <div className="header__cover">
        <img src={siteData?.cover_image?.image} width="100%" alt={siteData?.site_name} />  
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
            cover: {stampToTime(siteData?.cover_image?.timestamp/1000)}
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
          </div>
          :""}
          {siteData&&siteData.profile_image?
          <div className="header__p">profile: {stampToTime(siteData?.profile_image?.timestamp/1000)}
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
        {user?.role==="administrator"?<UploadBox />:siteData.site_name}
      </div>
      <Link to="/h/">
        <div 
          className="header__profile" 
          style={{backgroundImage: `url('${siteData?.profile_image?.image}')`}}
        />
      </Link>
    </header>
  )
}