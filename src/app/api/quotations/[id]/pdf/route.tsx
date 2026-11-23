import { NextResponse } from "next/server";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

// Never hyphenate words (emails, IMEIs, model names) across lines.
Font.registerHyphenationCallback((word) => [word]);
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { quotationLineLabel } from "@/lib/format-item-name";
import { companyContactLines, getCompanyLogoForPdf, getCompanyProfile } from "@/lib/company";

// Same visual language as the invoice PDF (src/app/api/sales/[id]/invoice/route.tsx).
const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, color: "#172033" },
  topBar: { height: 8, backgroundColor: "#10233f", marginBottom: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 22 },
  brand: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#10233f" },
  tagline: { color: "#526176", marginTop: 5, fontSize: 9 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#10233f", textAlign: "right" },
  number: { color: "#526176", marginTop: 5, textAlign: "right" },
  infoGrid: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: 14, marginBottom: 24 },
  infoBlock: { flex: 1, paddingRight: 8 },
  label: { color: "#64748b", fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 5 },
  value: { color: "#172033", fontFamily: "Helvetica-Bold" },
  muted: { color: "#526176", marginTop: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#10233f", color: "#ffffff", padding: 9, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottom: "1 solid #dbe3ed", paddingVertical: 10, paddingHorizontal: 9 },
  item: { flex: 1, paddingRight: 8 },
  itemNote: { color: "#64748b", fontSize: 8.5, marginTop: 3 },
  qty: { width: 45, textAlign: "center" },
  rate: { width: 90, textAlign: "right" },
  amount: { width: 95, textAlign: "right" },
  totalsArea: { flexDirection: "row", justifyContent: "space-between", marginTop: 24 },
  note: { width: 230, color: "#526176", lineHeight: 1.4 },
  totals: { width: 210 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  total: { flexDirection: "row", justifyContent: "space-between", paddingTop: 9, marginTop: 5, borderTop: "2 solid #10233f", fontFamily: "Helvetica-Bold", fontSize: 13, color: "#10233f" },
  validity: { marginTop: 10, padding: 7, backgroundColor: "#e0f2fe", color: "#075985", textAlign: "center", fontFamily: "Helvetica-Bold" },
  brandRow: { flexDirection: "row", maxWidth: 320 },
  logo: { height: 44, maxWidth: 110, marginRight: 10, objectFit: "contain" },
  contact: { color: "#526176", marginTop: 2, fontSize: 8.5 },
  footer: { borderTop: "1 solid #dbe3ed", marginTop: 34, paddingTop: 14, color: "#64748b", textAlign: "center", lineHeight: 1.4 },
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quotation = await prisma.quotation.findUnique({
    where: { id: params.id },
    include: { customer: true, items: { include: { phoneModel: true, phoneVariant: { include: { phoneModel: true } } } } },
  });
  if (!quotation) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const company = await getCompanyProfile();
  const logo = await getCompanyLogoForPdf(company);
  const brandName = company.name || "IStockPro";
  const phone = quotation.customer?.phone || quotation.customerPhone;
  const email = quotation.customer?.email || quotation.customerEmail;
  const validUntil = quotation.validUntil?.toISOString().slice(0, 10);

  const buffer = await renderToBuffer(
    <Document title={`Quotation ${quotation.quoteNumber}`} author={brandName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} />
        <View style={styles.header}>
          <View style={styles.brandRow}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logo ? <Image src={logo} style={styles.logo} /> : null}
            <View>
              <Text style={styles.brand}>{brandName}</Text>
              <Text style={styles.tagline}>{company.tagline || "Phones & accessories"}</Text>
              {companyContactLines(company).map((line) => <Text key={line} style={styles.contact}>{line}</Text>)}
            </View>
          </View>
          <View>
            <Text style={styles.title}>QUOTATION</Text>
            <Text style={styles.number}>{quotation.quoteNumber}</Text>
          </View>
        </View>
        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}>
            <Text style={styles.label}>Prepared for</Text>
            <Text style={styles.value}>{quotation.customer?.name || "Walk-in customer"}</Text>
            {phone ? <Text style={styles.muted}>{phone}</Text> : null}
            {email ? <Text style={styles.muted}>{email}</Text> : null}
            {!phone && !email ? <Text style={styles.muted}>Contact details not provided</Text> : null}
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{quotation.quoteDate.toISOString().slice(0, 10)}</Text>
            <Text style={styles.muted}>Valid until: {validUntil || "—"}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.label}>Pricing</Text>
            <Text style={styles.value}>{quotation.saleType}</Text>
          </View>
        </View>
        <View style={styles.tableHeader}>
          <Text style={styles.item}>Description</Text>
          <Text style={styles.qty}>Qty</Text>
          <Text style={styles.rate}>Unit Price</Text>
          <Text style={styles.amount}>Amount</Text>
        </View>
        {quotation.items.map((item) => {
          const { label, note } = quotationLineLabel(item);
          return (
            <View key={item.id} style={styles.row} wrap={false}>
              <View style={styles.item}>
                <Text>{label}</Text>
                {note ? <Text style={styles.itemNote}>{note}</Text> : null}
              </View>
              <Text style={styles.qty}>{item.quantity}</Text>
              <Text style={styles.rate}>{formatMoney(Number(item.unitPrice))}</Text>
              <Text style={styles.amount}>{formatMoney(Number(item.lineTotal))}</Text>
            </View>
          );
        })}
        {!quotation.items.length ? (
          <View style={styles.row}>
            <Text style={styles.item}>No line items</Text>
          </View>
        ) : null}
        <View style={styles.totalsArea} wrap={false}>
          <View style={styles.note}>
            {quotation.notes ? (
              <>
                <Text style={styles.label}>Notes</Text>
                <Text>{quotation.notes}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.totals}>
            <View style={styles.totalLine}>
              <Text>Subtotal</Text>
              <Text>{formatMoney(Number(quotation.subtotal))}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text>Tax{quotation.taxType === "Percent" ? ` (${Number(quotation.taxPercent).toFixed(2)}%)` : ""}</Text>
              <Text>{formatMoney(Number(quotation.taxAmount))}</Text>
            </View>
            {Number(quotation.handlingFee) ? (
              <View style={styles.totalLine}>
                <Text>Handling fee</Text>
                <Text>{formatMoney(Number(quotation.handlingFee))}</Text>
              </View>
            ) : null}
            <View style={styles.total}>
              <Text>Total</Text>
              <Text>{formatMoney(Number(quotation.totalAmount))}</Text>
            </View>
            {validUntil ? <Text style={styles.validity}>Valid until {validUntil}</Text> : null}
          </View>
        </View>
        <Text style={styles.footer}>
          {brandName} | Thank you for your interest.{"\n"}Prices are subject to stock availability until the quotation is accepted. This is a computer-generated quotation.{company.footerNote ? `\n${company.footerNote}` : ""}
        </Text>
      </Page>
    </Document>,
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${quotation.quoteNumber}.pdf"`, "Cache-Control": "no-store" },
  });
}
