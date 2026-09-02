"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { PrimaryButton } from "@/components/ui/primary-button";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Enter your username and password.");
      return;
    }

    setLoading(true);
    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Invalid username or password.");
        return;
      }
      if (!result?.ok) {
        toast.error("Sign in failed. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[14%] top-[15%] h-44 w-44 rounded-full bg-blue-300/40 blur-3xl" />
        <div className="absolute bottom-[12%] right-[15%] h-52 w-52 rounded-full bg-cyan-200/40 blur-3xl" />
      </div>

      <Card className="glass-panel relative w-full max-w-md rounded-3xl border border-white/90 p-8 shadow-[0_28px_80px_rgba(15,23,42,0.15)] dark:border-slate-700/85 dark:shadow-[0_28px_80px_rgba(2,6,23,0.45)]">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-700">Inventory Suite</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">IStockPro-v2</h1>
          <p className="mt-2 text-sm font-medium text-slate-700">Sign in to continue to your workspace</p>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
            Username
            <input
              autoComplete="username"
              placeholder="Your username"
              className="rounded-xl border border-slate-300/90 bg-white/90 px-3.5 py-2.5 text-slate-900 shadow-sm transition placeholder:text-slate-500 focus:border-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
            Password
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              className="rounded-xl border border-slate-300/90 bg-white/90 px-3.5 py-2.5 text-slate-900 shadow-sm transition placeholder:text-slate-500 focus:border-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <PrimaryButton
            disabled={loading}
            type="submit"
            className="mt-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(15,23,42,0.25)] hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            {loading ? "Signing in..." : "Sign In"}
          </PrimaryButton>
        </form>
      </Card>
    </main>
  );
}
