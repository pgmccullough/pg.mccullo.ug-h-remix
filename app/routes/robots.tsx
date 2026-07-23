/**
 * Serves /robots.txt.
 *
 * We do this as a route rather than a static file so the sitemap URL
 * can reference the site's own origin (works in any environment /
 * preview deploy without hardcoding a specific host).
 */

import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = new URL(request.url).origin;
  const body = [
    "User-agent: *",
    "Allow: /",
    // API + admin-only surfaces shouldn't be indexed. Federation
    // machine endpoints are also excluded — bots don't need to
    // discover them via crawl.
    "Disallow: /api/",
    "Disallow: /h/drafts",
    "Disallow: /h/notifications",
    "Disallow: /h/visitor/",
    "Disallow: /h/login",
    "Disallow: /users/",
    "Disallow: /inbox",
    "Disallow: /.well-known/",
    "Disallow: /nodeinfo/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
