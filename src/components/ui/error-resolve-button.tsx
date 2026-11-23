"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { setErrorResolved } from "@/lib/error-report-actions";

/** Marks every occurrence in a group resolved (with an optional note) or re-opens them. */
export function ErrorResolveButton({ ids, resolved }: { ids: string[]; resolved: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    const note = resolved ? undefined : window.prompt("Optional note — what fixed it?") ?? undefined;
    startTransition(async () => {
      for (const id of ids) await setErrorResolved(id, !resolved, note);
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={run} disabled={pending} className={resolved ? "btn btn-xs btn-secondary" : "btn btn-xs btn-success"}>
      {resolved ? <RotateCcw /> : <CheckCircle2 />}
      {pending ? "Saving…" : resolved ? "Reopen" : "Mark resolved"}
    </button>
  );
}
