import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "manager" | "staff";
      username: string;
    } & DefaultSession["user"];
    error?: "RefreshTokenExpired";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "manager" | "staff";
    username?: string;
    accessTokenExpires?: number;
    refreshTokenExpires?: number;
    error?: "RefreshTokenExpired";
  }
}
