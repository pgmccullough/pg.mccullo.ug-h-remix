import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  callbackUrl,
  newStateCookie,
  badRequest,
} from "~/utils/oauth.server";

async function start(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return badRequest("GITHUB_CLIENT_ID is not set.");
  }

  const { state, cookie } = await newStateCookie("github");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(request, "github"),
    scope: "read:user user:email",
    state,
  });

  return redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
    { headers: { "Set-Cookie": cookie } }
  );
}

export const loader = ({ request }: LoaderFunctionArgs) => start(request);
export const action = ({ request }: LoaderFunctionArgs) => start(request);
