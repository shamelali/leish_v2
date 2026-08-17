// Type definitions for Supabase Database
// Used to type the Supabase client. Generated via:
// npx supabase gen types postgres --project-id leish-v2 --schema public --out-dir src/lib/types
// or manually maintained to match the actual PostgreSQL schema.

// The Database type must match what Supabase JS client expects:
// - database: { public: { Tables: { [name]: { Row: ..., Insert: ... } }, ... } }
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "client" | "artist" | "admin";
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: "client" | "artist" | "admin";
          full_name?: string;
          phone?: string;
          avatar_url?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      providers: {
        Row: {
          id: string;
          profile_id: string;
          slug: string;
          display_name: string;
          bio: string | null;
          state: string;
          district: string;
          specialties: string[];
          default_deposit_percent: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          slug: string;
          display_name: string;
          bio?: string;
          state: string;
          district: string;
          specialties: string[];
          default_deposit_percent: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      services: {
        Row: {
          id: string;
          provider_id: string;
          name: string;
          description: string | null;
          price: number;
          duration_minutes: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          name: string;
          description?: string;
          price: number;
          duration_minutes: number;
          is_active?: boolean;
          created_at?: string;
        };
      };
      availability_slots: {
        Row: {
          id: string;
          provider_id: string;
          start_at: string;
          end_at: string;
          is_booked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          start_at: string;
          end_at: string;
          is_booked?: boolean;
          created_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          client_id: string;
          provider_id: string;
          service_id: string;
          slot_id: string;
          status: "pending_payment" | "confirmed" | "completed" | "cancelled" | "disputed";
          amount: number;
          deposit_amount: number;
          commission_percent: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          provider_id: string;
          service_id: string;
          slot_id: string;
          status?: "pending_payment" | "confirmed" | "completed" | "cancelled" | "disputed";
          amount: number;
          deposit_amount: number;
          commission_percent: number;
          notes?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_transactions: {
        Row: {
          id: string;
          booking_id: string;
          billplz_bill_id: string;
          amount: number;
          paid: boolean;
          raw_payload: object;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          billplz_bill_id: string;
          amount: number;
          paid?: boolean;
          raw_payload: object;
          created_at?: string;
        };
      };
    };
    Enums: {
      [key: string]: string;
    };
    Functions: {
      is_admin: {
        Args: { [key: string]: unknown };
        Returns: boolean;
      };
    };
    Views: {
      [key: string]: unknown;
    };
  };
};
