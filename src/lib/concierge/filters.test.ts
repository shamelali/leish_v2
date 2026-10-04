import { describe, expect, it } from "vitest";
import { SEED_ARTISTS } from "../data";
import {
  parseBudget,
  parseEventTypes,
  parseExperienceYears,
  parseLocation,
  rankArtists,
} from "./filters";
import { EMPTY_CONTEXT } from "./types";

describe("parseBudget", () => {
  it.each([
    ["RM300 - RM600", { min: 300, max: 600 }],
    ["300-600", { min: 300, max: 600 }],
    ["300 – 600", { min: 300, max: 600 }],
    ["myr 300 to myr 600", { min: 300, max: 600 }],
    ["600 to 300", { min: 300, max: 600 }],
    ["under RM 400", { min: 0, max: 400 }],
    ["starting from 250", { min: 250, max: 99999 }],
    ["around RM 350", { min: 0, max: 350 }],
    ["something affordable", { min: 0, max: 300 }],
    ["premium bridal", { min: 400, max: 99999 }],
    ["mid range artist", { min: 200, max: 500 }],
  ])("parses %j", (text, expected) => {
    expect(parseBudget(text)).toEqual(expected);
  });

  it("does not treat 'too'/'oo' as a range separator", () => {
    expect(parseBudget("300 too 600")).toBeNull();
    expect(parseBudget("300 oo 600")).toBeNull();
  });

  it("returns null when there is no budget", () => {
    expect(parseBudget("bridal makeup in KL")).toBeNull();
  });

  it("stays fast on long adversarial input", () => {
    const evil = `rm${" ".repeat(50_000)}x`;
    const start = performance.now();
    parseBudget(evil);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("parseExperienceYears", () => {
  it.each([
    ["5 years experience", 5],
    ["10+ years", 10],
    ["1 year", 1],
    ["a beginner", 0],
    ["veteran artist", 10],
    ["no info", 0],
  ])("parses %j", (text, expected) => {
    expect(parseExperienceYears(text)).toBe(expected);
  });
});

describe("parseEventTypes and parseLocation", () => {
  it("extracts matching event categories", () => {
    expect(parseEventTypes("bridal wedding and photoshoot")).toEqual(
      expect.arrayContaining(["Bridal", "Photoshoot"]),
    );
  });

  it("extracts known Malaysian locations and returns null when unknown", () => {
    expect(parseLocation("looking in petaling jaya")).toBe("Selangor, Petaling");
    expect(parseLocation("somewhere in mars")).toBeNull();
  });
});

describe("rankArtists", () => {
  it("ranks artists against conversation context", () => {
    const recs = rankArtists({
      ...EMPTY_CONTEXT,
      eventTypes: ["Bridal"],
      location: "Selangor, Petaling",
      budget: { min: 300, max: 800 },
      styleNotes: ["natural soft glam"],
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].score).toBeGreaterThanOrEqual(15);
  });

  it("handles mid-tier ratings, review counts, experience bands, and budget thresholds", () => {
    const customCatalog = [
      {
        ...SEED_ARTISTS[0],
        id: "mid-1",
        name: "Mid Artist",
        bio: "Specializes in editorial looks",
        state: "Kuala Lumpur",
        area: "Bangsar",
        specialties: ["Photoshoot" as const],
        rating: 4.75,
        reviewCount: 25,
        yearsExperience: 5,
        services: [
          {
            id: "s1",
            name: "Editorial Look",
            description: "Desc",
            price: 100,
            duration: "1h",
            category: "Editorial" as const,
          },
        ],
      },
      {
        ...SEED_ARTISTS[0],
        id: "low-1",
        name: "Junior Artist",
        bio: "New artist",
        state: "Johor",
        area: "Johor Bahru",
        specialties: ["Personal" as const],
        rating: 4.5,
        reviewCount: 5,
        yearsExperience: 2,
        services: [
          {
            id: "s2",
            name: "Personal Look",
            description: "Desc",
            price: 900,
            duration: "1h",
            category: "Personal" as const,
          },
        ],
      },
    ];

    const recs = rankArtists(
      {
        ...EMPTY_CONTEXT,
        eventTypes: ["Photoshoot"],
        location: "Kuala Lumpur, Bangsar",
        budget: { min: 500, max: 800 },
        styleNotes: ["editorial"],
      },
      customCatalog,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].artist.id).toBe("mid-1");
    expect(rankArtists(EMPTY_CONTEXT).length).toBeGreaterThan(0);
  });
});
