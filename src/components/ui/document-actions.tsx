"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import toast from "react-hot-toast";

/** Print (browser print dialog — the page has print styles) and Download PDF buttons. */
export function DocumentActions({ pdfUrl, fileName, printLabel = "Print" }: { pdfUrl: string; fileName: string; printLabel?: string }) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't create the PDF — try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
        <Printer className="size-4" /> {printLabel}
      </button>
      <button type="button" onClick={download} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
        <Download className="size-4" /> {downloading ? "Preparing…" : "Download PDF"}
      </button>
    </div>
  );
}
