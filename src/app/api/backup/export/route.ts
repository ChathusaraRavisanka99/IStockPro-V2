import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { exportBackup } from "@/lib/backup";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canManageUsers(session.user.role as "admin" | "manager" | "staff" | undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await exportBackup();
  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="istockpro-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
