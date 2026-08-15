import "@testing-library/jest-dom/vitest";

// Isolate DB-backed tests from the dev/prod database file.
process.env.LEISH_DB_PATH = ":memory:";
