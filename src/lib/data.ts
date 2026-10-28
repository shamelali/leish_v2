import type { BridalEvent, Category, NonBridalEvent } from "./types";

/**
 * Reference data only: geography, event taxonomies and marketing categories.
 *
 * The catalog itself (artists / studios / reviews) is NOT defined here and is
 * never seeded — it lives exclusively in the database and is populated by
 * admins (`/admin/artists`, `/api/onboarding`). See src/server/catalog.ts.
 */

export const MALAYSIA_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Kuala Lumpur",
  "Labuan",
  "Malacca",
  "Negeri Sembilan",
  "Pahang",
  "Penang",
  "Perak",
  "Perlis",
  "Putrajaya",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
] as const;

export type State = (typeof MALAYSIA_STATES)[number];

export const AREAS_BY_STATE: Record<State, string[]> = {
  Selangor: [
    "Cyberjaya",
    "Subang Jaya",
    "Petaling Jaya",
    "Shah Alam",
    "Klang",
    "Ampang",
    "Bangi",
    "Puchong",
    "Damansara",
    "Rawang",
    "Sepang",
    "Serdang",
  ],
  "Kuala Lumpur": [
    "KLCC",
    "Bukit Bintang",
    "Mont Kiara",
    "Bangsar",
    "Cheras",
    "Setapak",
    "Wangsa Maju",
    "Kepong",
    "Damansara Heights",
    "Taman Desa",
  ],
  Johor: [
    "Pasir Gudang",
    "Johor Bahru",
    "Skudai",
    "Iskandar Puteri",
    "Kulai",
    "Batu Pahat",
    "Muar",
    "Kluang",
  ],
  Penang: ["George Town", "Bayan Lepas", "Butterworth", "Tanjung Bungah", "Gurney", "Balik Pulau"],
  Perak: ["Ipoh", "Taiping", "Teluk Intan", "Sitiawan", "Kampar"],
  Malacca: ["Bandar Melaka", "Ayer Keroh", "Bukit Baru", "Bachang"],
  "Negeri Sembilan": ["Seremban", "Port Dickson", "Nilai", "Senawang"],
  Pahang: ["Kuantan", "Temerloh", "Bentong", "Cameron Highlands"],
  Kedah: ["Alor Setar", "Sungai Petani", "Kulim", "Langkawi"],
  Kelantan: ["Kota Bharu", "Pasir Mas", "Tanah Merah", "Bachok"],
  Terengganu: ["Kuala Terengganu", "Kemaman", "Dungun", "Marang"],
  Perlis: ["Kangar", "Arau", "Padang Besar"],
  Putrajaya: ["Presint 1", "Presint 9", "Presint 15", "Presint 16"],
  Labuan: ["Bandar Labuan", "Kiamsam", "Victoria"],
  Sabah: ["Kota Kinabalu", "Sandakan", "Tawau", "Penampang"],
  Sarawak: ["Kuching", "Miri", "Sibu", "Bintulu", "Samarahan"],
};

export const BRIDAL_EVENTS: { id: BridalEvent; label: string }[] = [
  { id: "engagement", label: "Engagement" },
  { id: "solemnization", label: "Solemnization" },
  { id: "reception", label: "Reception" },
  { id: "full-package", label: "Full Package (Engagement + Solemnization + Reception)" },
  { id: "bridal-other", label: "Other" },
];

export const NON_BRIDAL_EVENTS: { id: NonBridalEvent; label: string }[] = [
  { id: "dinner", label: "Dinner" },
  { id: "graduation", label: "Graduation" },
  { id: "ceremony", label: "Ceremony" },
  { id: "corporate", label: "Corporate" },
  { id: "touch-up", label: "Touch-up" },
  { id: "non-bridal-other", label: "Other" },
];

export const CATEGORIES: Category[] = [
  {
    slug: "bridal",
    name: "Bridal Makeup",
    description: "Engagement, solemnization, reception & full wedding packages",
    image: "/images/hero.jpg",
  },
  {
    slug: "engagement",
    name: "Engagement",
    description: "Natural glam for your special photoshoot moments",
    image: "/images/artist-5.jpg",
  },
  {
    slug: "graduation",
    name: "Graduation & Events",
    description: "Capsule glam, dinners and celebration-ready looks",
    image: "/images/artist-2.jpg",
  },
  {
    slug: "corporate",
    name: "Corporate",
    description: "Polished, professional looks for work and functions",
    image: "/images/artist-6.jpg",
  },
];
