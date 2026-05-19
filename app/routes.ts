import {
  type RouteConfig,
  route,
  index,
  layout,
  prefix,
} from "@react-router/dev/routes";

// This config preserves the route structure that the Remix v1 app had under
// app/routes/, declared explicitly for React Router v7.
//
// Tree:
//   /                          -> redirects to /h
//   /h                         -> layout (Header + Sidebar + <Outlet />)
//     index                    -> the feed
//     login                    -> sign-in modal
//     post/:postID             -> permalink for a single post
//     writing/we-die-in-every-war
//     *                        -> 404 (h/$notFound)
//
//   /api                       -> resource routes (no UI)
//     ... a lot of them, mirroring the old folder layout.

export default [
  // Root redirect: "/" -> "/h"
  index("routes/index.tsx"),

  // The /h layout and its children
  route("h", "routes/h.tsx", [
    index("routes/h/index.tsx"),
    route("login", "routes/h/login.tsx"),
    route("post/:postID", "routes/h/post/$postID.tsx"),
    route("writing/we-die-in-every-war", "routes/h/writing/we-die-in-every-war.tsx"),
    // 404 catchall for any /h/* path that doesn't match above
    route("*", "routes/h/$notFound.tsx"),
  ]),

  // All /api/* resource routes (no UI). Grouped by domain for readability.
  ...prefix("api", [
    route("analytics", "routes/api/analytics/index.tsx"),

    route("calendar", "routes/api/calendar/index.tsx"),
    route("calendar/create", "routes/api/calendar/create/index.tsx"),
    route("calendar/delete", "routes/api/calendar/delete/index.tsx"),

    route("comment/delete", "routes/api/comment/delete/index.ts"),
    route("comment/new", "routes/api/comment/new/index.ts"),

    route("email/delete", "routes/api/email/delete/index.ts"),
    route("email/delete/:emailId", "routes/api/email/delete/$emailId.ts"),
    route("email/fetchInbox", "routes/api/email/fetchInbox/index.ts"),
    route("email/fetchOneById", "routes/api/email/fetchOneById/index.ts"),
    route("email/fetchOutbox", "routes/api/email/fetchOutbox/index.ts"),
    route("email/markRead", "routes/api/email/markRead/index.ts"),
    route("email/markRead/:emailId", "routes/api/email/markRead/$emailId.ts"),
    route("email/receive", "routes/api/email/receive/index.ts"),
    route("email/search", "routes/api/email/search/index.ts"),
    route("email/send", "routes/api/email/send/index.tsx"),

    // Splat route for the S3 media proxy. The original Remix v1 path was
    // `app/routes/api/media/$filePath/$.ts`; we expose it as
    // /api/media/:filePath/* and the loader pulls both `filePath` and `*`
    // from `params`.
    route("media/:filePath/*", "routes/api/media/$filePath/$.ts"),
    route("media/scrape", "routes/api/media/scrape/index.ts"),

    route("notes", "routes/api/notes/index.tsx"),

    route("post/create", "routes/api/post/create/index.tsx"),
    route("post/delete/:postId", "routes/api/post/delete/$postId.tsx"),
    route("post/fetch", "routes/api/post/fetch/index.ts"),
    route("post/react", "routes/api/post/react/index.ts"),
    route("post/search", "routes/api/post/search/index.ts"),
    route("post/update/:postId", "routes/api/post/update/$postId.tsx"),

    route("rentalExt", "routes/api/rentalExt/index.tsx"),
    route("rentalExt/fetch", "routes/api/rentalExt/fetch/index.tsx"),

    route("scraper", "routes/api/scraper/index.tsx"),
    route("scraper/delete", "routes/api/scraper/delete/index.tsx"),

    route("siteData/bio", "routes/api/siteData/bio/index.ts"),
    route("siteData/profileImage", "routes/api/siteData/profileImage/index.tsx"),
    route("siteData/storyImage", "routes/api/siteData/storyImage/index.tsx"),
    route("siteData/watchword", "routes/api/siteData/watchword/index.tsx"),

    route("task", "routes/api/task/index.tsx"),

    route("upload", "routes/api/upload/index.tsx"),
    route("upload/base64", "routes/api/upload/base64/index.tsx"),

    route("user/fetch", "routes/api/user/fetch/index.tsx"),
    route("user/login", "routes/api/user/login/index.tsx"),
    route("user/register", "routes/api/user/register/index.tsx"),
  ]),
] satisfies RouteConfig;
