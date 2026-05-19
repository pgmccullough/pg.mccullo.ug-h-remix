import type { LoaderFunctionArgs } from "react-router";
import { federation } from "~/utils/federation.server";

// Path: /.well-known/webfinger
// Fedify handles the protocol — we just hand it the request.
export const loader = ({ request }: LoaderFunctionArgs) =>
  federation.fetch(request, { contextData: undefined });
