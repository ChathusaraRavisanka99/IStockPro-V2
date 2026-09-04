export default function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel w-full max-w-md rounded-3xl border border-white/70 p-8 dark:border-slate-700/80">
        <div className="space-y-3">
          <div className="tile-drop skeleton-shimmer h-5 w-28 rounded-md" style={{ ["--tile-delay" as string]: "0ms" }} />
          <div className="tile-drop skeleton-shimmer h-10 w-full rounded-xl" style={{ ["--tile-delay" as string]: "90ms" }} />
          <div className="tile-drop skeleton-shimmer h-10 w-full rounded-xl" style={{ ["--tile-delay" as string]: "180ms" }} />
          <div className="tile-drop skeleton-shimmer h-10 w-full rounded-xl" style={{ ["--tile-delay" as string]: "270ms" }} />
        </div>
      </div>
    </main>
  );
}
