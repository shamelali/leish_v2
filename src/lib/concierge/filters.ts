import { SEED_ARTISTS } from "@/lib/data";
import type { Artist } from "@/lib/types";
import type { ConciergeCategory, ConversationContext, MatchSignal, Recommendation } from "./types";

// ── Keyword dictionaries ──────────────────────────────────────────────────────

const EVENT_KEYWORDS: Record<ConciergeCategory, string[]> = {
  Bridal: [
    "wedding",
    "bridal",
    "bride",
    "bridesmaids",
    "engagement",
    "nuptials",
    "ceremony",
    "matrimony",
    "nikah",
    "solemnization",
  ],
  Event: [
    "event",
    "gala",
    "party",
    "prom",
    "graduation",
    "ball",
    "dinner",
    "red carpet",
    "celebration",
    "corporate",
    "birthday",
    "reception",
    "banquet",
    "concert",
    "stage",
  ],
  Photoshoot: [
    "editorial",
    "photoshoot",
    "fashion",
    "magazine",
    "creative",
    "shoot",
    "campaign",
    "runway",
    "avant-garde",
    "portfolio",
    "lookbook",
    "commercial",
    "catalogue",
  ],
  Natural: [
    "natural",
    "soft glam",
    "minimal",
    "dewy",
    "fresh",
    "skin-first",
    "everyday",
    "no makeup",
    "clean",
    "simple",
    "subtle",
    "nude",
    "lit from within",
  ],
  SFX: [
    "sfx",
    "special effects",
    "prosthetic",
    "halloween",
    "fantasy",
    "character",
    "fx makeup",
    "theatrical",
    "costume",
    "body paint",
    "zombie",
    "monster",
    "creature",
  ],
  "Hari Raya": [
    "hari raya",
    "eid",
    "festive",
    "malay",
    "traditional",
    "modest",
    "elegant",
    "cultural",
    "celebration",
    "ramadan",
    "iftar",
  ],
  "Chinese New Year": [
    "chinese new year",
    "cny",
    "lunar new year",
    "auspicious",
    "red",
    "gold",
    "traditional chinese",
    "festive",
    "lion dance",
    "ang pow",
  ],
  "Traditional Malay": [
    "malay traditional",
    "berias pengantin",
    "henna",
    "bunga telur",
    "malay bridal",
    "cultural",
    "authentic",
    "adat",
    "tradisi",
  ],
  Hijab: [
    "hijab",
    "modest",
    "muslimah",
    "burqa",
    "niqab",
    "tudung",
    "islamic",
    "halal makeup",
    "covered",
    "abaya",
  ],
};

// City/state aliases → normalised location key
const LOCATION_KEYWORDS: Record<string, string[]> = {
  "Selangor, Petaling": [
    "selangor",
    "petaling",
    "petaling jaya",
    "pj",
    "subang",
    "shah alam",
    "klang",
    "damansara",
    "bangsar south",
    "cyberjaya",
  ],
  "Wilayah Persekutuan Kuala Lumpur, Bukit Bintang": [
    "kuala lumpur",
    "kl",
    "bukit bintang",
    "w.p. kuala lumpur",
    "wilayah persekutuan",
    "chow kit",
    "mont kiara",
    "bangsar",
    "midvalley",
    "klcc",
    "city centre",
  ],
  "Pulau Pinang, Timur Laut": [
    "pulau pinang",
    "penang",
    "timur laut",
    "george town",
    "georgetown",
    "bayan lepas",
    "gelugor",
  ],
  "Johor, Johor Bahru": ["johor", "johor bahru", "jb", "iskandar", "tebrau", "pasir gudang"],
  "Sabah, Kota Kinabalu": ["sabah", "kota kinabalu", "kk", "likas", "damai"],
  "Sarawak, Kuching": ["sarawak", "kuching", "miri", "sibu"],
};

// ── Parsers ───────────────────────────────────────────────────────────────────

export function parseEventTypes(text: string): ConciergeCategory[] {
  const lower = text.toLowerCase();
  const matches: ConciergeCategory[] = [];
  for (const [category, keywords] of Object.entries(EVENT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matches.push(category as ConciergeCategory);
    }
  }
  return matches;
}

export function parseLocation(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [location, keywords] of Object.entries(LOCATION_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return location;
    }
  }
  return null;
}

export function parseBudget(text: string): { min: number; max: number } | null {
  // Match patterns like "MYR 300", "RM300", "$500", "300-600", "under 400"
  // Bounded whitespace keeps these linear; the separator is "-", "–" or the
  // word "to" (the old `[-–to]+` class also matched "too", "oo", "t"...).
  const rangeMatch = text.match(
    /(?:myr|rm|\$)?[ \t]{0,3}(\d{1,6})[ \t]{0,3}(?:-|–|to\b)[ \t]{0,3}(?:myr|rm|\$)?[ \t]{0,3}(\d{1,6})/i,
  );
  if (rangeMatch) {
    return {
      min: Math.min(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)),
      max: Math.max(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)),
    };
  }

  const underMatch = text.match(/under[ \t]{0,3}(?:myr|rm|\$)?[ \t]{0,3}(\d{1,6})/i);
  if (underMatch) return { min: 0, max: parseInt(underMatch[1], 10) };

  const aboveMatch = text.match(
    /(?:above|over|from|min|starting)[ \t]{0,3}(?:myr|rm|\$)?[ \t]{0,3}(\d{1,6})/i,
  );
  if (aboveMatch) return { min: parseInt(aboveMatch[1], 10), max: 99999 };

  const singleMatch = text.match(/(?:myr|rm|\$)[ \t]{0,3}(\d{1,6})/i);
  if (singleMatch) return { min: 0, max: parseInt(singleMatch[1], 10) };

  if (/\b(affordable|budget|cheap|low cost)\b/i.test(text)) {
    return { min: 0, max: 300 };
  }
  if (/\b(luxury|premium|high end|best|exclusive|top)\b/i.test(text)) {
    return { min: 400, max: 99999 };
  }
  if (/\b(mid range|moderate)\b/i.test(text)) return { min: 200, max: 500 };

  return null;
}

export function parseExperienceYears(text: string): number {
  // "5 years", "10+ years", etc.
  const m = text.match(/(\d{1,3})\+?[ \t]{0,3}years?/i);
  if (m) return parseInt(m[1], 10);
  if (/beginner|new|fresh/i.test(text)) return 0;
  if (/veteran|senior|master|decade/i.test(text)) return 10;
  return 0;
}

// ── Ranker ────────────────────────────────────────────────────────────────────

/** Minimum score for an artist to be included in results */
const MIN_SCORE = 15;

/** Maximum recommendations to return */
const MAX_RESULTS = 3;

export function rankArtists(
  context: ConversationContext,
  catalog: Artist[] = SEED_ARTISTS,
): Recommendation[] {
  const results = catalog.map((artist) => {
    const signals: MatchSignal[] = [];

    if (context.eventTypes.length > 0) {
      const specsLower = artist.specialties.map((s) => s.toLowerCase());
      const overlap = context.eventTypes.filter((e) =>
        specsLower.some((s) => s.includes(e.toLowerCase())),
      );
      if (overlap.length > 0) {
        signals.push({
          label: `Specializes in ${overlap.join(" & ")}`,
          points: overlap.length * 30,
        });
      }
    }

    if (context.location) {
      const locLower = context.location.toLowerCase();
      if (
        locLower.includes(artist.state.toLowerCase()) ||
        locLower.includes(artist.area.toLowerCase())
      ) {
        signals.push({ label: `Based in ${artist.area}, ${artist.state}`, points: 25 });
      }
    }

    if (context.budget && artist.services.length > 0) {
      const minPrice = Math.min(...artist.services.map((s) => s.price));
      if (minPrice <= context.budget.max) {
        const pts = minPrice >= context.budget.min * 0.6 ? 15 : 8;
        signals.push({ label: `Starting from MYR ${minPrice}`, points: pts });
      }
    }

    if (artist.rating >= 4.9) {
      signals.push({ label: `${artist.rating}★ rating`, points: 10 });
    } else if (artist.rating >= 4.7) {
      signals.push({ label: `${artist.rating}★ rating`, points: 5 });
    }

    if (artist.reviewCount >= 50) {
      signals.push({ label: `${artist.reviewCount} reviews`, points: 5 });
    } else if (artist.reviewCount >= 20) {
      signals.push({ label: `${artist.reviewCount} reviews`, points: 3 });
    }

    const expYears = artist.yearsExperience;
    if (expYears >= 8) {
      signals.push({ label: `${expYears} years experience`, points: 10 });
    } else if (expYears >= 4) {
      signals.push({ label: `${expYears} years experience`, points: 5 });
    }

    if (context.styleNotes.length > 0) {
      const bioLower = `${artist.bio} ${artist.specialties.join(" ")}`.toLowerCase();
      const styleHits = context.styleNotes.filter((note) =>
        note.split(" ").some((word) => word.length > 3 && bioLower.includes(word.toLowerCase())),
      );
      if (styleHits.length > 0) {
        signals.push({
          label: "Matches your style preferences",
          points: Math.min(styleHits.length * 5, 10),
        });
      }
    }

    signals.push({ label: "Listed artist", points: 5 });

    const score = signals.reduce((sum, s) => sum + s.points, 0);
    const topSignals = signals
      .filter((s) => s.points >= 5)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);
    const reason = topSignals.map((s) => s.label).join(" · ");

    return { artist, score, signals, reason };
  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .filter((r) => r.score >= MIN_SCORE);
}
