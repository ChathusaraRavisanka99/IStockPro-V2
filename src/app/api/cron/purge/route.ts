import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { purgeExpiredSoftDeletes } from "@/lib/purge";

export const dynamic = "force-dynamic";

/**
 * Permanently removes records soft-deleted more than 30 days ago. The app already runs
 * this automatically in the background (src/lib/purge.ts); this endpoint is for an
 * external scheduler (send `Authorization: Bearer $CRON_SECRET`) or an admin to trigger it.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorized = Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!authorized) {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.error || !canManageUsers(session.user.role as "admin" | "manager" | "staff" | undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const counts = await purgeExpiredSoftDeletes();
  return NextResponse.json({ ok: true, counts });
}
