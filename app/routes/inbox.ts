import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import { federation } from "~/utils/federation.server";

// Shared inbox at /inbox (Fedify also wires per-actor inboxes at
// /users/:identifier/inbox via users.$identifier.ts).
//
// In Phase A1 the inbox doesn't do anything with received activities yet —
// A2 wires up Follow handling.
export const loader = ({ request }: LoaderFunctionArgs) =>
  federation.fetch(request, { contextData: undefined });

export const action = ({ request }: ActionFunctionArgs) =>
  federation.fetch(request, { contextData: undefined });
