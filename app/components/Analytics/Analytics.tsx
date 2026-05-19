import { useEffect, useRef } from "react";
import { useFetcher, useLoaderData, useMatches } from "react-router";

/**
 * Lightweight visitor tracking pinger. Fires once per pathname change.
 * The client only sends what it knows (the path, its localStorage
 * guestUUID, whether there's a signed-in user). The server resolves IP
 * + geo from request headers — that keeps the IPStack API key off the
 * client and avoids a redundant network round trip.
 */
export const Analytics: React.FC = () => {
  const matches = useMatches();
  const { user } = useLoaderData<{ user: { id: string; user_name: string } | null }>();
  const updateVisitor = useFetcher();
  const lastReportedPath = useRef<string | null>(null);

  useEffect(() => {
    const curPath = matches.at(-1)?.pathname ?? "/";
    if (lastReportedPath.current === curPath) return;
    lastReportedPath.current = curPath;

    updateVisitor.submit(
      {
        path: curPath,
        guestUUID: (typeof localStorage !== "undefined" && localStorage.guestUUID) || "",
        userId: user?.id?.toString() ?? "",
        userName: user?.user_name ?? "",
        referrer: typeof document !== "undefined" ? document.referrer : "",
      },
      { method: "post", action: "/api/analytics?index" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  return null;
};
