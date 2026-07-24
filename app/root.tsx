import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
} from "react-router";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  MetaFunction,
} from "react-router";
import { useEffect } from "react";

import * as gtag from "~/utils/gtags.client";
import styles from "~/styles/App.css?url";
import { ThemeToggle } from "~/components/ThemeToggle/ThemeToggle";
import { WebVitals } from "~/components/WebVitals/WebVitals";

/**
 * Inline theme-resolution script — runs before React hydrates, so
 * dark-mode users don't see a white flash on first paint. Reads
 * localStorage first (explicit user choice), falls back to the OS
 * prefers-color-scheme. Writes the result to <html data-theme="...">;
 * the ThemeToggle component reads that back to sync its icon state.
 *
 * Injecting via dangerouslySetInnerHTML in <head> guarantees it fires
 * synchronously before <body> renders.
 */
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) {}
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* if anything explodes, we fall back to light — safest */ }
})();
`;

export const links: LinksFunction = () => {
  return process.env.NODE_ENV === "development"
    ? [
        { rel: "stylesheet", href: styles },
        { rel: "icon", href: "/pgm-icon-dev.svg", type: "image/svg+xml" },
      ]
    : [
        { rel: "stylesheet", href: styles },
        { rel: "icon", href: "/pgm-icon.svg", type: "image/svg+xml" },
        { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/manifest.webmanifest" },
      ];
};

// React Router v7 meta returns an array of descriptors instead of an object.
// Site-wide default meta. Per-route `meta` exports override title,
// description, canonical, OG, Twitter Card, and JSON-LD via
// `~/utils/seo.buildMeta()`.
export const meta: MetaFunction = () => [
  { charSet: "utf-8" },
  { title: "Patrick Glendon McCullough" },
  { name: "viewport", content: "width=device-width,initial-scale=1" },
  {
    name: "description",
    content:
      "Personal site of Patrick Glendon McCullough — writing, notes, and dispatches from St. Mark's Place.",
  },
  { name: "author", content: "Patrick Glendon McCullough" },
  { name: "color-scheme", content: "light dark" },
  { name: "theme-color", content: "#4A6CBA" },
  // Default OG (post pages override with per-post data)
  { property: "og:site_name", content: "Patrick Glendon McCullough" },
  { property: "og:type", content: "website" },
  { property: "og:title", content: "Patrick Glendon McCullough" },
  { property: "og:url", content: "https://pg.mccullo.ug/" },
  { property: "og:image", content: "https://pg.mccullo.ug/apple-touch-icon.png" },
  { name: "twitter:card", content: "summary_large_image" },

  // Feed autodiscovery — feed readers + browsers show a subscribe
  // affordance when they see these.
  { tagName: "link", rel: "alternate", type: "application/atom+xml",
    title: "Patrick Glendon McCullough (Atom)", href: "https://pg.mccullo.ug/feed.xml" },
  { tagName: "link", rel: "alternate", type: "application/feed+json",
    title: "Patrick Glendon McCullough (JSON Feed)", href: "https://pg.mccullo.ug/feed.json" },

  // rel="me" identity chain — verifies profiles for Mastodon
  // (Mastodon shows a green checkmark on links that mutually
  // rel="me" back to your profile) and contributes to Google's
  // E-E-A-T evaluation of the author.
  { tagName: "link", rel: "me", href: "https://pg.mccullo.ug/users/patrick" },
  { tagName: "link", rel: "me", href: "https://bsky.app/profile/patrick.mccullo.ug" },
  { tagName: "link", rel: "me", href: "https://beige.party/@mycotropic" },
  { tagName: "link", rel: "me", href: "https://github.com/pgmccullough" },

  // Webmention endpoint discovery — other IndieWeb sites + Bridgy
  // read this <link rel> tag to know where to send mentions.
  { tagName: "link", rel: "webmention", href: "https://pg.mccullo.ug/api/webmention" },

  // Micropub + IndieAuth discovery — lets IndieWeb clients (Quill,
  // Indigenous, iA Writer, micro.blog) find the auth + publishing
  // endpoints without configuration. `indieauth-metadata` is the
  // modern discovery mechanism (IndieAuth 2022-02-12); the individual
  // authorization_endpoint / token_endpoint links stay for older
  // clients that don't fetch the metadata document.
  {
    tagName: "link",
    rel: "indieauth-metadata",
    href: "https://pg.mccullo.ug/api/indieauth/metadata",
  },
  {
    tagName: "link",
    rel: "authorization_endpoint",
    href: "https://pg.mccullo.ug/api/indieauth/authorize",
  },
  {
    tagName: "link",
    rel: "token_endpoint",
    href: "https://pg.mccullo.ug/api/indieauth/token",
  },
  { tagName: "link", rel: "micropub", href: "https://pg.mccullo.ug/api/micropub" },

  // Site-wide WebSite JSON-LD. No SearchAction — the site's search
  // is a POST-based fetcher, not a GET URL Google can invoke; add
  // that later if we want a Sitelinks Search Box.
  {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Patrick Glendon McCullough",
      url: "https://pg.mccullo.ug/",
      description:
        "Personal site of Patrick Glendon McCullough — writing, notes, and dispatches from St. Mark's Place.",
      // Sitelinks Search Box: Google (when eligible) renders a small
      // search box beneath the homepage's SERP entry that invokes
      // this URL template directly. /h?q=... runs a Mongo text search
      // and returns the feed of matching posts.
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://pg.mccullo.ug/h?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
      author: {
        "@type": "Person",
        name: "Patrick Glendon McCullough",
        url: "https://pg.mccullo.ug/",
        sameAs: [
          "https://pg.mccullo.ug/users/patrick",
          "https://bsky.app/profile/patrick.mccullo.ug",
          "https://beige.party/@mycotropic",
          "https://github.com/pgmccullough",
        ],
      },
    },
  },
];

// GA tracking ID is a public value (the "measurement ID" shows up in any
// outbound network request from analytics-enabled pages anyway), so we
// bake it in at build time from VITE_GA_TRACKING_ID rather than round-
// tripping through loader data. Falsy in dev / when unset → no GA loads.
const GA_TRACKING_ID: string = import.meta.env.VITE_GA_TRACKING_ID ?? "";

export const loader = async (_args: LoaderFunctionArgs) => {
  // The VAPID public key is safe to expose (its whole point is being
  // shared with the client so the browser can create a push
  // subscription). The private key stays server-side.
  return {
    gaTrackingId: GA_TRACKING_ID,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  };
};

export default function App() {
  const location = useLocation();
  const { gaTrackingId } = useLoaderData<typeof loader>();

  useEffect(() => {
    if (gaTrackingId?.length) {
      gtag.pageview(location.pathname, gaTrackingId);
    }
  }, [location, gaTrackingId]);

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {/* a11y: skip-to-content link. Visually hidden until focused
            (Tab from the address bar reveals it), lets keyboard +
            screen reader users bypass the header nav on every page. */}
        <a href="#main" className="skip-link">Skip to content</a>
        {!import.meta.env.PROD || !gaTrackingId ? null : (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`}
            />
            {/* gtag() is just a dataLayer pusher; defining it before the
                external script loads is fine. We DON'T fire a `config`
                pageview here — the useEffect below handles every nav
                including the first one, so doing both would double-count
                the initial hit. */}
            <script
              async
              id="gtag-init"
              dangerouslySetInnerHTML={{
                __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaTrackingId}', { send_page_view: false });
              `,
              }}
            />
          </>
        )}
        {/* <main id="main"> is the target for the skip-link at the
            top of body. tabIndex=-1 lets keyboard focus land here
            after activating the skip link. */}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <ThemeToggle />
        {gaTrackingId ? <WebVitals gaTrackingId={gaTrackingId} /> : null}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
