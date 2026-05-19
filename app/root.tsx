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
export const meta: MetaFunction = () => [
  { charSet: "utf-8" },
  { title: "Patrick Glendon McCullough" },
  { name: "viewport", content: "width=device-width,initial-scale=1" },
];

// GA tracking ID is a public value (the "measurement ID" shows up in any
// outbound network request from analytics-enabled pages anyway), so we
// bake it in at build time from VITE_GA_TRACKING_ID rather than round-
// tripping through loader data. Falsy in dev / when unset → no GA loads.
const GA_TRACKING_ID: string = import.meta.env.VITE_GA_TRACKING_ID ?? "";

export const loader = async (_args: LoaderFunctionArgs) => {
  return { gaTrackingId: GA_TRACKING_ID };
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
      </head>
      <body>
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
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
