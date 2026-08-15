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
