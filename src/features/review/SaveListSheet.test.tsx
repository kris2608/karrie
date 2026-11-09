/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Adventure } from "../../domain/types";
import { SaveListSheet } from "./SaveListSheet";

afterEach(() => cleanup());

const adventure: Adventure = {
  id: "list-1",
  name: "Week",
  phase: "draft",
  items: [],
  categoryOrder: ["produce"],
  history: [],
  createdAt: 1,
  updatedAt: 1,
};

describe("SaveListSheet", () => {
  it("saves a new list with the typed name", () => {
    const onSave = vi.fn();
    render(<SaveListSheet open adventure={adventure} onClose={() => undefined} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("save-name"), { target: { value: "Zaterdag" } });
    fireEvent.click(screen.getByTestId("save-confirm"));
    expect(onSave).toHaveBeenCalledWith("Zaterdag", "");
  });

  it("updates in place or switches to save-as-new", () => {
    const onUpdate = vi.fn();
    const onSaveAsNew = vi.fn();
    const onSave = vi.fn();
    render(
      <SaveListSheet
        open
        adventure={adventure}
        editingFavorite
        onClose={() => undefined}
        onSave={onSave}
        onUpdate={onUpdate}
        onSaveAsNew={onSaveAsNew}
      />,
    );
    expect(screen.getByText("Lijstje bijwerken")).toBeTruthy();
    fireEvent.click(screen.getByTestId("save-confirm"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("save-as-new"));
    expect(screen.getByRole("heading", { name: "Bewaar als nieuw" })).toBeTruthy();
    fireEvent.change(screen.getByTestId("save-name"), { target: { value: "Kopie" } });
    fireEvent.click(screen.getByTestId("save-confirm"));
    expect(onSaveAsNew).toHaveBeenCalledWith("Kopie", "");
  });
});
