import { z } from "zod";
import { BRIDAL_EVENTS, NON_BRIDAL_EVENTS, MALAYSIA_STATES } from "@/lib/data";
import type { BridalEvent, NonBridalEvent } from "@/lib/types";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(["customer", "artist", "studio"]),
  consent: z.boolean().refine((val) => val === true, "You must consent to data collection"),
  consentTimestamp: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required").max(128),
});

export const bookingSchema = z.object({
  artistId: z.string().min(1),
  service: z.string().min(1, "Select a service"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date")
    .refine((d) => d >= new Date().toISOString().slice(0, 10), "Date cannot be in the past"),
  time: z.string().min(1, "Choose a time"),
  notes: z.string().max(2000).optional().default(""),
  // Event details (journey step 1: "submits a booking request with event details").
  eventType: z.string().trim().min(1, "Select an event type").max(80),
  venue: z.string().trim().max(200).optional().default(""),
  guestCount: z.coerce.number().int().min(0).max(1000).optional().default(0),
});

export const quotationSchema = z.object({
  baseFee: z.coerce.number().int().min(0).max(10_000_000),
  travelFee: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  earlyCallFee: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  accommodationFee: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  extras: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        amount: z.coerce.number().int().min(0).max(10_000_000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
  artistNote: z.string().trim().max(1000).optional().default(""),
});

export const artistsQuerySchema = z.object({
  query: z.string().trim().max(100).optional().default(""),
  state: z.enum(MALAYSIA_STATES).optional(),
  area: z.string().trim().max(80).optional(),
  bridal: z.enum(BRIDAL_EVENTS.map((e) => e.id) as [BridalEvent, ...BridalEvent[]]).optional(),
  nonBridal: z
    .enum(NON_BRIDAL_EVENTS.map((e) => e.id) as [NonBridalEvent, ...NonBridalEvent[]])
    .optional(),
  budget: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type QuotationInput = z.infer<typeof quotationSchema>;
export type ArtistsQuery = z.infer<typeof artistsQuerySchema>;
