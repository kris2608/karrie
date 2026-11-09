import { describe, expect, it } from "vitest";
import { homeShelf } from "./homeShelf";
import type { Adventure, SavedList } from "./types";

function list(id: string, favorite = false): SavedList {
  return { id, name: id, items: [], favorite, updatedAt: 1 };
}

function adventure(id: string, phase: Adventure["phase"]): Adventure {
  return { id, name: id, phase, items: [], categoryOrder: [], history: [], createdAt: 1, updatedAt: 1 };
}

describe("homeShelf", () => {
  it("puts a list saved from the current draft before the older previous list", () => {
    const saved = [list("current", true), list("older")];
    expect(homeShelf(saved, adventure("current", "draft")).map(({ list, label }) => [list.id, label])).toEqual([
      ["current", "Bewaard"],
      ["older", "Vorig lijstje"],
    ]);
  });

  it("shows the finished list as previous and keeps favorites in recency order", () => {
    const saved = [list("done"), list("fav1", true), list("plain"), list("fav2", true)];
    expect(homeShelf(saved, adventure("done", "done")).map(({ list, label }) => [list.id, label])).toEqual([
      ["done", "Vorig lijstje"],
      ["fav1", "Bewaard"],
      ["fav2", "Bewaard"],
    ]);
  });
});
