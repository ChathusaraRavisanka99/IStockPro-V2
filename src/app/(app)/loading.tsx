export default function AppLoading() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="glass-panel border-b border-white/65 p-4 lg:border-b-0 lg:border-r dark:border-slate-700/70">
        <div className="skeleton-shimmer mb-6 h-10 w-40 rounded-xl" />
        <div className="space-y-2">
          <div className="skeleton-shimmer h-8 w-full rounded-lg" />
          <div className="skeleton-shimmer h-8 w-full rounded-lg" />
          <div className="skeleton-shimmer h-8 w-full rounded-lg" />
          <div className="skeleton-shimmer h-8 w-full rounded-lg" />
        </div>
      </aside>
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="glass-panel rounded-3xl border border-white/65 p-6 dark:border-slate-700/70">
          <div className="skeleton-shimmer h-8 w-52 rounded-lg" />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="skeleton-shimmer h-28 rounded-2xl" />
            <div className="skeleton-shimmer h-28 rounded-2xl" />
            <div className="skeleton-shimmer h-28 rounded-2xl" />
            <div className="skeleton-shimmer h-28 rounded-2xl" />
          </div>
        </div>
      </main>
    </div>
  );
}
