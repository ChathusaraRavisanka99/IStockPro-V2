export default function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel w-full max-w-md rounded-3xl border border-white/70 p-8 dark:border-slate-700/80">
        <div className="space-y-3">
          <div className="skeleton-shimmer h-5 w-28 rounded-md" />
          <div className="skeleton-shimmer h-10 w-full rounded-xl" />
          <div className="skeleton-shimmer h-10 w-full rounded-xl" />
          <div className="skeleton-shimmer h-10 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
