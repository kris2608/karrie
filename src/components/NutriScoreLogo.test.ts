import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NutriScoreLogo, NutriScoreMark, nutriScoreGrade, nutriScoreLogosEnabled, nutriScoreSrc } from "./NutriScoreLogo";

describe("nutriScoreGrade", () => {
  it("accepts A–E in any case and rejects everything else", () => {
    expect(nutriScoreGrade("c")).toBe("C");
    expect(nutriScoreGrade("A")).toBe("A");
    expect(nutriScoreGrade(" e ")).toBe("E");
    expect(nutriScoreGrade(undefined)).toBeNull();
    expect(nutriScoreGrade("")).toBeNull();
    expect(nutriScoreGrade("F")).toBeNull();
    expect(nutriScoreGrade("not-a-grade")).toBeNull();
  });
});

describe("NutriScoreLogo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the official SVG for each grade by default", () => {
    for (const grade of ["A", "B", "C", "D", "E"] as const) {
      const html = renderToStaticMarkup(createElement(NutriScoreLogo, { grade }));
      expect(html).toContain(`src="${nutriScoreSrc(grade)}"`);
      expect(html).toContain(`aria-label="Nutri-Score ${grade}"`);
      expect(html).toContain('data-testid="nutri-score"');
      expect(html).toContain("width=\"160\"");
    }
  });

  it("renders nothing for missing or invalid grades", () => {
    expect(renderToStaticMarkup(createElement(NutriScoreLogo, { grade: undefined }))).toBe("");
    expect(renderToStaticMarkup(createElement(NutriScoreLogo, { grade: "F" }))).toBe("");
  });

  it("hides the trademark logo when VITE_NUTRISCORE_LOGOS is off", () => {
    vi.stubEnv("VITE_NUTRISCORE_LOGOS", "off");
    expect(nutriScoreLogosEnabled()).toBe(false);
    expect(renderToStaticMarkup(createElement(NutriScoreLogo, { grade: "C" }))).toBe("");
    const mark = renderToStaticMarkup(createElement(NutriScoreMark, { grade: "C" }));
    expect(mark).toContain("Nutri-Score C");
    expect(mark).not.toContain(".svg");
  });

  it("keeps logos on when the kill switch is unset", () => {
    expect(nutriScoreLogosEnabled()).toBe(true);
    expect(renderToStaticMarkup(createElement(NutriScoreMark, { grade: "C" }))).toContain("nutriscore-c.svg");
  });
});
