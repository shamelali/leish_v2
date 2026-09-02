// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db";
import { clearSettingsCache } from "@/server/settings";
import { runBalanceReminderSweep } from "./balance-reminders";

// Mock email, Slack, and logger so tests only exercise the sweep logic.
vi.mock("./booking-emails", () => ({
  sendBalanceReminder: vi.fn().mockResolvedValue(undefined),
  sendBalanceOverdueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./notifications", () => ({
  notifySlackOverdueBalance: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendBalanceReminder, sendBalanceOverdueEmail } from "./booking-emails";
import { notifySlackOverdueBalance } from "./notifications";

async function seedUser(id: string, role = "customer") {
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, `${id}@test.local`, "Test", role, "x:y", new Date().toISOString());
}

async function seedQuotation(bookingId: string, totalSen: number) {
  await getDb()
    .prepare(
      `INSERT INTO quotations (id, booking_id, base_fee, travel_fee, early_call_fee, accommodation_fee, extras, artist_note, total, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `q-${bookingId}`,
      bookingId,
      totalSen,
      0,
      0,
      0,
      "[]",
      null,
      totalSen,
      "pending",
      new Date().toISOString(),
      new Date(Date.now() + 86_400_000).toISOString(),
    );
}

async function seedBalancePayment(bookingId: string, status: string) {
  await getDb()
    .prepare(
      `INSERT INTO payments (id, booking_id, type, amount, currency, provider, status, provider_ref, provider_url, created_at, updated_at)
       VALUES (?, ?, 'balance', ?, 'MYR', 'dev', ?, ?, NULL, ?, ?)`,
    )
    .run(
      `p-${bookingId}`,
      bookingId,
      45_000,
      status,
      `ref-${bookingId}`,
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

let bookingCounter = 0;

async function seedBooking(
  id: string,
  userId: string,
  overrides: Partial<{
    status: string;
    date: string;
    time: string;
    artist_id: string;
    created_at: string;
  }> = {},
) {
  // Ensure uniqueness across artist_id + date + time to avoid constraint violations.
  const uniqueSuffix = `${bookingCounter++}`;
  await getDb()
    .prepare(
      `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, notes, event_type, venue, guest_count, status, balance_reminder_at, balance_escalated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
    )
    .run(
      id,
      userId,
      overrides.artist_id ?? `artist-${uniqueSuffix}`,
      "Aisha",
      "Bridal Makeup",
      150_000,
      overrides.date ?? new Date().toISOString().slice(0, 10),
      overrides.time ?? `${10 + uniqueSuffix.padStart(2, "0")}:00`,
      null,
      null,
      null,
      0,
      overrides.status ?? "confirmed",
      overrides.created_at ?? new Date().toISOString(),
    );
}

function isoDateDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearSettingsCache();
  await getDb().prepare("DELETE FROM payments").run();
  await getDb().prepare("DELETE FROM quotations").run();
  await getDb().prepare("DELETE FROM bookings").run();
  await getDb().prepare("DELETE FROM users").run();
});

describe("runBalanceReminderSweep — phase 1 (remind)", () => {
  it("reminds a confirmed booking whose balance is due within the window", async () => {
    await seedUser("u-remind");
    await seedBooking("b-remind", "u-remind", {
      status: "confirmed",
      date: isoDateDaysFromNow(2),
    });
    await seedQuotation("b-remind", 50_000);

    const result = await runBalanceReminderSweep();

    expect(result.reminded).toBe(1);
    expect(result.escalated).toBe(0);
    expect(sendBalanceReminder).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b-remind", balanceAmount: 45_000 }),
    );
    const row = (await getDb()
      .prepare("SELECT balance_reminder_at FROM bookings WHERE id = ?")
      .get("b-remind")) as { balance_reminder_at: string };
    expect(row.balance_reminder_at).toBeTruthy();
  });

  it("does not re-remind a booking within the 7-day cooldown", async () => {
    await seedUser("u-cooldown");
    await seedBooking("b-cooldown", "u-cooldown", {
      status: "confirmed",
      date: isoDateDaysFromNow(2),
    });
    await seedQuotation("b-cooldown", 50_000);
    await getDb()
      .prepare("UPDATE bookings SET balance_reminder_at = ? WHERE id = ?")
      .run(new Date().toISOString(), "b-cooldown");

    const result = await runBalanceReminderSweep();

    expect(result.reminded).toBe(0);
    expect(sendBalanceReminder).not.toHaveBeenCalled();
  });

  it("skips bookings whose balance payment is already paid", async () => {
    await seedUser("u-paid");
    await seedBooking("b-paid", "u-paid", {
      status: "confirmed",
      date: isoDateDaysFromNow(2),
    });
    await seedQuotation("b-paid", 50_000);
    await seedBalancePayment("b-paid", "paid");

    const result = await runBalanceReminderSweep();

    expect(result.reminded).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    expect(sendBalanceReminder).not.toHaveBeenCalled();
  });

  it("ignores confirmed bookings outside the reminder window", async () => {
    await seedUser("u-far");
    await seedBooking("b-far", "u-far", {
      status: "confirmed",
      date: isoDateDaysFromNow(30),
    });
    await seedQuotation("b-far", 50_000);

    const result = await runBalanceReminderSweep();

    expect(result.candidates).toBe(0);
    expect(sendBalanceReminder).not.toHaveBeenCalled();
  });
});
describe("runBalanceReminderSweep — phase 2 (escalate)", () => {
  it("escalates a completed booking with an unpaid overdue balance", async () => {
    await seedUser("u-escalate");
    await seedBooking("b-escalate", "u-escalate", {
      status: "completed",
      date: isoDateDaysFromNow(-5),
    });
    await seedQuotation("b-escalate", 50_000);

    const result = await runBalanceReminderSweep();

    expect(result.escalated).toBe(1);
    expect(sendBalanceOverdueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b-escalate", balanceAmount: 45_000 }),
    );
    expect(notifySlackOverdueBalance).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b-escalate", balanceAmount: 45_000 }),
    );
    const row = (await getDb()
      .prepare("SELECT balance_escalated_at FROM bookings WHERE id = ?")
      .get("b-escalate")) as { balance_escalated_at: string };
    expect(row.balance_escalated_at).toBeTruthy();
  });

  it("does not escalate the same completed booking twice", async () => {
    await seedUser("u-twice");
    await seedBooking("b-twice", "u-twice", {
      status: "completed",
      date: isoDateDaysFromNow(-5),
    });
    await seedQuotation("b-twice", 50_000);

    const first = await runBalanceReminderSweep();
    expect(first.escalated).toBe(1);

    vi.clearAllMocks();
    const second = await runBalanceReminderSweep();
    expect(second.escalated).toBe(0);
    expect(sendBalanceOverdueEmail).not.toHaveBeenCalled();
  });

  it("skips completed bookings whose balance is already paid", async () => {
    await seedUser("u-escal-paid");
    await seedBooking("b-escal-paid", "u-escal-paid", {
      status: "completed",
      date: isoDateDaysFromNow(-5),
    });
    await seedQuotation("b-escal-paid", 50_000);
    await seedBalancePayment("b-escal-paid", "paid");

    const result = await runBalanceReminderSweep();

    expect(result.escalated).toBe(0);
    expect(sendBalanceOverdueEmail).not.toHaveBeenCalled();
    expect(notifySlackOverdueBalance).not.toHaveBeenCalled();
  });
});
