import { useEffect } from "react";

/**
 * Client-only Web Vitals reporter.
 *
 * Uses raw PerformanceObserver APIs (no `web-vitals` dependency) to
 * measure LCP, CLS, FCP, TTFB, and INP, then reports each to GA4 as
 * a custom event via `window.gtag`.
 *
 * Metrics reported:
 *   LCP  — Largest Contentful Paint (ms since navigation)
 *   FCP  — First Contentful Paint (ms)
 *   TTFB — Time To First Byte (ms from navigationStart)
 *   CLS  — Cumulative Layout Shift × 1000 (integer, so GA4 sums cleanly)
 *   INP  — Interaction to Next Paint, approximated as the max
 *          event-duration seen across the session
 *
 * We report on visibility-change → hidden, plus once on pagehide,
 * so a metric that keeps mutating (CLS, INP) sends its final value.
 * LCP/FCP/TTFB report as soon as they're known.
 *
 * Mounted in root.tsx so every route benefits.
 */

interface GTag {
  (event: "event", name: string, params: Record<string, any>): void;
}

declare global {
  interface Window {
    gtag?: GTag;
  }
}

function sendMetric(
  name: "LCP" | "FCP" | "TTFB" | "CLS" | "INP",
  value: number,
  gaId: string
) {
  if (!window.gtag) return;
  // GA4 event value should be an integer. CLS is naturally fractional
  // (0 to ~1); multiply by 1000 to preserve resolution.
  const gaValue =
    name === "CLS" ? Math.round(value * 1000) : Math.round(value);
  window.gtag("event", name, {
    value: gaValue,
    metric_id: name.toLowerCase(),
    metric_value: value,
    metric_delta: value,
    send_to: gaId,
    // Web Vitals are passive observations, not user interactions.
    non_interaction: true,
  });
}

export const WebVitals: React.FC<{ gaTrackingId: string }> = ({
  gaTrackingId,
}) => {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !gaTrackingId ||
      typeof PerformanceObserver === "undefined"
    ) {
      return;
    }

    // --- TTFB --------------------------------------------------------
    // The Navigation Timing entry is populated before hydration, so
    // just read it once and report.
    try {
      const [nav] = performance.getEntriesByType(
        "navigation"
      ) as PerformanceNavigationTiming[];
      if (nav && typeof nav.responseStart === "number") {
        sendMetric("TTFB", nav.responseStart, gaTrackingId);
      }
    } catch {
      /* silent */
    }

    // --- LCP ---------------------------------------------------------
    // LCP updates as larger elements paint; we track the running
    // latest, then finalize on visibility change.
    let lcpValue = 0;
    let lcpObserver: PerformanceObserver | undefined;
    try {
      lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as
          | PerformanceEntry
          | undefined;
        if (last) lcpValue = last.startTime;
      });
      lcpObserver.observe({
        type: "largest-contentful-paint",
        buffered: true,
      } as PerformanceObserverInit);
    } catch {
      /* not supported (Safari < 16, etc.) */
    }

    // --- FCP ---------------------------------------------------------
    let fcpReported = false;
    let fcpObserver: PerformanceObserver | undefined;
    try {
      fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint" && !fcpReported) {
            fcpReported = true;
            sendMetric("FCP", entry.startTime, gaTrackingId);
          }
        }
      });
      fcpObserver.observe({ type: "paint", buffered: true });
    } catch {
      /* silent */
    }

    // --- CLS ---------------------------------------------------------
    // Sum layout-shift values that weren't triggered by recent user
    // input (per Web Vitals definition).
    let clsValue = 0;
    let clsObserver: PerformanceObserver | undefined;
    try {
      clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      /* silent */
    }

    // --- INP (approximated) -----------------------------------------
    // Real INP is the 98th-percentile long-tail interaction latency;
    // a simple approximation that catches the worst-case is the max
    // event duration observed. Chrome fires 'event' entries with a
    // built-in `duration` field.
    let inpMax = 0;
    let inpObserver: PerformanceObserver | undefined;
    try {
      inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          duration: number;
        })[]) {
          if (entry.duration > inpMax) inpMax = entry.duration;
        }
      });
      inpObserver.observe({
        type: "event",
        buffered: true,
        durationThreshold: 40,
      } as PerformanceObserverInit);
    } catch {
      /* Safari doesn't support 'event' observer yet */
    }

    // --- Final report on tab hide -----------------------------------
    // Metrics that accumulate (LCP, CLS, INP) need a final flush.
    // visibilitychange → hidden is the recommended trigger; pagehide
    // is a fallback for browsers that fire it but not visibilitychange.
    let reported = false;
    const flush = () => {
      if (reported) return;
      reported = true;
      if (lcpValue > 0) sendMetric("LCP", lcpValue, gaTrackingId);
      // Only report CLS if we saw any shifts — a "0 CLS" report on
      // every pageload dilutes the average unhelpfully.
      if (clsValue > 0) sendMetric("CLS", clsValue, gaTrackingId);
      if (inpMax > 0) sendMetric("INP", inpMax, gaTrackingId);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      lcpObserver?.disconnect();
      fcpObserver?.disconnect();
      clsObserver?.disconnect();
      inpObserver?.disconnect();
    };
  }, [gaTrackingId]);

  return null;
};
