"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { TileGrid, tileDropTotalMs } from "@/components/ui/tile-loader";

// A compact 3x3 variant with a faster per-tile animation — the full splash grid
// reads fine as a one-time thing, but repeated on every click it needs to be
// snappy and tightly formed rather than a stretched-out strip.
const GRID = { columns: 3, rows: 3, rowStepMs: 55, colStepMs: 35, durationMs: 420, tileClassName: "size-6 sm:size-7", gapClassName: "gap-2" };
const MIN_VISIBLE_MS = tileDropTotalMs(GRID) + 120; // let the drop finish, plus a beat to actually register it
const SAFETY_TIMEOUT_MS = 8000;

// Server Components (loading.tsx) hand control back the instant real content is
// ready, so on a warm cache the drop animation can be swapped out before it's
// even rendered a few frames. This intercepts link clicks itself (same technique
// as the old top progress bar) so it can hold the overlay for a guaranteed
// minimum time, regardless of how fast the actual navigation resolves.
export function NavigationTileOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams.toString()}`;
  const keyRef = useRef(key);
  const shownAtRef = useRef(0);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [runId, setRunId] = useState(0);

  function clearTimers() {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
  }

  function start() {
    clearTimers();
    setRunId((id) => id + 1); // remounts the tile grid so the drop animation replays from the top
    setVisible(true);
    shownAtRef.current = Date.now();
    safetyTimeoutRef.current = setTimeout(() => setVisible(false), SAFETY_TIMEOUT_MS);
  }

  function finish() {
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAtRef.current));
    hideTimeoutRef.current = setTimeout(() => setVisible(false), remaining);
  }

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        const nextKey = `${url.pathname}?${url.searchParams.toString()}`;
        if (nextKey === keyRef.current) return;
        start();
      } catch {
        // ignore unparsable hrefs
      }
    }
    // Capture phase: run before Next.js Link's own handler.
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => clearTimers, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-slate-950/70"
      aria-live="polite"
      aria-label="Loading page"
    >
      <TileGrid key={runId} {...GRID} />
    </div>
  );
}
