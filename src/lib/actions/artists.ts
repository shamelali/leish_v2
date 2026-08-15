"use server";

import { createClient } from "@/lib/supabase/server";

export async function getArtists(filters?: { state?: string; specialty?: string }) {
  const supabase = await createClient();

  let query = supabase
    .from("providers")
    .select("id, slug, display_name, bio, state, district, specialties")
    .eq("is_active", true);

  if (filters?.state) query = query.eq("state", filters.state);
  if (filters?.specialty) query = query.contains("specialties", [filters.specialty]);

  const { data, error } = await query;
  if (error) throw new Error(`[getArtists] ${error.message}`);
  return data;
}

export async function getArtistBySlug(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("providers")
    .select(
      `id, slug, display_name, bio, state, district, specialties, default_deposit_percent,
       services ( id, name, description, price, duration_minutes, is_active ),
       availability_slots ( id, start_at, end_at, is_booked )`
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error) {
    // Distinguish "not found" from a real infra failure — v1's silent-null
    // pattern made these indistinguishable, which is exactly what caused
    // the invisible 404s on this page.
    if (error.code === "PGRST116") return null;
    throw new Error(`[getArtistBySlug] ${error.message}`);
  }

  return data;
}
