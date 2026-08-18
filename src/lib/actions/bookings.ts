"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveBookingAmount } from "@/lib/payments/commission";
import { z } from "zod";

const createBookingSchema = z.object({
  providerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  slotId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/**
 * Creates a booking with amount/depositAmount resolved server-side from
 * `services` and `providers` records — never from client input. This is
 * the pattern audited and closed in v1; keep it intact.
 */
export async function createBooking(input: CreateBookingInput) {
  const parsed = createBookingSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("[createBooking] Not authenticated.");

  const { data: service, error: serviceError } = (await supabase
    .from("services")
    .select("price, provider_id, providers ( default_deposit_percent )")
    .eq("id", parsed.serviceId)
    .single()) as {
    data: {
      price: number;
      provider_id: string;
      providers: { default_deposit_percent: number };
    } | null;
    error: unknown;
  };

  if (serviceError || !service) {
    throw new Error("[createBooking] Service not found.");
  }
  if (service.provider_id !== parsed.providerId) {
    throw new Error("[createBooking] Service does not belong to provider.");
  }

  const { amount, depositAmount, commissionPercent } = resolveBookingAmount({
    servicePrice: service.price,
    providerDefaultDepositPercent: service.providers.default_deposit_percent,
  });

  const { data: booking, error: bookingError } = (await supabase
    .from("bookings")
    .insert({
      client_id: user.id,
      provider_id: parsed.providerId,
      service_id: parsed.serviceId,
      slot_id: parsed.slotId,
      amount,
      deposit_amount: depositAmount,
      commission_percent: commissionPercent,
      notes: parsed.notes,
      status: "pending_payment",
    })
    .select()
    .single()) as {
    data: {
      id: string;
      client_id: string;
      provider_id: string;
      service_id: string;
      slot_id: string;
      amount: number;
      deposit_amount: number;
      commission_percent: number;
      notes?: string;
      status:
        | "pending_payment"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "disputed";
      created_at: string;
      updated_at: string;
    } | null;
    error: {
      code?: string;
      message?: string;
    };
  };

  // The unique index on (slot_id) where status != 'cancelled' will raise a
  // unique_violation here if two clients race for the same slot. Surface
  // that as a clean error instead of a generic 500.
  if (bookingError) {
    if (bookingError.code === "23505") {
      throw new Error("[createBooking] This slot was just booked by someone else.");
    }
    throw new Error(`[createBooking] ${bookingError.message}`);
  }

  return booking;
}