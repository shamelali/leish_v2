/**
 * Ambient global declarations.
 */

export {};

declare global {
  interface Window {
    /**
     * Google Analytics gtag.js, injected by the analytics snippet when it is
     * enabled. Optional — it is absent whenever analytics is not loaded, so
     * every call site must guard before invoking it.
     */
    gtag?: (
      command: "event" | "config" | "set",
      targetOrEventName: string,
      params?: Record<string, unknown>,
    ) => void;
  }
}
