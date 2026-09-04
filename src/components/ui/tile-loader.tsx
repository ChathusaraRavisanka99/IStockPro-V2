type TileGridProps = {
  columns?: number;
  rows?: number;
  tileClassName?: string;
  gapClassName?: string;
  /** ms per row / per column of stagger — smaller = snappier cascade. */
  rowStepMs?: number;
  colStepMs?: number;
  /** how long each individual tile's drop-and-land animation takes. */
  durationMs?: number;
};

const DEFAULT_GRID = { columns: 4, rows: 4, rowStepMs: 70, colStepMs: 45, durationMs: 560 };

// Every tile drops in a cascading wave: earlier rows lead, and within a row the
// columns fan out slightly, so it reads as "raining down and building the view"
// rather than everything landing in lockstep.
export function tileDropTotalMs({ columns = DEFAULT_GRID.columns, rows = DEFAULT_GRID.rows, rowStepMs = DEFAULT_GRID.rowStepMs, colStepMs = DEFAULT_GRID.colStepMs, durationMs = DEFAULT_GRID.durationMs }: TileGridProps = {}) {
  return (rows - 1) * rowStepMs + (columns - 1) * colStepMs + durationMs;
}

export function TileGrid({
  columns = DEFAULT_GRID.columns,
  rows = DEFAULT_GRID.rows,
  tileClassName = "size-6 sm:size-7",
  gapClassName = "gap-2.5",
  rowStepMs = DEFAULT_GRID.rowStepMs,
  colStepMs = DEFAULT_GRID.colStepMs,
  durationMs = DEFAULT_GRID.durationMs,
}: TileGridProps) {
  const tiles = Array.from({ length: columns * rows }, (_, i) => ({ col: i % columns, row: Math.floor(i / columns) }));
  const totalDropMs = tileDropTotalMs({ columns, rows, rowStepMs, colStepMs, durationMs });

  return (
    <div className="relative flex items-center justify-center">
      <div className="tile-glow pointer-events-none absolute inset-[-30%]" aria-hidden="true" />
      <div
        className={`tile-idle-pulse relative grid ${gapClassName}`}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, ["--tile-idle-delay" as string]: `${totalDropMs}ms` }}
        role="status"
      >
        {tiles.map(({ col, row }) => (
          <div
            key={`${row}-${col}`}
            className={`tile-drop rounded-lg shadow-[0_6px_14px_rgba(30,64,175,0.28)] ${tileClassName}`}
            style={{
              ["--tile-delay" as string]: `${row * rowStepMs + col * colStepMs}ms`,
              ["--tile-duration" as string]: `${durationMs}ms`,
              background: `linear-gradient(155deg, rgba(96,165,250,${0.95 - row * 0.12}), rgba(37,99,235,${0.85 - row * 0.12}))`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function TileLoader({ label = "Loading IStockPro-v2" }: { label?: string }) {
  const totalDropMs = tileDropTotalMs();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8">
        <TileGrid tileClassName="size-8 sm:size-9" gapClassName="gap-3" />
        <div
          className="text-center opacity-0"
          style={{ animation: "tile-loader-label 420ms ease-out forwards", animationDelay: `${totalDropMs}ms` }}
        >
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{label}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Preparing your workspace...</p>
        </div>
      </div>
    </main>
  );
}
