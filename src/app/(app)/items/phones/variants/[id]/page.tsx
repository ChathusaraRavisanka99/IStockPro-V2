import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InfoHelp } from "@/components/ui/info-help";
import { formatMoney } from "@/lib/currency";
import { VariantSpecEditor } from "@/components/items/variant-spec-editor";
import { CostRow } from "@/components/ui/cost-breakdown-modal";
import { NoModalCell } from "@/components/ui/no-modal-cell";
import type { ActionResult } from "@/components/ui/editable-row";

export default async function PhoneVariantDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();
  const showCost = canViewCost(session.user?.role as "admin" | "manager" | "staff" | undefined);

  const variant = await prisma.phoneVariant.findUnique({
    where: { id: params.id },
    include: {
      phoneModel: true,
      phones: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { lot: true } },
    },
  });
  if (!variant) notFound();

  // Expenses (and the popup they feed) are cost-sensitive — only fetch for roles that
  // can already view cost, matching the Purchase Price column gating below.
  const expenseRows = showCost ? await prisma.expense.findMany({ where: { phoneId: { in: variant.phones.map((phone) => phone.id) } }, orderBy: { expenseDate: "desc" } }) : [];
  const expensesByPhone = new Map<string, typeof expenseRows>();
  for (const expense of expenseRows) {
    if (!expense.phoneId) continue;
    const list = expensesByPhone.get(expense.phoneId) ?? [];
    list.push(expense);
    expensesByPhone.set(expense.phoneId, list);
  }

  async function updateVariant(formData: FormData): Promise<ActionResult> {
    "use server";

    const variantName = String(formData.get("variantName") || "").trim();
    if (!variantName) return { ok: false, error: "Variant name is required." };

    await prisma.phoneVariant.update({
      where: { id: params.id },
      data: {
        variantName,
        color: String(formData.get("color") || "").trim() || null,
        storage: String(formData.get("storage") || "").trim() || null,
        ram: String(formData.get("ram") || "").trim() || null,
        screenSize: String(formData.get("screenSize") || "").trim() || null,
        processor: String(formData.get("processor") || "").trim() || null,
        camera: String(formData.get("camera") || "").trim() || null,
        os: String(formData.get("os") || "").trim() || null,
        networkType: String(formData.get("networkType") || "").trim() || null,
        battery: String(formData.get("battery") || "").trim() || null,
        defaultTagCost: Number(formData.get("defaultTagCost") || 0),
        defaultBatteryCost: Number(formData.get("defaultBatteryCost") || 0),
      },
    });

    revalidatePath(`/items/phones/variants/${params.id}`);
    revalidatePath("/items/phone-catalog");
    revalidatePath("/lots");
    return { ok: true };
  }

  const statusCounts = variant.phones.reduce<Record<string, number>>((acc, phone) => {
    acc[phone.status] = (acc[phone.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title={`${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName}`}
        subtitle="Variant specifications and unit inventory"
        help={
          <p>
            Edit this variant&apos;s specs and default tag/battery cost on the left — those defaults pre-fill when
            registering new units of this variant. Every individual unit registered under it is listed below; click a
            row for its cost/profit breakdown.
          </p>
        }
      />
      <div className="mb-4">
        <Link href="/items/phone-catalog" className="text-sm text-slate-700 underline">Back to Catalog</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <VariantSpecEditor
            variant={{
              variantName: variant.variantName,
              color: variant.color,
              storage: variant.storage,
              ram: variant.ram,
              screenSize: variant.screenSize,
              processor: variant.processor,
              camera: variant.camera,
              os: variant.os,
              networkType: variant.networkType,
              battery: variant.battery,
              defaultTagCost: Number(variant.defaultTagCost),
              defaultBatteryCost: Number(variant.defaultBatteryCost),
            }}
            showCost={showCost}
            updateAction={updateVariant}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Stock Summary</h2>
          <div className="grid gap-1.5 text-sm">
            {Object.entries(statusCounts).length ? (
              Object.entries(statusCounts).map(([status, count]) => (
                <p key={status} className="flex justify-between">
                  <span>{status}</span>
                  <span className="font-semibold">{count}</span>
                </p>
              ))
            ) : (
              <p className="text-slate-600">No units registered yet.</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Units
          <InfoHelp size="sm" title="Units">
            Every individual phone of this exact variant, by IMEI. Click a row to see its unit cost, wholesale/retail price, and profit breakdown.
          </InfoHelp>
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">IMEI</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Battery</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Lot</th>
                {showCost ? <th className="px-2 py-2">Purchase Price</th> : null}
                <th className="px-2 py-2">Retail Price</th>
              </tr>
            </thead>
            <tbody>
              {variant.phones.map((phone) => {
                const unitCost = Number(phone.purchasePrice);
                const totalCost = unitCost + Number(phone.tagCost) + Number(phone.batteryCost) + Number(phone.repairCost);
                const rowCells = (
                  <>
                    <td className="px-2 py-2">
                      {phone.imei}
                      {phone.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{phone.notes}</p> : null}
                    </td>
                    <td className="px-2 py-2">{phone.grade || "Not Graded"}</td>
                    <td className="px-2 py-2">{phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-"}</td>
                    <td className="px-2 py-2">{phone.status}</td>
                    <NoModalCell className="px-2 py-2">
                      <Link href={`/lots/${phone.lot.id}`} className="text-slate-800 underline">{phone.lot.lotNumber}</Link>
                    </NoModalCell>
                    {showCost ? <td className="px-2 py-2">{formatMoney(unitCost)}</td> : null}
                    <td className="px-2 py-2">{formatMoney(Number(phone.retailPrice ?? 0))}</td>
                  </>
                );
                if (!showCost) {
                  return <tr key={phone.id} className="border-b border-slate-200">{rowCells}</tr>;
                }
                return (
                  <CostRow
                    key={phone.id}
                    className="border-b border-slate-200"
                    data={{
                      name: `${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName} - IMEI ${phone.imei}`,
                      unitCost,
                      totalCost,
                      wholesalePrice: Number(phone.wholesalePrice ?? 0),
                      retailPrice: Number(phone.retailPrice ?? 0),
                      details: [
                        { label: "Variant", value: `${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName}` },
                        { label: "IMEI", value: phone.imei },
                        { label: "Status", value: phone.status },
                        { label: "Grade", value: phone.grade || "Not Graded" },
                        { label: "Battery health", value: phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-" },
                        { label: "Lot", value: phone.lot.lotNumber },
                        ...(phone.notes ? [{ label: "Notes", value: phone.notes }] : []),
                      ],
                      expenses: (expensesByPhone.get(phone.id) ?? []).map((expense) => ({
                        label: expense.category + (expense.description ? ` — ${expense.description}` : ""),
                        amount: Number(expense.amount),
                        date: expense.expenseDate.toISOString().slice(0, 10),
                      })),
                    }}
                  >
                    {rowCells}
                  </CostRow>
                );
              })}
              {!variant.phones.length ? (
                <tr>
                  <td className="px-2 py-4 text-slate-600" colSpan={showCost ? 7 : 6}>
                    No units registered for this variant yet.
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
