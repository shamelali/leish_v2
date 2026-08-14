"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button } from "@/components/Button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function signIn(nextUser: { name: string; email: string; role: Role }) {
    login(nextUser);
    router.push(redirect);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    // Demo auth: any valid-looking credentials sign you in.
    const name = email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    signIn({ name, email, role: "customer" });
  }

  function handleGoogle() {
    signIn({ name: "Aina Rahman", email: "aina@gmail.com", role: "customer" });
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Welcome Back</h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        Sign in to manage your appointments, favorites, and profile.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-medium">
        {[
          { role: "Client", icon: "👤" },
          { role: "Pro MUA", icon: "🎨" },
          { role: "Studio", icon: "💄" },
        ].map((r) => (
          <span key={r.role} className="rounded-full bg-stone-100 px-2 py-2 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {r.icon} {r.role}
          </span>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email Address"
          required
          className={inputCls}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className={inputCls}
        />
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <Button type="submit" className="w-full">Log In</Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
        <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
        or continue with
        <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogle}>
        <svg viewBox="0 0 24 24" className="h-4 w-4">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 001 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
        Sign in with Google
      </Button>

      <div className="mt-6 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400">Forgot Password?</Link>
        <span className="text-stone-500 dark:text-stone-400">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400">Sign Up Free</Link>
        </span>
      </div>
      <p className="mt-8 text-center text-xs text-stone-400 dark:text-stone-500">
        Demo build — any credentials will sign you in; no data leaves your browser.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-24 text-center text-stone-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
