"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Ban, Lock } from "lucide-react";
import { Modal, modalButton } from "@/components/ui/modal";
import { RestoreIssueList } from "@/components/ui/restore-button";
import type { LotRestoreUnit, RestoreIssue, RestoreResult } from "@/lib/recycle-bin";

/**
 * "Restore…" for a deleted lot: pick which of its deleted units come back with it. The lot is
 * always restored (units can't exist without it); units blocked by a conflict can't be picked.
 */
export function LotRestoreDialog({
  lotId,
  title,
  lotIssues,
  units,
  action,
}: {
  lotId: string;
  title: string;
  lotIssues: RestoreIssue[];
  units: LotRestoreUnit[];
  action: (formData: FormData) => Promise<RestoreResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const selectable = useMemo(() => units.filter((unit) => !unit.blocked), [units]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(selectable.filter((unit) => unit.withLot).map((unit) => unit.id)));
  const [result, setResult] = useState<{ error: string; issues: RestoreIssue[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pick = (filter: (unit: LotRestoreUnit) => boolean) => setChosen(new Set(selectable.filter(filter).map((unit) => unit.id)));

  function submit() {
    const formData = new FormData();
    formData.set("lotId", lotId);
    Array.from(chosen).forEach((id) => formData.append("unitId", id));
    startTransition(async () => {
      const response = await action(formData);
      if (!response.ok) {
        setResult({ error: response.error, issues: response.issues ?? [{ level: "block", message: response.error }] });
        return;
      }
      toast.success(response.message || "Restored");
      setOpen(false);
      router.refresh();
    });
  }

  const statuses = Array.from(new Set(selectable.map((unit) => unit.status)));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-xs btn-success">
        Restore…
      </button>
      {open ? (
        <Modal
          title={`Restore ${title}`}
          subtitle="Choose which of its deleted units come back with it."
          size="lg"
          busy={pending}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className={modalButton.secondary}>Cancel</button>
              <button type="button" onClick={submit} disabled={pending || lotIssues.length > 0} className={modalButton.primary}>
                {pending ? "Restoring…" : `Restore lot + ${chosen.size} unit${chosen.size === 1 ? "" : "s"}`}
              </button>
            </>
          }
        >
          <div className="grid gap-3 text-sm">
            {lotIssues.length ? <RestoreIssueList issues={lotIssues} /> : null}
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <input type="checkbox" checked disabled className="mt-0.5" aria-label="Lot (always restored)" />
              <span>
                <span className="font-medium text-slate-900">{title}</span>
                <span className="block text-xs text-slate-600">
                  <Lock className="mr-1 inline size-3" />
                  Always restored — units can&apos;t come back without their lot. Its supplier payments and accessory batches come back with it.
                </span>
              </span>
            </div>

            {units.length ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500">Select:</span>
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => pick(() => true)}>All</button>
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => setChosen(new Set())}>None (lot only)</button>
                  <button type="button" className="btn btn-xs btn-secondary" onClick={() => pick((unit) => unit.withLot)}>Deleted with the lot</button>
                  {statuses.map((status) => (
                    <button key={status} type="button" className="btn btn-xs btn-secondary" onClick={() => pick((unit) => unit.status === status)}>
                      Only {status}
                    </button>
                  ))}
                </div>
                <ul className="grid max-h-[50vh] gap-1 overflow-y-auto pr-1">
                  {units.map((unit) => (
                    <li key={unit.id}>
                      <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${unit.blocked ? "cursor-not-allowed border-red-200 bg-red-50" : "cursor-pointer border-slate-200 hover:bg-slate-50"}`}>
                        <input type="checkbox" className="mt-0.5" disabled={Boolean(unit.blocked)} checked={chosen.has(unit.id)} onChange={() => toggle(unit.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="font-medium text-slate-900">{unit.name}</span>
                            <span className="font-mono text-xs text-slate-600">{unit.imei}</span>
                          </span>
                          <span className="block text-xs text-slate-600">
                            {unit.status}
                            {unit.soldIn.length ? ` · sold in ${unit.soldIn.join(", ")}` : ""}
                            {unit.withLot ? "" : " · archived separately before the lot was deleted"}
                          </span>
                          {unit.blocked ? (
                            <span className="mt-1 flex items-start gap-1 text-xs font-medium text-red-800">
                              <Ban className="mt-0.5 size-3 shrink-0" /> Can&apos;t restore: {unit.blocked}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-slate-600">This lot has no deleted units.</p>
            )}

            {result ? (
              <div className="grid gap-1.5">
                <p className="font-medium text-red-800">{result.error}</p>
                <RestoreIssueList issues={result.issues} />
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
