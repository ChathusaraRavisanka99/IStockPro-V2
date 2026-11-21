"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal, modalButton } from "@/components/ui/modal";
import type { RestoreIssue, RestoreResult } from "@/lib/recycle-bin";

export function RestoreIssueList({ issues }: { issues: RestoreIssue[] }) {
  return (
    <ul className="grid gap-1.5">
      {issues.map((issue, index) => (
        <li
          key={index}
          className={`rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed ${issue.level === "block" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
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
      {report ? (
        <Modal
          title={`${report.ok ? "Restored" : "Can't restore"}: ${label}`}
          subtitle={report.title}
          icon={report.ok ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
          tone={report.ok ? "default" : "danger"}
          onClose={() => setReport(null)}
          footer={
            <button type="button" data-autofocus onClick={() => setReport(null)} className={modalButton.primary}>
              OK
            </button>
          }
        >
          <RestoreIssueList issues={report.issues} />
        </Modal>
      ) : null}
    </>
  );
}
