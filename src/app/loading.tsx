export default function RootLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel w-full max-w-xl rounded-3xl border border-white/70 p-8 text-center dark:border-slate-700/80">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 dark:border-slate-600 dark:border-t-slate-100" />
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Loading IStockPro-v2</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Preparing your workspace...</p>
      </div>
    </main>
  );
}
