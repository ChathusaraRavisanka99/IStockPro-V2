"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowRight, CheckCircle2, HelpCircle } from "lucide-react";
import { Modal, modalButton } from "@/components/ui/modal";
import type { RestoreIssue, RestoreResult } from "@/lib/recycle-bin";

/**
 * "Why?" chip: native hover tooltip on desktop, and click/tap toggles the full why + how
 * inline (a floating tooltip would be clipped by the table's horizontal scroller).
 */
function IssueHint({ why, how, open, onToggle }: { why?: string; how?: string; open: boolean; onToggle: () => void }) {
  if (!why && !how) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      title={[why && `Why: ${why}`, how && `How to fix: ${how}`].filter(Boolean).join("\n\n")}
      className="inline-flex items-center gap-1 rounded-md border border-current/25 bg-white/60 px-2 py-0.5 text-[11px] font-medium transition hover:bg-white"
    >
      <HelpCircle className="size-3" />
      {open ? "Hide help" : "Why & how to fix"}
    </button>
  );
}

function IssueItem({ issue }: { issue: RestoreIssue }) {
  const [open, setOpen] = useState(false);
  const linkClass = `inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${issue.level === "block" ? "bg-red-100 text-red-800 hover:bg-red-200" : "bg-amber-100 text-amber-900 hover:bg-amber-200"}`;
  // Same-page anchors use a plain <a> so the browser jumps and the row's :target highlight fires.
  const samePageAnchor = issue.href?.startsWith("/recycle-bin#");
  return (
    <li className={`rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed ${issue.level === "block" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <span className="font-semibold">{issue.level === "block" ? "Blocked: " : "Note: "}</span>
      {issue.message}
      {issue.href || issue.why || issue.how ? (
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {issue.href ? (
            samePageAnchor ? (
              <a href={issue.href} className={linkClass}>
                {issue.linkLabel || "Open"}
                <ArrowRight className="size-3" />
              </a>
            ) : (
              <Link href={issue.href} className={linkClass}>
                {issue.linkLabel || "Open"}
                <ArrowRight className="size-3" />
              </Link>
            )
          ) : null}
          <IssueHint why={issue.why} how={issue.how} open={open} onToggle={() => setOpen((value) => !value)} />
        </span>
      ) : null}
      {open ? (
        <span className="mt-2 block rounded-md bg-white/80 px-2.5 py-2 text-slate-700">
          {issue.why ? (
            <span className="block">
              <span className="font-semibold text-slate-900">Why: </span>
              {issue.why}
            </span>
          ) : null}
          {issue.how ? (
            <span className="mt-1 block">
              <span className="font-semibold text-slate-900">How to fix: </span>
              {issue.how}
            </span>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

export function RestoreIssueList({ issues }: { issues: RestoreIssue[] }) {
  return (
    <ul className="grid gap-1.5">
      {issues.map((issue, index) => (
        <IssueItem key={index} issue={issue} />
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
      <button type="button" onClick={onClick} disabled={pending} className="btn btn-xs btn-success">
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
