"use client";

type SaleType = "Retail" | "Wholesale";

export function SaleTypeToggle({ label, name, value, onChange }: { label: string; name: string; value: SaleType; onChange: (next: SaleType) => void }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-700">{label}</span>
        <input type="hidden" name={name} value={value} />
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {(["Retail", "Wholesale"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`px-3 py-1.5 ${value === option ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-1 text-xs text-slate-500">
        Items added below are priced at {value.toLowerCase()} price; switching re-prices lines you haven&apos;t edited by hand.
      </p>
    </>
  );
}
