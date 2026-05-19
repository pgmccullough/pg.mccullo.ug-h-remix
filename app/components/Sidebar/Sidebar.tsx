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
          <style> tag so hover/focus states work without needing an SCSS
          recompile. */}
      <style>{`
        .sidebar-session {
          text-align: center;
          padding: 1rem;
        }
        .sidebar-session__line {
          font-size: 0.85rem;
          color: #555;
          margin-bottom: 0.6rem;
        }
        .sidebar-session__btn {
          display: inline-block;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          background: #1a1a1a;
          color: #fff;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 600;
          font-family: inherit;
          letter-spacing: 0.02em;
          transition: background-color 0.15s ease, transform 0.05s ease;
          border: 1px solid #1a1a1a;
          cursor: pointer;
        }
        .sidebar-session__btn:hover,
        .sidebar-session__btn:focus-visible {
          background: #333;
          outline: none;
        }
        .sidebar-session__btn:active {
          transform: translateY(1px);
        }
        .sidebar-session__btn--ghost {
          background: transparent;
          color: #1a1a1a;
        }
        .sidebar-session__btn--ghost:hover,
        .sidebar-session__btn--ghost:focus-visible {
          background: #f0f0f0;
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
          {/* <SiteActivity /> */}
        </>
        :""}
    </div>
  )
}