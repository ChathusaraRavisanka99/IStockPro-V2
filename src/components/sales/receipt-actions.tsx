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

  return <div className="action-row"><button type="button" onClick={downloadInvoice} className="btn btn-md btn-primary">Download Invoice PDF</button><button type="button" onClick={() => window.print()} className="btn btn-md btn-secondary">Print Receipt</button></div>;
}
