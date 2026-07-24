/**
 * /now → /h/now permanent redirect.
 *
 * The /now-page convention (nownownow.com) prefers a URL at exactly
 * /now, but this site nests everything under /h. The real page
 * lives at /h/now; this route just catches the bare /now and
 * bounces to the canonical URL with 301 so search engines
 * consolidate signals on the /h/now version.
 */

import { redirect } from "react-router";

export const loader = () => redirect("/h/now", 301);
