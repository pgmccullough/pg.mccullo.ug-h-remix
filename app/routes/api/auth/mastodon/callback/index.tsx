import type { LoaderFunctionArgs } from "react-router";
import {
  callbackUrl,
  completeOAuthFlow,
  readStateCookie,
  badRequest,
  sanitizeReturnTo,
} from "~/utils/oauth.server";
import { clientPromise } from "~/lib/mongodb";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return badRequest(`Mastodon rejected: ${oauthError}`);
  if (!code || !returnedState) return badRequest("Missing code/state.");

  const { provider, state, extras, session } = await readStateCookie(request);
  if (provider !== "mastodon" || !state || state !== returnedState) {
    return badRequest("State mismatch.");
  }
  const instance = extras.instance;
  if (!instance) return badRequest("Lost the instance hostname.");
  const returnTo = sanitizeReturnTo(extras.returnTo) ?? "/h";

  // Look up the cached app credentials for this instance.
  const client = await clientPromise;
  const apps = client
    .db("user_posts")
    .collection<{ client_id: string; client_secret: string }>(
      "oauth_mastodon_apps"
    );
  const app = await apps.findOne({ instance });
  if (!app) {
    return badRequest(`No registered app for ${instance}. Try again.`);
  }

  const redirectUri = callbackUrl(request, "mastodon");

  // Exchange code for token.
  const tokenRes = await fetch(`https://${instance}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.client_id,
      client_secret: app.client_secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code,
      scope: "read",
    }),
  });
  if (!tokenRes.ok) {
    console.error(
      "[oauth/mastodon] token exchange failed:",
      tokenRes.status,
      await tokenRes.text()
    );
    return badRequest("Mastodon token exchange failed.");
  }
  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch the signed-in user's account.
  const accountRes = await fetch(
    `https://${instance}/api/v1/accounts/verify_credentials`,
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  if (!accountRes.ok) {
    return badRequest("Couldn't fetch Mastodon account.");
  }
  const account = (await accountRes.json()) as {
    id: string;
    username: string;       // local username on their instance
    acct: string;           // usually local; equals "username" or "user@otherhost"
    display_name?: string;
    avatar?: string;
    avatar_static?: string;
    url?: string;
    note?: string;
  };

  // Build the fully-qualified handle: user@instance
  const fqAcct = account.acct.includes("@")
    ? account.acct
    : `${account.username}@${instance}`;

  return completeOAuthFlow(
    {
      provider: "mastodon",
      externalId: account.id,
      // Mastodon's verify_credentials doesn't return email.
      email: undefined,
      displayName: account.display_name || account.username,
      username: account.username,
      avatarUrl: account.avatar || account.avatar_static,
      mastodonAcct: fqAcct,
      mastodonInstance: instance,
    },
    session,
    returnTo
  );
};
