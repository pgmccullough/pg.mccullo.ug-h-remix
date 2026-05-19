import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { logout } from "~/utils/session.server";

// User-initiated logout returns them to /h (not /h/login — that would be
// confusing right after they signed out).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return logout(request, "/h");
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return logout(request, "/h");
};

// Direct visits to /api/user/logout without a session just bounce to /h.
export default function LogoutFallback() {
  throw redirect("/h");
}
