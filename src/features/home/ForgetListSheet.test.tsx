/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedList } from "../../domain/types";
import { ForgetListSheet } from "./ForgetListSheet";

afterEach(() => cleanup());

const list: SavedList = {
  id: "list-1",
  name: "Weekboodschappen",
  items: [{ productId: "melk", name: "Melk", icon: "milk", category: "dairy", quantity: 1 }],
  favorite: true,
  updatedAt: 1,
};

describe("ForgetListSheet", () => {
  it("names the list and only wipes it after confirming", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ForgetListSheet list={list} onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByTestId("forget-list-sheet").textContent).toContain("Weekboodschappen");
    expect(screen.getByTestId("forget-list-sheet").textContent).toContain("1 product ");

    fireEvent.click(screen.getByTestId("forget-list-cancel"));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("forget-list-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(list);
  });
});
