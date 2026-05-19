import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import { redirect } from "react-router";
import { federation } from "~/utils/federation.server";

// Splat handler for everything under /users/*:
//   /users/:identifier           (Actor document)
//   /users/:identifier/inbox     (POST — Phase A2)
//   /users/:identifier/outbox    (Phase A3)
//   /users/:identifier/followers
//   /users/:identifier/following
//
// Fedify dispatches based on the URL when we hand it the request.
//
// For browser visits to a bare actor URL (Accept: text/html), we redirect
// to the human-facing /h page instead of returning JSON-LD.

function wantsActivityPub(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return (
    accept.includes("application/activity+json") ||
    accept.includes("application/ld+json") ||
    accept.includes("application/jrd+json")
  );
}

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Bare actor URL — browser visitors get the human site instead of JSON-LD.
  const isBareActor = /^\/users\/[^/]+\/?$/.test(url.pathname);
  if (isBareActor && !wantsActivityPub(request)) {
    return redirect("/h");
  }

  // Post URL — browser visitors get the post's permalink page.
  const postMatch = url.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)\/?$/);
  if (postMatch && !wantsActivityPub(request)) {
    return redirect(`/h/post/${postMatch[1]}`);
  }

  return federation.fetch(request, { contextData: undefined });
};

export const action = ({ request }: ActionFunctionArgs) =>
  federation.fetch(request, { contextData: undefined });
