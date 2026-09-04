// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `notifications.ts` reads SLACK_CHANNEL_ID at module scope, so every test has
 * to reset the module registry and re-import after setting the env. The Connect
 * token helper is mocked so nothing reaches the network.
 */

const getConnectToken = vi.fn<() => Promise<string | null>>();

vi.mock("./connect", () => ({
  getConnectToken: () => getConnectToken(),
}));

type Notifications = typeof import("./notifications");

async function loadWithChannel(channel: string | undefined): Promise<Notifications> {
  vi.resetModules();
  if (channel === undefined) delete process.env.SLACK_CHANNEL_ID;
  else process.env.SLACK_CHANNEL_ID = channel;
  return import("./notifications");
}

/** The JSON body of the single most recent chat.postMessage call. */
function lastPostBody(): Record<string, unknown> {
  const mockFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const [, init] = mockFetch.mock.calls.at(-1)!;
  return JSON.parse((init as RequestInit).body as string);
}

const originalFetch = globalThis.fetch;
const originalChannel = process.env.SLACK_CHANNEL_ID;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getConnectToken.mockReset().mockResolvedValue("xoxb-test-token");
  fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  process.env.NEXT_PUBLIC_SITE_URL = "https://leish.test";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalChannel === undefined) delete process.env.SLACK_CHANNEL_ID;
  else process.env.SLACK_CHANNEL_ID = originalChannel;
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  vi.restoreAllMocks();
});

const bookingParams = {
  bookingId: "0123456789abcdef",
  artistName: "Aina Makeup",
  service: "Bridal Reception",
  date: "2026-11-02",
  time: "09:00",
} as const;

describe("server/notifications — delivery guards", () => {
  it("does not call Slack when SLACK_CHANNEL_ID is unset", async () => {
    const n = await loadWithChannel(undefined);
    await n.notifySlackBookingStatus({ ...bookingParams, status: "requested" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getConnectToken).not.toHaveBeenCalled();
  });

  it("does not call Slack when Connect returns no token", async () => {
    getConnectToken.mockResolvedValue(null);
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({ ...bookingParams, status: "requested" });
    expect(getConnectToken).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a network error rather than throwing at the call site", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const n = await loadWithChannel("C01ABC123");
    await expect(
      n.notifySlackBookingStatus({ ...bookingParams, status: "confirmed" }),
    ).resolves.toBeUndefined();
  });

  it("swallows a Slack API-level failure (ok:false)", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: false, error: "channel_not_found" }) });
    const n = await loadWithChannel("C01ABC123");
    await expect(
      n.notifySlackBookingStatus({ ...bookingParams, status: "confirmed" }),
    ).resolves.toBeUndefined();
  });

  it("posts to the configured channel with a bearer token", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({ ...bookingParams, status: "requested" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer xoxb-test-token",
      "Content-Type": "application/json",
    });
    expect(lastPostBody().channel).toBe("C01ABC123");
  });
});

describe("server/notifications — notifySlackBookingStatus", () => {
  it.each([
    ["requested", "📩", "New booking request"],
    ["accepted", "✅", "Booking accepted"],
    ["confirmed", "🎉", "Booking confirmed (deposit paid)"],
    ["completed", "🏁", "Booking completed"],
    ["cancelled", "❌", "Booking cancelled"],
  ] as const)("renders %s with its emoji and label", async (status, emoji, label) => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({ ...bookingParams, status });

    const body = lastPostBody();
    expect(body.text).toContain(`${emoji} ${label}`);
    // Fallback text carries the 8-char short reference.
    expect(body.text).toContain("#01234567");
  });

  it("omits the client and price fields when they are not supplied", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({ ...bookingParams, status: "requested" });

    const serialised = JSON.stringify(lastPostBody());
    expect(serialised).not.toContain("*Client:*");
    expect(serialised).not.toContain("*Price:*");
  });

  it("includes the client name and formats price from sen to ringgit", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({
      ...bookingParams,
      status: "confirmed",
      clientName: "Siti",
      price: 45000,
    });

    const serialised = JSON.stringify(lastPostBody());
    expect(serialised).toContain("*Client:*\\nSiti");
    expect(serialised).toContain("RM 450.00");
  });

  it("renders a price of zero rather than dropping the field", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({ ...bookingParams, status: "confirmed", price: 0 });
    expect(JSON.stringify(lastPostBody())).toContain("RM 0.00");
  });

  it("links the action button at the admin bookings page", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({ ...bookingParams, status: "requested" });
    expect(JSON.stringify(lastPostBody())).toContain("https://leish.test/admin/bookings");
  });

  it("falls back to the production URL when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackBookingStatus({ ...bookingParams, status: "requested" });
    expect(JSON.stringify(lastPostBody())).toContain("https://leish.my/admin/bookings");
  });
});

describe("server/notifications — notifySlackPayment", () => {
  it("labels a deposit and converts the amount", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackPayment({
      bookingId: "0123456789abcdef",
      artistName: "Aina Makeup",
      amountSen: 20000,
      type: "deposit",
    });

    const body = lastPostBody();
    expect(body.text).toContain("💰 Deposit received");
    expect(body.text).toContain("RM 200.00");
    expect(body.text).toContain("#01234567");
  });

  it("labels a balance payment distinctly from a deposit", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackPayment({
      bookingId: "0123456789abcdef",
      artistName: "Aina Makeup",
      amountSen: 130050,
      type: "balance",
    });

    const body = lastPostBody();
    expect(body.text).toContain("Balance payment received");
    expect(body.text).toContain("RM 1300.50");
  });
});

describe("server/notifications — notifySlackOverdueBalance", () => {
  it("posts an overdue alert with the amount due", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackOverdueBalance({
      bookingId: "0123456789abcdef",
      artistName: "Aina Makeup",
      service: "Bridal Reception",
      balanceAmount: 80000,
    });

    const body = lastPostBody();
    expect(body.text).toContain("🚨 Balance overdue");
    expect(body.text).toContain("RM 800.00");
  });

  it("includes the client name when supplied", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackOverdueBalance({
      bookingId: "0123456789abcdef",
      artistName: "Aina Makeup",
      service: "Bridal Reception",
      clientName: "Siti",
      balanceAmount: 80000,
    });
    expect(JSON.stringify(lastPostBody())).toContain("*Client:*\\nSiti");
  });
});

describe("server/notifications — notifySlackPayoutSummary", () => {
  it("stays silent when nothing settled and nothing failed", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackPayoutSummary({ settled: 0, failed: 0, pendingRemaining: 7 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts when at least one payout settled", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackPayoutSummary({ settled: 3, failed: 0, pendingRemaining: 2 });
    expect(lastPostBody().text).toBe("💰 Payout automation: 3 settled, 0 failed, 2 pending");
  });

  it("posts when a payout failed even with none settled", async () => {
    const n = await loadWithChannel("C01ABC123");
    await n.notifySlackPayoutSummary({ settled: 0, failed: 1, pendingRemaining: 0 });
    expect(lastPostBody().text).toContain("0 settled, 1 failed");
    expect(JSON.stringify(lastPostBody())).toContain("https://leish.test/admin/payouts");
  });
});
