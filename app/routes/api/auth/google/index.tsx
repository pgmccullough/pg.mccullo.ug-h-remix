import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  callbackUrl,
  newStateCookie,
  badRequest,
} from "~/utils/oauth.server";

// Initiate the Google OAuth flow.
//
// Both GET (link click) and POST (form submit) are accepted via the same
// loader/action so the SignInModal can use whichever shape is easier.

async function start(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return badRequest("GOOGLE_CLIENT_ID is not set.");
  }

  const { state, cookie } = await newStateCookie("google");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request, "google"),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    { headers: { "Set-Cookie": cookie } }
  );
}

export const loader = ({ request }: LoaderFunctionArgs) => start(request);
export const action = ({ request }: LoaderFunctionArgs) => start(request);
