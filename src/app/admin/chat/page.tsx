"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
}

interface ValidationResult {
  websocketConnect: boolean;
  historyLoad: boolean;
  sendReceive: boolean;
  presence: boolean;
  errors: string[];
}

export default function AdminChatPage() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [bookingIds, setBookingIds] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationBookingId, setValidationBookingId] = useState("");
  const [validationToken, setValidationToken] = useState("");

  useEffect(() => {
    if (!loading && (!session || session.user.role !== "admin")) {
      router.push("/");
    }
  }, [session, loading, router]);

  if (loading || !session || session.user.role !== "admin") {
    return <div style={styles.loading}>Loading...</div>;
  }

  const handleMigrate = async () => {
    const ids = bookingIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      alert("Please enter at least one booking ID");
      return;
    }

    setMigrating(true);
    try {
      const res = await fetch(`/api/admin/chat/migrate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ bookingIds: ids, dryRun }),
      });
      const data = await res.json();
      setMigrationResult(data);
    } catch (err) {
      console.error(err);
      alert("Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  const handleValidate = async () => {
    if (!validationBookingId || !validationToken) {
      alert("Please enter booking ID and token");
      return;
    }

    setValidating(true);
    try {
      const res = await fetch(
        `/api/admin/chat/validate?bookingId=${validationBookingId}&token=${validationToken}`,
        {
          headers: { Authorization: `Bearer ${session.token}` },
        },
      );
      const data = await res.json();
      setValidationResult(data);
    } catch (err) {
      console.error(err);
      alert("Validation failed");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>Chat Administration</h1>
        <p style={styles.subtitle}>Manage and monitor the real-time chat system</p>
      </header>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>📦 Message Migration</h2>
        <p style={styles.description}>
          Migrate historical messages from the old SSE system to the new Durable Object SQLite
          storage.
        </p>

        <div style={styles.formGroup}>
          <label style={styles.label}>Booking IDs (comma-separated)</label>
          <textarea
            style={styles.textarea}
            value={bookingIds}
            onChange={(e) => setBookingIds(e.target.value)}
            placeholder="booking-1, booking-2, booking-3"
            rows={3}
          />
        </div>

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            style={styles.checkbox}
          />
          <span>Dry run (preview only, no changes)</span>
        </label>

        <button
          style={{
            ...styles.button,
            ...(migrating ? styles.buttonDisabled : {}),
          }}
          onClick={handleMigrate}
          disabled={migrating}
        >
          {migrating ? "Migrating..." : dryRun ? "Preview Migration" : "Run Migration"}
        </button>

        {migrationResult && (
          <div
            style={{
              ...styles.result,
              ...(migrationResult.success ? styles.resultSuccess : styles.resultError),
            }}
          >
            <h3>{migrationResult.success ? "✅ Success" : "❌ Failed"}</h3>
            <p>Migrated: {migrationResult.migrated} messages</p>
            <p>Failed: {migrationResult.failed} messages</p>
            {migrationResult.errors.length > 0 && (
              <details style={styles.details}>
                <summary>Errors</summary>
                <ul style={styles.errorList}>
                  {migrationResult.errors.map((err, i) => (
                    <li key={i} style={styles.errorItem}>
                      {err}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>🔍 System Validation</h2>
        <p style={styles.description}>Test the chat system components for a specific booking.</p>

        <div style={styles.formRow}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Booking ID</label>
            <input
              style={styles.input}
              type="text"
              value={validationBookingId}
              onChange={(e) => setValidationBookingId(e.target.value)}
              placeholder="booking-123"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>User Token</label>
            <input
              style={styles.input}
              type="text"
              value={validationToken}
              onChange={(e) => setValidationToken(e.target.value)}
              placeholder="user JWT token"
            />
          </div>
        </div>

        <button
          style={{
            ...styles.button,
            ...(validating ? styles.buttonDisabled : {}),
          }}
          onClick={handleValidate}
          disabled={validating}
        >
          {validating ? "Validating..." : "Run Validation"}
        </button>

        {validationResult && (
          <div
            style={{
              ...styles.result,
              ...(validationResult.errors.length === 0 ? styles.resultSuccess : styles.resultError),
            }}
          >
            <h3>
              {validationResult.errors.length === 0 ? "✅ All Checks Passed" : "❌ Issues Found"}
            </h3>
            <div style={styles.checkGrid}>
              <div style={styles.checkItem}>
                <span
                  style={{
                    ...styles.checkIcon,
                    color: validationResult.websocketConnect ? "#22c55e" : "#ef4444",
                  }}
                >
                  {validationResult.websocketConnect ? "✓" : "✗"}
                </span>
                <span>WebSocket Connection</span>
              </div>
              <div style={styles.checkItem}>
                <span
                  style={{
                    ...styles.checkIcon,
                    color: validationResult.historyLoad ? "#22c55e" : "#ef4444",
                  }}
                >
                  {validationResult.historyLoad ? "✓" : "✗"}
                </span>
                <span>History Load</span>
              </div>
              <div style={styles.checkItem}>
                <span
                  style={{
                    ...styles.checkIcon,
                    color: validationResult.sendReceive ? "#22c55e" : "#ef4444",
                  }}
                >
                  {validationResult.sendReceive ? "✓" : "✗"}
                </span>
                <span>Send/Receive</span>
              </div>
              <div style={styles.checkItem}>
                <span
                  style={{
                    ...styles.checkIcon,
                    color: validationResult.presence ? "#22c55e" : "#ef4444",
                  }}
                >
                  {validationResult.presence ? "✓" : "✗"}
                </span>
                <span>Presence</span>
              </div>
            </div>
            {validationResult.errors.length > 0 && (
              <details style={styles.details}>
                <summary>Errors</summary>
                <ul style={styles.errorList}>
                  {validationResult.errors.map((err, i) => (
                    <li key={i} style={styles.errorItem}>
                      {err}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>📊 Rollout Control</h2>
        <p style={styles.description}>
          Control the percentage of users who use the new chat system.
        </p>
        <div style={styles.rolloutInfo}>
          <p>
            Current rollout: <code>CHAT_ROLLOUT_PERCENT</code> environment variable
          </p>
          <p>Set in Cloudflare Workers dashboard → Variables</p>
          <ul style={styles.rolloutSteps}>
            <li>0% — All users on old SSE system</li>
            <li>10% — Canary release</li>
            <li>50% — Half users on new system</li>
            <li>100% — Full rollout</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "32px 24px",
    color: "#fff",
  },
  header: {
    marginBottom: "32px",
  },
  subtitle: {
    color: "#9ca3af",
    margin: "8px 0 0",
  },
  section: {
    background: "#1a1a2e",
    border: "1px solid #2a2a4a",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "24px",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: "20px",
  },
  description: {
    color: "#9ca3af",
    marginBottom: "24px",
  },
  formGroup: {
    marginBottom: "16px",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontSize: "14px",
    fontWeight: 500,
  },
  textarea: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #374151",
    background: "#0f172a",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "inherit",
    resize: "vertical",
  },
  input: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #374151",
    background: "#0f172a",
    color: "#fff",
    fontSize: "14px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    marginBottom: "16px",
  },
  checkbox: {
    width: "18px",
    height: "18px",
  },
  button: {
    padding: "12px 24px",
    borderRadius: "8px",
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  result: {
    marginTop: "16px",
    padding: "16px",
    borderRadius: "8px",
  },
  resultSuccess: {
    background: "rgba(34, 197, 94, 0.1)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
  },
  resultError: {
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
  },
  details: {
    marginTop: "12px",
  },
  errorList: {
    margin: "8px 0 0",
    paddingLeft: "20px",
  },
  errorItem: {
    color: "#fca5a5",
    fontSize: "13px",
    marginBottom: "4px",
  },
  checkGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "12px",
    marginTop: "16px",
  },
  checkItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  checkIcon: {
    fontSize: "18px",
  },
  rolloutInfo: {
    background: "#0f172a",
    border: "1px solid #374151",
    borderRadius: "8px",
    padding: "16px",
  },
  rolloutSteps: {
    margin: "12px 0 0",
    paddingLeft: "20px",
    color: "#d1d5db",
  },
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
  },
};
