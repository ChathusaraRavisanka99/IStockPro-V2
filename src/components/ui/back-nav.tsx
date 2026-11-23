"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";

/**
 * "← Back to <previous page>" plus a short list of the pages visited before it, so you can
 * step back through your trail (no forward). The trail lives in this tab's sessionStorage;
 * each entry is labelled with the page's heading.
 */

type Entry = { url: string; label: string };
const KEY = "istock-trail";
const MAX = 15;

function read(): Entry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return [];
  }
}
function write(trail: Entry[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    /* storage unavailable — the button just won't show */
  }
}

function fallbackLabel(url: string) {
  const path = url.split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return "Home";
  const isItems = parts[0] === "items" && parts[1];
  const section = (isItems ? parts[1] : parts[0]).replace(/-/g, " ");
  const title = section.charAt(0).toUpperCase() + section.slice(1);
  return parts.length > (isItems ? 2 : 1) ? `${title} details` : title;
}

export function BackNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [trail, setTrail] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const goingBackTo = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const query = searchParams.toString();
  const url = `${pathname}${query ? `?${query}` : ""}`;

  useEffect(() => {
    let next = read();
    const target = goingBackTo.current;
    goingBackTo.current = null;
    if (target !== null && next[target]?.url === url) {
      next = next.slice(0, target + 1);
    } else {
      const last = next[next.length - 1];
      // Same page with different filters/search replaces the entry instead of stacking.
      if (last && last.url.split("?")[0] === pathname) next[next.length - 1] = { ...last, url };
      else if (next.length >= 2 && next[next.length - 2].url === url) next = next.slice(0, -1); // browser back
      else next.push({ url, label: fallbackLabel(url) });
    }
    write(next);
    setTrail(next);
    setOpen(false);

    // Label the entry with the page heading once it has rendered.
    const timer = window.setTimeout(() => {
      const heading = document.querySelector("main h1")?.textContent?.trim();
      if (!heading) return;
      const current = read();
      const index = current.length - 1;
      if (current[index]?.url.split("?")[0] === pathname) {
        current[index] = { ...current[index], label: heading.slice(0, 60) };
        write(current);
        setTrail(current);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [url, pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (trail.length < 2) return null;
  const previous = trail[trail.length - 2];
  const earlier = trail.slice(0, -1).map((entry, index) => ({ ...entry, index })).reverse();

  function goTo(index: number) {
    goingBackTo.current = index;
    router.push(trail[index].url);
  }

  return (
    <div ref={menuRef} className="relative mb-3 flex items-center gap-1 print:hidden">
      <button type="button" onClick={() => goTo(trail.length - 2)} className="btn btn-xs btn-secondary max-w-[70vw]" title={`Back to ${previous.label}`}>
        <ArrowLeft className="size-3.5 shrink-0" />
        <span className="truncate">Back to {previous.label}</span>
      </button>
      {earlier.length > 1 ? (
        <button type="button" onClick={() => setOpen((value) => !value)} className="btn btn-xs btn-secondary px-1.5" aria-label="Earlier pages" title="Earlier pages you visited" aria-expanded={open}>
          <ChevronDown className="size-3.5" />
        </button>
      ) : null}
      {open ? (
        <ul className="absolute left-0 top-full z-50 mt-1 grid w-72 max-w-[90vw] gap-0.5 rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-lg">
          <li className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Go back to</li>
          {earlier.map((entry, position) => (
            <li key={`${entry.index}-${entry.url}`}>
              <button type="button" onClick={() => goTo(entry.index)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-slate-800 hover:bg-slate-100">
                <span className="truncate">{entry.label}</span>
                <span className="shrink-0 text-xs text-slate-400">{position + 1} back</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
