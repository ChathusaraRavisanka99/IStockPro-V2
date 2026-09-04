import { NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, color: "#172033" },
  topBar: { height: 8, backgroundColor: "#10233f", marginBottom: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 22 },
  brand: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#10233f" },
  tagline: { color: "#526176", marginTop: 5, fontSize: 9 },
  invoiceTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#10233f", textAlign: "right" },
  invoiceNumber: { color: "#526176", marginTop: 5, textAlign: "right" },
  infoGrid: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: 14, marginBottom: 24 },
  infoBlock: { flex: 1 },
  label: { color: "#64748b", fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 5 },
  value: { color: "#172033", fontFamily: "Helvetica-Bold" },
  muted: { color: "#526176", marginTop: 4 },
  tableHeader: { flexDirection: "row", backgroundColor: "#10233f", color: "#ffffff", padding: 9, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottom: "1 solid #dbe3ed", paddingVertical: 10 },
  item: { flex: 1 },
  qty: { width: 55, textAlign: "center" },
  rate: { width: 85, textAlign: "right" },
  amount: { width: 90, textAlign: "right" },
  totalsArea: { flexDirection: "row", justifyContent: "space-between", marginTop: 24 },
  paymentNote: { width: 220, color: "#526176", lineHeight: 1.4 },
  totals: { width: 200 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  total: { flexDirection: "row", justifyContent: "space-between", paddingTop: 9, marginTop: 5, borderTop: "2 solid #10233f", fontFamily: "Helvetica-Bold", fontSize: 13, color: "#10233f" },
  status: { marginTop: 10, padding: 7, backgroundColor: "#dcfce7", color: "#166534", textAlign: "center", fontFamily: "Helvetica-Bold" },
  footer: { borderTop: "1 solid #dbe3ed", marginTop: 34, paddingTop: 14, color: "#64748b", textAlign: "center", lineHeight: 1.4 },
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: { customer: true, invoice: true, items: { include: { phone: true, accessory: true } } },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  const buffer = await renderToBuffer(
    <Document title={sale.invoice?.invoiceNumber || sale.saleNumber} author="IStockPro">
      <Page size="A4" style={styles.page}>
        <View style={styles.topBar} />
        <View style={styles.header}>
          <View><Text style={styles.brand}>IStockPro</Text><Text style={styles.tagline}>Inventory and retail management</Text></View>
          <View><Text style={styles.invoiceTitle}>INVOICE</Text><Text style={styles.invoiceNumber}>{sale.invoice?.invoiceNumber || sale.saleNumber}</Text></View>
        </View>
        <View style={styles.infoGrid}>
          <View style={styles.infoBlock}><Text style={styles.label}>Bill To</Text><Text style={styles.value}>{sale.customer?.name || "Walk-in customer"}</Text><Text style={styles.muted}>{sale.customer?.email || sale.customer?.phone || "Customer details not provided"}</Text></View>
          <View style={styles.infoBlock}><Text style={styles.label}>Invoice Date</Text><Text style={styles.value}>{sale.invoice?.issueDate.toISOString().slice(0, 10) || sale.saleDate.toISOString().slice(0, 10)}</Text><Text style={styles.muted}>Sale reference: {sale.saleNumber}</Text></View>
          <View style={styles.infoBlock}><Text style={styles.label}>Payment Status</Text><Text style={styles.value}>{sale.invoice?.status || "Unpaid"}</Text><Text style={styles.muted}>Paid: ${Number(sale.invoice?.paidAmount || 0).toFixed(2)}</Text></View>
        </View>
        <View style={styles.tableHeader}><Text style={styles.item}>Description</Text><Text style={styles.qty}>Qty</Text><Text style={styles.rate}>Unit Price</Text><Text style={styles.amount}>Amount</Text></View>
        {sale.items.map((item) => <View key={item.id} style={styles.row}><Text style={styles.item}>{item.phone?.imei || item.accessory?.name || "Sale item"}</Text><Text style={styles.qty}>{item.quantity}</Text><Text style={styles.rate}>${Number(item.unitPrice).toFixed(2)}</Text><Text style={styles.amount}>${Number(item.lineTotal).toFixed(2)}</Text></View>)}
        {!sale.items.length ? <View style={styles.row}><Text style={styles.item}>Summary sale without item lines</Text><Text style={styles.qty}>-</Text><Text style={styles.rate}>-</Text><Text style={styles.amount}>-</Text></View> : null}
        <View style={styles.totalsArea}><View style={styles.paymentNote}><Text style={styles.label}>Notes</Text><Text>Thank you for choosing IStockPro. Please retain this invoice for your records.</Text></View><View style={styles.totals}><View style={styles.totalLine}><Text>Subtotal</Text><Text>${Number(sale.subtotal).toFixed(2)}</Text></View><View style={styles.totalLine}><Text>Tax</Text><Text>${Number(sale.taxAmount).toFixed(2)}</Text></View><View style={styles.totalLine}><Text>Discount</Text><Text>-${Number(sale.discount).toFixed(2)}</Text></View><View style={styles.total}><Text>Total Due</Text><Text>${Number(sale.totalAmount).toFixed(2)}</Text></View><Text style={styles.status}>{sale.invoice?.status || "Unpaid"}</Text></View></View>
        <Text style={styles.footer}>IStockPro | Thank you for your business.{"\n"}This is a computer-generated invoice and does not require a signature.</Text>
      </Page>
    </Document>,
  );

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${sale.invoice?.invoiceNumber || sale.saleNumber}.pdf"`, "Cache-Control": "no-store" } });
}
