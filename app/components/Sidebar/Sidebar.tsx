import { Link } from 'react-router';
import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from 'react';
import type { User, SiteData } from '../../common/types';
import { Calendar, Email, Notes, RentalProperties, SiteActivity, TaskTracker, Webcam, WishList } from '~/adminApps';
import { TextEditor } from '../TextEditor/TextEditor';
import { SignInModal } from '../SignInModal/SignInModal';

export const Sidebar: React.FC<{
  manualSiteData?: SiteData,
  manualUser?: User
}> = ({manualSiteData, manualUser}) => {

  let loadData;

  if(!manualSiteData) {
    loadData = useLoaderData<{user: User, siteData: SiteData}>();
  }

  const user = loadData?.user||manualUser;
  const siteData = loadData?.siteData||manualSiteData;

  const [ editMode, setEditMode ] = useState<boolean>(false);
  const [ editPrompt, toggleEditPrompt ] = useState<boolean>(false);
  const [ bioContent, setBioContent ] = useState<string|undefined>(siteData?.site_description);
  const [ showSignInModal, setShowSignInModal ] = useState<boolean>(false);

  const bioFetch = useFetcher();

  const saveBio = () => {
    bioFetch.submit(
      { bioData: bioContent! },
      { method: "post", action: `/api/siteData/bio?index` }
    );
  }

  useEffect(() => {
    if(bioFetch.data?.bioRes) {
      bioFetch.data.bioRes = null;
      setEditMode(false);
    }
  },[ bioFetch ])
  

  return (
    <div id="sidebar">
      <article className="postcard--left">
        <div className="postcard__time" style={{ justifyContent: "center" }}>
          <div className="postcard__time__link--unlink">
            <Link to="/h/">{!siteData?.site_name||"Patrick Glendon McCullough"}</Link>
          </div>
          {user?.role==="administrator"
            ?<div className="postcard__time__option" onClick={() => {toggleEditPrompt(!editPrompt)}}>
              <p className="postcard__time__option__chevron">^</p>
            </div>
            :""
          }
        </div>
        <div className="postcard__content">
          {editPrompt
            ?<>
              <div 
                className="postcard__content__modal__background"
                onClick={() => {
                  toggleEditPrompt(false);
                }}
              />
              <div className="postcard__content__modal">
                <div>Post Options</div>
                <button onClick={() => {
                  setEditMode(true);
                  toggleEditPrompt(false);
                }}>EDIT</button>
                <button onClick={() => {
                  toggleEditPrompt(false);
                }}>CANCEL</button>
              </div>
            </>
            :""
          }
          <div className="postcard__content__media"></div>
          <div className="postcard__content__text">
            {siteData?.site_description
              ?editMode
                ?<>
                  <TextEditor 
                    htmlString={siteData?.site_description}
                    contentStateSetter={setBioContent}
                  />
                  <button onClick={saveBio}>SAVE</button>
                  <button onClick={() => {
                    setEditMode(false);
                  }}>CANCEL</button>
                </>
                :<span dangerouslySetInnerHTML={{__html: siteData?.site_description}} />
              :""
            }
          </div>
        </div>
      </article>

      {/* Session controls — visible to everyone. Styled via a scoped
          <style> tag so it lands without needing an SCSS recompile. The
          rules below have to fight the global `button { height: 20px }`
          reset in _global.scss, so we explicitly reset the things that
          reset would otherwise impose. Colors and shapes match the
          existing site theme: $header (#506982), the global button blue
          (#4A6CBA), 4px radii, and the box-shadow hover treatment used
          on .postcard__time__option. */}
      <style>{`
        .sidebar-session {
          text-align: center;
          padding: 14px 12px;
        }
        .sidebar-session__line {
          font-size: 13px;
          color: #555;
          margin-bottom: 10px;
        }
        .sidebar-session__line strong {
          color: #506982;
        }
        .sidebar-session__btn,
        .sidebar-session__btn:visited {
          /* Reset the globals that fight us */
          height: auto;
          margin: 0;
          /* Theme-matched button */
          display: inline-block;
          padding: 8px 18px;
          background: #4A6CBA;
          color: #fff;
          font: 600 14px 'PGM Sans', sans-serif;
          letter-spacing: 0.02em;
          border: 0;
          border-radius: 4px;
          text-decoration: none;
          line-height: 1.2;
          cursor: pointer;
          transition: box-shadow 0.2s ease, background-color 0.15s ease;
          box-sizing: border-box;
        }
        .sidebar-session__btn:hover,
        .sidebar-session__btn:focus-visible {
          background: #506982;
          box-shadow: 0 0 0 3px #ccc;
          outline: none;
        }
        .sidebar-session__btn--ghost,
        .sidebar-session__btn--ghost:visited {
          background: #fff;
          color: #4A6CBA;
          border: 1px solid #979997;
          border-right: 1px solid #777;
          border-bottom: 2px solid #777;
          padding: 7px 16px;
        }
        .sidebar-session__btn--ghost:hover,
        .sidebar-session__btn--ghost:focus-visible {
          background: #fff;
          color: #506982;
          box-shadow: 0 0 0 3px #ccc;
        }
      `}</style>
      <article className="postcard--left sidebar-session">
        {user?.id
          ? <>
              <div className="sidebar-session__line">
                Signed in as <strong>{user.user_name}</strong>
              </div>
              <Link
                to="/api/user/logout"
                className="sidebar-session__btn sidebar-session__btn--ghost"
              >
                Sign out
              </Link>
            </>
          : <button
              type="button"
              onClick={() => setShowSignInModal(true)}
              className="sidebar-session__btn"
            >
              Sign in / Sign up
            </button>
        }
      </article>

      {showSignInModal && (
        <SignInModal onClose={() => setShowSignInModal(false)} />
      )}

      {!manualSiteData&&user?.role==="administrator"
        ?<>
          {/* <Email /> */}
          <Calendar />
          <Notes />
          {/* <TaskTracker /> */}
          <WishList />
          {/* <RentalProperties /> */}
          {/* <Webcam /> */}
          <SiteActivity />
        </>
        :""}
    </div>
  )
}