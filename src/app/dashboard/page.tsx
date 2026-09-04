"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { getTurnstileToken } from "@/lib/turnstile-token";
import type { Artist } from "@/lib/types";
import { catalogImageSrc, catalogPath, formatRM } from "@/lib/utils";
import { Button } from "@/components/Button";
import { TurnstileWidget } from "@/components/TurnstileWidget";

interface ExtraItem {
  label: string;
  amount: number;
}

interface Quotation {
  id: string;
  baseFee: number;
  travelFee: number;
  earlyCallFee: number;
  accommodationFee: number;
  extras: ExtraItem[];
  artistNote: string | null;
  total: number;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface Booking {
  id: string;
  artistId: string;
  artistName: string;
  service: string;
  price: number;
  date: string;
  time: string;
  notes: string | null;
  status: string;
  eventType: string | null;
  venue: string | null;
  guestCount: number;
  quotation: Quotation | null;
  totalPrice: number | null;
  balanceDueDate: string | null;
  balanceAmount: number | null;
  payment: {
    amount: number;
    type: string;
    status: string;
    provider: string;
    reference: string | null;
    url: string | null;
  } | null;
  balancePayment: {
    amount: number;
    type: string;
    status: string;
    provider: string;
    reference: string | null;
    url: string | null;
  } | null;
}

interface ClaimedProfile {
  artistId: string;
  artistName: string;
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    requested: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    accepted: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
    confirmed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    completed: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
    cancelled: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  };
  return styles[status] ?? styles.requested;
}

export default function DashboardPage() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [catalog, setCatalog] = useState<Artist[]>([]);
  const [verifyState, setVerifyState] = useState<"idle" | "sending" | "sent">("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [claimedProfile, setClaimedProfile] = useState<ClaimedProfile | null>(null);
  const [claimArtistId, setClaimArtistId] = useState("");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimedStudioProfile, setClaimedStudioProfile] = useState<{
    studioId: string;
    studioName: string;
  } | null>(null);
  const [claimStudioId, setClaimStudioId] = useState("");
  const [studios, setStudios] = useState<
    { id: string; name: string; area: string; state: string }[]
  >([]);
  // Quotation builder state (MUA)
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    baseFee: "",
    travelFee: "",
    earlyCallFee: "",
    accommodationFee: "",
    extraLabel: "",
    extraAmount: "",
    artistNote: "",
  });
  const [quoteExtras, setQuoteExtras] = useState<ExtraItem[]>([]);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteSending, setQuoteSending] = useState(false);

  interface BookingsResponse {
    bookings: Booking[];
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/bookings")
      .then((res) => (res.ok ? (res.json() as Promise<BookingsResponse>) : { bookings: [] }))
      .then((body) => {
        if (!cancelled) setBookings(body.bookings ?? []);
      })
      .finally(() => {
        if (!cancelled) setBookingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/catalog/artists")
      .then((res) => (res.ok ? (res.json() as Promise<{ artists: Artist[] }>) : { artists: [] }))
      .then((body) => {
        if (!cancelled) setCatalog(body.artists ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  interface ArtistProfileResponse {
    profile: ClaimedProfile | null;
  }

  useEffect(() => {
    if (!user || user.role === "customer") return;
    let cancelled = false;
    fetch("/api/artist-profiles")
      .then((res) => (res.ok ? (res.json() as Promise<ArtistProfileResponse>) : { profile: null }))
      .then((body) => {
        if (!cancelled) setClaimedProfile(body.profile ?? null);
      })
      .catch(() => undefined);
    if (user.role === "studio") {
      fetch("/api/studio-profiles")
        .then((res) =>
          res.ok
            ? (res.json() as Promise<{ profile: { studioId: string; studioName: string } | null }>)
            : { profile: null },
        )
        .then((body) => {
          if (!cancelled) setClaimedStudioProfile(body.profile ?? null);
        })
        .catch(() => undefined);
      fetch("/api/catalog/studios")
        .then((res) =>
          res.ok
            ? (res.json() as Promise<{
                studios: { id: string; name: string; area: string; state: string }[];
              }>)
            : { studios: [] },
        )
        .then((body) => {
          if (!cancelled) setStudios(body.studios ?? []);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function refreshBookings() {
    const res = await fetch("/api/bookings");
    if (res.ok) {
      const body: BookingsResponse = await res.json();
      setBookings(body.bookings ?? []);
    }
  }

  async function resendVerification() {
    setVerifyState("sending");
    setVerifyError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const body: { error?: string } = await res.json();
      if (!res.ok) {
        setVerifyError(body?.error ?? "Could not resend the verification email.");
        return;
      }
      setVerifyState("sent");
    } catch {
      setVerifyError("Network error — please try again.");
      setVerifyState("idle");
    }
  }

  async function updateBooking(id: string, action: "accept" | "reject" | "complete" | "cancel") {
    const res = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body: { error?: string; booking?: Booking } = await res.json();
    if (!res.ok) {
      alert(body?.error ?? "Could not update the booking.");
      return;
    }
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...body.booking } : b)));
  }

  async function exportMyData() {
    const res = await fetch("/api/me/export");
    if (!res.ok) {
      alert("Could not export your data.");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leish-data-${user?.id?.slice(0, 8) ?? "me"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Delete your account permanently? This removes all bookings, messages and data. This cannot be undone.",
      )
    ) {
      return;
    }
    const res = await fetch("/api/me?confirm=1", { method: "DELETE" });
    if (!res.ok) {
      alert("Could not delete your account. Please try again.");
      return;
    }
    await logout();
    router.push("/");
  }

  async function sendReminder(id: string) {
    const res = await fetch(`/api/bookings/${id}/remind`, { method: "POST" });
    const body: { message?: string; error?: string } = await res.json();
    alert(body?.message ?? body?.error ?? "Reminder sent.");
  }

  async function requestRefund(id: string) {
    if (!window.confirm("Request a refund of the balance? (RM 200 booking fee is non-refundable)"))
      return;
    const res = await fetch(`/api/bookings/${id}/refund`, { method: "POST" });
    const body: { message?: string; error?: string } = await res.json();
    alert(body?.message ?? body?.error ?? "Refund processed.");
    refreshBookings();
  }

  async function payBookingFee(id: string) {
    const turnstileToken = getTurnstileToken();
    const res = await fetch(`/api/bookings/${id}/pay-fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken }),
    });
    const body: { error?: string; payment?: { url?: string } } = await res.json();
    if (!res.ok) {
      alert(body?.error ?? "Could not create the payment.");
      return;
    }
    if (body.payment?.url) {
      window.open(body.payment.url, "_blank", "noopener,noreferrer");
    }
    refreshBookings();
  }

  async function payBalance(id: string) {
    const turnstileToken = getTurnstileToken();
    const res = await fetch(`/api/bookings/${id}/pay-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnstileToken }),
    });
    const body: { error?: string; payment?: { url?: string } } = await res.json();
    if (!res.ok) {
      alert(body?.error ?? "Could not create the payment.");
      return;
    }
    if (body.payment?.url) {
      window.open(body.payment.url, "_blank", "noopener,noreferrer");
    }
    refreshBookings();
  }

  function openQuoteForm(bookingId: string) {
    setQuoteFor(bookingId);
    setQuoteForm({
      baseFee: "",
      travelFee: "",
      earlyCallFee: "",
      accommodationFee: "",
      extraLabel: "",
      extraAmount: "",
      artistNote: "",
    });
    setQuoteExtras([]);
    setQuoteError(null);
  }

  function addExtra() {
    if (!quoteForm.extraLabel || !quoteForm.extraAmount) return;
    setQuoteExtras((prev) => [
      ...prev,
      { label: quoteForm.extraLabel, amount: Math.round(Number(quoteForm.extraAmount) * 100) },
    ]);
    setQuoteForm((f) => ({ ...f, extraLabel: "", extraAmount: "" }));
  }

  async function sendQuotation(bookingId: string) {
    setQuoteError(null);
    setQuoteSending(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseFee: Math.round(Number(quoteForm.baseFee) * 100),
          travelFee: quoteForm.travelFee ? Math.round(Number(quoteForm.travelFee) * 100) : 0,
          earlyCallFee: quoteForm.earlyCallFee
            ? Math.round(Number(quoteForm.earlyCallFee) * 100)
            : 0,
          accommodationFee: quoteForm.accommodationFee
            ? Math.round(Number(quoteForm.accommodationFee) * 100)
            : 0,
          extras: quoteExtras,
          artistNote: quoteForm.artistNote,
        }),
      });
      const body: { error?: string } = await res.json();
      if (!res.ok) {
        setQuoteError(body?.error ?? "Could not send the quotation.");
        return;
      }
      setQuoteFor(null);
      refreshBookings();
    } catch {
      setQuoteError("Network error — please try again.");
    } finally {
      setQuoteSending(false);
    }
  }

  async function claimProfile(e: React.FormEvent) {
    e.preventDefault();
    setClaimMsg(null);
    setClaimError(null);
    const isStudioClaim = user?.role === "studio" && claimStudioId;
    const endpoint = isStudioClaim ? "/api/studio-profiles" : "/api/artist-profiles";
    const payload = isStudioClaim ? { studioId: claimStudioId } : { artistId: claimArtistId };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body: { error?: string; profile?: ClaimedProfile | null } = await res.json();
    if (!res.ok) {
      setClaimError(body?.error ?? "Could not claim this profile.");
      return;
    }
    if (isStudioClaim) {
      const studioBody = body as unknown as {
        profile: { studioId: string; studioName: string } | null;
      };
      setClaimedStudioProfile(studioBody.profile ?? null);
      fetch("/api/studio-profiles")
        .then((r) => r.json())
        .then((b) => setClaimedStudioProfile(b.profile ?? null))
        .catch(() => undefined);
    } else {
      setClaimedProfile(body.profile ?? null);
    }
    setClaimMsg("Profile claimed — you can now manage its bookings.");
    refreshBookings();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center text-stone-500 dark:text-stone-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <span className="text-5xl">🔐</span>
        <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
          Please sign in
        </h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          Log in to manage your appointments, favorites, and profile.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/login?redirect=%2Fdashboard">Log in</Button>
          <Button href="/register" variant="outline">
            Sign up free
          </Button>
        </div>
      </div>
    );
  }

  const isArtist = user.role === "artist" || user.role === "studio";

  // MUA stats
  const requestedCount = bookings.filter((b) => b.status === "requested").length;
  const quotePendingCount = bookings.filter(
    (b) => b.status === "accepted" && b.quotation?.status === "pending",
  ).length;
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;
  const earningsPaid = bookings
    .filter((b) => b.status === "confirmed" && b.payment?.status === "paid")
    .reduce((sum, b) => sum + (b.payment?.amount ?? 0), 0);
  const earningsPending = bookings
    .filter((b) => b.status === "confirmed")
    .reduce((sum, b) => sum + (b.balanceAmount ?? 0), 0);

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-rose-600 dark:text-rose-500">Dashboard</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            Hi, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-2 text-stone-500 dark:text-stone-400">
            Signed in as{" "}
            <span className="font-medium text-stone-700 dark:text-stone-200">
              {ROLE_LABELS[user.role]}
            </span>{" "}
            ({user.email})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={logout}>
            Log out
          </Button>
          <Button variant="outline" onClick={exportMyData}>
            Export data
          </Button>
        </div>
      </div>

      {/* Email verification banner */}
      {!user.emailVerified && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-800/60 dark:bg-amber-500/10">
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-400">
              Verify your email address
            </p>
            <p className="text-sm text-amber-700/90 dark:text-amber-300/80">
              Confirm your email to fully activate your account.
            </p>
            {verifyError && (
              <p className="mt-1 text-sm text-rose-600 dark:text-rose-400" role="alert">
                {verifyError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={resendVerification}
            disabled={verifyState === "sending"}
            className="rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            {verifyState === "sending"
              ? "Sending…"
              : verifyState === "sent"
                ? "Sent ✓"
                : "Resend email"}
          </button>
        </div>
      )}

      {/* Profile claim — artist vs studio (Option B) */}
      {isArtist && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">
            {user.role === "studio" ? "Your studio profile" : "Your artist profile"}
          </h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {user.role === "studio"
              ? claimedStudioProfile
                ? `You are managing “${claimedStudioProfile.studioName}”.`
                : claimedProfile
                  ? `You are managing artist “${claimedProfile.artistName}” (legacy). Claim a studio to manage studio bookings.`
                  : "Claim a studio profile so bookings arrive in your dashboard."
              : claimedProfile
                ? `You are managing “${claimedProfile.artistName}”.`
                : "Claim a catalog profile so bookings arrive in your dashboard."}
          </p>
          {user.role === "studio"
            ? !claimedStudioProfile &&
              !claimedProfile && (
                <form onSubmit={claimProfile} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <label htmlFor="claim-studio" className="sr-only">
                    Studio profile
                  </label>
                  <select
                    id="claim-studio"
                    value={claimStudioId}
                    onChange={(e) => setClaimStudioId(e.target.value)}
                    required
                    className="h-11 flex-1 rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <option value="" disabled>
                      Select your studio…
                    </option>
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.area}, {s.state}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm">
                    Claim studio
                  </Button>
                </form>
              )
            : !claimedProfile && (
                <form onSubmit={claimProfile} className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <label htmlFor="claim-artist" className="sr-only">
                    Artist profile
                  </label>
                  <select
                    id="claim-artist"
                    value={claimArtistId}
                    onChange={(e) => setClaimArtistId(e.target.value)}
                    required
                    className="h-11 flex-1 rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <option value="" disabled>
                      Select your artist profile…
                    </option>
                    {catalog.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {a.area}, {a.state}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm">
                    Claim profile
                  </Button>
                </form>
              )}
          {claimMsg && (
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{claimMsg}</p>
          )}
          {claimError && (
            <p className="mt-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
              {claimError}
            </p>
          )}
        </div>
      )}

      {/* MUA stats */}
      {isArtist && (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Requests", value: String(requestedCount) },
            { label: "Quotations open", value: String(quotePendingCount) },
            { label: "Bookings confirmed", value: String(confirmedCount) },
            { label: "Fees paid (RM)", value: formatRM(earningsPaid) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-stone-200 bg-white p-4 text-center dark:border-stone-800 dark:bg-stone-900"
            >
              <p className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {s.value}
              </p>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {isArtist ? (
          <>
            <QuickAction
              icon="🎨"
              title="Update profile"
              text="Edit portfolio, services & pricing"
              href="/onboarding"
            />
            <QuickAction
              icon="📋"
              title="Quotations"
              text="Build quotes with a 24h review window"
              href="/dashboard"
            />
            <QuickAction
              icon="📊"
              title="Earnings"
              text={`${formatRM(earningsPaid)} paid · ${formatRM(earningsPending)} pending`}
              href="/dashboard"
            />
          </>
        ) : (
          <>
            <QuickAction
              icon="✨"
              title="Find artists"
              text="Browse top-rated MUAs near you"
              href="/artists"
            />
            <QuickAction
              icon="💄"
              title="Explore studios"
              text="Discover premium beauty studios"
              href="/studios"
            />
            <QuickAction
              icon="📅"
              title="My bookings"
              text="Requests, quotations & payments"
              href="/dashboard"
            />
          </>
        )}
      </div>

      {/* Bookings */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          {isArtist ? "Booking requests" : "Your bookings"}
        </h2>

        {bookingsLoading ? (
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Loading bookings…</p>
        ) : bookings.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center dark:border-stone-700 dark:bg-stone-900">
            <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              No bookings yet
            </p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              {isArtist
                ? "Claim a profile above to start receiving requests."
                : "Find your perfect artist and book your first appointment."}
            </p>
            {!isArtist && (
              <div className="mt-6">
                <Button href="/artists">Browse artists</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {bookings.map((appt) => {
              const artist = catalog.find((a) => a.id === appt.artistId);
              return (
                <div
                  key={appt.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    {artist && (
                      <Image
                        src={catalogImageSrc(artist.image)}
                        alt={artist.name}
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-stone-900 dark:text-stone-100">
                        {appt.artistName}
                      </p>
                      <p className="text-sm text-stone-500 dark:text-stone-400">
                        {appt.service} · {formatRM(appt.price)} · #{appt.id.slice(0, 8)}
                        {appt.eventType ? ` · ${appt.eventType}` : ""}
                        {appt.guestCount ? ` · ${appt.guestCount} guests` : ""}
                      </p>
                      {appt.venue && (
                        <p className="text-xs text-stone-400 dark:text-stone-500">
                          📍 {appt.venue}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-stone-600 dark:text-stone-400">
                      <p className="font-medium text-stone-800 dark:text-stone-200">
                        {formatDate(appt.date)}
                      </p>
                      <p>{appt.time}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge(appt.status)}`}
                    >
                      {appt.status}
                    </span>
                    {appt.payment && (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          appt.payment.status === "paid"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : appt.payment.status === "failed"
                              ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                              : "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400"
                        }`}
                      >
                        fee {appt.payment.status}
                      </span>
                    )}
                  </div>

                  {/* Quotation block */}
                  {appt.quotation && appt.quotation.status !== "superseded" && (
                    <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-stone-900 dark:text-stone-100">
                          Quotation · {formatRM(appt.quotation.total)}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(appt.quotation.status)}`}
                        >
                          {appt.quotation.status}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-1 text-sm text-stone-600 dark:text-stone-400">
                        <li className="flex justify-between">
                          <span>Base fee</span>
                          <span>{formatRM(appt.quotation.baseFee)}</span>
                        </li>
                        {appt.quotation.travelFee > 0 && (
                          <li className="flex justify-between">
                            <span>Travel</span>
                            <span>{formatRM(appt.quotation.travelFee)}</span>
                          </li>
                        )}
                        {appt.quotation.earlyCallFee > 0 && (
                          <li className="flex justify-between">
                            <span>Early call</span>
                            <span>{formatRM(appt.quotation.earlyCallFee)}</span>
                          </li>
                        )}
                        {appt.quotation.accommodationFee > 0 && (
                          <li className="flex justify-between">
                            <span>Accommodation</span>
                            <span>{formatRM(appt.quotation.accommodationFee)}</span>
                          </li>
                        )}
                        {appt.quotation.extras.map((e) => (
                          <li key={e.label} className="flex justify-between">
                            <span>{e.label}</span>
                            <span>{formatRM(e.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {appt.quotation.artistNote && (
                        <p className="mt-2 text-sm italic text-stone-500 dark:text-stone-400">
                          “{appt.quotation.artistNote}”
                        </p>
                      )}

                      {!isArtist &&
                        appt.status === "accepted" &&
                        appt.quotation.status === "pending" && (
                          <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
                            {appt.balanceDueDate && (
                              <p className="text-xs text-stone-500 dark:text-stone-400">
                                Balance of {formatRM(appt.balanceAmount ?? 0)} due by{" "}
                                {formatDate(appt.balanceDueDate)}.
                              </p>
                            )}
                            {appt.payment?.status === "required" ? (
                              <>
                                <TurnstileWidget onVerify={() => {}} />
                                <button
                                  type="button"
                                  onClick={() => payBookingFee(appt.id)}
                                  className="mt-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
                                >
                                  Pay RM 200 booking fee →
                                </button>
                              </>
                            ) : (
                              <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                                ✓ Booking fee paid — slot secured!
                              </p>
                            )}
                            <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                              Non-refundable · expires{" "}
                              {new Date(appt.quotation.expiresAt).toLocaleString("en-MY")}
                            </p>
                          </div>
                        )}

                      {/* MUA quote builder */}
                      {isArtist &&
                        appt.status === "accepted" &&
                        appt.quotation.status === "expired" && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => openQuoteForm(appt.id)}
                              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900"
                            >
                              Send new quotation
                            </button>
                          </div>
                        )}
                      {isArtist &&
                        appt.status === "accepted" &&
                        appt.quotation.status === "pending" && (
                          <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
                            Waiting for the client — 24h window from{" "}
                            {new Date(appt.quotation.createdAt).toLocaleString("en-MY")}.
                          </p>
                        )}
                    </div>
                  )}

                  {/* MUA: no quotation yet on accepted booking */}
                  {isArtist && appt.status === "accepted" && !appt.quotation && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => openQuoteForm(appt.id)}
                        className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900"
                      >
                        Build & send quotation
                      </button>
                    </div>
                  )}

                  {/* Quotation builder form */}
                  {isArtist && quoteFor === appt.id && (
                    <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                      <p className="font-medium text-stone-900 dark:text-stone-100">
                        Quotation for {appt.artistName}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm">
                          <span className="mb-1 block text-stone-500 dark:text-stone-400">
                            Base fee (RM)
                          </span>
                          <input
                            type="number"
                            min={0}
                            className={inputCls}
                            placeholder="e.g. 880"
                            value={quoteForm.baseFee}
                            onChange={(e) =>
                              setQuoteForm({ ...quoteForm, baseFee: e.target.value })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-stone-500 dark:text-stone-400">
                            Travel (RM)
                          </span>
                          <input
                            type="number"
                            min={0}
                            className={inputCls}
                            placeholder="e.g. 80"
                            value={quoteForm.travelFee}
                            onChange={(e) =>
                              setQuoteForm({ ...quoteForm, travelFee: e.target.value })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-stone-500 dark:text-stone-400">
                            Early call (RM)
                          </span>
                          <input
                            type="number"
                            min={0}
                            className={inputCls}
                            placeholder="e.g. 50"
                            value={quoteForm.earlyCallFee}
                            onChange={(e) =>
                              setQuoteForm({ ...quoteForm, earlyCallFee: e.target.value })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block text-stone-500 dark:text-stone-400">
                            Accommodation (RM)
                          </span>
                          <input
                            type="number"
                            min={0}
                            className={inputCls}
                            placeholder="e.g. 150"
                            value={quoteForm.accommodationFee}
                            onChange={(e) =>
                              setQuoteForm({ ...quoteForm, accommodationFee: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <input
                          className={inputCls}
                          placeholder="Extra item (e.g. Hair styling)"
                          value={quoteForm.extraLabel}
                          onChange={(e) =>
                            setQuoteForm({ ...quoteForm, extraLabel: e.target.value })
                          }
                        />
                        <input
                          type="number"
                          min={0}
                          className={inputCls + " w-32"}
                          placeholder="RM"
                          value={quoteForm.extraAmount}
                          onChange={(e) =>
                            setQuoteForm({ ...quoteForm, extraAmount: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          onClick={addExtra}
                          className="rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:border-rose-400 hover:text-rose-700 dark:border-stone-700 dark:text-stone-200"
                        >
                          Add
                        </button>
                      </div>
                      {quoteExtras.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm text-stone-600 dark:text-stone-400">
                          {quoteExtras.map((e, i) => (
                            <li key={i} className="flex justify-between">
                              <span>{e.label}</span>
                              <span>
                                {formatRM(e.amount)}
                                <button
                                  type="button"
                                  className="ml-2 text-rose-500"
                                  onClick={() =>
                                    setQuoteExtras(quoteExtras.filter((_, j) => j !== i))
                                  }
                                >
                                  ✕
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-stone-500 dark:text-stone-400">
                          Artist note (optional)
                        </span>
                        <textarea
                          rows={2}
                          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 focus:border-rose-400 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                          placeholder="e.g. Early call included, travel within 30km"
                          value={quoteForm.artistNote}
                          onChange={(e) =>
                            setQuoteForm({ ...quoteForm, artistNote: e.target.value })
                          }
                        />
                      </label>
                      {quoteError && (
                        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400" role="alert">
                          {quoteError}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => sendQuotation(appt.id)}
                          disabled={quoteSending || !quoteForm.baseFee}
                          className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                        >
                          {quoteSending ? "Sending…" : "Send quotation"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuoteFor(null)}
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 dark:border-stone-700 dark:text-stone-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isArtist ? (
                      <>
                        {appt.status === "requested" && (
                          <>
                            <button
                              type="button"
                              onClick={() => updateBooking(appt.id, "accept")}
                              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => updateBooking(appt.id, "reject")}
                              className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:border-red-300 hover:text-red-600 dark:border-stone-700 dark:text-stone-300"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {appt.status === "confirmed" && (
                          <button
                            type="button"
                            onClick={() => updateBooking(appt.id, "complete")}
                            className="rounded-full bg-stone-800 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900"
                          >
                            Complete
                          </button>
                        )}
                        {(appt.status === "requested" ||
                          appt.status === "accepted" ||
                          appt.status === "confirmed") && (
                          <button
                            type="button"
                            onClick={() => updateBooking(appt.id, "cancel")}
                            className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:border-red-300 hover:text-red-600 dark:border-stone-700 dark:text-stone-300"
                          >
                            Cancel
                          </button>
                        )}
                      </>
                    ) : (
                      (appt.status === "requested" ||
                        appt.status === "accepted" ||
                        appt.status === "confirmed") && (
                        <button
                          type="button"
                          onClick={() => updateBooking(appt.id, "cancel")}
                          className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:border-red-300 hover:text-red-600 dark:border-stone-700 dark:text-stone-300"
                        >
                          Cancel
                        </button>
                      )
                    )}
                    {isArtist && appt.status === "confirmed" && (appt.balanceAmount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => sendReminder(appt.id)}
                        className="rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
                      >
                        Send reminder
                      </button>
                    )}
                    {!isArtist &&
                      appt.status === "confirmed" &&
                      (appt.balanceAmount ?? 0) > 0 &&
                      appt.balancePayment?.status !== "paid" && (
                        <>
                          <TurnstileWidget onVerify={() => {}} />
                          <button
                            type="button"
                            onClick={() => payBalance(appt.id)}
                            className="rounded-full bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500"
                          >
                            Pay balance ({formatRM(appt.balanceAmount ?? 0)})
                          </button>
                        </>
                      )}
                    {!isArtist && appt.status === "cancelled" && (
                      <button
                        type="button"
                        onClick={() => requestRefund(appt.id)}
                        className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:border-violet-300 hover:text-violet-700 dark:border-stone-700 dark:text-stone-300"
                      >
                        Request refund
                      </button>
                    )}
                    {(appt.status === "confirmed" || appt.status === "completed") && (
                      <a
                        href={`/api/bookings/${appt.id}/invoice`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:text-stone-300"
                      >
                        Invoice
                      </a>
                    )}
                    {artist && (
                      <Link
                        href={catalogPath("artists", artist)}
                        className="text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
                      >
                        View →
                      </Link>
                    )}
                  </div>

                  <ChatThread bookingId={appt.id} isArtist={isArtist} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Data & account */}
      <section className="mt-12 border-t border-stone-200 pt-6 dark:border-stone-800">
        <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
          Your data
        </h2>
        <p className="mt-1 max-w-xl text-sm text-stone-500 dark:text-stone-400">
          You own your data. Export everything we hold about you, or delete your account and all
          associated data permanently.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={exportMyData}>
            ⬇ Export my data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={deleteAccount}
            className="border-red-300 text-red-600 hover:border-red-400 hover:text-red-700 dark:border-red-800 dark:text-red-400"
          >
            Delete my account
          </Button>
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  text,
  href,
}: {
  icon: string;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-stone-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
    >
      <span className="text-2xl">{icon}</span>
      <p className="mt-3 font-semibold text-stone-900 dark:text-stone-100">{title}</p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{text}</p>
    </Link>
  );
}

interface ThreadMessage {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
}

function ChatThread({ bookingId, isArtist }: { bookingId: string; isArtist: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Live updates via Server-Sent Events; the stream also replays history.
    const source = new EventSource(`/api/bookings/${bookingId}/messages/stream`);
    source.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data) as ThreadMessage;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      } catch {
        // ignore malformed frames
      }
    });
    return () => source.close();
  }, [open, bookingId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (res.ok) {
        const body: {
          message: { id: string; body: string; senderName: string; createdAt: string };
        } = await res.json();
        setMessages((prev) => [...prev, body.message]);
        setDraft("");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500"
      >
        {open ? "Hide chat" : "💬 Chat with " + (isArtist ? "client" : "artist")}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-xs text-stone-400 dark:text-stone-500">No messages yet.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-medium text-stone-700 dark:text-stone-200">
                  {m.senderName}
                </span>
                <span className="text-stone-400 dark:text-stone-500">
                  {" "}
                  · {new Date(m.createdAt).toLocaleString("en-MY")}
                </span>
                <p className="text-stone-600 dark:text-stone-400">{m.body}</p>
              </div>
            ))}
          </div>
          <form onSubmit={send} className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              className="h-10 flex-1 rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="rounded-full bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
