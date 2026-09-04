"use client";

import { useSession } from "@/hooks/useSession";
import { ChatInterface } from "@/lib/chat/ChatInterface";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface BookingChatProps {
  params: Promise<{ id: string }>;
}

export default function BookingChatPage({ params }: BookingChatProps) {
  const { session, loading } = useSession();
  const router = useRouter();
  const [bookingId, setBookingId] = useState("");

  // Show chat as soon as the session is confirmed (derived — no effect needed).
  const showChat = Boolean(session);

  useEffect(() => {
    (async () => {
      const { id } = await params;
      setBookingId(id);
    })();
  }, [params]);

  useEffect(() => {
    if (!loading && !session) {
      router.push(`/login?redirect=/bookings/${bookingId}`);
    }
  }, [session, loading, router, bookingId]);

  const wsUrl = process.env.NEXT_PUBLIC_CHAT_WS_URL;

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (!wsUrl) {
    return (
      <div style={styles.errorContainer}>
        <h2>Chat Unavailable</h2>
        <p>Chat service not configured. Please contact support.</p>
        <Link href={`/bookings/${bookingId}`} style={styles.backLink}>
          ← Back to Booking
        </Link>
      </div>
    );
  }

  return (
    <div style={styles.pageContainer}>
      <header style={styles.header}>
        <Link href={`/bookings/${bookingId}`} style={styles.backLink}>
          ← Back to Booking
        </Link>
        <h1 style={styles.title}>Booking Chat</h1>
      </header>

      {showChat && (
        <main style={styles.main}>
          <ChatInterface
            bookingId={bookingId}
            token={session.token}
            wsUrl={wsUrl}
            style={{ height: "calc(100vh - 140px)", minHeight: "500px" }}
            onMessage={(msg) => {
              // Optional: track analytics
              const gtag = typeof window !== "undefined" ? window.gtag : undefined;
              if (gtag) {
                gtag("event", "chat_message_sent", {
                  booking_id: bookingId,
                  message_length: msg.body.length,
                });
              }
            }}
            onError={(err) => {
              console.error("Chat error:", err);
              // Could show toast notification here
            }}
          />
        </main>
      )}
    </div>
  );
}

import type { CSSProperties } from "react";

const styles: Record<string, CSSProperties> = {
  pageContainer: {
    minHeight: "100vh",
    background: "#0f0f1a",
    color: "#fff",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    gap: "16px",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid #2a2a4a",
    borderTopColor: "#2563eb",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  header: {
    padding: "24px",
    maxWidth: "800px",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  backLink: {
    color: "#9ca3af",
    textDecoration: "none",
    fontSize: "14px",
    transition: "color 0.2s",
  },
  title: {
    fontSize: "28px",
    fontWeight: 600,
    margin: 0,
  },
  main: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "0 24px 24px",
  },
  errorContainer: {
    maxWidth: "600px",
    margin: "100px auto",
    padding: "40px",
    textAlign: "center",
    background: "#1a1a2e",
    borderRadius: "12px",
    border: "1px solid #2a2a4a",
  },
};

// Add keyframes for spinner
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
