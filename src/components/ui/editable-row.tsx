"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Shared state for a row's inline Edit/Save/Cancel toggle, entirely client-side (no
 * `?edit=<id>` query param, no navigation). Save calls the given server action directly
 * (same "call it, then router.refresh()" pattern already used by SearchableSelect's
 * quick-add), so the action itself must not call redirect() — it returns an
 * ActionResult instead, which lets a rejected re-auth (or any other validation failure)
 * show an inline error without closing the row.
 */
export function useEditableRow(action: (formData: FormData) => Promise<ActionResult>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setEditing(true);
    setError(null);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        setEditing(false);
        setError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  // React DOM 18.3 only intercepts <form action={fn}> for real Server Actions — a plain
  // client closure passed the same way falls through to the browser's native form
  // submission (a real page navigation) instead of being called. Use a normal onSubmit
  // handler instead, matching the onClick-based pattern SearchableSelect's quick-add
  // already uses for the same "call the action directly" flow.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(new FormData(event.currentTarget));
  }

  return { editing, error, pending, open, cancel, save, handleSubmit };
}
