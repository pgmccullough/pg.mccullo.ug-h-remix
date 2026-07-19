/**
 * ThemeToggle — floating dark/light-mode toggle that lives in the
 * bottom-right of every page.
 *
 * Storage & first-load behavior:
 *  - localStorage.theme = "dark" | "light" | undefined
 *  - undefined defers to prefers-color-scheme so a first-time visitor
 *    on a system-dark OS sees dark mode without opting in.
 *  - The `data-theme` attribute is applied to <html> synchronously by
 *    an inline script in root.tsx *before* first paint (see the head
 *    block there) — this component only handles the runtime toggle.
 *
 * Styling:
 *  - All dark overrides live in the <style> block below, scoped under
 *    [data-theme="dark"]. That keeps the theme layer isolated from the
 *    site's main App.css; we don't touch any existing rules.
 */

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("theme", theme); } catch { /* private mode etc. */ }
}

export const ThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // The root inline script already applied the correct theme; just
    // sync our React state so the button icon matches.
    setTheme(currentTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <>
      <style>{`
        /* ------------------------------------------------------------
         *  Toggle button chrome
         * ---------------------------------------------------------- */
        .theme-toggle {
          position: fixed;
          right: 16px;
          bottom: 16px;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid #979997;
          background: #fff;
          color: #506982;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(0,0,0,0.12);
          z-index: 200;
          display: flex; align-items: center; justify-content: center;
          padding: 0;
          transition: background-color 0.15s ease, transform 0.15s ease;
        }
        .theme-toggle:hover {
          background: #f3f3f3;
          transform: scale(1.05);
        }
        [data-theme="dark"] .theme-toggle {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .theme-toggle:hover { background: #232b36; }

        /* ------------------------------------------------------------
         *  Dark palette overrides — scoped entirely under
         *  [data-theme="dark"] so light mode is unaffected.
         *
         *  Palette:
         *   #0f1419  page background
         *   #1a2028  card / surface
         *   #232b36  elevated (row hover, table headers)
         *   #2a3543  borders
         *   #e5e7eb  primary text
         *   #a1b5c9  secondary text (headings, links to site content)
         *   #94a3b8  muted text (metadata, dates)
         *   #6b7280  subtle text (hostnames, placeholders)
         *   #6b8dd8  accent blue (buttons, external links)
         * ---------------------------------------------------------- */
        [data-theme="dark"] body,
        [data-theme="dark"] html { background: #0f1419; color: #e5e7eb; }
        [data-theme="dark"] .content { background: #0f1419; }

        /* Postcards ------------------------------------------------- */
        [data-theme="dark"] .postcard {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .postcard__time {
          background: #232b36;
          border-color: #2a3543;
        }
        [data-theme="dark"] .postcard__time__link,
        [data-theme="dark"] .postcard__time__link:visited { color: #a1b5c9; }
        [data-theme="dark"] .postcard__privacy,
        [data-theme="dark"] .postcard__time__onThisDay { color: #94a3b8; }
        [data-theme="dark"] .postcard__content,
        [data-theme="dark"] .postcard__content__text { color: #e5e7eb; }
        [data-theme="dark"] .postcard__content a,
        [data-theme="dark"] .postcard__content a:visited { color: #6b8dd8; }
        [data-theme="dark"] .postcard__content__media { background: #0a0d10; }
        [data-theme="dark"] .postcard--left {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .postcard__time__link--unlink { color: #a1b5c9; }
        [data-theme="dark"] .fake-p,
        [data-theme="dark"] .fake-p * { color: inherit; }

        /* Sidebar --------------------------------------------------- */
        [data-theme="dark"] .sidebar-notif,
        [data-theme="dark"] .sidebar-notif a,
        [data-theme="dark"] .sidebar-notif a:visited {
          color: #a1b5c9;
        }
        [data-theme="dark"] .sidebar-session { color: #94a3b8; }

        /* Composer -------------------------------------------------- */
        [data-theme="dark"] .upload,
        [data-theme="dark"] .upload--active {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .upload__editable {
          background: #1a2028;
          color: #e5e7eb;
          border-color: #2a3543;
        }
        [data-theme="dark"] .upload__editable[placeholder]:empty::before {
          color: #6b7280;
        }
        [data-theme="dark"] .upload__feedback,
        [data-theme="dark"] .upload__feedback__checkbox__label,
        [data-theme="dark"] .upload__feedback__privacy option {
          color: #e5e7eb;
        }
        [data-theme="dark"] .upload__feedback__privacy {
          background: #232b36;
          color: #e5e7eb;
          border-color: #2a3543;
        }
        [data-theme="dark"] .upload__file-preview__file {
          background: #232b36;
        }
        [data-theme="dark"] .upload--expanded__frame {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .upload__expand { color: #a1b5c9; }
        [data-theme="dark"] .upload__expand:hover { color: #6b8dd8; }

        /* Toolbar buttons in the editor ---------------------------- */
        [data-theme="dark"] .lexical__toolbar,
        [data-theme="dark"] .lexical__toolbar button {
          background: #232b36 !important;
          color: #a1b5c9 !important;
        }
        [data-theme="dark"] .lexical__toolbar button:hover {
          background: #2a3543 !important;
          color: #e5e7eb !important;
        }

        /* Feed toggle (Me / Friends) ------------------------------- */
        [data-theme="dark"] .feed-toggle {
          background: #1a2028;
          border-color: #2a3543;
        }
        [data-theme="dark"] .feed-toggle__tab,
        [data-theme="dark"] .feed-toggle__tab:visited { color: #a1b5c9; }
        [data-theme="dark"] .feed-toggle__tab--active,
        [data-theme="dark"] .feed-toggle__tab--active:visited {
          background: #4A6CBA;
          color: #fff;
        }

        /* Friends section chrome ----------------------------------- */
        [data-theme="dark"] .friends__section {
          background: #1a2028;
          border-color: #2a3543;
        }
        [data-theme="dark"] .friends__section-header {
          background: #232b36;
          border-color: #2a3543;
          color: #a1b5c9;
        }
        [data-theme="dark"] .friends__section-header__chev {
          background: #1a2028;
          border-color: #2a3543;
          color: #a1b5c9;
        }
        [data-theme="dark"] .friends__following-chip {
          background: #232b36;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .friends__following-chip a { color: #a1b5c9; }

        /* Friend post card add-ons --------------------------------- */
        [data-theme="dark"] .friend-author {
          background: #232b36;
          border-color: #2a3543;
          color: #94a3b8;
        }
        [data-theme="dark"] .friend-author__name { color: #a1b5c9; }
        [data-theme="dark"] .friend-author__handle,
        [data-theme="dark"] .friend-author__via { color: #6b7280; }

        [data-theme="dark"] .friend-link-card {
          background: #232b36;
          border-color: #2a3543;
        }
        [data-theme="dark"] .friend-link-card:hover { border-color: #6b8dd8; }
        [data-theme="dark"] .friend-link-card__thumb { background: #0a0d10; }
        [data-theme="dark"] .friend-link-card__title { color: #e5e7eb; }
        [data-theme="dark"] .friend-link-card__desc { color: #94a3b8; }
        [data-theme="dark"] .friend-link-card__host { color: #6b7280; }

        /* Comments (home + friends feed both use these classes) --- */
        [data-theme="dark"] .comment {
          background: transparent;
          border-color: #2a3543;
        }
        [data-theme="dark"] .comment__user-image { background: #232b36; }
        [data-theme="dark"] .comment__user-name { color: #a1b5c9; }
        [data-theme="dark"] .comment__date { color: #6b7280; }
        [data-theme="dark"] .comment__content-inner { color: #e5e7eb; }
        [data-theme="dark"] .comment__input {
          background: #232b36;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .comment-signin__btn { background: #4A6CBA; }

        /* Reactions ------------------------------------------------ */
        [data-theme="dark"] .react-button {
          background: #232b36;
          color: #a1b5c9;
          border-color: #2a3543;
        }
        [data-theme="dark"] .react-button:hover { background: #2a3543; }
        [data-theme="dark"] .emoji-vote {
          background: #232b36;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .emoji-vote--mine {
          background: #4A6CBA;
          color: #fff;
          border-color: #4A6CBA;
        }
        [data-theme="dark"] .emoji-container,
        [data-theme="dark"] .heart-react__pop {
          background: #1a2028;
          border-color: #2a3543;
        }

        /* Search --------------------------------------------------- */
        [data-theme="dark"] .search__input {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .search__input::placeholder { color: #6b7280; }

        /* Recent visitors drawer ----------------------------------- */
        [data-theme="dark"] .siteActivity {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .siteActivity__header {
          background: #232b36;
          color: #a1b5c9;
        }
        [data-theme="dark"] .siteActivity__header:hover { background: #2a3543; }
        [data-theme="dark"] .siteActivity__row { border-color: #2a3543; }
        [data-theme="dark"] .siteActivity__line1 { color: #e5e7eb; }
        [data-theme="dark"] .siteActivity__line2 { color: #94a3b8; }
        [data-theme="dark"] .siteActivity__path,
        [data-theme="dark"] .siteActivity__path:visited { color: #6b8dd8; }

        /* Loading placeholder ------------------------------------- */
        [data-theme="dark"] .feed-loading { color: #a1b5c9; }

        /* Drafts page --------------------------------------------- */
        [data-theme="dark"] .drafts { color: #e5e7eb; }
        [data-theme="dark"] .drafts h2 { color: #a1b5c9; }
        [data-theme="dark"] .drafts__row {
          background: #1a2028;
          border-color: #2a3543;
          color: #e5e7eb;
        }
        [data-theme="dark"] .drafts__row__meta { color: #94a3b8; }
        [data-theme="dark"] .drafts__row__meta strong { color: #a1b5c9; }
        [data-theme="dark"] .drafts__row__excerpt { color: #e5e7eb; }
        [data-theme="dark"] .drafts__btn--ghost {
          background: #1a2028;
          border-color: #2a3543;
        }
        [data-theme="dark"] .drafts__btn--ghost:hover { background: #232b36; }
        [data-theme="dark"] .drafts__empty { color: #6b7280; }

        /* Visitor detail page ------------------------------------- */
        [data-theme="dark"] .vd { color: #e5e7eb; }
        [data-theme="dark"] .vd h1 { color: #a1b5c9; }
        [data-theme="dark"] .vd h2 { color: #a1b5c9; }
        [data-theme="dark"] .vd__meta { color: #94a3b8; }
        [data-theme="dark"] .vd__section {
          background: #1a2028;
          border-color: #2a3543;
        }
        [data-theme="dark"] .vd__row { border-color: #232b36; }
        [data-theme="dark"] .vd__row__k { color: #6b7280; }
        [data-theme="dark"] .vd__pill {
          background: #232b36;
          color: #e5e7eb;
        }
        [data-theme="dark"] .vd__hist th {
          background: #232b36;
          color: #a1b5c9;
        }
        [data-theme="dark"] .vd__hist td { color: #e5e7eb; border-color: #232b36; }
        [data-theme="dark"] .vd__hist__ref { color: #6b7280; }
        [data-theme="dark"] .vd__back { color: #6b8dd8; }

        /* Image crop modal ---------------------------------------- */
        [data-theme="dark"] .imgCrop__modal {
          background: #1a2028;
          color: #e5e7eb;
        }
        [data-theme="dark"] .imgCrop__header {
          background: #232b36;
          color: #a1b5c9;
        }
        [data-theme="dark"] .imgCrop__footer { border-color: #2a3543; }
        [data-theme="dark"] .imgCrop__pick {
          background: #232b36;
          color: #a1b5c9;
          border-color: #2a3543;
        }
        [data-theme="dark"] .imgCrop__btn--ghost {
          background: #1a2028;
          color: #a1b5c9;
          border-color: #2a3543;
        }

        /* Sign-in modal ------------------------------------------- */
        [data-theme="dark"] .signIn__modal,
        [data-theme="dark"] .signIn__inner {
          background: #1a2028 !important;
          color: #e5e7eb !important;
        }
        [data-theme="dark"] .signIn__title { color: #a1b5c9 !important; }
        [data-theme="dark"] .signIn__oauth-btn { border-color: #2a3543 !important; }

        /* Notifications page + friends errors --------------------- */
        [data-theme="dark"] .friends__error { color: #f87171; }

        /* ------------------------------------------------------------
         *  Admin widgets — Calendar / Notes / WishList / etc.
         * ---------------------------------------------------------- */

        /* Calendar day-of-week strip: light gray band in light mode;
           in dark mode make it a muted elevated surface. */
        [data-theme="dark"] .calendar__days--day {
          background: #232b36 !important;
          border-color: #2a3543 !important;
          color: #a1b5c9 !important;
        }
        /* Date cells: were dark #ccc borders on white bg; flip to
           subtle borders on the card surface with legible numbers. */
        [data-theme="dark"] .calendar__dates__block,
        [data-theme="dark"] .calendar__dates__block--current {
          border-color: #2a3543 !important;
          color: #e5e7eb !important;
        }
        [data-theme="dark"] .calendar__dates__block:hover,
        [data-theme="dark"] .calendar__dates__block--current {
          background: #232b36 !important;
        }
        [data-theme="dark"] .calendar__header,
        [data-theme="dark"] .calendar__header--current { color: #a1b5c9; }
        [data-theme="dark"] .calendar__appointments__ind {
          border-color: #2a3543 !important;
        }
        [data-theme="dark"] .calendar__appointments__ind--event {
          border-left-color: #2a3543 !important;
          color: #e5e7eb;
        }
        [data-theme="dark"] .calendar__sync {
          background: #232b36 !important;
          color: #e5e7eb !important;
          border-color: #2a3543 !important;
        }

        /* Notes: tab strip + textarea. Existing rules make active
           tabs white and inactive tabs #eee (grey) — flip so active
           reads as elevated surface and inactive as muted. */
        [data-theme="dark"] .note { border-color: #2a3543; color: #e5e7eb; }
        [data-theme="dark"] .note__title {
          background: #232b36 !important;
          border-color: #2a3543 !important;
          color: #94a3b8 !important;
        }
        [data-theme="dark"] .note__title:hover { background: #2a3543 !important; }
        [data-theme="dark"] .note__title--active,
        [data-theme="dark"] .note__title--active:hover {
          background: #1a2028 !important;
          color: #e5e7eb !important;
          border-color: #2a3543 !important;
        }
        [data-theme="dark"] .note__input,
        [data-theme="dark"] .note__textarea {
          background: #232b36 !important;
          border-color: #2a3543 !important;
          color: #e5e7eb !important;
        }
        [data-theme="dark"] .note__input::placeholder,
        [data-theme="dark"] .note__textarea::placeholder {
          color: #6b7280 !important;
        }
        [data-theme="dark"] .note__progress {
          background: #232b36 !important;
          border-color: #2a3543 !important;
        }

        /* React button pill lives on the post meta row — currently
           its light-mode style is a small white pill that reads much
           too bright in dark mode. */
        [data-theme="dark"] .react-button {
          background: #232b36 !important;
          color: #a1b5c9 !important;
          border-color: #2a3543 !important;
        }
        [data-theme="dark"] .react-button:hover {
          background: #2a3543 !important;
        }

        /* Postcard time bar's "Public" pill (privacy label) — appears
           as a dark blue button element in light mode; keep the blue
           accent but make it read cleanly on the dark timestamp bar. */
        [data-theme="dark"] .postcard__privacy {
          background: transparent !important;
          color: #a1b5c9 !important;
          border-color: #2a3543 !important;
        }

        /* Story image button and other WishList / RentalProperties
           admin cards inherit .postcard--left which is already
           themed, but their inputs / buttons may need help. */
        [data-theme="dark"] input[type="text"]:not(.search__input):not(.comment__input),
        [data-theme="dark"] input[type="email"],
        [data-theme="dark"] input[type="password"],
        [data-theme="dark"] input[type="url"],
        [data-theme="dark"] input[type="number"],
        [data-theme="dark"] input[type="datetime-local"],
        [data-theme="dark"] input[type="date"],
        [data-theme="dark"] textarea:not(.note__textarea),
        [data-theme="dark"] select:not(.upload__feedback__privacy) {
          background: #232b36;
          color: #e5e7eb;
          border-color: #2a3543;
        }
        [data-theme="dark"] input::placeholder,
        [data-theme="dark"] textarea::placeholder { color: #6b7280; }

        /* Post content: bump the body copy up to full primary text
           color so long-form reads at full contrast (some inline
           spans were inheriting weaker greys). */
        [data-theme="dark"] .postcard__content__text,
        [data-theme="dark"] .postcard__content__text * {
          color: #e5e7eb;
        }
        [data-theme="dark"] .postcard__content__text a,
        [data-theme="dark"] .postcard__content__text a:visited {
          color: #6b8dd8;
        }

        /* ------------------------------------------------------------
         *  Force override any surface that App.css explicitly sets
         *  to white. Otherwise nested opaque backgrounds show through
         *  the themed parent card as white rectangles.
         * ---------------------------------------------------------- */
        [data-theme="dark"] .postcard__content {
          background: #1a2028 !important;
          border-color: #2a3543 !important;
        }
        [data-theme="dark"] .postcard__content__modal {
          background: #1a2028 !important;
          border-color: #2a3543 !important;
          color: #e5e7eb;
        }
        [data-theme="dark"] .postcard__content__modal::before {
          border-bottom-color: #2a3543 !important;
        }
        [data-theme="dark"] .postcard__content__modal::after {
          border-bottom-color: #1a2028 !important;
        }
        [data-theme="dark"] .postcard__content__meta { background: #232b36; }
        [data-theme="dark"] .postcard__time__option {
          background: #232b36 !important;
          color: #a1b5c9 !important;
          border-color: #2a3543 !important;
        }
        [data-theme="dark"] .postcard__time__option:hover { background: #2a3543 !important; }
        [data-theme="dark"] .postcard__content-edit,
        [data-theme="dark"] .postcard__content-edit--active {
          background: rgba(26, 32, 40, 0.9) !important;
        }
        [data-theme="dark"] .upload {
          background: #1a2028 !important;
          border-color: #2a3543 !important;
        }
        [data-theme="dark"] .hidden-app-list {
          background: #1a2028 !important;
          border-color: #2a3543 !important;
          color: #e5e7eb;
        }
        [data-theme="dark"] .sidebar-button,
        [data-theme="dark"] .register__card__button {
          background: #232b36 !important;
          color: #e5e7eb !important;
          border-color: #2a3543 !important;
        }
        [data-theme="dark"] .sidebar-button:hover { background: #2a3543 !important; }
        [data-theme="dark"] .writingMain {
          background: #0f1419 !important;
          color: #e5e7eb;
        }
        [data-theme="dark"] .search {
          background: #1a2028 !important;
        }
        [data-theme="dark"] .snippet {
          background: #1a2028 !important;
          border-color: #2a3543 !important;
          color: #e5e7eb;
        }
        [data-theme="dark"] .email-attachments__remove {
          background: #232b36 !important;
        }
        [data-theme="dark"] .wish-list__delete { background: #232b36 !important; }
        [data-theme="dark"] .comment__content-inner { background: transparent !important; }
        [data-theme="dark"] .comment__input {
          background: #232b36 !important;
          color: #e5e7eb !important;
        }
      `}</style>

      <button
        type="button"
        className="theme-toggle"
        onClick={toggle}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? "☀︎" : "☾"}
      </button>
    </>
  );
};
