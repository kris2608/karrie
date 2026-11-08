import { describe, expect, it } from "vitest";
import { FEEDBACK_FORM, feedbackUrl, rememberCompleted, wantsFeedbackInvite } from "./feedback";

describe("feedback", () => {
  it("opens the published Tally form with only the source", () => {
    expect(feedbackUrl("settings")).toBe(`${FEEDBACK_FORM}?source=settings`);
    expect(feedbackUrl("completed")).toBe(`${FEEDBACK_FORM}?source=completed`);
  });

  it("counts each finished adventure once, also after undoing", () => {
    const once = rememberCompleted([], "a");
    expect(rememberCompleted(once, "a")).toEqual(["a"]);
    expect(rememberCompleted(once, "b")).toEqual(["a", "b"]);
  });

  it("invites after the second distinct finish, and never again once answered", () => {
    expect(wantsFeedbackInvite(["a"], false)).toBe(false);
    expect(wantsFeedbackInvite(["a", "b"], false)).toBe(true);
    expect(wantsFeedbackInvite(["a", "b", "c"], true)).toBe(false);
  });
});
