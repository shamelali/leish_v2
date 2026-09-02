// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db";
import { autoCompletePastBookings, autoCancelStaleBookings } from "./booking-transitions";

// Mock email so tests don't depend on the email provider.
vi.mock("@/server/booking-emails", () => ({
  notifyBookingStatusChanged: vi.fn().mockResolvedValue(undefined),
  getOwnerEmail: vi.fn(),
}));

vi.mock("@/server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function seedUser(id: string, role = "customer") {
  return getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, `${id}@test.local`, "Test", role, "x:y", new Date().toISOString());
}

let bookingCounter = 0;

function seedBooking(
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
  return getDb()
    .prepare(
      `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      overrides.artist_id ?? `artist-${uniqueSuffix}`,
      "Aisha",
      "Bridal Makeup",
      150000,
      overrides.date ?? new Date().toISOString().slice(0, 10),
      overrides.time ?? `${10 + uniqueSuffix.padStart(2, "0")}:00`,
      overrides.status ?? "confirmed",
      overrides.created_at ?? new Date().toISOString(),
    );
}

describe("autoCompletePastBookings", () => {
  it("completes confirmed bookings whose event date has passed", async () => {
    await seedUser("u-complete");
    await seedBooking("b-past", "u-complete", {
      status: "confirmed",
      date: "2020-01-01", // far in the past
    });

    const results = await autoCompletePastBookings();

    expect(results).toHaveLength(1);
    expect(results[0].bookingId).toBe("b-past");
    expect(results[0].toStatus).toBe("completed");

    const updated = (await getDb()
      .prepare("SELECT status FROM bookings WHERE id = ?")
      .get("b-past")) as {
      status: string;
    };
    expect(updated.status).toBe("completed");
  });

  it("does not touch confirmed bookings that are still upcoming", async () => {
    await seedUser("u-future");
    const futureDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); // tomorrow
    await seedBooking("b-future", "u-future", { status: "confirmed", date: futureDate });

    const results = await autoCompletePastBookings();

    expect(results).toHaveLength(0);

    const unchanged = (await getDb()
      .prepare("SELECT status FROM bookings WHERE id = ?")
      .get("b-future")) as {
      status: string;
    };
    expect(unchanged.status).toBe("confirmed");
  });

  it("does not touch non-confirmed bookings", async () => {
    await seedUser("u-requested");
    await seedBooking("b-req", "u-requested", {
      status: "requested",
      date: "2020-01-01",
    });

    const results = await autoCompletePastBookings();
    expect(results).toHaveLength(0);
  });
});

describe("autoCancelStaleBookings", () => {
  it("cancels requested bookings older than 48h", async () => {
    await seedUser("u-stale");
    const oldDate = new Date(Date.now() - 50 * 3_600_000).toISOString(); // 50h ago
    await seedBooking("b-stale", "u-stale", {
      status: "requested",
      created_at: oldDate,
    });

    const results = await autoCancelStaleBookings();

    expect(results).toHaveLength(1);
    expect(results[0].bookingId).toBe("b-stale");
    expect(results[0].toStatus).toBe("cancelled");

    const updated = (await getDb()
      .prepare("SELECT status FROM bookings WHERE id = ?")
      .get("b-stale")) as {
      status: string;
    };
    expect(updated.status).toBe("cancelled");
  });

  it("does not cancel requested bookings younger than 48h", async () => {
    await seedUser("u-recent");
    const recent = new Date(Date.now() - 2 * 3_600_000).toISOString(); // 2h ago
    await seedBooking("b-recent", "u-recent", {
      status: "requested",
      created_at: recent,
    });

    const results = await autoCancelStaleBookings();
    expect(results).toHaveLength(0);

    const unchanged = (await getDb()
      .prepare("SELECT status FROM bookings WHERE id = ?")
      .get("b-recent")) as {
      status: string;
    };
    expect(unchanged.status).toBe("requested");
  });

  it("does not cancel accepted bookings (still in negotiation)", async () => {
    await seedUser("u-accepted");
    const oldDate = new Date(Date.now() - 72 * 3_600_000).toISOString(); // 72h ago
    await seedBooking("b-accepted", "u-accepted", {
      status: "accepted",
      created_at: oldDate,
    });

    const results = await autoCancelStaleBookings();
    expect(results).toHaveLength(0);

    const unchanged = (await getDb()
      .prepare("SELECT status FROM bookings WHERE id = ?")
      .get("b-accepted")) as {
      status: string;
    };
    expect(unchanged.status).toBe("accepted");
  });
});
