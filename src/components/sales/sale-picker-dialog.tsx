"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import { formatMoney } from "@/lib/currency";
import { searchReturnableSales, type ReturnableSale, type SaleSearchFilters } from "@/lib/return-sale-search";

/**
 * Popup for finding the sale a return belongs to: search by sale #, customer name/phone, IMEI
 * or item name, narrow by date range and sale type, and see each sale's returnable items before
 * picking it.
 */
export function SalePickerDialog({
  onPick,
  onClose,
  quickAddSale,
}: {
  onPick: (sale: ReturnableSale) => void;
  onClose: () => void;
  /** Optional "record a manual sale" shortcut (sale total only). */
  quickAddSale?: (formData: FormData) => void | Promise<unknown>;
}) {
  const [filters, setFilters] = useState<SaleSearchFilters>({ onlyReturnable: true });
  const [result, setResult] = useState<{ sales: ReturnableSale[]; more: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [quickTotal, setQuickTotal] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const requestId = useRef(0);

  function run(next: SaleSearchFilters) {
    const id = ++requestId.current;
    startTransition(async () => {
      const data = await searchReturnableSales(next);
      if (id === requestId.current) setResult(data);
    });
  }

  // Debounced search whenever a filter changes.
  useEffect(() => {
    const timer = window.setTimeout(() => run(filters), filters.query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const set = (patch: Partial<SaleSearchFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const hasFilters = Boolean(filters.query || filters.from || filters.to || filters.saleType);

  return (
    <Modal
      title="Find the sale"
      subtitle="Search by sale #, customer, phone number, IMEI or item — then pick the sale being returned."
      size="xl"
      onClose={onClose}
      flush
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {quickAddSale ? (
            showQuick ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData();
                  formData.set("subtotal", quickTotal);
                  startTransition(async () => {
                    await quickAddSale(formData);
                    setShowQuick(false);
                    setQuickTotal("");
                    run({ onlyReturnable: false });
                    setFilters({ onlyReturnable: false });
                  });
                }}
              >
                <input type="number" min={0} step="0.01" required value={quickTotal} onChange={(event) => setQuickTotal(event.target.value)} placeholder="Sale total" className={`${modalField.input} w-36`} />
                <button className="btn btn-sm btn-primary" disabled={pending}>Add sale</button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowQuick(false)}>Cancel</button>
              </form>
            ) : (
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowQuick(true)} title="Record a sale that isn't in the system (total only) so a return can be linked to it">
                + Add sale
              </button>
            )
          ) : (
            <span />
          )}
          <button type="button" className={modalButton.secondary} onClick={onClose}>Close</button>
        </div>
      }
    >
      <div className="sticky top-0 z-10 grid gap-2 border-b border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <input autoFocus value={filters.query ?? ""} onChange={(event) => set({ query: event.target.value })} placeholder="Sale #, customer, phone, IMEI, model…" className={modalField.input} />
        <label className="flex items-center gap-1 text-xs text-slate-600">
          From
          <input type="date" value={filters.from ?? ""} onChange={(event) => set({ from: event.target.value || undefined })} className={`${modalField.input} sm:w-36`} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          To
          <input type="date" value={filters.to ?? ""} onChange={(event) => set({ to: event.target.value || undefined })} className={`${modalField.input} sm:w-36`} />
        </label>
        <select value={filters.saleType ?? ""} onChange={(event) => set({ saleType: event.target.value || undefined })} className={`${modalField.input} sm:w-32`}>
          <option value="">All types</option>
          <option value="Retail">Retail</option>
          <option value="Wholesale">Wholesale</option>
        </select>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 sm:col-span-4">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={Boolean(filters.onlyReturnable)} onChange={(event) => set({ onlyReturnable: event.target.checked })} />
            Only sales with items left to return
          </label>
          {hasFilters ? (
            <button type="button" className="underline" onClick={() => setFilters({ onlyReturnable: filters.onlyReturnable })}>
              Clear filters
            </button>
          ) : null}
          <span className="ml-auto">{pending ? "Searching…" : result ? `${result.sales.length}${result.more ? "+" : ""} sale${result.sales.length === 1 ? "" : "s"}` : ""}</span>
        </div>
      </div>

      <div className="grid gap-2 p-3">
        {result?.sales.map((sale) => (
          <button
            key={sale.id}
            type="button"
            onClick={() => onPick(sale)}
            className="grid gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm transition hover:border-slate-400 hover:bg-slate-50"
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">{sale.saleNumber}</span>
              <span className="text-slate-700">{formatMoney(sale.total)}</span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
              <span>{sale.date}</span>
              <span>{sale.customer ? `${sale.customer}${sale.customerPhone ? ` · ${sale.customerPhone}` : ""}` : "Walk-in"}</span>
              <span>{sale.saleType}</span>
              {sale.status !== "Completed" ? <span className="font-medium text-amber-800">{sale.status}</span> : null}
            </span>
            {sale.items.length ? (
              <span className="text-xs text-slate-700">
                {sale.items.slice(0, 3).map((item) => item.label).join(" · ")}
                {sale.items.length > 3 ? ` · +${sale.items.length - 3} more` : ""}
              </span>
            ) : (
              <span className="text-xs text-slate-500">Nothing left to return on this sale</span>
            )}
          </button>
        ))}
        {result && !result.sales.length && !pending ? <p className="px-1 py-6 text-center text-sm text-slate-600">No sales match these filters.</p> : null}
        {result?.more ? <p className="text-center text-xs text-slate-500">Showing the newest 60 — narrow the search or date range to find older sales.</p> : null}
      </div>
    </Modal>
  );
}
