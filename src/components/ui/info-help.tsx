"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Modal, modalButton } from "@/components/ui/modal";

type Props = {
  title?: string;
  children: ReactNode;
  /** Smaller icon variant for section headings vs. the page-title-sized default. */
  size?: "sm" | "md";
};

export function InfoHelp({ title, children, size = "md" }: Props) {
  const [open, setOpen] = useState(false);

  const iconClass =
    size === "sm"
      ? "inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500 transition hover:border-slate-400 hover:bg-slate-100"
      : "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-slate-100";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={title ? `Help: ${title}` : "Help"} className={iconClass}>
        i
      </button>
      {open ? (
        <Modal
          title={title || "Help"}
          icon={<Info className="size-4" />}
          size="sm"
          onClose={() => setOpen(false)}
          footer={
            <button type="button" data-autofocus onClick={() => setOpen(false)} className={modalButton.primary}>
              Got it
            </button>
          }
        >
          <div className="text-sm font-normal leading-relaxed text-slate-700 [&_p+p]:mt-2">{children}</div>
        </Modal>
      ) : null}
    </>
  );
}
