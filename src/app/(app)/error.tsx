"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { reportClientError } from "@/lib/error-report-actions";

/**
 * Shown instead of a blank crash when a page or action fails. The error is recorded in the
 * Error Log (with the page, time and the server's reference) so it can be fixed later.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    reportClientError({
      kind: "page",
      message: error.message || "Page crashed",
      stack: error.stack,
      digest: error.digest,
      route: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
    }).then(setRef, () => setRef(null));
  }, [error]);

  const serverRef = error.message?.match(/error ref ([A-Z0-9]+)/)?.[1];

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
            <p className="mt-1 text-sm text-slate-600">
              The problem has been recorded in the Error Log with what you were doing, so it can be fixed. Nothing was half-saved — changes are only written when they fully succeed.
            </p>
            {error.message && !error.message.startsWith("An error occurred in the Server Components render") ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{error.message}</p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">
              Reference: <span className="font-mono">{serverRef ?? ref ?? error.digest ?? "—"}</span>
              {error.digest ? <span className="ml-2 font-mono text-slate-400">digest {error.digest}</span> : null}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link href="/dashboard" className="btn btn-md btn-secondary">
            Go to dashboard
          </Link>
          <button type="button" onClick={reset} className="btn btn-md btn-primary">
            <RotateCcw /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}
