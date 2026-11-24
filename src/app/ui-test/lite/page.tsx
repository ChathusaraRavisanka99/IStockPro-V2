import { Suspense } from "react";
import { LiteShell } from "@/components/ui/lite-shell";
import { BackNav } from "@/components/ui/back-nav";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { LONG_NAME, LONG_PHONE } from "../fixtures";

/** The Lite shell (bottom tabs + More sheet) around sample content. */
export default function UiTestLitePage() {
  return (
    <LiteShell name={LONG_NAME} role="staff">
      <Suspense fallback={null}>
        <BackNav />
      </Suspense>
      <h1 className="text-xl font-semibold" data-testid="harness-ready">Hi, {LONG_NAME.split(" ")[0]}</h1>
      <section className="mt-3 grid grid-cols-2 gap-2">
        {["Sales today", "Owed to you"].map((label) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="break-words text-base font-semibold">{formatMoney(12972670.52)}</p>
          </div>
        ))}
      </section>
      <Card className="mt-3">
        <p className="truncate">{LONG_PHONE}</p>
      </Card>
    </LiteShell>
  );
}
