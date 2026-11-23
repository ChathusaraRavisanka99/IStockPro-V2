import { getServerSession } from "next-auth";
import { Download } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { APP_ERROR_ACTION, type AppErrorDetails } from "@/lib/error-log";
import { ErrorResolveButton } from "@/components/ui/error-resolve-button";

type Filter = "open" | "resolved" | "all";

export default async function ErrorLogPage({ searchParams }: { searchParams: { status?: string } }) {
  const session = await getServerSession(authOptions);
  if (!canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined)) {
    return (
      <div>
        <PageHeader title="Error Log" subtitle="Recorded crashes and failures" />
        <Card>
          <p className="text-sm text-slate-600">Only admins and managers can view the error log.</p>
        </Card>
      </div>
    );
  }
  const filter: Filter = searchParams.status === "resolved" || searchParams.status === "all" ? searchParams.status : "open";

  const rows = await prisma.auditLog.findMany({
    where: { action: APP_ERROR_ACTION },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { name: true, username: true } } },
  });
  const entries = rows.map((row) => ({ ...row, info: (row.details ?? {}) as AppErrorDetails }));
  const visible = entries.filter((entry) => (filter === "all" ? true : filter === "open" ? !entry.info.resolvedAt : Boolean(entry.info.resolvedAt)));

  // Group identical failures (same place + message) so repeats read as one problem.
  const groups = new Map<string, typeof visible>();
  for (const entry of visible) {
    const key = `${entry.info.where}|${(entry.info.message ?? "").replace(/\(error ref [A-Z0-9]+\)/, "").slice(0, 200)}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const openCount = entries.filter((entry) => !entry.info.resolvedAt).length;

  const tabs: { id: Filter; label: string }[] = [
    { id: "open", label: `Open (${openCount})` },
    { id: "resolved", label: `Resolved (${entries.length - openCount})` },
    { id: "all", label: `All (${entries.length})` },
  ];

  return (
    <div>
      <PageHeader
        title="Error Log"
        subtitle="Crashes and failures recorded automatically, with what was happening at the time"
        help={
          <>
            <p>Whenever saving fails, a page crashes or the browser hits an error, it&apos;s recorded here: where it happened, who was using it, the page, a safe summary of what was submitted (passwords are never stored), how long it ran and the technical details.</p>
            <p>Repeats of the same problem are grouped. Mark a problem resolved once it&apos;s fixed; Export downloads the open ones as JSON to hand to a developer.</p>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map((tab) => (
            <a key={tab.id} href={tab.id === "open" ? "/error-log" : `/error-log?status=${tab.id}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === tab.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {tab.label}
            </a>
          ))}
        </div>
        <a href={`/api/error-log/export?status=${filter}`} download className="btn btn-sm btn-secondary">
          <Download /> Export JSON
        </a>
      </div>

      {!groups.size ? (
        <Card>
          <p className="text-sm text-slate-600">{filter === "open" ? "No open errors. 🎉" : "Nothing here."}</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {Array.from(groups.values()).map((group) => {
            const latest = group[0];
            const info = latest.info;
            return (
              <Card key={latest.id} className="p-0">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${latest.entityType === "server-action" ? "bg-red-50 text-red-800" : latest.entityType === "page" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{latest.entityType}</span>
                      <span className="font-mono">{info.where}</span>
                      {group.length > 1 ? <span className="rounded-full bg-slate-900 px-2 py-0.5 font-medium text-white">×{group.length}</span> : null}
                      {info.resolvedAt ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">resolved by {info.resolvedBy}</span> : null}
                    </p>
                    <p className="mt-1 break-words font-medium text-slate-900">{info.message}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Last {latest.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                      {group.length > 1 ? ` · first ${group[group.length - 1].createdAt.toISOString().replace("T", " ").slice(0, 16)}` : ""}
                      {latest.user ? ` · ${latest.user.name || latest.user.username}` : ""}
                      {info.route ? ` · ${info.route}` : ""}
                      {info.durationMs !== undefined ? ` · ran ${(info.durationMs / 1000).toFixed(1)}s` : ""}
                    </p>
                    {info.resolutionNote ? <p className="mt-1 text-xs text-emerald-800">Note: {info.resolutionNote}</p> : null}
                  </div>
                  <ErrorResolveButton ids={group.map((entry) => entry.id)} resolved={Boolean(info.resolvedAt)} />
                </div>
                <details className="group px-4 py-2">
                  <summary className="cursor-pointer text-sm text-slate-600">Details for developers</summary>
                  <div className="mt-2 grid gap-2 pb-2">
                    {info.input ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted data</p>
                        <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(info.input, null, 2)}</pre>
                      </div>
                    ) : null}
                    {info.stack || info.extra ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technical</p>
                        <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{[info.name ? `${info.name}: ${info.message}` : info.message, info.stack, info.extra ? JSON.stringify(info.extra, null, 2) : null, info.digest ? `digest: ${info.digest}` : null, info.userAgent ? `browser: ${info.userAgent}` : null, info.appVersion ? `version: ${info.appVersion}` : null].filter(Boolean).join("\n\n")}</pre>
                      </div>
                    ) : null}
                    {group.length > 1 ? <p className="text-xs text-slate-500">Occurrences: {group.map((entry) => entry.createdAt.toISOString().slice(5, 16).replace("T", " ")).join(", ")}</p> : null}
                  </div>
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
