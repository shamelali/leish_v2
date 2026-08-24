"use client";

import { useEffect, useRef } from "react";
import { setTurnstileToken } from "@/lib/turnstile-token";

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (dev/e2e) —
 * the server skips verification in that case too. When configured, loads the
 * Turnstile script once and surfaces the token via onVerify.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void; theme?: string },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export function TurnstileWidget({ onVerify }: { onVerify: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    // Script already loaded (e.g. second widget on the page): render now,
    // synchronously — no state transition needed.
    if (window.turnstile && containerRef.current && widgetIdRef.current === null) {
      renderWidget();
      return;
    }
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      // Script tag exists from another mount — poll until the API lands.
      const timer = setInterval(() => {
        if (window.turnstile) {
          clearInterval(timer);
          renderWidget();
        }
      }, 100);
      return () => clearInterval(timer);
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      if (containerRef.current) renderWidget();
    };
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renderWidget is stable per mount
  }, []);

  function renderWidget() {
    if (!SITE_KEY || !window.turnstile || !containerRef.current || widgetIdRef.current !== null)
      return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token) => {
        setTurnstileToken(token);
        onVerify(token);
      },
      "error-callback": () => {
        setTurnstileToken(null);
        onVerify(null);
      },
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    });
  }

  if (!SITE_KEY) return null;

  return <div ref={containerRef} className="my-3" data-testid="turnstile" />;
}
