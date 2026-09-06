import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { importBackup, type ImportSummary } from "@/lib/backup";

const ROLE_LEGEND: { role: UserRole; label: string; description: string }[] = [
  { role: "admin", label: "Admin", description: "Full access: manage users and roles, view purchase costs and margins, void invoices, and access every report." },
  { role: "manager", label: "Manager", description: "Views purchase costs, margins, and financial reports, and can void invoices. Cannot manage users." },
  { role: "staff", label: "Staff", description: "Runs day-to-day sales, quotations, lots, and inventory. Cannot see purchase costs/margins, void invoices, or manage users." },
];

type SettingsSearchParams = {
  imported?: string;
  userError?: string;
  userCreated?: string;
  pwError?: string;
  pwSuccess?: string;
  resetError?: string;
  resetSuccess?: string;
};

export default async function SettingsPage({ searchParams }: { searchParams?: SettingsSearchParams }) {
  const session = await getServerSession(authOptions);
  const isAdmin = canManageUsers(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const currentUserId = session?.user?.id;

  const [users, auditLogs, lastImportLog] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { user: true } }),
    prisma.auditLog.findFirst({ where: { action: "BackupImport" }, orderBy: { createdAt: "desc" } }),
  ]);

  async function createUser(formData: FormData) {
    "use server";

    if (!isAdmin) return;

    const name = String(formData.get("name") || "").trim() || null;
    const username = String(formData.get("username") || "").trim();
    const email = String(formData.get("email") || "").trim() || null;
    const password = String(formData.get("password") || "");
    const roleInput = String(formData.get("role") || "staff");
    const role = (["admin", "manager", "staff"] as const).includes(roleInput as UserRole) ? (roleInput as UserRole) : "staff";

    if (!username || password.length < 8) {
      redirect("/settings?userError=Username is required and password must be at least 8 characters.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      await prisma.user.create({ data: { name, username, email, passwordHash, role } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        redirect("/settings?userError=That username or email is already in use.");
      }
      throw error;
    }

    revalidatePath("/settings");
    redirect("/settings?userCreated=1");
  }

  async function updateUser(formData: FormData) {
    "use server";

    if (!isAdmin) return;

    const id = String(formData.get("id") || "");
    if (!id) return;

    const roleInput = String(formData.get("role") || "staff");
    const role = (["admin", "manager", "staff"] as const).includes(roleInput as UserRole) ? (roleInput as UserRole) : "staff";
    const isActive = formData.get("isActive") === "true";

    if (id === currentUserId && (role !== "admin" || !isActive)) {
      redirect("/settings?userError=You cannot remove your own admin access or disable your own account.");
    }

    await prisma.user.update({ where: { id }, data: { role, isActive } });
    revalidatePath("/settings");
    revalidatePath("/dashboard");
  }

  async function resetUserPassword(formData: FormData) {
    "use server";

    if (!isAdmin) return;

    const id = String(formData.get("id") || "");
    const newPassword = String(formData.get("newPassword") || "");
    if (!id || newPassword.length < 8) {
      redirect("/settings?resetError=Password must be at least 8 characters.");
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      redirect("/settings?resetError=User not found.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    await prisma.auditLog.create({
      data: { action: "PasswordReset", entityType: "User", entityId: id, userId: currentUserId, details: { targetUsername: target!.username } },
    });

    revalidatePath("/settings");
    redirect("/settings?resetSuccess=1");
  }

  async function changeOwnPassword(formData: FormData) {
    "use server";

    if (!currentUserId) return;

    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (newPassword.length < 8) {
      redirect("/settings?pwError=New password must be at least 8 characters.");
    }
    if (newPassword !== confirmPassword) {
      redirect("/settings?pwError=New password and confirmation do not match.");
    }

    const me = await prisma.user.findUnique({ where: { id: currentUserId } });
    if (!me) return;

    const isValid = await bcrypt.compare(currentPassword, me.passwordHash);
    if (!isValid) {
      redirect("/settings?pwError=Current password is incorrect.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: currentUserId }, data: { passwordHash } });
    await prisma.auditLog.create({ data: { action: "PasswordChange", entityType: "User", entityId: currentUserId, userId: currentUserId, details: {} } });

    redirect("/settings?pwSuccess=1");
  }

  async function importBackupAction(formData: FormData) {
    "use server";

    if (!isAdmin) return;
    const file = formData.get("backupFile");
    if (!(file instanceof File) || file.size === 0) return;

    const text = await file.text();
    const { summary, invalid } = await importBackup(text, session!.user.id);

    await prisma.auditLog.create({
      data: {
        action: "BackupImport",
        entityType: "Backup",
        entityId: file.name,
        userId: session!.user.id,
        details: invalid ? { invalid: true } : { summary },
      },
    });

    revalidatePath("/settings");
    revalidatePath("/dashboard");
    redirect("/settings?imported=1");
  }

  const importDetails = lastImportLog?.details as { invalid?: boolean; summary?: ImportSummary } | null;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Users, audit logs, and backup operations" />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Users &amp; Roles</h2>
            <span className="text-xs text-slate-600">{isAdmin ? "Admin access" : "Read-only"}</span>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            {ROLE_LEGEND.map((entry) => (
              <div key={entry.role} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{entry.label}</p>
                <p className="mt-1 text-xs text-slate-600">{entry.description}</p>
              </div>
            ))}
          </div>

          {searchParams?.userError ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{searchParams.userError}</p>
          ) : null}
          {searchParams?.userCreated ? (
            <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">User created.</p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-700">
                  <th className="px-2 py-2">Username</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Status</th>
                  {isAdmin ? <th className="px-2 py-2">Password</th> : null}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-200">
                    <td className="px-2 py-2">{user.username}{user.id === currentUserId ? <span className="ml-1 text-xs text-slate-500">(you)</span> : null}</td>
                    <td className="px-2 py-2">{user.name || "-"}</td>
                    {isAdmin ? (
                      <>
                        <td className="px-2 py-2" colSpan={2}>
                          <form action={updateUser} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="id" value={user.id} />
                            <select name="role" defaultValue={user.role} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                              <option value="admin">Admin</option>
                              <option value="manager">Manager</option>
                              <option value="staff">Staff</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-xs text-slate-700">
                              <input type="checkbox" name="isActive" value="true" defaultChecked={user.isActive} className="size-4" />
                              Active
                            </label>
                            <button type="submit" className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white">Save</button>
                          </form>
                        </td>
                        <td className="px-2 py-2">
                          <form action={resetUserPassword} className="flex items-center gap-2">
                            <input type="hidden" name="id" value={user.id} />
                            <input name="newPassword" type="password" placeholder="New password" minLength={8} required className="w-32 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" />
                            <button type="submit" className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800">Reset</button>
                          </form>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-2">{user.role}</td>
                        <td className="px-2 py-2">{user.isActive ? "Active" : "Disabled"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin && (searchParams?.resetError || searchParams?.resetSuccess) ? (
            <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${searchParams.resetError ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-900"}`}>
              {searchParams.resetError || "Password reset."}
            </p>
          ) : null}

          {isAdmin ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <h3 className="mb-3 text-base font-semibold">Add User</h3>
              <form action={createUser} className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <input name="name" placeholder="Full name (optional)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                <input name="username" placeholder="Username" required className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                <input name="email" type="email" placeholder="Email (optional)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                <input name="password" type="password" placeholder="Password (min 8 chars)" required minLength={8} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                <select name="role" defaultValue="staff" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white md:col-span-3 xl:col-span-5">Create User</button>
              </form>
            </div>
          ) : null}
        </Card>

        <Card className="min-w-0 xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">My Account</h2>
          <p className="mb-3 text-sm text-slate-600">Signed in as <span className="font-medium text-slate-800">{session?.user?.username}</span>. Change your own password below.</p>
          {searchParams?.pwError ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{searchParams.pwError}</p>
          ) : null}
          {searchParams?.pwSuccess ? (
            <p className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">Password changed.</p>
          ) : null}
          <form action={changeOwnPassword} className="grid gap-3 md:grid-cols-3">
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Current password
              <input name="currentPassword" type="password" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              New password
              <input name="newPassword" type="password" required minLength={8} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Confirm new password
              <input name="confirmPassword" type="password" required minLength={8} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm text-white md:col-span-3">Change Password</button>
          </form>
        </Card>

        <Card className="min-w-0 xl:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Database Backup</h2>
          <p className="mb-3 text-sm text-slate-600">
            Export downloads every business record (inventory, sales, quotations, lots, customers, suppliers, financials) as a single JSON file.
            User accounts and passwords are never included. Importing that file elsewhere — or back into this system — only ever adds records that
            don&apos;t already exist (matched by ID and by natural keys like IMEI, SKU, or lot/sale/invoice number); anything that already exists is left
            untouched, so re-importing the same backup, or importing into a system with overlapping data, can never overwrite or duplicate a record.
            Archived records are exported and restored in their archived state, so they stay excluded from reports either way.
          </p>
          {isAdmin ? (
            <div className="grid gap-3">
              <a href="/api/backup/export" className="inline-block w-fit rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
                Download Backup
              </a>
              <form action={importBackupAction} className="grid gap-2">
                <label className="grid gap-1 text-sm text-slate-700">
                  Import from file
                  <input type="file" name="backupFile" accept="application/json" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                </label>
                <button type="submit" className="w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800">
                  Import Backup
                </button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Only admins can export or import backups.</p>
          )}

          {searchParams?.imported && importDetails ? (
            importDetails.invalid ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">That file isn&apos;t a valid backup export.</p>
            ) : (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                <p className="mb-2 font-medium">Import complete</p>
                <div className="grid gap-1">
                  {importDetails.summary
                    ?.filter((row) => row.created > 0 || row.skipped > 0 || row.errors > 0)
                    .map((row) => (
                      <p key={row.entity} className="flex justify-between gap-2 text-xs">
                        <span className="capitalize">{row.entity}</span>
                        <span>{row.created} added · {row.skipped} already existed{row.errors ? ` · ${row.errors} failed` : ""}</span>
                      </p>
                    ))}
                  {!importDetails.summary?.some((row) => row.created > 0 || row.skipped > 0 || row.errors > 0) ? <p className="text-xs">No records found in that file.</p> : null}
                </div>
              </div>
            )
          ) : null}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Recent Audit Logs</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">Entity</th>
                <th className="px-2 py-2">User</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{log.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="px-2 py-2">{log.action}</td>
                  <td className="px-2 py-2">{log.entityType}</td>
                  <td className="px-2 py-2">{log.user?.username || "system"}</td>
                </tr>
              ))}
              {!auditLogs.length ? (
                <tr>
                  <td className="px-2 py-4 text-slate-600" colSpan={4}>
                    No audit logs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
