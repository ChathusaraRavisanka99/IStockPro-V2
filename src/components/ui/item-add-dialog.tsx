"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, MessageSquare, Minus, Pencil, Plus } from "lucide-react";
import { modalField } from "@/components/ui/modal";
import type { PriceEditResult } from "@/lib/item-price-actions";
import { CommentList } from "@/components/items/item-comments";
import { formatMoney } from "@/lib/currency";
import { Modal, modalButton } from "@/components/ui/modal";

type Props = {
  name: string;
  details: { label: string; value: string }[];
  retailPrice: number;
  wholesalePrice?: number;
  /** Cost figures — only passed for roles allowed to see cost. */
  cost?: { unitCost: number; totalCost: number; breakdown?: { label: string; amount: number }[] };
  priceMode: "Retail" | "Wholesale";
  quantity: string;
  onQuantityChange: (value: string) => void;
  /** Units still addable (stock minus what's already in the cart); undefined = unlimited. */
  remaining?: number;
  notes?: string | null;
  /** Internal seller-only comments (latest first). */
  comments?: { id: string; author: string; at: string; text: string }[];
  /** Managers: set retail/wholesale (and notes) right here; detailsHref edits everything else. */
  priceEditor?: {
    requiresPassword: boolean;
    detailsHref: string;
    onSave: (values: { retailPrice: number; wholesalePrice: number; notes: string | null; confirmUsername?: string; confirmPassword?: string }) => Promise<PriceEditResult>;
  };
  onConfirm: () => void;
  onCancel: () => void;
};

function margin(price: number, cost: number) {
  if (price <= 0) return null;
  return ((price - cost) / price) * 100;
}

function PriceOption({ label, price, cost, active }: { label: string; price: number; cost?: number; active: boolean }) {
  const pct = cost !== undefined ? margin(price, cost) : null;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}>
      <p className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
        {label}
        {active ? " · applied" : ""}
      </p>
      <p className="mt-0.5 text-base font-semibold">{formatMoney(price)}</p>
      {pct !== null ? <p className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{pct.toFixed(1)}% margin</p> : null}
    </div>
  );
}

export function ItemAddDialog({ name, details, retailPrice, wholesalePrice, cost, priceMode, quantity, onQuantityChange, remaining, notes, comments, priceEditor, onConfirm, onCancel }: Props) {
  const appliedPrice = priceMode === "Wholesale" && wholesalePrice !== undefined ? wholesalePrice : retailPrice;
  const priceMissing = appliedPrice <= 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ retail: String(retailPrice || ""), wholesale: String(wholesalePrice || ""), notes: notes ?? "" });
  const [creds, setCreds] = useState({ username: "", password: "" });
  const [saveError, setSaveError] = useState<{ message: string; field?: string } | null>(null);
  const [saving, startSaving] = useTransition();

  // Same rules as the server (item-price-actions), shown while typing.
  const retailValue = Number(draft.retail);
  const wholesaleValue = draft.wholesale.trim() === "" ? 0 : Number(draft.wholesale);
  const fieldErrors = {
    retail: !draft.retail.trim() || !Number.isFinite(retailValue) || retailValue <= 0 ? "Enter a retail price greater than 0." : retailValue > 100_000_000 ? "That looks too large." : null,
    wholesale: !Number.isFinite(wholesaleValue) || wholesaleValue < 0 ? "Can't be negative." : wholesaleValue > retailValue && retailValue > 0 ? "Can't be higher than retail." : null,
  };
  const belowCost = cost && retailValue > 0 && retailValue < cost.totalCost;
  const pricesChanged = Math.abs(retailValue - retailPrice) >= 0.005 || Math.abs(wholesaleValue - (wholesalePrice ?? 0)) >= 0.005;
  const needsPassword = Boolean(priceEditor?.requiresPassword && pricesChanged);

  function startEdit() {
    setDraft({ retail: retailPrice > 0 ? String(retailPrice) : "", wholesale: wholesalePrice ? String(wholesalePrice) : "", notes: notes ?? "" });
    setSaveError(null);
    setEditing(true);
  }

  function savePrices() {
    if (!priceEditor || fieldErrors.retail || fieldErrors.wholesale) return;
    startSaving(async () => {
      const result = await priceEditor.onSave({
        retailPrice: retailValue,
        wholesalePrice: wholesaleValue,
        notes: draft.notes.trim() || null,
        ...(needsPassword ? { confirmUsername: creds.username, confirmPassword: creds.password } : {}),
      });
      if (!result.ok) {
        setSaveError({ message: result.error, field: result.field });
        return;
      }
      setSaveError(null);
      setEditing(false);
      setCreds({ username: "", password: "" });
    });
  }
  const qty = Math.max(1, Number(quantity) || 1);
  const overStock = remaining !== undefined && qty > remaining;
  const step = (delta: number) => {
    const next = Math.max(1, qty + delta);
    onQuantityChange(String(remaining !== undefined ? Math.min(next, Math.max(1, remaining)) : next));
  };

  return (
    <Modal
      title={name}
      subtitle={remaining !== undefined ? `${remaining} available to add` : undefined}
      onClose={onCancel}
      footer={
        <>
          <div className="mr-auto flex items-center rounded-lg border border-slate-300 bg-white">
            <button type="button" onClick={() => step(-1)} aria-label="Decrease quantity" className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-40" disabled={qty <= 1}>
              <Minus className="size-4" />
            </button>
            <input
              type="number"
              min={1}
              max={remaining}
              value={quantity}
              data-autofocus
              aria-label="Quantity"
              onChange={(event) => onQuantityChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !overStock) onConfirm();
              }}
              className="w-14 border-x border-slate-200 py-1.5 text-center text-sm outline-none"
            />
            <button type="button" onClick={() => step(1)} aria-label="Increase quantity" className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-40" disabled={remaining !== undefined && qty >= remaining}>
              <Plus className="size-4" />
            </button>
          </div>
          <button type="button" onClick={onCancel} className={modalButton.secondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={overStock || priceMissing || editing} title={priceMissing ? "Set a price first" : undefined} className={modalButton.primary}>
            Add {qty > 1 ? `${qty} · ${formatMoney(appliedPrice * qty)}` : "to cart"}
          </button>
        </>
      }
    >
      <div className={`grid gap-2 ${wholesalePrice !== undefined ? "grid-cols-2" : "grid-cols-1"}`}>
        <PriceOption label="Retail" price={retailPrice} cost={cost?.totalCost} active={priceMode === "Retail"} />
        {wholesalePrice !== undefined ? <PriceOption label="Wholesale" price={wholesalePrice} cost={cost?.totalCost} active={priceMode === "Wholesale"} /> : null}
      </div>

      {priceMissing && !editing ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0" /> {priceMode} price not set — it can&apos;t be added to the bill at LKR 0.
          </span>
          {priceEditor ? (
            <button type="button" onClick={startEdit} className="btn btn-xs btn-primary">
              Set price
            </button>
          ) : (
            <span className="text-xs">Ask a manager to set it.</span>
          )}
        </div>
      ) : null}

      {priceEditor && !editing ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {!priceMissing ? (
            <button type="button" onClick={startEdit} className="btn btn-xs btn-secondary">
              <Pencil /> Edit prices
            </button>
          ) : null}
          <Link href={priceEditor.detailsHref} className="btn btn-xs btn-secondary" title="Opens the item's page — your bill is kept and you can come back">
            <ExternalLink /> Edit full details
          </Link>
        </div>
      ) : null}

      {editing && priceEditor ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Set prices</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={modalField.label}>
              Retail price (LKR)
              <input type="number" min={0} step="0.01" inputMode="decimal" data-autofocus value={draft.retail} onChange={(event) => setDraft((d) => ({ ...d, retail: event.target.value }))} aria-invalid={Boolean(fieldErrors.retail)} className={`${modalField.input} ${fieldErrors.retail && draft.retail ? "border-red-400" : ""}`} />
              {fieldErrors.retail && draft.retail ? <span className="text-xs font-normal text-red-700">{fieldErrors.retail}</span> : null}
            </label>
            <label className={modalField.label}>
              Wholesale price (LKR, optional)
              <input type="number" min={0} step="0.01" inputMode="decimal" value={draft.wholesale} onChange={(event) => setDraft((d) => ({ ...d, wholesale: event.target.value }))} aria-invalid={Boolean(fieldErrors.wholesale)} className={`${modalField.input} ${fieldErrors.wholesale ? "border-red-400" : ""}`} />
              {fieldErrors.wholesale ? <span className="text-xs font-normal text-red-700">{fieldErrors.wholesale}</span> : null}
            </label>
          </div>
          {cost && retailValue > 0 ? (
            <p className={`text-xs ${belowCost ? "font-medium text-red-700" : "text-slate-600"}`}>
              {belowCost ? "⚠ Below cost — " : ""}Cost {formatMoney(cost.totalCost)} · retail margin {(((retailValue - cost.totalCost) / retailValue) * 100).toFixed(1)}%
              {wholesaleValue > 0 ? ` · wholesale margin ${(((wholesaleValue - cost.totalCost) / wholesaleValue) * 100).toFixed(1)}%` : ""}
            </p>
          ) : null}
          <label className={modalField.label}>
            Notes (shown to staff when selling)
            <input value={draft.notes} onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))} maxLength={500} className={modalField.input} />
          </label>
          {needsPassword ? (
            <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 sm:grid-cols-2">
              <p className="text-xs text-amber-900 sm:col-span-2">Changing this price needs your password.</p>
              <input value={creds.username} onChange={(event) => setCreds((c) => ({ ...c, username: event.target.value }))} placeholder="Username" autoComplete="username" className={modalField.input} />
              <input type="password" value={creds.password} onChange={(event) => setCreds((c) => ({ ...c, password: event.target.value }))} placeholder="Password" autoComplete="current-password" className={`${modalField.input} ${saveError?.field === "password" ? "border-red-400" : ""}`} />
            </div>
          ) : null}
          {saveError ? <p className="text-xs text-red-700">{saveError.message}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="btn btn-sm btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={savePrices} disabled={saving || Boolean(fieldErrors.retail || fieldErrors.wholesale) || (needsPassword && (!creds.username || !creds.password))} className="btn btn-sm btn-primary">
              {saving ? "Saving…" : "Save prices"}
            </button>
          </div>
        </div>
      ) : null}

      {notes ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Note:</span> {notes}
        </p>
      ) : null}

      {comments?.length ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-sky-900">
            <MessageSquare className="size-3.5" /> Team comments <span className="font-normal text-sky-700">· internal, not shown to the customer</span>
          </p>
          <CommentList rows={comments.map((comment) => ({ ...comment, authorId: null }))} />
        </div>
      ) : null}

      {details.length ? (
        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm sm:grid-cols-2">
          {details.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 sm:block">
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className="text-right font-medium text-slate-900 sm:text-left">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {cost ? (
        <div className="mt-4 grid gap-1.5 text-sm text-slate-700">
          <p className="flex justify-between">
            <span>Unit cost</span>
            <span>{formatMoney(cost.unitCost)}</span>
          </p>
          {(cost.breakdown ?? [])
            .filter((entry) => entry.amount !== 0)
            .map((entry) => (
              <p key={entry.label} className="flex justify-between pl-3 text-xs text-slate-500">
                <span>+ {entry.label}</span>
                <span>{formatMoney(entry.amount)}</span>
              </p>
            ))}
          <p className="flex justify-between font-medium text-slate-900">
            <span>Total cost</span>
            <span>{formatMoney(cost.totalCost)}</span>
          </p>
          <p className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
            <span>Profit at {priceMode.toLowerCase()}</span>
            <span className={appliedPrice - cost.totalCost >= 0 ? "text-emerald-700" : "text-red-700"}>
              {appliedPrice - cost.totalCost >= 0 ? "▲" : "▼"} {formatMoney(appliedPrice - cost.totalCost)}
              {appliedPrice > 0 ? ` (${(((appliedPrice - cost.totalCost) / appliedPrice) * 100).toFixed(1)}%)` : ""}
            </span>
          </p>
        </div>
      ) : null}

      {overStock ? <p className="mt-3 text-xs text-red-700">Only {remaining} available.</p> : null}
    </Modal>
  );
}
