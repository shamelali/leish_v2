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
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
});
