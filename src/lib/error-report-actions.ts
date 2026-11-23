"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { APP_ERROR_ACTION, logAppError, type AppErrorDetails } from "@/lib/error-log";

// Same error reported repeatedly from a browser (e.g. a render loop) is only stored once a minute.
const recent = new Map<string, number>();

/** Called from error boundaries and the global browser error listener. */
export async function reportClientError(report: { kind: "page" | "browser"; message: string; stack?: string; digest?: string; route?: string; userAgent?: string; extra?: Record<string, unknown> }): Promise<string | null> {
  const key = `${report.kind}|${report.route}|${report.message}`.slice(0, 400);
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 60_000) return null;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();
  return logAppError(report.kind, {
    where: report.kind === "page" ? `page ${report.route ?? ""}`.trim() : `browser ${report.route ?? ""}`.trim(),
    message: String(report.message || "Unknown error").slice(0, 2000),
    digest: report.digest,
    route: report.route,
    userAgent: report.userAgent?.slice(0, 300),
    extra: { ...(report.extra ?? {}), ...(report.stack ? { clientStack: report.stack.split("\n").slice(0, 20).join("\n") } : {}) },
  });
}

async function requireManager() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canViewCost(session.user.role as "admin" | "manager" | "staff")) return null;
  return session.user;
}

/** Marks an error entry resolved (or re-opens it), keeping who/when and an optional note. */
export async function setErrorResolved(id: string, resolved: boolean, note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireManager();
  if (!user) return { ok: false, error: "Only admins and managers can manage the error log." };
  const row = await prisma.auditLog.findUnique({ where: { id } });
  if (!row || row.action !== APP_ERROR_ACTION) return { ok: false, error: "Entry not found." };
  const details = { ...(row.details as AppErrorDetails) };
  if (resolved) {
    details.resolvedAt = new Date().toISOString();
    details.resolvedBy = user.username;
    details.resolutionNote = note?.trim() || undefined;
  } else {
    delete details.resolvedAt;
    delete details.resolvedBy;
    delete details.resolutionNote;
  }
  await prisma.auditLog.update({ where: { id }, data: { details: details as object } });
  return { ok: true };
}
