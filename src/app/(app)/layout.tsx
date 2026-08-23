import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/ui/app-nav";
import { authOptions } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-slate-200 bg-white/70 p-4 backdrop-blur lg:border-b-0 lg:border-r dark:border-slate-700 dark:bg-slate-900/70">
        <Link href="/dashboard" className="mb-5 block text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          IStockPro-v2
        </Link>
        <AppNav />
      </aside>
      <main className="p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
