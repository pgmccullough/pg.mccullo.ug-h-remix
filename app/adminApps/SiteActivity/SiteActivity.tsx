import { Link, useLoaderData } from "react-router";
import { useEffect, useRef, useState } from "react";

interface VisitorDoc {
  _id?: string;
  firstSeen?: number;
  lastSeen?: number;
  lastIpData?: any;
  lastUserName?: string | null;
  /** Admin-assigned label — overrides all other name sources when set. */
  manualLabel?: string | null;
  ipData?: any[];
  ip?: string[];
  user?: Array<{ id?: string; user_name?: string } | null>;
  history?: Array<{ path?: string; timestamp?: number; referrer?: string }>;
}

function place(visitor: VisitorDoc): string {
  const d = visitor.lastIpData ?? visitor.ipData?.[visitor.ipData.length - 1];
  if (d) {
    const parts = [d.city, d.region_code, d.country_code]
      .filter((x) => typeof x === "string" && x.length);
    if (parts.length) return parts.join(", ");
    if (d.country_name) return d.country_name;
  }
  // Last-resort fallback for entries with no geo data — show the IP itself
  // so admin has SOMETHING to go on. Better than the unhelpful "?".
  const ip = visitor.ip?.[visitor.ip.length - 1];
  return ip || "unknown";
}

function countryCode(visitor: VisitorDoc): string {
  const d = visitor.lastIpData ?? visitor.ipData?.[visitor.ipData.length - 1];
  return typeof d?.country_code === "string" ? d.country_code : "";
}

// flag emoji glyphs don't render on Windows (Chrome/FF fall back to the
// regional-indicator letters) and are inconsistent on other platforms
// too. Render an actual PNG from flagcdn.com — free CDN, tiny files,
// no auth. 16×12 pairs nicely with the 13px row text.
function FlagIcon({ visitor }: { visitor: VisitorDoc }) {
  const cc = countryCode(visitor);
  if (!cc) return null;
  return (
    <img
      src={`https://flagcdn.com/16x12/${cc.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/32x24/${cc.toLowerCase()}.png 2x`}
      alt={cc}
      width={16}
      height={12}
      style={{ verticalAlign: "middle", borderRadius: 1 }}
    />
  );
}

function lastPath(visitor: VisitorDoc): string {
  return visitor.history?.[visitor.history.length - 1]?.path ?? "/";
}

function whenLabel(ms?: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.round(diff / min)}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function identity(visitor: VisitorDoc): string {
  // Manual admin-assigned label wins over automatic detection —
  // lets Patrick call an anon "Mom" or "Googlebot" once and have
  // it stick.
  if ((visitor as any).manualLabel) return String((visitor as any).manualLabel);
  if (visitor.lastUserName) return visitor.lastUserName;
  const u = visitor.user?.find((x) => x?.user_name)?.user_name;
  if (u) return u;
  return "anon";
}

const LAST_READ_KEY = "siteActivityLastRead";

/**
 * Convert a URL-safe base64 VAPID public key (Uint8Array bytes) into
 * the raw byte array that pushManager.subscribe() wants.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const SiteActivity: React.FC<{}> = () => {
  const { visitors: loaderVisitors, vapidPublicKey } = useLoaderData<{
    visitors: VisitorDoc[];
    vapidPublicKey?: string;
  }>();
  // Collapsed by default — the drawer just shows its header tab at the
  // bottom of the screen until clicked.
  const [expanded, setExpanded] = useState<boolean>(false);
  const expandedRef = useRef(expanded);
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  // Unread tracking: the number that appears in the header parens is
  // the count of visitors whose `lastSeen` is newer than the last time
  // the admin opened the drawer. Stored in localStorage so it persists
  // across page loads. On very first mount (no stored value) we treat
  // everything as unread — matches the pre-change "(50)" baseline until
  // the admin opens the drawer once.
  //
  // `null` means "not yet loaded from localStorage" — used to avoid a
  // hydration mismatch between SSR and client on the very first paint.
  const [lastReadTs, setLastReadTs] = useState<number | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_READ_KEY);
      setLastReadTs(stored ? Number(stored) : 0);
    } catch {
      setLastReadTs(0);
    }
  }, []);
  const markAllRead = () => {
    const now = Date.now();
    setLastReadTs(now);
    try { localStorage.setItem(LAST_READ_KEY, String(now)); } catch {}
  };

  // Take over visitor state from the loader so we can push live
  // updates onto it via Pusher. The loader still does the first paint.
  const [visitors, setVisitors] = useState<VisitorDoc[]>(loaderVisitors ?? []);
  useEffect(() => {
    // If the loader re-renders with a fresh list (route navigation),
    // start over from that snapshot.
    setVisitors(loaderVisitors ?? []);
  }, [loaderVisitors]);

  // Desktop notification permission state. We let the admin opt in
  // via a tiny bell in the header bar; once granted, every live
  // visitor event fires a Notification.
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unknown">(
    "unknown"
  );
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPerm(Notification.permission);
    }
  }, []);
  const notifPermRef = useRef(notifPerm);
  useEffect(() => { notifPermRef.current = notifPerm; }, [notifPerm]);

  // Track whether this browser is already subscribed for Web Push
  // (checked once on mount, and after a subscribe/unsubscribe flip).
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const refreshPushState = async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setPushSubscribed(!!sub);
    } catch { /* ignore */ }
  };
  useEffect(() => { void refreshPushState(); }, []);

  /**
   * Enable push:
   *   1. Ask for Notification permission if not granted yet.
   *   2. Register the service worker.
   *   3. pushManager.subscribe() with the site's VAPID public key.
   *   4. POST the subscription to /api/push/subscribe so the server
   *      can send us notifications later.
   *
   * Idempotent — calling it when already subscribed is a no-op.
   */
  const enablePush = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("This browser doesn't support push notifications.");
      return;
    }
    if (!vapidPublicKey) {
      alert("Push isn't configured on the server yet (missing VAPID_PUBLIC_KEY).");
      return;
    }
    try {
      // 1. Permission
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        setNotifPerm(perm);
        if (perm !== "granted") return;
      }
      // 2. Service worker (idempotent — re-register is a cheap check)
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      // 3. Subscribe (or return the existing sub)
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }
      // 4. Ship the subscription to the server
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        console.error("[push] subscribe endpoint failed:", await res.text());
        alert("Server rejected the subscription.");
        return;
      }
      setPushSubscribed(true);
    } catch (err) {
      console.error("[push] enable failed:", err);
      alert("Could not enable push notifications. See console for details.");
    }
  };

  const disablePush = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setPushSubscribed(false);
    } catch (err) {
      console.error("[push] disable failed:", err);
    }
  };

  const requestNotifPerm = async (e: React.MouseEvent) => {
    // Legacy fallback: if push isn't available, still let the admin
    // grant permission for the tab-only in-page notification path.
    e.stopPropagation();
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotifPerm(result);
    } catch {
      // Some browsers (older Safari) throw; treat as denied.
      setNotifPerm("denied");
    }
  };

  // Subscribe to the live visitor channel. Dynamic-import pusher-js
  // so its `self`-touching module init can't break the SSR bundle.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { default: Pusher } = await import("pusher-js");
      if (cancelled) return;
      const pusher = new Pusher("1463cc5404c5aa8377ba", { cluster: "mt1" });
      const channel = pusher.subscribe("client-new-visitor");
      channel.bind("refresh", (data: { visitor: VisitorDoc }) => {
        const v = data?.visitor;
        if (!v?._id) return;
        // Move/insert at the top of the list.
        setVisitors((prev) => {
          const others = prev.filter((p) => String(p._id) !== String(v._id));
          return [v, ...others];
        });
        // If the drawer is already open, the admin is looking at the
        // widget — auto-mark this new visitor as read so the header
        // count doesn't tick up while they're staring at the list.
        if (expandedRef.current) markAllRead();
        // Fire a desktop notification if the admin opted in.
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          notifPermRef.current === "granted"
        ) {
          try {
            const title = "New visitor";
            // OS notifications can't render <img>, and flag emoji is
            // unreliable in notification centers — fall back to text.
            const body = `${identity(v)} ${place(v)} · ${lastPath(v)}`;
            const n = new Notification(title, {
              body,
              icon: "/favicon.ico",
              tag: String(v._id), // collapses repeated visits by the same person
            });
            // Click-through opens the visited path.
            n.onclick = () => {
              window.focus();
              window.location.href = lastPath(v);
            };
          } catch {
            /* swallow — notifications are best effort */
          }
        }
      });
      cleanup = () => {
        try { channel.unbind_all(); } catch {}
        try { channel.unsubscribe(); } catch {}
        try { pusher.disconnect(); } catch {}
      };
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const sorted = [...(visitors ?? [])].sort(
    (a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
  );

  // Single container fixed to bottom: 0. Body (above) animates max-height
  // open/closed; header (below) stays anchored to the container's bottom
  // edge, which is always at the viewport bottom. As body grows, the
  // container grows *upward* and the header rides along with it visually
  // — which is what makes the drawer feel like one thing instead of two.

  return (
    <>
      <style>{`
        .siteActivity {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 360px;
          max-width: 90vw;
          max-height: 50vh;
          z-index: 80;
          background: #fff;
          border: 1px solid #979997;
          border-bottom: 0;
          border-radius: 4px 4px 0 0;
          box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.12);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          /* Closed by default: slide the whole drawer downward by its own
             height minus the 40px header, so only the header peeks above
             the viewport bottom. */
          transform: translateY(calc(100% - 40px));
          transition: transform 0.3s ease;
        }
        .siteActivity--open {
          transform: translateY(0);
        }
        .siteActivity__header {
          flex: 0 0 40px;
          padding: 0 14px;
          background: #eee;
          font-weight: 600;
          color: #506982;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          user-select: none;
          box-sizing: border-box;
        }
        .siteActivity__body {
          flex: 1 1 auto;
          overflow-y: auto;
          border-top: 1px solid #ddd;
        }
        .siteActivity__header:hover { background: #e6e6e6; }
        .siteActivity__caret {
          font-size: 1.25rem;
          color: #777;
          line-height: 1;
          transition: transform 0.2s ease;
        }
        /* "^" points up by default; rotate when expanded so it points
           down, suggesting "click to collapse". */
        .siteActivity__caret--down { transform: rotate(180deg); }

        .siteActivity__row {
          padding: 8px 14px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 13px;
          line-height: 1.35;
        }
        .siteActivity__row:last-child { border-bottom: 0; }
        .siteActivity__line1 { color: #333; }
        .siteActivity__line2 { color: #888; font-size: 12px; }
        .siteActivity__path,
        .siteActivity__path:visited {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #4A6CBA;
          text-decoration: none;
        }
        .siteActivity__path:hover { text-decoration: underline; }
      `}</style>

      <div className={`siteActivity${expanded ? " siteActivity--open" : ""}`}>
        {/* Header on TOP, body BELOW it. The container is fixed at
            bottom:0 and is translated downward by (own height - header)
            when closed, so only the header pokes above the viewport
            bottom. Toggling the --open class swaps to translateY(0),
            and the transition animates the slide. */}
        <div
          className="siteActivity__header"
          onClick={() => {
            // Opening the drawer marks everything as read. Closing
            // doesn't rewind — a fresh (0) stays fresh.
            const nowExpanded = !expanded;
            setExpanded(nowExpanded);
            if (nowExpanded) markAllRead();
          }}
        >
          <span>
            Recent visitors
            {lastReadTs !== null && (() => {
              // Unread count = visitors whose lastSeen postdates the
              // last time the drawer was opened. Rendered as " (N)"
              // only when N > 0 so a caught-up widget reads clean.
              const unread = sorted.filter(
                (v) => (v.lastSeen ?? 0) > lastReadTs
              ).length;
              return unread > 0 ? ` (${unread})` : "";
            })()}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            {/* Push-subscription button. If not subscribed yet, one
                click enables permission + service worker + push. If
                already subscribed, a filled bell + click to opt out. */}
            {notifPerm !== "denied" && !pushSubscribed && (
              <button
                type="button"
                onClick={enablePush}
                title="Enable push notifications on this device (works even when the tab is closed)"
                style={{
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 16,
                  height: "auto",
                  lineHeight: 1,
                }}
              >
                🔔
              </button>
            )}
            {pushSubscribed && (
              <button
                type="button"
                onClick={disablePush}
                title="Push subscribed on this device. Click to unsubscribe."
                style={{
                  background: "transparent",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                  fontSize: 16,
                  height: "auto",
                  lineHeight: 1,
                }}
              >
                🔕
              </button>
            )}
            {notifPerm === "denied" && (
              <span
                title="Notifications blocked — enable in your browser site settings"
                style={{ fontSize: 13, opacity: 0.6 }}
              >
                🔕
              </span>
            )}
            <span
              className={`siteActivity__caret${expanded ? " siteActivity__caret--down" : ""}`}
            >
              ^
            </span>
          </span>
        </div>
        <div className="siteActivity__body" aria-hidden={!expanded}>
          {sorted.length === 0 ? (
            <div className="siteActivity__row" style={{ color: "#888" }}>
              No visits recorded yet.
            </div>
          ) : (
            sorted.map((v) => {
              const visitCount = v.history?.length ?? 0;
              return (
              <div key={String(v._id)} className="siteActivity__row">
                <div
                  className="siteActivity__line1"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  {/* Whole identity block is a click-through to the
                      visitor detail page, where the admin can see the
                      full history + fingerprint + geo trail. */}
                  <Link
                    to={`/h/visitor/${String(v._id)}`}
                    style={{ color: "inherit", textDecoration: "none", minWidth: 0 }}
                  >
                    <strong>{identity(v)}</strong>{" "}
                    <FlagIcon visitor={v} />
                    {countryCode(v) && " "}
                    {place(v)}
                  </Link>
                  <span
                    style={{
                      color: "#888",
                      fontSize: 12,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ({visitCount} visit{visitCount === 1 ? "" : "s"})
                  </span>
                </div>
                <div className="siteActivity__line2">
                  <Link className="siteActivity__path" to={lastPath(v)}>
                    {lastPath(v)}
                  </Link>
                  {" · "}
                  {whenLabel(v.lastSeen)}
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
