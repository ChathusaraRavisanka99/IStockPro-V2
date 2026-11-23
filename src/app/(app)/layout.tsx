import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/ui/app-nav";
import { MobileNav } from "@/components/ui/mobile-nav";
import { LogoutButton } from "@/components/ui/logout-button";
import { authOptions } from "@/lib/auth";
import { schedulePurgeIfDue } from "@/lib/purge";
import { BrowserErrorReporter } from "@/components/ui/browser-error-reporter";
import { LiteShell } from "@/components/ui/lite-shell";
import { LiteSuggestion, ModeSwitch } from "@/components/ui/mode-switch";
import { getUiMode } from "@/lib/ui-mode";
import { Suspense } from "react";
import { ReturnToBanner } from "@/components/ui/return-to-banner";
import { TableSorter } from "@/components/ui/table-sorter";
import { BackNav } from "@/components/ui/back-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.error) {
    redirect("/login");
  }

  // Permanently remove records soft-deleted 30+ days ago (throttled, runs in the background).
  schedulePurgeIfDue();

  const userName = session.user.name || session.user.username;
  if (getUiMode() === "lite") {
    return (
      <>
        <BrowserErrorReporter />
        <TableSorter />
        <LiteShell name={userName} role={session.user.role}>
          <Suspense fallback={null}>
            <BackNav />
            <ReturnToBanner />
          </Suspense>
          {children}
        </LiteShell>
      </>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr] print:!block">
      <aside className="glass-panel hidden print:!hidden border-b border-white/90 p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div>
          <Link href="/dashboard" className="mb-6 block rounded-xl px-3 py-2 text-lg font-semibold tracking-tight text-slate-950 transition hover:bg-white/75">
            IStockPro-v2
          </Link>
          <AppNav />
        </div>
        <div className="mt-auto grid gap-3 pt-4">
          <ModeSwitch mode="full" />
          <LogoutButton name={userName} role={session.user.role} />
        </div>
      </aside>
      <BrowserErrorReporter />
        <TableSorter />
      <main className="min-w-0 p-3 sm:p-6 lg:p-8 print:p-0">
        <MobileNav name={userName} role={session.user.role} />
        <LiteSuggestion />
        <div className="glass-panel rounded-2xl border border-white/90 p-3 text-slate-950 shadow-[0_25px_60px_rgba(15,23,42,0.1)] sm:rounded-3xl sm:p-6 lg:p-8 print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
          <Suspense fallback={null}>
            <BackNav />
            <ReturnToBanner />
          </Suspense>
          {children}
        </div>
      </main>
    </div>
  );
}
