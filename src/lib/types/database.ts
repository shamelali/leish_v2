export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "client" | "artist" | "admin";
export type BookingStatus =
  "pending_payment" | "confirmed" | "completed" | "cancelled" | "disputed";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      providers: {
        Row: {
          id: string;
          profile_id: string;
          slug: string;
          display_name: string;
          bio: string | null;
          state: string | null;
          district: string | null;
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
          bio?: string | null;
          state?: string | null;
          district?: string | null;
          specialties?: string[];
          default_deposit_percent?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          slug?: string;
          display_name?: string;
          bio?: string | null;
          state?: string | null;
          district?: string | null;
          specialties?: string[];
          default_deposit_percent?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "providers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
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
          description?: string | null;
          price: number;
          duration_minutes: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          duration_minutes?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
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
        Update: {
          id?: string;
          provider_id?: string;
          start_at?: string;
          end_at?: string;
          is_booked?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "availability_slots_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          client_id: string;
          provider_id: string;
          service_id: string;
          slot_id: string;
          status: BookingStatus;
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
          status?: BookingStatus;
          amount: number;
          deposit_amount: number;
          commission_percent?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          provider_id?: string;
          service_id?: string;
          slot_id?: string;
          status?: BookingStatus;
          amount?: number;
          deposit_amount?: number;
          commission_percent?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_slot_id_fkey";
            columns: ["slot_id"];
            isOneToOne: false;
            referencedRelation: "availability_slots";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_transactions: {
        Row: {
          id: string;
          booking_id: string;
          billplz_bill_id: string;
          amount: number;
          paid: boolean;
          raw_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          billplz_bill_id: string;
          amount: number;
          paid?: boolean;
          raw_payload: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          billplz_bill_id?: string;
          amount?: number;
          paid?: boolean;
          raw_payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_transactions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      booking_status: BookingStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
