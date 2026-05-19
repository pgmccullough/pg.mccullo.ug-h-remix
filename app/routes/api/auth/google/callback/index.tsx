import type { LoaderFunctionArgs } from "react-router";
import {
  callbackUrl,
  completeOAuthFlow,
  readStateCookie,
  badRequest,
} from "~/utils/oauth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return badRequest("Google OAuth env vars are not set.");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return badRequest(`Google rejected: ${oauthError}`);
  if (!code || !returnedState) return badRequest("Missing code/state.");

  const { provider, state, session } = await readStateCookie(request);
  if (provider !== "google" || !state || state !== returnedState) {
    return badRequest("State mismatch.");
  }

  // Exchange code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl(request, "google"),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error(
      "[oauth/google] token exchange failed:",
      tokenRes.status,
      await tokenRes.text()
    );
    return badRequest("Google token exchange failed.");
  }
  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    id_token?: string;
  };

  // Fetch userinfo.
  const userRes = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  if (!userRes.ok) {
    console.error("[oauth/google] userinfo failed:", await userRes.text());
    return badRequest("Couldn't fetch Google user info.");
  }
  const profile = (await userRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
  };

  return completeOAuthFlow(
    {
      provider: "google",
      externalId: profile.sub,
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.picture,
    },
    session,
    "/h"
  );
};
