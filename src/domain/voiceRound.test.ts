import { describe, expect, it } from "vitest";
import { INITIAL_PRAISE_STATE, planFoundVoice, type PraiseState } from "./voiceRound";

function sequence(randoms: number[], lastIndex: number): Array<ReturnType<typeof planFoundVoice>["line"]> {
  let state: PraiseState = { ...INITIAL_PRAISE_STATE };
  return randoms.map((random, index) => {
    const plan = planFoundVoice(state, { isLast: index === lastIndex, random });
    state = plan.praise;
    return plan.line;
  });
}

describe("planFoundVoice", () => {
  it("celebrates the last find immediately and never praises it", () => {
    const plan = planFoundVoice({ findsSincePraise: 2, lastWasPraise: false }, { isLast: true, random: 0 });
    expect(plan).toMatchObject({ line: "celebration", at: "found", delayMs: 0 });
    expect(plan.line).not.toBe("praise");
  });

  it("never praises twice in a row", () => {
    const lines = sequence([0, 0, 0, 0, 0, 0], 99);
    for (let i = 1; i < lines.length; i += 1) {
      expect(lines[i] === "praise" && lines[i - 1] === "praise").toBe(false);
    }
    expect(lines.filter((line) => line === "praise").length).toBeGreaterThan(0);
  });

  it("praises about one find in three and at latest on the third find", () => {
    const lines = sequence(Array.from({ length: 12 }, () => 0.99), 99);
    expect(lines).toEqual(["none", "none", "praise", "none", "none", "praise", "none", "none", "praise", "none", "none", "praise"]);
  });

  it("praises a find when the roll says so, then skips the next", () => {
    const lines = sequence([0.1, 0.1, 0.9], 99);
    expect(lines[0]).toBe("praise");
    expect(lines[1]).toBe("none");
  });

  it("ends the round with celebration even if praise was due", () => {
    const lines = sequence([0.99, 0.99, 0], 2);
    expect(lines).toEqual(["none", "none", "celebration"]);
  });
});
