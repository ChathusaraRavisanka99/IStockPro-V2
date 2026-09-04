import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "@/lib/auth-constants";

const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_THRESHOLD = 5;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // Outer cookie ceiling — matches the refresh window. middleware.ts is what
    // actually renews the cookie on activity (Server Components can't write
    // cookies in the App Router), so this is the hard cap for a fully idle browser.
    maxAge: REFRESH_TOKEN_TTL_MS / 1000,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = credentials.username.trim();

        // Same lockout applies whether the username exists or not, and every
        // failure (bad username, inactive account, wrong password) is logged
        // identically below — a distinguishable response here would let an
        // attacker use the lockout itself to enumerate valid usernames.
        const recentFailures = await prisma.auditLog.count({
          where: { action: "LoginFailure", entityId: username, createdAt: { gte: new Date(Date.now() - LOGIN_LOCKOUT_WINDOW_MS) } },
        });
        if (recentFailures >= LOGIN_LOCKOUT_THRESHOLD) {
          throw new Error("TooManyAttempts");
        }

        const user = await prisma.user.findUnique({
          where: { username },
        });

        async function recordFailure() {
          await prisma.auditLog.create({
            data: { action: "LoginFailure", entityType: "User", entityId: username, userId: user?.id, details: {} },
          }).catch(() => {});
        }

        if (!user || !user.isActive) {
          await recordFailure();
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          await recordFailure();
          return null;
        }

        return {
          id: user.id,
          name: user.name ?? user.username,
          email: user.email,
          role: user.role,
          username: user.username,
        };
      },
    }),
  ],
  callbacks: {
    // Owns only the initial sign-in shape. The 30-minute-access / 40-minute-refresh
    // expiry transitions are decided and persisted in middleware.ts, since that's
    // the one place able to both read and rewrite the session cookie on every
    // request — a Server Component's getServerSession() call is read-only here.
    jwt({ token, user }) {
      if (user) {
        const authUser = user as { role?: "admin" | "manager" | "staff"; username?: string };
        const now = Date.now();
        token.role = authUser.role;
        token.username = authUser.username;
        token.accessTokenExpires = now + ACCESS_TOKEN_TTL_MS;
        token.refreshTokenExpires = now + REFRESH_TOKEN_TTL_MS;
        delete token.error;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as "admin" | "manager" | "staff") ?? "staff";
        session.user.username = (token.username as string | undefined) ?? "";
      }
      if (token.error) {
        session.error = token.error;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
