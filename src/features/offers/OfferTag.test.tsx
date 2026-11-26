/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfferTag } from "./OfferTag";

describe("OfferTag", () => {
  it("shows Actie? as a single badge and keeps the full meaning in the label", () => {
    render(<OfferTag shown="maybe" retailer="jumbo" />);
    const tag = screen.getByTestId("offer-tag");
    expect(tag.textContent).toContain("Actie?");
    expect(tag.textContent).not.toContain("Mogelijke aanbieding");
    expect(tag.getAttribute("aria-label")).toBe("Mogelijk in de aanbieding");
    expect(tag.getAttribute("title")).toBe("Mogelijk in de aanbieding");
  });
});
