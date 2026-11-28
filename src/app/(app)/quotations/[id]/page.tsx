import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentActions } from "@/components/ui/document-actions";
import { QuotationRowActions } from "@/components/quotations/quotation-row-actions";
import { canViewCost } from "@/lib/rbac";
import { SpecChips } from "@/components/ui/spec-chips";
import { formatMoney } from "@/lib/currency";
import { quotationLineLabel } from "@/lib/format-item-name";
import { EntityLink } from "@/components/ui/entity-link";
import { companyContactLines, getCompanyLogoUrl, getCompanyProfile } from "@/lib/company";

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Sent: "bg-sky-50 text-sky-800",
  Accepted: "bg-emerald-50 text-emerald-800",
  Converted: "bg-emerald-50 text-emerald-800",
  Rejected: "bg-red-50 text-red-800",
  Expired: "bg-amber-50 text-amber-900",
};

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();

  const quotation = await prisma.quotation.findUnique({
    where: { id: params.id },
    include: { customer: true, items: { include: { phoneModel: true, phoneVariant: { include: { phoneModel: true } } } }, convertedSale: true },
  });
  if (!quotation) notFound();

  const company = await getCompanyProfile();
  const logoUrl = await getCompanyLogoUrl(company);
  const contactPhone = quotation.customer?.phone || quotation.customerPhone;
  const contactEmail = quotation.customer?.email || quotation.customerEmail;
  const validUntil = quotation.validUntil?.toISOString().slice(0, 10);
  const expired = quotation.validUntil ? quotation.validUntil.getTime() < Date.now() : false;
  const lines = quotation.items.map((item) => ({ item, ...quotationLineLabel(item) }));

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title={`Quotation ${quotation.quoteNumber}`}
          subtitle="Quotation details and pricing summary"
          help={
            <p>
              The quotation as the customer sees it. Use <b>Print</b> for a paper copy or <b>Download PDF</b> to email or share it. Phone lines show the model, variant and its
              color/storage. If it has been converted to a sale, a link to that sale is shown.
            </p>
          }
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/quotations" className="text-sm text-slate-700 underline">
            Back to Quotations
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <QuotationRowActions large redirectAfterDelete="/quotations" canDeleteConverted={canViewCost(session.user?.role as "admin" | "manager" | "staff" | undefined)} username={session.user?.username} quotation={{ id: quotation.id, quoteNumber: quotation.quoteNumber, status: quotation.status, validUntil: quotation.validUntil, customerPhone: quotation.customerPhone, customerEmail: quotation.customerEmail, notes: quotation.notes, totalAmount: quotation.totalAmount, itemCount: quotation.items.length, convertedSaleNumber: quotation.convertedSale?.saleNumber ?? null }} />
            <DocumentActions pdfUrl={`/api/quotations/${quotation.id}/pdf`} fileName={quotation.quoteNumber} />
          </div>
        </div>
      </div>

      {/* The document itself — what prints and what the PDF mirrors. */}
      <article className="quote-document mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-[#10233f]" aria-hidden="true" />
        <div className="p-4 sm:p-8">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-12 max-w-[120px] object-contain" />
              ) : null}
              <div>
                <p className="text-2xl font-bold tracking-tight text-[#10233f]">{company.name || "IStockPro"}</p>
                <p className="text-sm text-slate-500">{company.tagline || "Phones & accessories"}</p>
                {companyContactLines(company).map((line) => (
                  <p key={line} className="whitespace-pre-line text-xs text-slate-600">{line}</p>
                ))}
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-xl font-bold tracking-wide text-[#10233f]">QUOTATION</p>
              <p className="text-sm text-slate-600">{quotation.quoteNumber}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 sm:justify-end print:hidden">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[quotation.status] ?? "bg-slate-100 text-slate-700"}`}>{quotation.status}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quotation.saleType === "Wholesale" ? "bg-purple-50 text-purple-800" : "bg-slate-100 text-slate-700"}`}>{quotation.saleType}</span>
                {expired ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">Expired</span> : null}
              </div>
            </div>
          </header>

          <section className="grid gap-4 border-b border-slate-200 py-5 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prepared for</p>
              <p className="mt-1 font-semibold text-slate-900">{quotation.customer ? <EntityLink kind="customer" id={quotation.customer.id} className="text-left font-semibold text-slate-900 underline decoration-slate-300 decoration-dotted underline-offset-2 print:no-underline">{quotation.customer.name}</EntityLink> : "Walk-in customer"}</p>
              {contactPhone ? <p className="text-slate-600">{contactPhone}</p> : null}
              {contactEmail ? <p className="break-all text-slate-600">{contactEmail}</p> : null}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</p>
              <p className="mt-1 text-slate-900">{quotation.quoteDate.toISOString().slice(0, 10)}</p>
              <p className="text-slate-600">Valid until: {validUntil || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pricing</p>
              <p className="mt-1 text-slate-900">{quotation.saleType}</p>
              {quotation.convertedSale ? (
                <Link href={`/sales/${quotation.convertedSale.id}`} className="text-slate-700 underline print:hidden">
                  Converted to sale {quotation.convertedSale.saleNumber}
                </Link>
              ) : null}
            </div>
          </section>

          {/* Desktop / print: table (hidden on phones, which get the card list) — responsive-ok */}
          <table className="mt-5 hidden w-full text-sm sm:table print:table">
            <thead>
              <tr className="bg-[#10233f] text-left text-white">
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="w-16 px-3 py-2 text-center font-semibold">Qty</th>
                <th className="w-36 px-3 py-2 text-right font-semibold">Unit price</th>
                <th className="w-36 px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ item, label, note }) => (
                <tr key={item.id} className="border-b border-slate-200 align-top">
                  <td className="px-3 py-3">
                    <span className="font-medium text-slate-900">{label}</span>
                    {item.phoneVariant ? <SpecChips color={item.phoneVariant.color} storage={item.phoneVariant.storage} ram={item.phoneVariant.ram} className="mt-1 flex print:hidden" /> : null}
                    {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
                  </td>
                  <td className="px-3 py-3 text-center">{item.quantity}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">{formatMoney(Number(item.unitPrice))}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium">{formatMoney(Number(item.lineTotal))}</td>
                </tr>
              ))}
              {!lines.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-slate-500">No line items were added.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {/* Phones: stacked cards */}
          <ul className="mt-5 grid gap-2 sm:hidden print:hidden">
            {lines.map(({ item, label, note }) => (
              <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium text-slate-900">{label}</p>
                {item.phoneVariant ? <SpecChips color={item.phoneVariant.color} storage={item.phoneVariant.storage} ram={item.phoneVariant.ram} className="mt-1.5 flex" /> : null}
                {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
                <div className="mt-2 flex items-end justify-between gap-2 text-sm">
                  <span className="text-slate-600">
                    {item.quantity} × {formatMoney(Number(item.unitPrice))}
                  </span>
                  <span className="font-semibold text-slate-900">{formatMoney(Number(item.lineTotal))}</span>
                </div>
              </li>
            ))}
            {!lines.length ? <li className="text-sm text-slate-500">No line items were added.</li> : null}
          </ul>

          <section className="mt-6 flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm text-sm text-slate-600">
              {quotation.notes ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap">{quotation.notes}</p>
                </>
              ) : null}
            </div>
            <dl className="w-full space-y-2 text-sm text-slate-700 sm:max-w-xs">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatMoney(Number(quotation.subtotal))}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tax{quotation.taxType === "Percent" ? ` (${Number(quotation.taxPercent).toFixed(2)}%)` : ""}</dt>
                <dd>{formatMoney(Number(quotation.taxAmount))}</dd>
              </div>
              {Number(quotation.handlingFee) ? (
                <div className="flex justify-between">
                  <dt>Handling fee</dt>
                  <dd>{formatMoney(Number(quotation.handlingFee))}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t-2 border-[#10233f] pt-2 text-base font-bold text-[#10233f]">
                <dt>Total</dt>
                <dd>{formatMoney(Number(quotation.totalAmount))}</dd>
              </div>
              {validUntil ? <p className="rounded-md bg-sky-50 px-2 py-1.5 text-center text-xs font-semibold text-sky-800">Valid until {validUntil}</p> : null}
            </dl>
          </section>

          <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            {company.name || "IStockPro"} · Thank you for your interest. Prices are subject to stock availability until the quotation is accepted.
            {company.footerNote ? <span className="mt-1 block whitespace-pre-line">{company.footerNote}</span> : null}
          </footer>
        </div>
      </article>
    </div>
  );
}
