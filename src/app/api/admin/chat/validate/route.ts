import { NextResponse } from "next/server";

interface ValidationResult {
  websocketConnect: boolean;
  historyLoad: boolean;
  sendReceive: boolean;
  presence: boolean;
  errors: string[];
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const bookingId = url.searchParams.get("bookingId");
    const token = url.searchParams.get("token");

    if (!bookingId || !token) {
      return NextResponse.json({ error: "bookingId and token required" }, { status: 400 });
    }

    const workerUrl = process.env.NEXT_PUBLIC_CHAT_WS_URL?.replace("/ws/", "/api/") ?? "";
    const errors: string[] = [];

    // Test 1: WebSocket connection
    let websocketConnect = false;
    try {
      const wsUrl = `${workerUrl.replace("/api/", "/ws/")}${bookingId}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
        ws.onopen = () => {
          clearTimeout(timeout);
          websocketConnect = true;
          ws.close();
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("WebSocket error"));
        };
      });
    } catch (e) {
      errors.push(`WebSocket connect: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Test 2: History load (via REST)
    let historyLoad = false;
    try {
      const res = await fetch(`${workerUrl}chat/history/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        historyLoad = true;
      } else {
        errors.push(`History load: ${res.status} ${res.statusText}`);
      }
    } catch (e) {
      errors.push(`History load: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Test 3: Presence
    let presence = false;
    try {
      const res = await fetch(`${workerUrl}chat/presence/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        presence = true;
      }
    } catch (e) {
      errors.push(`Presence: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Test 4: Send/Receive would need two tokens - skip for now
    const sendReceive = false;

    const result: ValidationResult = {
      websocketConnect,
      historyLoad,
      sendReceive,
      presence,
      errors,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Validation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
