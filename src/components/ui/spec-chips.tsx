import { isLightColor, resolvePhoneColor } from "@/lib/phone-colors";

type Size = "xs" | "sm";
const SIZE: Record<Size, string> = { xs: "px-1.5 py-0.5 text-[11px]", sm: "px-2 py-0.5 text-xs" };

/**
 * A color label painted in the color itself (e.g. "Sierra Blue" on a sierra-blue chip), with
 * text that stays readable; unknown names fall back to a neutral chip with a striped dot.
 */
export function ColorChip({ color, size = "xs", active }: { color: string; size?: Size; active?: boolean }) {
  const swatch = resolvePhoneColor(color);
  if (!swatch) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white font-medium text-slate-700 ${SIZE[size]} ${active ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}>
        <span className="size-2 rounded-full bg-[repeating-linear-gradient(45deg,#cbd5e1_0_2px,#fff_2px_4px)] ring-1 ring-slate-300" aria-hidden="true" />
        {color}
      </span>
    );
  }
  const light = isLightColor(swatch);
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${SIZE[size]} ${light ? "ring-1 ring-inset ring-black/15" : ""} ${active ? "outline outline-2 outline-offset-2 outline-slate-900" : ""}`}
      // Text color is inline (not a theme class) so the chip reads the same in light and dark mode.
      style={{ backgroundColor: swatch, color: light ? "#0f172a" : "#ffffff" }}
    >
      {color}
    </span>
  );
}

export function StorageChip({ value, size = "xs" }: { value: string; size?: Size }) {
  return <span className={`inline-flex items-center rounded-full bg-slate-100 font-medium text-slate-700 ring-1 ring-inset ring-slate-200 ${SIZE[size]}`}>{value}</span>;
}

export function RamChip({ value, size = "xs" }: { value: string; size?: Size }) {
  return <span className={`inline-flex items-center rounded-full bg-white font-medium text-slate-600 ring-1 ring-inset ring-slate-300 ${SIZE[size]}`}>{value} RAM</span>;
}

/** Color / storage / RAM of a variant as chips, skipping blanks. */
export function SpecChips({ color, storage, ram, size = "xs", className = "" }: { color?: string | null; storage?: string | null; ram?: string | null; size?: Size; className?: string }) {
  if (!color && !storage && !ram) return null;
  // Callers that pass a display class ("flex") get the chips on their own line; otherwise they
  // sit inline after the text with a small gap so they never touch it.
  const ownLine = className.split(/\s+/).some((name) => name === "flex" || name === "block" || name === "grid");
  return (
    <span className={`${ownLine ? "" : "ml-1.5 inline-flex align-middle"} flex-wrap items-center gap-1.5 ${className}`}>
      {color ? <ColorChip color={color} size={size} /> : null}
      {storage ? <StorageChip value={storage} size={size} /> : null}
      {ram ? <RamChip value={ram} size={size} /> : null}
    </span>
  );
}

const STATUS_STYLES: Record<string, { label: string; className: string; dot: string }> = {
  InStock: { label: "In stock", className: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  Reserved: { label: "Reserved", className: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500" },
  Sold: { label: "Sold", className: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  Returned: { label: "Returned", className: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  Repair: { label: "In repair", className: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  WrittenOff: { label: "Written off", className: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
};

/** Unit status as a labelled pill (color + text, never color alone). */
export function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}

const GRADE_STYLES: Record<string, string> = { A: "bg-emerald-600 text-white", B: "bg-amber-500 text-white", C: "bg-orange-600 text-white" };

export function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-xs text-slate-400">Not graded</span>;
  return <span className={`inline-flex size-6 items-center justify-center rounded-md text-xs font-bold ${GRADE_STYLES[grade] ?? "bg-slate-200 text-slate-700"}`} title={`Grade ${grade}`}>{grade}</span>;
}

/** Amber "price not set" flags for stock that would otherwise sell at LKR 0. */
export function PriceMissing({ retail, wholesale, showWholesale = true, className = "" }: { retail: unknown; wholesale?: unknown; showWholesale?: boolean; className?: string }) {
  const noRetail = !(Number(retail ?? 0) > 0);
  const noWholesale = showWholesale && wholesale !== undefined && !(Number(wholesale ?? 0) > 0);
  if (!noRetail && !noWholesale) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {noRetail ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200" title="Retail price is 0 — set it before selling">⚠ No retail price</span> : null}
      {noWholesale ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200" title="Wholesale price is 0">⚠ No wholesale price</span> : null}
    </span>
  );
}
