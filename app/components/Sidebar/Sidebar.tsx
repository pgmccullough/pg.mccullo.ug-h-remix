import { Link } from 'react-router';
import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from 'react';
import type { User, SiteData } from '../../common/types';
import { Calendar, Email, Notes, RentalProperties, TaskTracker, Webcam, WishList } from '~/adminApps';
// Temporarily disabled while investigating M0 Mongo contention —
// the widget fetches /api/bible/state on every sidebar mount,
// which hits Mongo on every /h/* pageview site-wide, and the
// 4.5MB KJV JSON is bundled into the function (memory pressure
// on cold start). Restore when the Mongo tier is upgraded.
// import { BibleWidget } from '~/components/BibleWidget/BibleWidget';
import { TextEditor } from '../TextEditor/TextEditor';
import { SignInModal } from '../SignInModal/SignInModal';
import { BlueskyIcon } from '~/assets/svgs/BlueskyIcon';
import { MastodonIcon } from '~/assets/svgs/MastodonIcon';
import { FediverseIcon } from '~/assets/svgs/FediverseIcon';
import { GithubIcon } from '~/assets/svgs/GithubIcon';
import { InstagramIcon } from '~/assets/svgs/InstagramIcon';

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
          hidden offscreen by default. A small tab on the LEFT edge of the
          viewport opens it; the tab itself slides to the RIGHT edge as
          the sidebar expands, where it becomes the close button. The
          sidebar takes the full viewport width minus the 40px tab.
          Above 992px, none of this applies. */}
      <style>{`
        @media (max-width: 991px) {
          #sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: calc(100vw - 28px);
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
            z-index: 201;
            width: 28px;
            height: 48px;
            background: #4A6CBA;
            color: #fff;
            border: 0;
            border-radius: 0 6px 6px 0;
            cursor: pointer;
            box-shadow: 2px 0 6px rgba(0,0,0,0.2);
            padding: 0;
            margin: 0;
            /* Center the chevron rather than leaning on font-baseline. */
            display: flex;
            align-items: center;
            justify-content: center;
            font: 700 18px 'PGM Sans', sans-serif;
            line-height: 1;
            /* The default transform also handles vertical centering. */
            transform: translateY(-50%);
            transition: left 0.25s ease, transform 0.25s ease;
          }
          /* Slightly darker on hover for visible affordance now that
             the base color matches the site accent blue. */
          .sidebar-mobile-tab:hover { background: #3a5aa0; }
          /* When the sidebar is open: slide tab to the right edge of the
             viewport. Don't flip — the flat side stays against the
             sidebar's right edge (or the screen edge when closed), and
             the rounded corners always face outward. Only the chevron
             glyph changes (toggled in JSX). */
          #sidebar.sidebar--mobile-open ~ .sidebar-mobile-tab {
            left: calc(100vw - 28px);
            box-shadow: -2px 0 6px rgba(0,0,0,0.2);
          }
        }
        @media (min-width: 992px) {
          .sidebar-mobile-tab { display: none !important; }
        }
      `}</style>
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
          {/* Static footer — lives inside the postcard shell but
              outside the editable bio area, so it can't be
              accidentally clobbered by an admin edit. Mirrors the
              "Elsewhere" chips + navigation from /h/about so any
              page in the app is one click from a profile link or
              a nav landing. */}
          <nav className="sidebar-about-footer" aria-label="About links">
            <div className="sidebar-about-footer__nav">
              <Link to="/h/about" onClick={() => setMobileOpen(false)}>About</Link>
              <span aria-hidden="true">·</span>
              <Link to="/h/now" onClick={() => setMobileOpen(false)}>Now</Link>
            </div>
            <div className="sidebar-about-footer__chips">
              <a
                className="sidebar-about-footer__chip"
                rel="me noopener noreferrer"
                target="_blank"
                href="https://bsky.app/profile/mccullo.ug"
                title="Bluesky"
                aria-label="Bluesky"
              ><BlueskyIcon size={18} /></a>
              <a
                className="sidebar-about-footer__chip"
                rel="me noopener noreferrer"
                target="_blank"
                href="https://mastodon.social/@patrick@pg.mccullo.ug/"
                title="Mastodon"
                aria-label="Mastodon"
              ><MastodonIcon size={18} /></a>
              <a
                className="sidebar-about-footer__chip"
                rel="me noopener noreferrer"
                target="_blank"
                href="https://pg.mccullo.ug/users/patrick"
                title="Fediverse"
                aria-label="Fediverse"
              ><FediverseIcon size={18} /></a>
              <a
                className="sidebar-about-footer__chip sidebar-about-footer__chip--github"
                rel="me noopener noreferrer"
                target="_blank"
                href="https://github.com/pgmccullough"
                title="GitHub"
                aria-label="GitHub"
              ><GithubIcon size={18} /></a>
              <a
                className="sidebar-about-footer__chip"
                rel="me noopener noreferrer"
                target="_blank"
                href="https://www.instagram.com/pgmccullough/"
                title="Instagram"
                aria-label="Instagram"
              ><InstagramIcon size={18} /></a>
            </div>
          </nav>
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
        /* Sidebar About postcard footer — nav + social chips
           lives outside the editable bio area so admin edits
           can't accidentally wipe it. Matches the About page
           chip visual but scaled down for the narrow sidebar. */
        .sidebar-about-footer {
          padding: 8px 10px 10px;
          border-top: 1px solid #f0f0f0;
          text-align: center;
        }
        .sidebar-about-footer__nav {
          font: 600 12px 'PGM Sans', sans-serif;
          margin-bottom: 8px;
          color: #506982;
        }
        .sidebar-about-footer__nav a,
        .sidebar-about-footer__nav a:visited {
          color: #4A6CBA;
          text-decoration: none;
        }
        .sidebar-about-footer__nav a:hover { text-decoration: underline; }
        .sidebar-about-footer__nav span {
          margin: 0 6px;
          color: #999;
        }
        .sidebar-about-footer__chips {
          display: flex;
          justify-content: center;
          gap: 4px;
          flex-wrap: wrap;
        }
        .sidebar-about-footer__chip,
        .sidebar-about-footer__chip:visited {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: #eef2f7;
          font-size: 14px;
          text-decoration: none;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .sidebar-about-footer__chip:hover {
          background: #dde5ef;
          transform: translateY(-1px);
        }
        .sidebar-about-footer__chip svg { display: block; }
        /* GitHub mark uses currentColor so it inherits chip text color;
           default to near-black in light mode, invert in dark. */
        .sidebar-about-footer__chip--github { color: #1B1F23; }
        [data-theme="dark"] .sidebar-about-footer__chip--github { color: #f0f6fc; }
        [data-theme="dark"] .sidebar-about-footer {
          border-top-color: #232b36;
        }
        [data-theme="dark"] .sidebar-about-footer__nav {
          color: #a1b5c9;
        }
        [data-theme="dark"] .sidebar-about-footer__nav span {
          color: #4a5568;
        }
        [data-theme="dark"] .sidebar-about-footer__chip {
          background: #2a2a2a;
        }
        [data-theme="dark"] .sidebar-about-footer__chip:hover {
          background: #3a3a3a;
        }
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

      {/* Admin-only widgets that sit above the Bible reader. */}
      {!manualSiteData && user?.role === "administrator"
        ?<>
          <NotificationsBadge />
          <article className="postcard--left sidebar-notif">
            <Link to="/h/drafts">Drafts</Link>
          </article>
          {/* <Email /> */}
          <Calendar />
        </>
        :""}

      {/* Bible widget disabled — see import comment above. */}
      {/* {!manualSiteData ? <BibleWidget /> : ""} */}

      {!manualSiteData && user?.role === "administrator"
        ?<>
          <Notes />
          {/* <TaskTracker /> */}
          <WishList />
          {/* <RentalProperties /> */}
          {/* <Webcam /> */}
          {/* SiteActivity is rendered in h.tsx so it lives outside the
              sidebar's transformed-on-mobile container. position:fixed
              elements need the viewport as their containing block. */}
        </>
        :""}
      </div>

      {/* Mobile-only tab. Sibling AFTER the sidebar so the `~` selector
          in the <style> block can move it to the right edge when the
          sidebar is open. Same button does both jobs (open and close)
          since it's always at the visible edge of the panel. */}
      <button
        type="button"
        className="sidebar-mobile-tab"
        aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
        onClick={() => setMobileOpen((o) => !o)}
      >
        {mobileOpen ? "‹" : "›"}
      </button>
    </>
  )
}