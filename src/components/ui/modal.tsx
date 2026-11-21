"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Size = "sm" | "md" | "lg" | "xl";
const WIDTHS: Record<Size, string> = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };
const EXIT_MS = 160;

// Stack of open modals so Esc only closes the top one, and page scroll stays locked until
// the last one closes.
const openStack: symbol[] = [];

type Props = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional leading icon in the header (e.g. a warning glyph for destructive dialogs). */
  icon?: ReactNode;
  tone?: "default" | "danger";
  size?: Size;
  onClose: () => void;
  /** Sticky footer, typically the action buttons. */
  footer?: ReactNode;
  children: ReactNode;
  /** Set while a save is in flight so Esc/backdrop can't drop the user's work. */
  busy?: boolean;
  /** Body padding off — for content that manages its own layout (e.g. a filterable list). */
  flush?: boolean;
};

/**
 * Shared popup shell for every dialog in the app: portal + dimmed backdrop, centered card on
 * desktop / bottom sheet on phones, sticky header (title, subtitle, close) and footer,
 * scrollable body, Esc / backdrop / ✕ to close with a short exit animation, page scroll
 * lock, Tab focus kept inside, and focus returned to the trigger afterwards.
 */
export function Modal({ title, subtitle, icon, tone = "default", size = "md", onClose, footer, children, busy, flush }: Props) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(Symbol("modal"));
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const requestClose = useCallback(() => {
    if (busyRef.current) return;
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const id = idRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openStack.push(id);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first autofocus field, else the panel itself, so keyboard users land inside.
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? panel;
    window.setTimeout(() => target?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== id) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key === "Tab" && panel && panel.contains(document.activeElement)) {
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openStack.indexOf(id);
      if (index >= 0) openStack.splice(index, 1);
      if (!openStack.length) document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [requestClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-4 ${closing ? "modal-backdrop-out" : "modal-backdrop-in"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      // Portaled content still bubbles React events to its owner — e.g. a CostRow's <tr>
      // onClick would immediately reopen the dialog. Contain them here.
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none ring-1 ring-slate-900/5 sm:max-h-[88vh] sm:rounded-2xl ${WIDTHS[size]} ${closing ? "modal-panel-out" : "modal-panel-in"}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        <div className={`flex shrink-0 items-start gap-3 border-b px-5 pb-3 pt-3 sm:pt-4 ${tone === "danger" ? "border-red-100" : "border-slate-100"}`}>
          {icon ? <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${tone === "danger" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"}`}>{icon}</div> : null}
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className={`text-base font-semibold leading-6 ${tone === "danger" ? "text-red-900" : "text-slate-900"}`}>
              {title}
            </h3>
            {subtitle ? <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${flush ? "" : "px-5 py-4"}`}>{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/** Consistent popup buttons. */
export const modalButton = {
  secondary: "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50",
  primary: "rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50",
  danger: "rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50",
};

/** Label/input styling shared by popup forms. */
export const modalField = {
  label: "grid gap-1 text-xs font-medium text-slate-600",
  input: "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
};
