import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingStars } from "./RatingStars";

describe("RatingStars", () => {
  it("renders five stars with an accessible label", () => {
    render(<RatingStars rating={4.5} />);
    expect(screen.getByLabelText("Rated 4.5 out of 5")).toBeInTheDocument();
  });

  it("clamps ratings outside 0–5", () => {
    const { rerender } = render(<RatingStars rating={7} />);
    expect(screen.getByLabelText("Rated 7 out of 5")).toBeInTheDocument();
    rerender(<RatingStars rating={-1} />);
    expect(screen.getByLabelText("Rated -1 out of 5")).toBeInTheDocument();
  });
});
