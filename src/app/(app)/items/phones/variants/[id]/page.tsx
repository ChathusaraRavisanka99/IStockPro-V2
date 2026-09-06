import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/currency";

export default async function PhoneVariantDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { edit?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();
  const showCost = canViewCost(session.user?.role as "admin" | "manager" | "staff" | undefined);
  const editing = searchParams?.edit === "1";

  const variant = await prisma.phoneVariant.findUnique({
    where: { id: params.id },
    include: {
      phoneModel: true,
      phones: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { lot: true } },
    },
  });
  if (!variant) notFound();

  async function updateVariant(formData: FormData) {
    "use server";

    const variantName = String(formData.get("variantName") || "").trim();
    if (!variantName) return;

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

    // Leave edit mode on save (Cancel already does this) — otherwise the row stays open
    // indefinitely with no feedback that the save succeeded.
    redirect(`/items/phones/variants/${params.id}`);
  }

  const specs: [string, string | null][] = [
    ["Color", variant.color],
    ["Storage (ROM)", variant.storage],
    ["RAM", variant.ram],
    ["Screen size", variant.screenSize],
    ["Processor", variant.processor],
    ["Camera", variant.camera],
    ["OS", variant.os],
    ["Network", variant.networkType],
    ["Battery", variant.battery],
  ];
  const presentSpecs = specs.filter(([, value]) => value);

  const statusCounts = variant.phones.reduce<Record<string, number>>((acc, phone) => {
    acc[phone.status] = (acc[phone.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title={`${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName}`} subtitle="Variant specifications and unit inventory" />
      <div className="mb-4">
        <Link href="/items/phone-catalog" className="text-sm text-slate-700 underline">Back to Catalog</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Specifications</h2>
            {!editing ? (
              <a href="?edit=1" className="text-sm text-slate-700 underline">Edit</a>
            ) : null}
          </div>
          {editing ? (
            <form action={updateVariant} className="grid gap-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Variant name
                  <input name="variantName" required defaultValue={variant.variantName} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Color
                  <input name="color" defaultValue={variant.color || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Storage (ROM)
                  <input name="storage" defaultValue={variant.storage || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  RAM
                  <input name="ram" defaultValue={variant.ram || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Screen size
                  <input name="screenSize" defaultValue={variant.screenSize || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Processor
                  <input name="processor" defaultValue={variant.processor || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Camera
                  <input name="camera" defaultValue={variant.camera || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  OS
                  <input name="os" defaultValue={variant.os || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Network
                  <input name="networkType" defaultValue={variant.networkType || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Battery
                  <input name="battery" defaultValue={variant.battery || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                {showCost ? (
                  <>
                    <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                      Default tag cost
                      <input name="defaultTagCost" type="number" step="0.01" min={0} defaultValue={Number(variant.defaultTagCost)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                    </label>
                    <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                      Default battery cost
                      <input name="defaultBatteryCost" type="number" step="0.01" min={0} defaultValue={Number(variant.defaultBatteryCost)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                    </label>
                  </>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white">Save</button>
                <a href="?" className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700">Cancel</a>
              </div>
            </form>
          ) : presentSpecs.length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              {presentSpecs.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
                  <dd className="text-slate-900">{value}</dd>
                </div>
              ))}
              {showCost ? (
                <>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Default tag cost</dt>
                    <dd className="text-slate-900">{formatMoney(variant.defaultTagCost)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Default battery cost</dt>
                    <dd className="text-slate-900">{formatMoney(variant.defaultBatteryCost)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-slate-600">No specifications recorded yet.</p>
          )}
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
        <h2 className="mb-3 text-lg font-semibold">Units</h2>
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
              {variant.phones.map((phone) => (
                <tr key={phone.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">
                    {phone.imei}
                    {phone.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{phone.notes}</p> : null}
                  </td>
                  <td className="px-2 py-2">{phone.grade || "-"}</td>
                  <td className="px-2 py-2">{phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-"}</td>
                  <td className="px-2 py-2">{phone.status}</td>
                  <td className="px-2 py-2">
                    <Link href={`/lots/${phone.lot.id}`} className="text-slate-800 underline">{phone.lot.lotNumber}</Link>
                  </td>
                  {showCost ? <td className="px-2 py-2">{formatMoney(Number(phone.purchasePrice))}</td> : null}
                  <td className="px-2 py-2">{formatMoney(Number(phone.retailPrice ?? 0))}</td>
                </tr>
              ))}
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
