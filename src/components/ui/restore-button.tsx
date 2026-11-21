"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type RestoreResult = { ok: true; message?: string } | { ok: false; error: string };

export function RestoreButton({ kind, id, action }: { kind: string; id: string; action: (formData: FormData) => Promise<RestoreResult> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("id", id);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.success(result.message || "Restored");
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={onClick} disabled={pending} className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-800 disabled:opacity-60">
        {pending ? "Restoring..." : "Restore"}
      </button>
      {error ? <span className="mt-1 max-w-xs text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
