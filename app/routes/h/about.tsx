/**
 * /h/about — canonical bio + identity page.
 *
 * Foundational for author-level E-E-A-T signals: gives Google (and
 * anyone else evaluating the site) a single Person entity to attach
 * writing to, with sameAs pointers to Bluesky/Mastodon/GitHub for
 * cross-verification.
 *
 * Content is intentionally editable inline in this file — Patrick
 * can tweak the paragraphs without going through an admin UI.
 */

import type { MetaFunction } from "react-router";
import { buildMeta, SEO_CONST } from "~/utils/seo";

export const meta: MetaFunction = () => {
  const description =
    "Patrick Glendon McCullough — writer and tinkerer, dispatches from St. Mark's Place.";
  return buildMeta({
    title: "About",
    description,
    path: "/h/about",
    appendSiteName: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: {
        "@type": "Person",
        name: SEO_CONST.AUTHOR_NAME,
        alternateName: "PGMcCullough",
        url: SEO_CONST.SITE_URL,
        image: `${SEO_CONST.SITE_URL}/apple-touch-icon.png`,
        description,
        // sameAs powers Google's Knowledge Graph aggregation across
        // the profiles that mutually verify back via rel="me".
        sameAs: [
          "https://pg.mccullo.ug/users/patrick",
          "https://bsky.app/profile/patrick.mccullo.ug",
          "https://beige.party/@mycotropic",
          "https://github.com/pgmccullough",
        ],
      },
    },
  });
};

export default function About() {
  return (
    <>
      <style>{`
        .about {
          padding: 16px;
          font-family: 'PGM Sans', sans-serif;
          color: #333;
        }
        .about h1 { font-size: 24px; color: #506982; margin: 0 0 12px; }
        .about h2 {
          font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;
          color: #506982; margin: 24px 0 8px;
        }
        .about p { line-height: 1.6; margin: 0 0 12px; font-size: 15px; }
        .about a, .about a:visited { color: #4A6CBA; text-decoration: none; }
        .about a:hover { text-decoration: underline; }
        .about__profiles {
          list-style: none; padding: 0; margin: 0;
          display: flex; flex-wrap: wrap; gap: 10px;
        }
        .about__profile {
          display: inline-flex; gap: 6px; align-items: center;
          padding: 6px 12px;
          background: #fff; border: 1px solid #979997;
          border-radius: 999px; font-size: 13px;
        }
        [data-theme="dark"] .about { color: #e5e7eb; }
        [data-theme="dark"] .about h1 { color: #a1b5c9; }
        [data-theme="dark"] .about h2 { color: #a1b5c9; }
        [data-theme="dark"] .about__profile {
          background: #232b36; border-color: #2a3543; color: #e5e7eb;
        }
      `}</style>
      {/* Wrap the page content in the site's standard postcard shell so
          it visually reads as part of the feed — gray header bar with
          the page name, white content area with a border. Matches how
          post permalinks look. */}
      <article className="postcard">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink" style={{ flex: 1 }}>
            About
          </div>
        </div>
        <div className="postcard__content">
      <section className="about">
        <h1>Patrick Glendon McCullough</h1>

        <p>
          Erstwhile Okie on St. Mark's Place. Writer, tinkerer, and
          occasional dispatcher of dreams, drafts, and running notes.
        </p>

        <p>
          This site is where I keep the pieces that don't quite fit
          anywhere else — a personal feed, a scratchpad for essays,
          and running notes on the projects I'm tinkering with.
        </p>

        <h2>Elsewhere</h2>
        <ul className="about__profiles">
          <li className="about__profile">
            <a rel="me" href="https://bsky.app/profile/patrick.mccullo.ug">
              🦋 Bluesky
            </a>
          </li>
          <li className="about__profile">
            <a rel="me" href="https://beige.party/@mycotropic">
              🐘 Mastodon
            </a>
          </li>
          <li className="about__profile">
            <a rel="me" href="https://pg.mccullo.ug/users/patrick">
              🌐 Fediverse
            </a>
          </li>
          <li className="about__profile">
            <a rel="me" href="https://github.com/pgmccullough">
              💻 GitHub
            </a>
          </li>
        </ul>

        <h2>Site</h2>
        <p>
          Read <a href="/h">the feed</a> or subscribe via{" "}
          <a href="/feed.xml">Atom</a> or{" "}
          <a href="/feed.json">JSON Feed</a>.
        </p>
      </section>
        </div>
      </article>
    </>
  );
}
