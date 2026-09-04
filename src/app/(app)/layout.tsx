import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/ui/app-nav";
import { MobileNav } from "@/components/ui/mobile-nav";
import { LogoutButton } from "@/components/ui/logout-button";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="glass-panel hidden border-b border-white/90 p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div>
          <Link href="/dashboard" className="mb-6 block rounded-xl px-3 py-2 text-lg font-semibold tracking-tight text-slate-950 transition hover:bg-white/75">
            IStockPro-v2
          </Link>
          <AppNav />
        </div>
        <div className="mt-auto pt-4">
          <LogoutButton name={session.user.name || session.user.username} role={session.user.role} />
        </div>
      </aside>
      <main className="p-4 sm:p-6 lg:p-8">
        <MobileNav name={session.user.name || session.user.username} role={session.user.role} />
        <div className="glass-panel rounded-3xl border border-white/90 p-4 text-slate-950 shadow-[0_25px_60px_rgba(15,23,42,0.1)] sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
