"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import type { RestoreIssue, RestoreResult } from "@/lib/recycle-bin";

export function RestoreIssueList({ issues }: { issues: RestoreIssue[] }) {
  return (
    <ul className="grid gap-1.5">
      {issues.map((issue, index) => (
        <li
          key={index}
          className={`rounded-lg border px-2.5 py-1.5 text-xs ${issue.level === "block" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          <span className="font-semibold">{issue.level === "block" ? "Blocked: " : "Note: "}</span>
          {issue.message}
          {issue.href ? (
            <>
              {" "}
              <Link href={issue.href} className="font-medium underline">
                {issue.linkLabel || "Open"}
              </Link>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function RestoreButton({ kind, id, label, action }: { kind: string; id: string; label: string; action: (formData: FormData) => Promise<RestoreResult> }) {
  const router = useRouter();
  const [report, setReport] = useState<{ title: string; issues: RestoreIssue[]; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("id", id);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        // Every constraint the restore hit, shown together so the user can fix them.
        setReport({ title: result.error, issues: result.issues ?? [{ level: "block", message: result.error }], ok: false });
        return;
      }
      toast.success(result.message || "Restored");
      if (result.issues?.length) setReport({ title: result.message || "Restored with notes", issues: result.issues, ok: true });
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={onClick} disabled={pending} className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-800 disabled:opacity-60">
        {pending ? "Restoring..." : "Restore"}
      </button>
      {report && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setReport(null)}>
              <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
                <h3 className={`text-base font-semibold ${report.ok ? "text-slate-900" : "text-red-800"}`}>{report.ok ? "Restored" : "Can't restore"}: {label}</h3>
                <p className="mt-1 text-sm text-slate-600">{report.title}</p>
                <div className="mt-3">
                  <RestoreIssueList issues={report.issues} />
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setReport(null)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">
                    OK
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
