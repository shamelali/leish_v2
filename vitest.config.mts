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
      reporter: ["text", "text-summary", "lcov", "html"],
      // Cover the business/logic layers, cron routes, and request proxy.
      // UI-heavy client components, browser SDK wrappers, and pure type/data
      // modules are excluded so the metric reflects unit-testable logic.
      include: ["src/lib/**", "src/server/**", "src/app/api/cron/**/*.ts", "src/proxy.ts"],
      exclude: [
        "src/lib/data.ts",
        "src/lib/types.ts",
        "src/lib/auth.tsx",
        "src/lib/theme.tsx",
        "src/lib/agnost-client.ts",
        "src/lib/ops/cron-auth.ts",
        "src/lib/chat/**",
        "src/lib/supabase/**",
        "src/server/__integration__/**",
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: {
        // Ratchet: floor CI enforces across all business/server/cron modules.
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
