import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Isolate DB-backed tests from the dev/prod database file.
process.env.LEISH_DB_PATH = ":memory:";

// vitest.config.mts runs with globals:false, so @testing-library/react's
// automatic cleanup never registers. Without this, rendered trees stay
// mounted and React's scheduler finishes pending work after the jsdom
// environment is torn down — the run then fails with an unhandled
// "ReferenceError: window is not defined" (Button.test.tsx).
afterEach(() => {
  cleanup();
});
