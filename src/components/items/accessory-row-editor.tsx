"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { formatMoney } from "@/lib/currency";
import { CostRow, CostCard } from "@/components/ui/cost-breakdown-modal";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";

type Accessory = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  soldQuantity: number;
  lowStockThreshold: number;
  purchasePrice: unknown;
  wholesalePrice: unknown;
  retailPrice: unknown;
  connectorType: string | null;
  voltage: string | null;
  fastCharging: boolean;
  notes: string | null;
  expenses?: { category: string; description: string | null; amount: unknown; expenseDate: string | Date }[];
};

type Props = {
  item: Accessory;
  updateAction: (formData: FormData) => Promise<ActionResult>;
  archiveAction: (formData: FormData) => void | Promise<void>;
};

function EditForm({ item, error, pending, onSubmit, cancel }: { item: Accessory; error: string | null; pending: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; cancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <input type="hidden" name="id" value={item.id} />
      <label className="grid min-w-0 gap-1 text-xs text-slate-600">
        Name
        <input name="name" required defaultValue={item.name} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-600">
        SKU
        <input name="sku" required defaultValue={item.sku} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-600">
        Low stock threshold
        <input name="lowStockThreshold" type="number" min={0} defaultValue={item.lowStockThreshold} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-600">
        Purchase price
        <input name="purchasePrice" type="number" step="0.01" min={0} defaultValue={Number(item.purchasePrice)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-600">
        Wholesale price
        <input name="wholesalePrice" type="number" step="0.01" min={0} defaultValue={Number(item.wholesalePrice)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-600">
        Retail price
        <input name="retailPrice" type="number" step="0.01" min={0} defaultValue={Number(item.retailPrice)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      {error ? <p className="col-span-full text-xs text-red-700">{error}</p> : null}
      <div className="flex items-end gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-60">
          {pending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={cancel} className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AccessoryTableRow({ item, updateAction, archiveAction }: Props) {
  const { editing, error, pending, open, cancel, handleSubmit } = useEditableRow(updateAction);
  const editRowRef = useRef<HTMLTableRowElement>(null);

  // This table lives in a horizontally-scrolling wrapper (more columns than fit on
  // mobile) — the "Edit" button sits in the last column, so on a phone the wrapper is
  // already scrolled right when it's clicked. Without this, the edit form's own fields
  // (leftmost columns) render off-screen and the user has to notice and swipe back.
  useEffect(() => {
    if (editing) editRowRef.current?.scrollIntoView({ inline: "start", block: "nearest" });
  }, [editing]);

  if (editing) {
    return (
      <tr ref={editRowRef} className="border-b border-slate-200 bg-slate-50">
        <td className="px-2 py-2" colSpan={10}>
          <EditForm item={item} error={error} pending={pending} onSubmit={handleSubmit} cancel={cancel} />
        </td>
      </tr>
    );
  }

  return (
    <CostRow
      className="border-b border-slate-200"
      data={{
        name: `${item.name} (${item.sku})`,
        unitCost: Number(item.purchasePrice),
        totalCost: Number(item.purchasePrice),
        wholesalePrice: Number(item.wholesalePrice),
        retailPrice: Number(item.retailPrice),
        details: [
          { label: "Name", value: item.name },
          { label: "SKU", value: item.sku },
          ...(item.connectorType || item.voltage || item.fastCharging
            ? [{ label: "Specs", value: [item.connectorType, item.voltage, item.fastCharging ? "Fast charging" : null].filter(Boolean).join(" · ") }]
            : []),
          { label: "In stock", value: String(item.quantity) },
          { label: "Sold", value: String(item.soldQuantity) },
          { label: "Low stock threshold", value: String(item.lowStockThreshold) },
          ...(item.notes ? [{ label: "Notes", value: item.notes }] : []),
        ],
        expenses: (item.expenses ?? []).map((expense) => ({
          label: expense.category + (expense.description ? ` — ${expense.description}` : ""),
          amount: Number(expense.amount),
          date: new Date(expense.expenseDate).toISOString().slice(0, 10),
        })),
      }}
    >
      <td className="px-2 py-2">{item.name}</td>
      <td className="px-2 py-2">{item.sku}</td>
      <td className="px-2 py-2 text-xs text-slate-600">
        {[item.connectorType, item.voltage, item.fastCharging ? "Fast charging" : null].filter(Boolean).join(" · ") || "-"}
      </td>
      <td className="px-2 py-2">{item.quantity}</td>
      <td className="px-2 py-2">{item.soldQuantity}</td>
      <td className="px-2 py-2">{item.lowStockThreshold}</td>
      <td className="px-2 py-2">{formatMoney(Number(item.purchasePrice))}</td>
      <td className="px-2 py-2">{formatMoney(Number(item.wholesalePrice))}</td>
      <td className="px-2 py-2">{formatMoney(Number(item.retailPrice))}</td>
      <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex gap-2">
          <button type="button" onClick={open} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700">
            Edit
          </button>
          <form action={archiveAction}>
            <input type="hidden" name="id" value={item.id} />
            <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button>
          </form>
        </div>
      </td>
    </CostRow>
  );
}

export function AccessoryGridCard({ item, updateAction, archiveAction }: Props) {
  const { editing, error, pending, open, cancel, handleSubmit } = useEditableRow(updateAction);

  if (editing) {
    return <EditForm item={item} error={error} pending={pending} onSubmit={handleSubmit} cancel={cancel} />;
  }

  return (
    <CostCard
      data={{
        name: `${item.name} (${item.sku})`,
        unitCost: Number(item.purchasePrice),
        totalCost: Number(item.purchasePrice),
        wholesalePrice: Number(item.wholesalePrice),
        retailPrice: Number(item.retailPrice),
        details: [
          { label: "Name", value: item.name },
          { label: "SKU", value: item.sku },
          ...(item.connectorType || item.voltage || item.fastCharging
            ? [{ label: "Specs", value: [item.connectorType, item.voltage, item.fastCharging ? "Fast charging" : null].filter(Boolean).join(" · ") }]
            : []),
          { label: "In stock", value: String(item.quantity) },
          { label: "Sold", value: String(item.soldQuantity) },
          { label: "Low stock threshold", value: String(item.lowStockThreshold) },
          ...(item.notes ? [{ label: "Notes", value: item.notes }] : []),
        ],
        expenses: (item.expenses ?? []).map((expense) => ({
          label: expense.category + (expense.description ? ` — ${expense.description}` : ""),
          amount: Number(expense.amount),
          date: new Date(expense.expenseDate).toISOString().slice(0, 10),
        })),
      }}
    >
      <p className="font-semibold text-slate-900">{item.name}</p>
      <p className="mt-1 text-sm text-slate-700">{item.sku}</p>
      {item.connectorType || item.fastCharging || item.voltage ? (
        <p className="mt-1 text-xs text-slate-600">
          {[item.connectorType, item.voltage, item.fastCharging ? "Fast charging" : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <p className="mt-3 text-sm text-slate-700">{item.quantity} in stock | {formatMoney(Number(item.retailPrice))}</p>
      {item.notes ? <p className="mt-1 text-xs italic text-slate-500">{item.notes}</p> : null}
      <div className="mt-3 flex gap-2" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={open} className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700">
          Edit
        </button>
        <form action={archiveAction}>
          <input type="hidden" name="id" value={item.id} />
          <button className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700">Archive</button>
        </form>
      </div>
    </CostCard>
  );
}
