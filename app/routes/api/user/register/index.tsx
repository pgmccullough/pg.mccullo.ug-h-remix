import type { ActionFunctionArgs } from "react-router";
import { createUserSession, login } from "~/utils/session.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const username = form.get("username");

  return {registered: "not yet registered "+username};
}