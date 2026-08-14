"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Reset your password</h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        Enter your email and we&apos;ll send you a link to create a new password.
      </p>

      {sent ? (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800/60 dark:bg-emerald-500/10">
          <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-400">Check your inbox 📬</p>
          <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300/90">
            If an account exists for <span className="font-medium">{email}</span>, a reset link is on
            its way. (Demo — no email was actually sent.)
          </p>
          <div className="mt-6">
            <Button href="/login" variant="outline">Back to Log in</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="mt-6 space-y-4"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email Address"
            required
            className={inputCls}
          />
          <Button type="submit" className="w-full">Send Reset Link</Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400">Log in</Link>
      </p>
    </div>
  );
}
