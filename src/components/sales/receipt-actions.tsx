"use client";

export function ReceiptActions({ saleId, fileName }: { saleId: string; fileName: string }) {
  async function downloadInvoice() {
    const response = await fetch(`/api/sales/${saleId}/invoice`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="flex gap-2"><button type="button" onClick={downloadInvoice} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Download Invoice PDF</button><button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">Print Receipt</button></div>;
}
