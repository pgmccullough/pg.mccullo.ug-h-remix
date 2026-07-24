import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  callbackUrl,
  newStateCookie,
  badRequest,
  sanitizeReturnTo,
} from "~/utils/oauth.server";
import { clientPromise } from "~/lib/mongodb";

/**
 * Initiate Mastodon sign-in.
 *
 * Takes an `instance` form field — accepts:
 *   - bare hostname:        "mastodon.social"
 *   - URL:                  "https://mastodon.social"
 *   - full handle:          "@user@mastodon.social"
 *
 * The fully-qualified handle case strips the user portion. We normalize
 * to a bare hostname and proceed.
 *
 * If we've never registered an OAuth app on this instance before, we POST
 * to its /api/v1/apps to do so dynamically — that's the standard pattern
 * every Mastodon client uses. The credentials we receive are cached so
 * subsequent sign-ins from that instance reuse the same app.
 */

interface CachedApp {
  instance: string;
  client_id: string;
  client_secret: string;
  registered_at: number;
}

async function appsCol() {
  const client = await clientPromise;
  return client
    .db("user_posts")
    .collection<CachedApp>("oauth_mastodon_apps");
}

function normalizeInstance(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  // Strip @user@ prefix if present.
  const at = s.indexOf("@", 1);
  if (s.startsWith("@") && at > 0) s = s.slice(at + 1);
  // Strip scheme.
  s = s.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  // Must look like a hostname.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return null;
  return s.toLowerCase();
}

async function ensureApp(
  instance: string,
  redirectUri: string
): Promise<CachedApp> {
  const col = await appsCol();
  const existing = await col.findOne({ instance });
  if (existing) return existing;

  // Register a new app on this instance.
  const body = new URLSearchParams({
    client_name: "pg.mccullo.ug",
    redirect_uris: redirectUri,
    scopes: "read",
    website: "https://pg.mccullo.ug/h",
  });
  const res = await fetch(`https://${instance}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `${instance} app registration failed: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as {
    client_id: string;
    client_secret: string;
  };
  const record: CachedApp = {
    instance,
    client_id: data.client_id,
    client_secret: data.client_secret,
    registered_at: Date.now(),
  };
  await col.insertOne(record);
  return record;
}

async function start(request: Request, instanceRaw: string, returnTo?: string) {
  const instance = normalizeInstance(instanceRaw);
  if (!instance) {
    return badRequest("Please enter a valid Mastodon instance hostname.");
  }

  const redirectUri = callbackUrl(request, "mastodon");
  let app: CachedApp;
  try {
    app = await ensureApp(instance, redirectUri);
  } catch (err) {
    console.error("[oauth/mastodon] app registration failed:", err);
    return badRequest(`Couldn't reach ${instance}. Is it spelled correctly?`);
  }

  // Stash the instance (and returnTo, if provided) in the state cookie
  // so the callback can dispatch on both.
  const extras: Record<string, string> = { instance };
  if (returnTo) extras.returnTo = returnTo;
  const { state, cookie } = await newStateCookie("mastodon", extras);
  const params = new URLSearchParams({
    client_id: app.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read",
    state,
  });

  return redirect(
    `https://${instance}/oauth/authorize?${params.toString()}`,
    { headers: { "Set-Cookie": cookie } }
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  // returnTo can arrive on the form (from SignInModal's hidden input)
  // or the query string (link click, testing).
  const url = new URL(request.url);
  const returnTo =
    sanitizeReturnTo(form.get("returnTo")?.toString()) ??
    sanitizeReturnTo(url.searchParams.get("returnTo")) ??
    undefined;
  return start(request, form.get("instance")?.toString() ?? "", returnTo);
};

// GET also supported via ?instance= query param, mostly for testing.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const instance = url.searchParams.get("instance") ?? "";
  if (!instance) {
    return badRequest("Missing instance parameter.");
  }
  const returnTo =
    sanitizeReturnTo(url.searchParams.get("returnTo")) ?? undefined;
  return start(request, instance, returnTo);
};
