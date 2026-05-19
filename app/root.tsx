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

export const loader = async (_args: LoaderFunctionArgs) => {
  return { gaTrackingId: "G-48Y17ZTWTK" };
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
        {process.env.NODE_ENV === "development" || !gaTrackingId ? null : (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaTrackingId}`}
            />
            <script
              async
              id="gtag-init"
              dangerouslySetInnerHTML={{
                __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaTrackingId}', {
                  page_path: window.location.pathname,
                });
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
