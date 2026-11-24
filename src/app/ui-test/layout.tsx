import { notFound } from "next/navigation";

/**
 * Component harness for the automated mobile/responsive tests (tests/ui). It renders the app's
 * shared UI with fixed sample data — no login, no database. Disabled unless the server was
 * started with UI_TEST=1, so it never exists in production.
 */
export const dynamic = "force-dynamic";

export default function UiTestLayout({ children }: { children: React.ReactNode }) {
  if (process.env.UI_TEST !== "1") notFound();
  return children;
}
