import { afterEach, describe, expect, it } from "vitest";
import {
  attributionEventData,
  captureCampaignFromLocation,
  hasAttribution,
  parseCampaignParams,
  readStoredAttribution,
  storeAttribution,
} from "./campaignAttribution";

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

const storage = new MemoryStorage();

afterEach(() => storage.clear());

describe("parseCampaignParams", () => {
  it("keeps only allowlisted utm values", () => {
    expect(parseCampaignParams("?utm_source=chatgpt&utm_medium=paid&utm_campaign=launch_nl&evil=1")).toEqual({
      utm_source: "chatgpt",
      utm_medium: "paid",
      utm_campaign: "launch_nl",
    });
  });

  it("rejects unsafe characters", () => {
    expect(parseCampaignParams("?utm_source=chat gpt&utm_medium=paid")).toEqual({
      utm_medium: "paid",
    });
  });
});

describe("campaign storage", () => {
  it("stores and reads attribution", () => {
    storeAttribution({ utm_source: "instagram", utm_medium: "paid" }, storage);
    expect(hasAttribution(readStoredAttribution(storage))).toBe(true);
    expect(attributionEventData(readStoredAttribution(storage))).toEqual({
      utm_source: "instagram",
      utm_medium: "paid",
    });
  });

  it("captures from a query string", () => {
    const attrs = captureCampaignFromLocation("?utm_source=creator&utm_campaign=launch_nl", storage);
    expect(attrs).toEqual({ utm_source: "creator", utm_campaign: "launch_nl" });
  });
});
