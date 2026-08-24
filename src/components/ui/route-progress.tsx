"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams.toString()}`;
  const keyRef = useRef(key);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  function clearTimers() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }

  function start() {
    clearTimers();
    setVisible(true);
    setProgress(15);
    timerRef.current = setInterval(() => {
      setProgress((current) => (current < 85 ? current + Math.random() * 8 : current));
    }, 200);
    // Safety net: if the navigation never completes (dropped connection, aborted fetch), don't
    // leave the bar stuck forever.
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 8000);
  }

  function finish() {
    clearTimers();
    setProgress(100);
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);
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
    // Capture phase: run before Next.js Link's own handler calls preventDefault().
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => clearTimers, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[100] h-1 w-full">
      <div
        className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
