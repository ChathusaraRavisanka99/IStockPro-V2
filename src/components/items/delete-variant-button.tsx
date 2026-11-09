"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/components/ui/editable-row";

export function DeleteVariantButton({
  variantId,
  variantName,
  deleteAction,
  redirectTo,
  className,
}: {
  variantId: string;
  variantName: string;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm(`Delete variant "${variantName}"? Sold units keep their history.`)) return;
    const formData = new FormData();
    formData.set("id", variantId);
    startTransition(async () => {
      const result = await deleteAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={className ?? "rounded-md border border-red-200 px-2 py-0.5 text-xs text-red-700 disabled:opacity-60"}
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      {error ? <span className="mt-1 max-w-xs text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
