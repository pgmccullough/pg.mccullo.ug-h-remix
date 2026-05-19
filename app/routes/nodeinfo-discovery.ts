import type { LoaderFunctionArgs } from "react-router";
import { federation } from "~/utils/federation.server";

// Path: /.well-known/nodeinfo (the discovery doc)
// Returns a JRD pointing to /nodeinfo/2.1
export const loader = ({ request }: LoaderFunctionArgs) =>
  federation.fetch(request, { contextData: undefined });
