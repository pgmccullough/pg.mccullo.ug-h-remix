/**
 * /h/now — a "now" page in the Derek Sivers tradition.
 *
 * A snapshot of what I'm currently up to. Updated occasionally, not
 * a feed. Content is inline in this file — same pattern as /h/about
 * — so an update is just an edit + push, no admin UI or DB write.
 *
 * The /now page movement lives at https://nownownow.com — the
 * directory picks up sites that publish this file at exactly
 * /now (or on my site, /h/now). Reciprocal linking is common.
 *
 * When you refresh this page, remember to bump NOW_UPDATED_AT so
 * the footer's "last updated" line stays honest.
 */

import type { MetaFunction } from "react-router";
import { buildMeta, SEO_CONST } from "~/utils/seo";

// Update this every time you meaningfully change the content below.
// The footer line uses it to signal to readers whether they're
// looking at a fresh snapshot or a stale one.
const NOW_UPDATED_AT = "July 2026";

export const meta: MetaFunction = () => {
  const description =
    "What Patrick is up to right now — current projects, current reading, current obsessions.";
  return buildMeta({
    title: "Now",
    description,
    path: "/h/now",
    appendSiteName: true,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "Now — Patrick Glendon McCullough",
      url: `${SEO_CONST.SITE_URL}/h/now`,
      description,
      mainEntity: {
        "@type": "Person",
        name: SEO_CONST.AUTHOR_NAME,
        url: SEO_CONST.SITE_URL,
      },
    },
  });
};

export default function Now() {
  return (
    <>
      <style>{`
        .now {
          padding: 16px;
          font-family: 'PGM Sans', sans-serif;
          color: #333;
          max-width: 620px;
        }
        .now h1 { font-size: 24px; color: #506982; margin: 0 0 4px; }
        .now__updated {
          font-size: 12px;
          color: #888;
          margin-bottom: 20px;
        }
        .now h2 {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #506982;
          margin: 24px 0 8px;
        }
        .now p { line-height: 1.6; margin: 0 0 12px; font-size: 15px; }
        .now ul { padding-left: 20px; margin: 0 0 12px; line-height: 1.6; }
        .now li { margin-bottom: 6px; }
        .now a, .now a:visited { color: #4A6CBA; text-decoration: none; }
        .now a:hover { text-decoration: underline; }
        .now__footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid #e6e6e6;
          font-size: 12px;
          color: #888;
        }
        [data-theme="dark"] .now { color: #e5e7eb; }
        [data-theme="dark"] .now h1,
        [data-theme="dark"] .now h2 { color: #a1b5c9; }
        [data-theme="dark"] .now__updated,
        [data-theme="dark"] .now__footer { color: #94a3b8; }
        [data-theme="dark"] .now__footer { border-top-color: #2a3543; }
      `}</style>
      <section className="now">
        <h1>Now</h1>
        <div className="now__updated">Updated {NOW_UPDATED_AT}</div>

        <p>
          This page is a snapshot of what I'm up to at the moment.
          It's a <a href="https://nownownow.com/about" rel="noopener">
          /now page</a> — a small IndieWeb tradition of telling
          people what you're doing <em>right now</em> instead of
          only what you did in the past.
        </p>

        <h2>Working on</h2>
        <ul>
          <li>
            This site. Tinkering with federation, tags, embeddings,
            IndieWeb bits, and any other rabbit hole that looks
            promising.
          </li>
          <li>
            <em>(Add your other current projects here.)</em>
          </li>
        </ul>

        <h2>Reading</h2>
        <ul>
          <li><em>(A book you're currently in the middle of.)</em></li>
        </ul>

        <h2>Listening to</h2>
        <ul>
          <li><em>(An album, artist, podcast, or radio show you keep coming back to.)</em></li>
        </ul>

        <h2>Where</h2>
        <p>
          St. Mark's Place, New York City.
        </p>

        <div className="now__footer">
          Inspired by the <a href="https://nownownow.com" rel="noopener">
          /now page movement</a> — see what everyone else is up to
          right now.
        </div>
      </section>
    </>
  );
}
