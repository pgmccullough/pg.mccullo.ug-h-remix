import type { ActionFunctionArgs } from "react-router";
import { createUserSession, login } from "~/utils/session.server";
import { sanitizeReturnTo } from "~/utils/oauth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");

  const user = await login({ username, password });
  if (!user) {
    return {logInError: "error"};
  }
  // Honor ?returnTo=/... on the form (hidden field from SignInModal)
  // or on the query string (link that landed here directly). Reject
  // anything but same-origin paths to prevent open-redirect abuse.
  const url = new URL(request.url);
  const returnTo =
    sanitizeReturnTo(form.get("returnTo")?.toString()) ??
    sanitizeReturnTo(url.searchParams.get("returnTo")) ??
    "/h/";
  return createUserSession(user.id, returnTo);
}