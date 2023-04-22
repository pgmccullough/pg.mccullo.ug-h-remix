import type { ActionArgs } from "@remix-run/node";
import { createUserSession, login } from "~/utils/session.server";

export const action = async ({ request }: ActionArgs) => {
  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");

  const user = await login({ username, password });
  if (!user) {
    return {logInError: "error"};
  }
  return createUserSession(user.id, "/h/");
}