"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { Button } from "@/components/Button";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { id: Role; label: string; hint: string; icon: string }[] = [
  { id: "customer", label: "Client", hint: "Book artists & studios", icon: "👤" },
  { id: "artist", label: "Artist", hint: "Pro MUA — get booked", icon: "🎨" },
  { id: "studio", label: "Studio", hint: "Salon or studio", icon: "💄" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [role, setRole] = useState<Role>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    // Demo auth — registers locally only.
    login({ name: name.trim(), email, role });
    if (role === "artist") {
      router.push("/onboarding?new=1");
    } else {
      router.push("/dashboard");
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Create your account</h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Choose your path — switch roles any time.</p>

      <div className="mt-6 grid grid-cols-3 gap-2">
        {ROLE_OPTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRole(r.id)}
            className={cn(
              "rounded-2xl border p-3 text-center transition-colors",
              role === r.id
                ? "border-rose-600 bg-rose-50 ring-2 ring-rose-100 dark:border-rose-500 dark:bg-rose-500/10 dark:ring-rose-900/40"
                : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600",
            )}
          >
            <span className="text-xl">{r.icon}</span>
            <p className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">{r.label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-stone-500 dark:text-stone-400">{r.hint}</p>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
          className={inputCls}
        />
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
          placeholder="Password (min. 6 characters)"
          required
          className={inputCls}
        />
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <Button type="submit" className="w-full">Sign Up Free</Button>
      </form>

      <p className="mt-5 text-center text-sm text-stone-500 dark:text-stone-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400">Log in</Link>
      </p>
      <p className="mt-8 text-center text-xs text-stone-400 dark:text-stone-500">
        Demo build — accounts are stored in your browser only.
      </p>
    </div>
  );
}
