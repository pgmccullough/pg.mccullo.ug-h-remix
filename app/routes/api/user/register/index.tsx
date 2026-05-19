import type { ActionFunctionArgs } from "react-router";
import { createUserSession, register } from "~/utils/session.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const result = await register({
    username: form.get("username")?.toString() ?? "",
    email: form.get("email")?.toString() ?? "",
    password: form.get("password")?.toString() ?? "",
    confirm_password: form.get("confirm_password")?.toString() ?? "",
    first_name: form.get("first_name")?.toString() ?? "",
    last_name: form.get("last_name")?.toString() ?? "",
  });

  if (!result.ok) {
    // Reuse the logInError channel the SignInModal already wires up.
    return { logInError: result.error };
  }

  return createUserSession(result.userId, "/h/");
};
