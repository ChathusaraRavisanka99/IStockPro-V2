# Tests

| Command | What it checks | Needs |
| --- | --- | --- |
| `npm test` | Static rules: no overflow-prone layouts in the code (`scripts/check-responsive.mjs`), every page is in the phone menus, the Light/Dark/System switch is in both phone top bars, Back button and table sorting are mounted. | nothing |
| `npm run test:ui` | Real browser at 320 / 360 / 390 / 768 px, light and dark, against the UI harness (`src/app/ui-test`, sample data): no sideways scrolling, theme switch works, menus list every page, tables scroll inside their card, the sale and price-history popups work. | Chrome (or `npx playwright install chromium`) |
| `npm run test:e2e` | Logs in and opens every real page at phone width: no sideways scrolling. Browse-only. | `E2E_USERNAME` / `E2E_PASSWORD` in `.env.local` and `npm run dev` running |
| `npm run check:responsive` | Prints every responsive finding in the code. | nothing |

Run `npm test` and `npm run test:ui` before pushing UI changes. The browser tests use the `playwright` package — if it is missing on a fresh setup, run `npm install -D playwright@1.63.0` once.

## Rules of thumb that keep phones working

- Put every `<table>` inside `<div className="overflow-x-auto">` (or `DataTableShell`). On phones its cells stay on one line and the table scrolls inside its card; add `wrap-cell` to a cell that should wrap (long notes).
- Grid cells may shrink (`.grid > * { min-width: 0 }` in `globals.css`), so long truncated names can't widen the page. Flex children that hold truncated text still need `min-w-0`.
- Rows of 3+ buttons need `flex-wrap`.
- Multi-column grids start at 1–2 columns and grow with `sm:` / `md:` prefixes.
- A reviewed exception gets a `responsive-ok` comment on or above the line.
- New pages go in `src/lib/navigation.ts` so they appear in the sidebar, the phone drawer and Lite "More".
- New shared UI belongs in the harness (`src/app/ui-test/page.tsx`) with long sample data.
