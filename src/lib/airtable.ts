"use client";

import { useState, useEffect } from "react";

type AirtableEvent = {
  type: string;
  properties?: Record<string, unknown>;
};

export function useAirtable() {
  const [events, setEvents] = useState<AirtableEvent[]>([]);

  const trackEvent = (event: AirtableEvent) => {
    setEvents((prev) => [...prev, event]);
    // TODO: integrate with actual Airtable when configured
    console.log("Airtable event:", event);
  };

  return { trackEvent };
}
