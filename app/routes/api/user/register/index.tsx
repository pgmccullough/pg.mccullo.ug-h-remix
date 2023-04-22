import type { ActionArgs } from "@remix-run/node";
import { createUserSession, login } from "~/utils/session.server";

export const action = async ({ request }: ActionArgs) => {
  const form = await request.formData();
  const username = form.get("username");

  return {registered: "not yet registered "+username};
}