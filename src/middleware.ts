import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken, encode } from "next-auth/jwt";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "@/lib/auth-constants";

// Server Components can't write cookies in the App Router, so getServerSession()
// alone can never persist a refreshed token back to the browser. This runs before
// every request and is the one place that can both read and rewrite the session
// cookie — it silently renews the access token while the user is still within the
// refresh window, and lets the cookie's own maxAge lapse (forcing re-login) once
// there's been no activity for REFRESH_TOKEN_TTL_MS.
export async function middleware(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.next();

  const secureCookie = req.nextUrl.protocol === "https:";
  const token = await getToken({ req, secret, secureCookie });
  if (!token) return NextResponse.next();

  const now = Date.now();
  const accessTokenExpires = typeof token.accessTokenExpires === "number" ? token.accessTokenExpires : 0;
  if (now < accessTokenExpires) {
    return NextResponse.next();
  }

  const refreshTokenExpires = typeof token.refreshTokenExpires === "number" ? token.refreshTokenExpires : 0;
  const res = NextResponse.next();

  if (now < refreshTokenExpires) {
    // Inside the refresh window — silently reissue both.
    token.accessTokenExpires = now + ACCESS_TOKEN_TTL_MS;
    token.refreshTokenExpires = now + REFRESH_TOKEN_TTL_MS;
    delete token.error;
  } else {
    // Refresh window has also lapsed — flag it so getServerSession()'s session()
    // callback surfaces session.error and callers force a real re-login.
    token.error = "RefreshTokenExpired";
  }

  const encoded = await encode({ token, secret, maxAge: REFRESH_TOKEN_TTL_MS / 1000 });
  const cookieName = secureCookie ? "__Secure-next-auth.session-token" : "next-auth.session-token";
  res.cookies.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_MS / 1000,
  });
  return res;
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
