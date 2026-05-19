import { Link } from 'react-router';
import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from 'react';
import type { User, SiteData } from '../../common/types';
import { Calendar, Email, Notes, RentalProperties, SiteActivity, TaskTracker, Webcam, WishList } from '~/adminApps';
import { TextEditor } from '../TextEditor/TextEditor';
import { SignInModal } from '../SignInModal/SignInModal';

const NotificationsBadge: React.FC = () => {
  const data = useLoaderData<{ unreadNotifications?: number }>();
  const count = data?.unreadNotifications ?? 0;
  return (
    <>
      <style>{`
        .sidebar-notif {
          padding: 10px 12px;
          text-align: center;
          margin-bottom: 10px;
        }
        .sidebar-notif a {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #4A6CBA;
          text-decoration: none;
          font: 600 14px 'PGM Sans', sans-serif;
        }
        .sidebar-notif a:hover { color: #506982; }
        .sidebar-notif__count {
          background: #be0d0d;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          padding: 1px 7px;
          border-radius: 999px;
          min-width: 18px;
          text-align: center;
        }
      `}</style>
      <article className="postcard--left sidebar-notif">
        <Link to="/h/notifications">
          Notifications
          {count > 0 && (
            <span className="sidebar-notif__count">{count > 99 ? "99+" : count}</span>
          )}
        </Link>
      </article>
    </>
  );
};

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
  const [ mobileOpen, setMobileOpen ] = useState<boolean>(false);

  // Close mobile overlay on Escape, and lock body scroll while it's open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

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
    <>
      {/* Mobile-only sidebar overlay behavior. Below 992px the sidebar is
          hidden offscreen by default; a small tab on the left edge of the
          viewport slides it in as an overlay. Above 992px, none of this
          applies and the original two-column layout is unchanged. */}
      <style>{`
        @media (max-width: 991px) {
          #sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 320px;
            max-width: 85vw;
            z-index: 200;
            background: #eee url('/assets/images/bgPattern.png');
            padding: 12px;
            overflow-y: auto;
            box-sizing: border-box;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 2px 0 16px rgba(0,0,0,0.25);
          }
          #sidebar.sidebar--mobile-open {
            transform: translateX(0);
          }
          .sidebar-mobile-tab {
            position: fixed;
            top: 50%;
            left: 0;
            transform: translateY(-50%);
            z-index: 150;
            background: #506982;
            color: #fff;
            padding: 18px 8px;
            border: 0;
            border-radius: 0 8px 8px 0;
            cursor: pointer;
            font: 700 18px 'PGM Sans', sans-serif;
            line-height: 1;
            box-shadow: 2px 0 6px rgba(0,0,0,0.2);
            height: auto;
            margin: 0;
          }
          .sidebar-mobile-tab:hover { background: #4A6CBA; }
          .sidebar-mobile-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 199;
            border: 0;
            padding: 0;
            cursor: pointer;
          }
          /* When the overlay is open, hide the tab — they're redundant. */
          #sidebar.sidebar--mobile-open ~ .sidebar-mobile-tab {
            display: none;
          }
        }
        @media (min-width: 992px) {
          .sidebar-mobile-tab,
          .sidebar-mobile-backdrop { display: none !important; }
        }
      `}</style>

      {mobileOpen && (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Close sidebar"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        id="sidebar"
        className={mobileOpen ? "sidebar--mobile-open" : undefined}
      >
        <article className="postcard--left">
          <div className="postcard__time" style={{ justifyContent: "center" }}>
            <div className="postcard__time__link--unlink">
              <Link to="/h/" onClick={() => setMobileOpen(false)}>
                {!siteData?.site_name||"Patrick Glendon McCullough"}
              </Link>
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

      {!manualSiteData && user?.role === "administrator"
        ?<>
          <NotificationsBadge />
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

      {/* Mobile-only left-edge tab to slide the sidebar in. Sibling AFTER
          the sidebar so the `~` selector in the <style> block can hide it
          when the sidebar is open. */}
      <button
        type="button"
        className="sidebar-mobile-tab"
        aria-label="Open sidebar"
        onClick={() => setMobileOpen(true)}
      >
        ›
      </button>
    </>
  )
}