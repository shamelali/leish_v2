import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Cover the business/logic layers. UI-heavy client components and pure
      // type/data modules are excluded so the metric reflects tested logic.
      include: ["src/lib/**", "src/server/**"],
      exclude: [
        "src/lib/data.ts",
        "src/lib/types.ts",
        "src/lib/auth.tsx",
        "src/lib/theme.tsx",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: {
        // Audit target: 80% across all metrics (Phase 2 report).
        // Current measured: ~68% statements / 62% branches / 70% functions/lines.
        // Enforce a modest gate above the prior 60/55 baseline; raise to 80
        // incrementally as referral/upload/turnstile coverage lands.
        statements: 65,
        branches: 60,
        functions: 68,
        lines: 68,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
