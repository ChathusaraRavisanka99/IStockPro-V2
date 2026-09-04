// Shared between src/lib/auth.ts (Node runtime) and middleware.ts (Edge runtime) —
// keep this file free of any non-Edge-safe imports.
export const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const REFRESH_TOKEN_TTL_MS = 40 * 60 * 1000; // 40 minutes
