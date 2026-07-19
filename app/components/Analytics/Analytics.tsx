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

    // Client-side signals for better returning-visitor matching. All
    // are best-effort and coalesce to "" if the browser doesn't
    // expose them.
    let viewport = "";
    let timezone = "";
    let language = "";
    try {
      if (typeof window !== "undefined" && window.screen) {
        viewport = `${window.screen.width}x${window.screen.height}`;
      }
      if (typeof Intl !== "undefined") {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
      }
      if (typeof navigator !== "undefined") {
        language = navigator.language ?? "";
      }
    } catch { /* swallow — analytics never blocks the page */ }

    updateVisitor.submit(
      {
        path: curPath,
        guestUUID: (typeof localStorage !== "undefined" && localStorage.guestUUID) || "",
        userId: user?.id?.toString() ?? "",
        userName: user?.user_name ?? "",
        referrer: typeof document !== "undefined" ? document.referrer : "",
        viewport,
        timezone,
        language,
      },
      { method: "post", action: "/api/analytics?index" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  return null;
};
