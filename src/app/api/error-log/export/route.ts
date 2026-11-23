import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCost } from "@/lib/rbac";
import { APP_ERROR_ACTION, type AppErrorDetails } from "@/lib/error-log";

export const dynamic = "force-dynamic";

/** Error Log as JSON — the hand-off file for a development session. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error || !canViewCost(session.user.role as "admin" | "manager" | "staff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const status = request.nextUrl.searchParams.get("status") || "open";
  const rows = await prisma.auditLog.findMany({ where: { action: APP_ERROR_ACTION }, orderBy: { createdAt: "desc" }, take: 2000, include: { user: { select: { username: true } } } });
  const entries = rows
    .map((row) => ({ id: row.id, at: row.createdAt.toISOString(), source: row.entityType, user: row.user?.username ?? null, ...(row.details as AppErrorDetails) }))
    .filter((entry) => (status === "all" ? true : status === "resolved" ? Boolean(entry.resolvedAt) : !entry.resolvedAt));
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), status, count: entries.length, entries }, null, 2);
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="istockpro-errors-${status}-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
