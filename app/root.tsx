import { LoaderFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation
} from "@remix-run/react";
import { useEffect } from "react";
import * as gtag from "~/utils/gtags.client";
import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

import { Posts, SiteData } from '~/common/types';
import { Header } from "~/components/Header/Header";
import { Sidebar } from '~/components/Sidebar/Sidebar';

import styles from "~/styles/App.css";

export const links = () => {
  return [{ rel: "stylesheet", href: styles }];
}

export const meta: MetaFunction = () => ({
  charset: "utf-8",
  title: "Patrick Glendon McCullough",
  viewport: "width=device-width,initial-scale=1",
});

export const loader: LoaderFunction = async ({ request }) => {
  const user = await getUser(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({user_name:"PGMcCullough"}).toArray();
  const emails = await db.collection('myEmails').find({MessageStream:"inbound"}).sort({created:-1}).limit(25).toArray();
  return {emails, gaTrackingId: "G-48Y17ZTWTK", user, siteData:{...siteData[0]}};
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
        <Header />
        <div className="content">
          <Sidebar />
          <div className="right-column">
            <Outlet />
            <ScrollRestoration />
            <Scripts />
            <LiveReload />
          </div>
        </div>
      </body>
    </html>
  );
}
