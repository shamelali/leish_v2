export type Role = "customer" | "artist" | "studio";

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
}

export interface Studio {
  id: string;
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
  description: string | null;
  price: number;
  category: string;
  brand: string | null;
  image_url: string | null;
  rating: number | null;
  review_count: number | null;
  is_featured: boolean;
  stock_count: number | null;
  min_order: number | null;
  return_policy: string | null;
  ingredients: string | null;
  is_clean: boolean;
  is_cruelty_free: boolean;
  sort_order: number;
}

export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  verified_purchase: boolean;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referee_id: string;
  product_id: string | null;
  status: "pending" | "completed" | "cancelled";
  reward_amount: number | null;
}
