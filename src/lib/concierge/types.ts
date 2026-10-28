import type { Artist } from "@/lib/types";

export type ConciergeCategory =
  | "Bridal"
  | "Event"
  | "Photoshoot"
  | "Natural"
  | "SFX"
  | "Hari Raya"
  | "Chinese New Year"
  | "Traditional Malay"
  | "Hijab";

export interface ConversationContext {
  /** Detected makeup/event categories across all turns */
  eventTypes: ConciergeCategory[];
  /** Normalised location string */
  location: string | null;
  /** Budget band extracted from conversation */
  budget: { min: number; max: number } | null;
  /** Free-text style notes collected across turns */
  styleNotes: string[];
  /** Whether a photo was uploaded in this session */
  hasInspirationPhoto: boolean;
  /** Number of turns so far */
  turnCount: number;
}

export const EMPTY_CONTEXT: ConversationContext = {
  eventTypes: [],
  location: null,
  budget: null,
  styleNotes: [],
  hasInspirationPhoto: false,
  turnCount: 0,
};

export interface MatchSignal {
  label: string;
  points: number;
}

export interface Recommendation {
  artist: Artist;
  score: number;
  /** Human-readable match rationale */
  reason: string;
  /** Signals that contributed to this score */
  signals: MatchSignal[];
}
