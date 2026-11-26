import { describe, expect, it } from "vitest";
import { attributionEventData, captureCampaignFromLocation } from "./campaignAttribution";
import { IG_BIO_SEARCH, igBioDestination, igBioLandingEvent, isIgBioPath } from "./igBio";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("instagram bio link", () => {
  it("matches only /ig and /ig/", () => {
    expect(isIgBioPath("/ig")).toBe(true);
    expect(isIgBioPath("/ig/")).toBe(true);
    expect(isIgBioPath("/ig/extra")).toBe(false);
    expect(isIgBioPath("/ignored")).toBe(false);
    expect(isIgBioPath("/")).toBe(false);
  });

  it("sends both paths to the home URL with the bio campaign", () => {
    const destination = igBioDestination();
    expect(destination).toBe("/?utm_source=instagram&utm_medium=social&utm_campaign=bio");
    const url = new URL(destination, "https://www.karrie.eu");
    expect(url.pathname).toBe("/");
    expect(url.search).toBe(IG_BIO_SEARCH);
    // Umami's before-send only rewrites /l/{token} and /s/{token}. This path stays a normal pageview.
    expect(/^\/(?:l|s)\/[A-Za-z0-9_-]{16,64}\/?$/.test(url.pathname)).toBe(false);
  });

  it("counts the bio landing and ignores other campaigns", () => {
    expect(igBioLandingEvent(IG_BIO_SEARCH)).toEqual({
      name: "landing_view",
      data: { page: "ig", utm_source: "instagram", utm_medium: "social", utm_campaign: "bio" },
    });
    expect(igBioLandingEvent("?utm_source=instagram&utm_medium=paid&utm_campaign=launch_nl")).toBeNull();
    expect(igBioLandingEvent("")).toBeNull();
  });

  it("stores the same allowlisted params that new_adventure_clicked and adventure_started attach", () => {
    const storage = new MemoryStorage();
    const attrs = captureCampaignFromLocation(IG_BIO_SEARCH, storage);
    expect(attributionEventData(attrs)).toEqual({
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "bio",
    });
  });
});
