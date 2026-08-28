import * as agnost from "agnostai";

/**
 * Agnost AI analytics integration.
 *
 * Captures real user interactions, conversation turns, and tool calls
 * for observability and analytics.
 *
 * Environment variables:
 * - AGNOST_ORG_ID: Organization ID from Agnost dashboard
 * - AGNOST_ENDPOINT: API endpoint (default: https://api.agnost.ai)
 */

const AGNOST_ORG_ID = process.env.AGNOST_ORG_ID;
const AGNOST_ENDPOINT = process.env.AGNOST_ENDPOINT || "https://api.agnost.ai";

let initialized = false;

/**
 * Initialize Agnost SDK once at app startup.
 * Safe to call multiple times — only initializes once.
 */
export function initAgnost(): void {
  if (initialized) return;
  if (!AGNOST_ORG_ID) {
    console.warn("[agnost] AGNOST_ORG_ID not set — analytics disabled");
    return;
  }

  agnost.init(AGNOST_ORG_ID, {
    endpoint: AGNOST_ENDPOINT,
  });
  initialized = true;
  console.log(`[agnost] initialized (org: ${AGNOST_ORG_ID.slice(0, 8)}...)`);
}

/**
 * Flush pending events and clean up.
 * Call on process exit for graceful shutdown.
 */
export async function shutdownAgnost(): Promise<void> {
  if (!initialized) return;
  try {
    await agnost.shutdown();
    console.log("[agnost] shutdown complete");
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Check if Agnost is configured and ready.
 */
export function isAgnostEnabled(): boolean {
  return initialized && Boolean(AGNOST_ORG_ID);
}

export { agnost };
