export type Role = "customer" | "artist" | "studio" | "admin";

export type BridalEvent =
  "engagement" | "solemnization" | "reception" | "full-package" | "bridal-other";

export type NonBridalEvent =
  "dinner" | "graduation" | "ceremony" | "corporate" | "touch-up" | "non-bridal-other";

export interface Service {
  name: string;
  price: number;
  duration: string;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  text: string;
  event: string;
}

export interface Artist {
  id: string;
  /** URL key. Seeded artists keep slug === id; admin-created ones use a UUID id. */
  slug?: string;
  name: string;
  tagline: string;
  bio: string;
  image: string;
  rating: number;
  reviewCount: number;
  state: string;
  area: string;
  priceFrom: number;
  specialties: string[];
  services: Service[];
  bridal: BridalEvent[];
  nonBridal: NonBridalEvent[];
  availability: string[];
  portfolio: string[];
  verified: boolean;
  yearsExperience: number;
  reviews: Review[];
  referralCode?: string;
  referredBy?: string | null;
  referralEarnings?: number;
}

export interface Studio {
  id: string;
  /** URL key. Seeded studios keep slug === id. */
  slug?: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
  rating: number;
  reviewCount: number;
  state: string;
  area: string;
  address: string;
  services: string[];
  priceFrom: number;
  hours: string;
  phone: string;
  referralCode?: string;
  referredBy?: string | null;
  referralEarnings?: number;
}

export interface Category {
  slug: string;
  name: string;
  description: string;
  image: string;
  count: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  category: string;
  brand: string;
  image_url: string;
  rating: number;
  review_count: number;
  is_featured: boolean;
  stock_count: number;
  min_order: number;
  return_policy: string;
  ingredients: string;
  is_clean: boolean;
  is_cruelty_free: boolean;
  sort_order: number;
}
