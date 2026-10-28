import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Artist } from "@/lib/types";
import ArtistsBrowser from "./ArtistsBrowser";

// The browser reads `?category=` from the router and reports filter changes to
// analytics; neither is under test here.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/agnost-client", () => ({ trackSearch: vi.fn() }));

/**
 * A fresh production deployment has an empty catalog (there is no demo seed),
 * so the "nothing onboarded yet" state is a real launch state, not an edge case.
 */
const SELANGOR_ARTIST: Artist = {
  id: "selangor-artist",
  slug: "selangor-artist",
  name: "Selangor Artist",
  tagline: "Fixture tagline",
  bio: "",
  image: "/images/hero.jpg",
  rating: 4.8,
  reviewCount: 3,
  state: "Selangor",
  area: "Cyberjaya",
  priceFrom: 480,
  specialties: ["Bridal"],
  services: [],
  bridal: ["reception"],
  nonBridal: ["dinner"],
  availability: ["Tomorrow 10:00"],
  portfolio: [],
  verified: true,
  yearsExperience: 5,
  reviews: [],
};

describe("ArtistsBrowser", () => {
  it("renders an artist card per catalog row", () => {
    render(<ArtistsBrowser artists={[SELANGOR_ARTIST]} />);
    // The card link's accessible name includes the tagline and price too.
    expect(
      screen.getByRole("link", { name: new RegExp(SELANGOR_ARTIST.name) }),
    ).toBeInTheDocument();
  });

  it("invites onboarding when the catalog is empty", () => {
    render(<ArtistsBrowser artists={[]} />);

    expect(screen.getByText("No artists listed yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Join as an artist/i })).toHaveAttribute(
      "href",
      "/onboarding",
    );
    // Not the "filters too narrow" message — nothing can be cleared here.
    expect(screen.queryByText("No artists match your filters")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Clear all filters/i })).toHaveLength(0);
  });

  it("separates 'no matches' from an empty catalog", async () => {
    const user = userEvent.setup();
    render(<ArtistsBrowser artists={[SELANGOR_ARTIST]} />);

    await user.selectOptions(screen.getByLabelText("State"), "Johor");

    expect(screen.getByText("No artists match your filters")).toBeInTheDocument();
    expect(screen.queryByText("No artists listed yet")).not.toBeInTheDocument();
    // Rendered twice: the toolbar link and the empty-state button.
    expect(screen.getAllByRole("button", { name: /Clear all filters/i }).length).toBeGreaterThan(0);
  });
});
