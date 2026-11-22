"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Eye } from "lucide-react";
import { Modal, modalButton } from "@/components/ui/modal";
import { EntityEditButton } from "@/components/ui/entity-editor";
import { SpecChips } from "@/components/ui/spec-chips";
import { peekEntity, updateEntityAction } from "@/lib/entity-peek-actions";
import type { EntityKind, PeekData } from "@/lib/entity-peek-types";

const KIND_LABEL: Record<EntityKind, string> = {
  lot: "Lot",
  supplier: "Supplier",
  customer: "Customer",
  model: "Phone model",
  variant: "Variant",
  accessory: "Accessory",
  phone: "Phone unit",
  sale: "Sale",
};

function PeekDialog({ kind, id, onClose }: { kind: EntityKind; id: string; onClose: () => void }) {
  // A fact can itself link to another record (e.g. a unit's lot); that opens in place.
  const [target, setTarget] = useState({ kind, id });
  const [data, setData] = useState<PeekData | null | undefined>(undefined);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    peekEntity(target.kind, target.id).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [target, reload]);

  return (
    <Modal
      title={data?.title ?? KIND_LABEL[target.kind]}
      subtitle={data ? `${KIND_LABEL[target.kind]}${data.subtitle ? ` · ${data.subtitle}` : ""}${data.deleted ? " · deleted" : ""}` : "Loading…"}
      icon={<Eye className="size-4" />}
      onClose={onClose}
      footer={
        <>
          {data?.edit ? (
            <EntityEditButton
              title={data.edit.title}
              fields={data.edit.fields}
              hidden={{ __kind: data.kind, __id: data.id }}
              action={async (formData) => {
                const result = await updateEntityAction(formData);
                if (result.ok) setReload((value) => value + 1);
                return result;
              }}
              username={data.username}
              buttonClassName={modalButton.secondary}
            />
          ) : null}
          {data && !data.deleted ? (
            <Link href={data.href} onClick={onClose} className={`${modalButton.primary} inline-flex items-center gap-1.5`}>
              Open page <ArrowUpRight className="size-4" />
            </Link>
          ) : null}
        </>
      }
    >
      {data === undefined ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="skeleton-shimmer h-9 rounded-lg" />
          ))}
        </div>
      ) : data === null ? (
        <p className="text-sm text-slate-500">This record couldn&apos;t be found — it may have been deleted permanently.</p>
      ) : (
        <div className="grid gap-3">
          {data.chips ? <SpecChips {...data.chips} size="sm" className="flex" /> : null}
          <dl className="grid gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-3 text-sm sm:grid-cols-2">
            {data.facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-xs text-slate-500">{fact.label}</dt>
                <dd className="break-words font-medium text-slate-900">
                  {fact.link ? (
                    <button type="button" onClick={() => setTarget(fact.link!)} className="text-left underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">
                      {fact.value}
                    </button>
                  ) : (
                    fact.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {target.kind !== kind || target.id !== id ? (
            <button type="button" onClick={() => setTarget({ kind, id })} className="justify-self-start text-xs text-slate-600 underline">
              ← Back to {KIND_LABEL[kind].toLowerCase()}
            </button>
          ) : null}
          {data.editHint ? <p className="text-xs text-slate-500">{data.editHint}</p> : null}
          {data.edit ? <p className="text-xs text-slate-500">Edit changes everyday details directly; fields marked sensitive need a review and your password.</p> : null}
        </div>
      )}
    </Modal>
  );
}

/**
 * A reference to another record (lot, supplier, customer, variant…). Clicking opens a details
 * popup with an Edit option and a link to the full page — instead of navigating away.
 */
export function EntityLink({ kind, id, children, className }: { kind: EntityKind; id: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={className ?? "text-left font-medium text-slate-800 underline decoration-slate-300 decoration-dotted underline-offset-2 transition hover:decoration-slate-900"}
        title={`View ${KIND_LABEL[kind].toLowerCase()} details`}
      >
        {children}
      </button>
      {open ? <PeekDialog kind={kind} id={id} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
