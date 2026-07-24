/**
 * POST /api/bible/highlight
 *
 * Admin-only. Toggles a single verse's highlight status for a
 * (book, chapter). Body: form fields `book`, `chapter`, `verse`
 * (verse is 1-indexed).
 *
 * Returns the updated `verses` array so the widget can reconcile
 * its local state with the server's authoritative list.
 */

import type { ActionFunctionArgs } from "react-router";
import { getUser } from "~/utils/session.server";
import { toggleHighlight } from "~/utils/bible.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await getUser(request);
  if (user?.role !== "administrator") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await request.formData();
  const book = form.get("book")?.toString() ?? "";
  const chapter = Number(form.get("chapter")?.toString() ?? "");
  const verse = Number(form.get("verse")?.toString() ?? "");
  if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse) || verse < 1) {
    return Response.json({ error: "invalid input" }, { status: 400 });
  }
  const highlights = await toggleHighlight(book, chapter, verse);
  return Response.json({ ok: true, highlights });
};
