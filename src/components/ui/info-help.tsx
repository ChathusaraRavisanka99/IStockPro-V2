"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  title?: string;
  children: ReactNode;
  /** Smaller icon variant for section headings vs. the page-title-sized default. */
  size?: "sm" | "md";
};

const FADE_MS = 200;

export function InfoHelp({ title, children, size = "md" }: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, FADE_MS);
  }

  const iconClass =
    size === "sm"
      ? "inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
      : "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-100";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={title ? `Help: ${title}` : "Help"} className={iconClass}>
        i
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              onClick={close}
              className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                className={`w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl transition-all duration-200 ${closing ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
              >
                {title ? <p className="mb-1.5 text-sm font-semibold text-slate-900">{title}</p> : null}
                <div className="text-sm leading-relaxed text-slate-700">{children}</div>
                <button type="button" onClick={close} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  Got it
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
