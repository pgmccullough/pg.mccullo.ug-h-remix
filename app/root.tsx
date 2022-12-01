import { LoaderFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration
} from "@remix-run/react";

import { clientPromise } from "./lib/mongodb";
const ObjectId = require('mongodb').ObjectId;

import { Posts, SiteData } from './common/types';
import { Header } from "./components/Header/Header";
import { Sidebar } from './components/Sidebar/Sidebar';

import styles from "~/styles/App.css";

export const links = () => {
  return [{ rel: "stylesheet", href: styles }];
}

export const meta: MetaFunction = () => ({
  charset: "utf-8",
  title: "Patrick Glendon McCullough",
  viewport: "width=device-width,initial-scale=1",
});

export const loader: LoaderFunction = async () => {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const siteData = await db.collection("myUsers").find({ _id : ObjectId('62d4a25bbe8297b0fb98a06a') }).toArray();
  return {siteData:{...siteData[0]}};
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
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
