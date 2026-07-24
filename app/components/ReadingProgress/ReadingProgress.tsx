import { useEffect, useRef, useState } from "react";

/**
 * Thin colored bar fixed at the top of the viewport that fills
 * proportionally as the reader scrolls through a post's content.
 *
 * Tracks scroll position relative to a target element (the post
 * body), not the whole page — so the bar reflects reading progress
 * through the article specifically, not scroll through the entire
 * document (which includes header + related posts + backlinks +
 * footer).
 *
 * Requestings-animation-frame throttling so scroll-heavy dragging
 * stays smooth. Hides itself entirely on short posts (< viewport
 * height) since there's nothing meaningful to track.
 */
export const ReadingProgress: React.FC<{ targetSelector?: string }> = ({
  targetSelector = ".postcard__content__text",
}) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const compute = () => {
      const el = document.querySelector(targetSelector) as HTMLElement | null;
      if (!el) {
        setVisible(false);
        return;
      }
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight;
      // Only show the bar when the content is at least ~1.5x the
      // viewport — for anything shorter, scroll progress is
      // meaningless (you can see the whole thing without moving).
      if (rect.height < viewport * 1.5) {
        setVisible(false);
        return;
      }
      setVisible(true);

      // Progress: how much of the content has scrolled above the
      // fold. `-rect.top` is how many pixels of content have moved
      // above the viewport top; divide by (contentHeight - viewport)
      // to get a 0-to-1 range where 1 = the bottom of the content
      // is at the bottom of the viewport.
      const scrolled = -rect.top;
      const readable = rect.height - viewport;
      const pct = readable > 0 ? Math.min(1, Math.max(0, scrolled / readable)) : 0;
      setProgress(pct);
    };

    const onScrollOrResize = () => {
      if (rafId.current != null) return;
      rafId.current = requestAnimationFrame(() => {
        compute();
        rafId.current = null;
      });
    };

    // Initial paint (post might load with a hash-scroll deep-linking
    // partway down, so pick up the current position rather than 0).
    compute();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [targetSelector]);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Reading progress"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "transparent",
        zIndex: 200,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress * 100}%`,
          background: "#4A6CBA",
          transition: "width 0.08s linear",
        }}
      />
    </div>
  );
};
