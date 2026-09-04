export default function AppLoading() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="glass-panel border-b border-white/65 p-4 lg:border-b-0 lg:border-r dark:border-slate-700/70">
        <div className="tile-drop skeleton-shimmer mb-6 h-10 w-40 rounded-xl" style={{ ["--tile-delay" as string]: "0ms" }} />
        <div className="space-y-2">
          <div className="tile-drop skeleton-shimmer h-8 w-full rounded-lg" style={{ ["--tile-delay" as string]: "70ms" }} />
          <div className="tile-drop skeleton-shimmer h-8 w-full rounded-lg" style={{ ["--tile-delay" as string]: "140ms" }} />
          <div className="tile-drop skeleton-shimmer h-8 w-full rounded-lg" style={{ ["--tile-delay" as string]: "210ms" }} />
          <div className="tile-drop skeleton-shimmer h-8 w-full rounded-lg" style={{ ["--tile-delay" as string]: "280ms" }} />
        </div>
      </aside>
      <main className="p-4 sm:p-6 lg:p-8">
        <div className="glass-panel rounded-3xl border border-white/65 p-6 dark:border-slate-700/70">
          <div className="tile-drop skeleton-shimmer h-8 w-52 rounded-lg" style={{ ["--tile-delay" as string]: "120ms" }} />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="tile-drop skeleton-shimmer h-28 rounded-2xl" style={{ ["--tile-delay" as string]: "190ms" }} />
            <div className="tile-drop skeleton-shimmer h-28 rounded-2xl" style={{ ["--tile-delay" as string]: "240ms" }} />
            <div className="tile-drop skeleton-shimmer h-28 rounded-2xl" style={{ ["--tile-delay" as string]: "290ms" }} />
            <div className="tile-drop skeleton-shimmer h-28 rounded-2xl" style={{ ["--tile-delay" as string]: "340ms" }} />
          </div>
        </div>
      </main>
    </div>
  );
}
