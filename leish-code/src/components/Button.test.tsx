import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a button with children", () => {
    render(<Button>Book now</Button>);
    expect(screen.getByRole("button", { name: "Book now" })).toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Click me" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a link when href is provided", () => {
    render(<Button href="/artists">Browse</Button>);
    expect(screen.getByRole("link", { name: "Browse" })).toHaveAttribute("href", "/artists");
  });

  it("is disabled when disabled is set", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button", { name: "Disabled" })).toBeDisabled();
  });
});
