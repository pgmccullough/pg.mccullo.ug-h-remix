import type { LinksFunction, LoaderArgs } from "@remix-run/node";
import { LoaderFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch,
  useLoaderData,
  useLocation
} from "@remix-run/react";
import { useEffect } from "react";
import * as gtag from "~/utils/gtags.client";

import styles from "~/styles/App.css";

export const links: LinksFunction = () => {
  return process.env.NODE_ENV === "development"
    ?[
      { rel: "stylesheet", href: styles },
      { rel: 'icon', href: '/pgm-icon-dev.svg', type: 'image/svg+xml' },
    ]
    :[
      { rel: "stylesheet", href: styles },
      { rel: 'icon', href: '/pgm-icon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' }
    ]
}

export const meta: MetaFunction = () => ({
  charset: "utf-8",
  title: "Patrick Glendon McCullough",
  viewport: "width=device-width,initial-scale=1",
});

export const loader: LoaderFunction = async ({ request }: LoaderArgs) => {
  return {gaTrackingId: "G-48Y17ZTWTK"};
}

export function CatchBoundary() {

}

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
        <LiveReload />
      </body>
    </html>
  );
}
