import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from "@/lib/auth-constants";

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

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
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
