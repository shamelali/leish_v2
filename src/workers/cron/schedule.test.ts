import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { duePaths } from "./index";

type CronEntry = { path: string; schedule: string };

const declared: CronEntry[] = (
  JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: CronEntry[] }
).crons;

const at = (utcHour: number, utcMinute: number) =>
  new Date(Date.UTC(2026, 0, 15, utcHour, utcMinute, 0));

describe("leish-cron dispatch table", () => {
  it("runs the hourly sweeps at the top of every hour only", () => {
    expect(duePaths(at(7, 0))).toEqual(
      expect.arrayContaining(["/api/cron/quotation-expiry", "/api/cron/booking-transitions"]),
    );
    expect(duePaths(at(7, 30))).not.toContain("/api/cron/quotation-expiry");
  });

  it("drains the email retry queue every 5 minutes", () => {
    expect(duePaths(at(7, 5))).toEqual(["/api/cron/email-retries"]);
    expect(duePaths(at(7, 7))).toEqual([]);
  });

  it("staggers the morning sweeps instead of firing all three at once", () => {
    expect(duePaths(at(9, 0))).toContain("/api/cron/balance-reminders");
    expect(duePaths(at(9, 0))).not.toContain("/api/cron/review-requests");
    expect(duePaths(at(10, 0))).toContain("/api/cron/review-requests");
    expect(duePaths(at(11, 0))).toContain("/api/cron/quotation-recovery");
    expect(duePaths(at(11, 0))).not.toContain("/api/cron/balance-reminders");
  });

  it("dispatches exactly the set of paths vercel.json declares", () => {
    const fired = new Set<string>();
    for (let h = 0; h < 24; h += 1) {
      for (const m of [0, 5]) duePaths(at(h, m)).forEach((p) => fired.add(p));
    }
    const paths = declared.map((c) => c.path);
    expect(paths.filter((p) => !fired.has(p))).toEqual([]);
    expect([...fired].filter((p) => !paths.includes(p))).toEqual([]);
  });

  it("fires each daily sweep in its declared hour and nowhere else", () => {
    for (const { path, schedule } of declared) {
      const [minute, hour] = schedule.split(" ");
      if (hour === "*") continue;
      const due = Number(hour);
      expect(duePaths(at(due, Number(minute))), path).toContain(path);
      const otherHours = [...Array(24).keys()]
        .filter((h) => h !== due)
        .filter((h) => duePaths(at(h, 0)).includes(path));
      expect(otherHours, path).toEqual([]);
    }
  });
});
