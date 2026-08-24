import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

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
          <h2 className="mb-3 text-lg font-semibold">Specifications</h2>
          {presentSpecs.length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              {presentSpecs.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
                  <dd className="text-slate-900">{value}</dd>
                </div>
              ))}
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
                  {showCost ? <td className="px-2 py-2">${Number(phone.purchasePrice).toFixed(2)}</td> : null}
                  <td className="px-2 py-2">${Number(phone.retailPrice ?? 0).toFixed(2)}</td>
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
