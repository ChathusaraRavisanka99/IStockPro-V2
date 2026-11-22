import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RestoreButton, RestoreIssueList } from "@/components/ui/restore-button";
import { formatPhoneName } from "@/lib/format-item-name";
import { SOFT_DELETE_RETENTION_DAYS } from "@/lib/purge";
import { checkRestore, daysLeft, originalLotNumber, restoreItem, retentionCutoff, type RecycleKind, type RestoreIssue, type RestoreResult } from "@/lib/recycle-bin";

const KINDS: RecycleKind[] = ["lot", "phone", "variant", "model", "customer", "supplier", "accessory"];

type Row = { kind: RecycleKind; id: string; title: string; detail: string; deletedAt: Date };

const KIND_LABELS: Record<RecycleKind, string> = {
  lot: "Lots",
  phone: "Phone units",
  variant: "Phone variants",
  model: "Phone models",
  customer: "Customers",
  supplier: "Suppliers",
  accessory: "Accessories",
};

export default async function RecycleBinPage({ searchParams }: { searchParams: { type?: string } }) {
  const session = await getServerSession(authOptions);
  const allowed = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  if (!allowed) {
    return (
      <div>
        <PageHeader title="Recycle Bin" subtitle="Recover recently deleted records" />
        <Card>
          <p className="text-sm text-slate-600">Only admins and managers can view and restore deleted records.</p>
        </Card>
      </div>
    );
  }

  const typeFilter = KINDS.includes(searchParams.type as RecycleKind) ? (searchParams.type as RecycleKind) : null;
  const recent = { deletedAt: { not: null, gte: retentionCutoff() } };

  const [lots, phones, variants, models, customers, suppliers, accessories] = await Promise.all([
    prisma.lot.findMany({ where: recent, include: { supplier: true, _count: { select: { phones: true } } } }),
    prisma.phone.findMany({ where: recent, include: { lot: true, phoneVariant: { include: { phoneModel: true } } } }),
    prisma.phoneVariant.findMany({ where: recent, include: { phoneModel: true } }),
    prisma.phoneModel.findMany({ where: recent }),
    prisma.customer.findMany({ where: recent }),
    prisma.supplier.findMany({ where: recent }),
    prisma.accessory.findMany({ where: recent }),
  ]);

  const rows: Row[] = [
    ...lots.map((lot) => ({ kind: "lot" as const, id: lot.id, title: `Lot ${originalLotNumber(lot.lotNumber)}`, detail: `${lot.supplier.name} · ${lot._count.phones} unit(s) · started ${lot.purchaseDate.toISOString().slice(0, 10)}`, deletedAt: lot.deletedAt! })),
    ...phones.map((phone) => ({ kind: "phone" as const, id: phone.id, title: `IMEI ${phone.imei}`, detail: `${formatPhoneName(phone.phoneVariant)} · lot ${originalLotNumber(phone.lot.lotNumber)} · ${phone.status}`, deletedAt: phone.deletedAt! })),
    ...variants.map((variant) => ({ kind: "variant" as const, id: variant.id, title: formatPhoneName(variant), detail: "Phone variant", deletedAt: variant.deletedAt! })),
    ...models.map((model) => ({ kind: "model" as const, id: model.id, title: `${model.brand} ${model.modelName}`, detail: "Phone model", deletedAt: model.deletedAt! })),
    ...customers.map((customer) => ({ kind: "customer" as const, id: customer.id, title: customer.name, detail: [customer.phone, customer.email].filter(Boolean).join(" · ") || "Customer", deletedAt: customer.deletedAt! })),
    ...suppliers.map((supplier) => ({ kind: "supplier" as const, id: supplier.id, title: supplier.name, detail: [supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Supplier", deletedAt: supplier.deletedAt! })),
    ...accessories.map((item) => ({ kind: "accessory" as const, id: item.id, title: item.name, detail: `${item.category} · SKU ${item.sku}`, deletedAt: item.deletedAt! })),
  ].sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  // Constraint pre-check, so conflicts show next to each item before anyone clicks Restore.
  const issuesByRow = new Map<string, RestoreIssue[]>(
    await Promise.all(
      rows
        .filter((row) => row.kind === "lot" || row.kind === "phone" || row.kind === "variant")
        .map(async (row) => [`${row.kind}-${row.id}`, await checkRestore(row.kind, row.id)] as const)
    )
  );

  const counts = KINDS.map((kind) => ({ kind, count: rows.filter((row) => row.kind === kind).length }));
  const visible = typeFilter ? rows.filter((row) => row.kind === typeFilter) : rows;

  async function restore(formData: FormData): Promise<RestoreResult> {
    "use server";
    const actor = await getServerSession(authOptions);
    if (!canViewCost(actor?.user?.role as "admin" | "manager" | "staff" | undefined)) return { ok: false, error: "Not allowed." };
    const kind = String(formData.get("kind") || "") as RecycleKind;
    const id = String(formData.get("id") || "");
    const result = await restoreItem(kind, id);
    if (result.ok) {
      await prisma.auditLog.create({ data: { action: "Restore", entityType: kind, entityId: id, userId: actor?.user?.id || null, details: {} } });
      for (const path of ["/recycle-bin", "/lots", "/items/phones", "/items/phone-catalog", "/customers", "/suppliers", "/dashboard"]) revalidatePath(path);
    }
    return result;
  }

  return (
    <div>
      <PageHeader
        title="Recycle Bin"
        subtitle={`Deleted records you can still recover — each is permanently removed ${SOFT_DELETE_RETENTION_DAYS} days after deletion`}
        help={
          <p>
            Anything deleted or archived in the last {SOFT_DELETE_RETENTION_DAYS} days is listed here. Restore puts it back exactly as it was. Restoring a lot also brings back the units that were
            deleted with it. Anything that would break a rule (an IMEI or lot number now used by another record, or a lot/variant/model that is still deleted) is listed under the item in red before you restore — fix it, or restore the parent first.
          </p>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <a href="/recycle-bin" className={`rounded-full border px-3 py-1 text-sm ${!typeFilter ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>
          All ({rows.length})
        </a>
        {counts.map(({ kind, count }) => (
          <a key={kind} href={`/recycle-bin?type=${kind}`} className={`rounded-full border px-3 py-1 text-sm ${typeFilter === kind ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>
            {KIND_LABELS[kind]} ({count})
          </a>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">Deleted</th>
                <th className="px-2 py-2">Permanently deleted in</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const left = daysLeft(row.deletedAt);
                return (
                  <tr key={`${row.kind}-${row.id}`} id={`${row.kind}-${row.id}`} className="scroll-mt-24 border-b border-slate-200 align-top transition-colors target:bg-amber-50 target:ring-2 target:ring-inset target:ring-amber-300">
                    <td className="whitespace-nowrap px-2 py-2 text-slate-600">{KIND_LABELS[row.kind]}</td>
                    <td className="px-2 py-2">
                      <p className="font-medium text-slate-900">{row.title}</p>
                      <p className="text-xs text-slate-500">{row.detail}</p>
                      {issuesByRow.get(`${row.kind}-${row.id}`)?.length ? (
                        <div className="mt-1.5 max-w-xl">
                          <RestoreIssueList issues={issuesByRow.get(`${row.kind}-${row.id}`)!} />
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{row.deletedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className={`whitespace-nowrap px-2 py-2 ${left <= 3 ? "font-medium text-red-700" : "text-slate-700"}`}>{left} day{left === 1 ? "" : "s"}</td>
                    <td className="px-2 py-2">
                      <RestoreButton kind={row.kind} id={row.id} label={row.title} action={restore} />
                    </td>
                  </tr>
                );
              })}
              {!visible.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={5}>
                    Nothing deleted in the last {SOFT_DELETE_RETENTION_DAYS} days.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
