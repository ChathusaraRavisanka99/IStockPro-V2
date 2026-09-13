"use client";

/**
 * "Confirm it's you" fields for a retroactive edit — revealed inline in the same form
 * rather than a separate modal/round-trip. The owning server action reads
 * `confirmUsername`/`confirmPassword` from the submitted FormData and verifies them
 * via `verifyCredentials()` (src/lib/auth.ts) before applying the update.
 */
export function ReauthFields({ username }: { username?: string }) {
  return (
    <div className="col-span-full grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:grid-cols-2">
      <p className="col-span-full text-xs text-amber-900">
        This value was set in an earlier stage. Confirm your password to correct it.
      </p>
      <label className="grid min-w-0 gap-1 text-xs text-slate-700">
        Confirm username
        <input name="confirmUsername" required defaultValue={username} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <label className="grid min-w-0 gap-1 text-xs text-slate-700">
        Confirm password
        <input name="confirmPassword" type="password" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
    </div>
  );
}
