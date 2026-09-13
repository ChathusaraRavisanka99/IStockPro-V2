import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyCredentials } from "@/lib/auth";

/**
 * Confirms the *currently logged-in* user's own password, reading `confirmUsername`/
 * `confirmPassword` off the submitted FormData. Used by server actions that let someone
 * correct a value from an earlier lot stage — see the stage-relative re-auth rule in
 * src/app/(app)/lots/[id]/page.tsx.
 */
export async function checkReauth(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerSession(authOptions);
  const confirmUsername = String(formData.get("confirmUsername") || "").trim();
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!confirmUsername || !confirmPassword) {
    return { ok: false, error: "Enter your username and password to confirm this change." };
  }
  if (confirmUsername.toLowerCase() !== (session?.user?.username || "").toLowerCase()) {
    return { ok: false, error: "That username doesn't match your logged-in account." };
  }
  const verified = await verifyCredentials(confirmUsername, confirmPassword);
  if (!verified) {
    return { ok: false, error: "Incorrect username or password." };
  }
  return { ok: true };
}
