import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { StatusPill } from "@/components/ui/spec-chips";

/** The live unit that already holds an IMEI. */
export type ImeiOwner = { imei: string; phone: string; lotId: string; lotNumber: string; status: string };

/**
 * Explains why an IMEI can't be used: the rule, and the phone that already has it (with a
 * link to its lot) — or that it's already queued in the current batch.
 */
export function ImeiConflictNotice({ imei, owner, batchLine }: { imei: string; owner?: ImeiOwner | null; batchLine?: number | null }) {
  if (!owner && !batchLine) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="size-3.5 shrink-0" />
        {owner ? <>IMEI {imei} is already registered</> : <>IMEI {imei} is already in this batch</>}
      </p>
      {owner ? (
        <>
          <div className="mt-1.5 grid gap-1 rounded-md bg-white/80 px-2.5 py-2 text-slate-700">
            <p className="font-medium text-slate-900">{owner.phone}</p>
            <p className="flex flex-wrap items-center gap-2">
              <span>Lot {owner.lotNumber}</span>
              <StatusPill status={owner.status} />
            </p>
          </div>
          <p className="mt-1.5 leading-relaxed">
            Why: an IMEI identifies one physical phone, so only one active unit can have it — otherwise sales, returns and warranty lookups would match the wrong phone.
            If this is the same phone, there&apos;s nothing to add. If the other entry is a mistake, archive it or correct its IMEI first.
          </p>
          <Link href={`/lots/${owner.lotId}`} className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 font-semibold text-red-800 hover:bg-red-200">
            Go to lot {owner.lotNumber} <ArrowRight className="size-3" />
          </Link>
        </>
      ) : (
        <p className="mt-1 leading-relaxed">It&apos;s already queued as line {batchLine} below — each phone can only be added once. Remove that line if it was wrong.</p>
      )}
    </div>
  );
}
