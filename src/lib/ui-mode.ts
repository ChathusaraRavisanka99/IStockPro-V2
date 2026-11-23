import { cookies } from "next/headers";

/**
 * "full" = the complete app with sidebar; "lite" = a simplified, mobile-first shell (bottom tab
 * bar, Lite home and stock check). Stored in a cookie so the server renders the right shell.
 */
export type UiMode = "full" | "lite";
export const UI_MODE_COOKIE = "istockpro-mode";

export function getUiMode(): UiMode {
  return cookies().get(UI_MODE_COOKIE)?.value === "lite" ? "lite" : "full";
}
