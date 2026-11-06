import { expect, it } from "vitest";
import type { ScannedProduct } from "../../domain/types";
import { initialScan, scannerReducer, type ScanEvent, type ScanState } from "./scannerMachine";

const product: ScannedProduct = { ean: "3017620422003", name: "Nutella", categoryTags: [], category: "pantry" };

function run(events: ScanEvent[], from: ScanState = initialScan) {
  return events.reduce(scannerReducer, from);
}

it("doorloopt camera, scan en opzoeken", () => {
  const state = run([{ type: "open" }, { type: "camera-ready" }, { type: "detect", ean: "3017620422003" }]);
  expect(state).toMatchObject({ status: "barcode-detected", ean: "3017620422003", scanId: 1 });
  const loaded = run([{ type: "load", scanId: 1 }, { type: "found", scanId: 1, product }], state);
  expect(loaded).toMatchObject({ status: "product-found", product });
});

it("laat een ouder een gevonden product bevestigen", () => {
  const found = run([{ type: "open" }, { type: "camera-ready" }, { type: "detect", ean: "1" }, { type: "load", scanId: 1 }, { type: "found", scanId: 1, product }]);
  expect(run([{ type: "verified", scanId: 1 }], found)).toMatchObject({ status: "verification-success", product });
  expect(run([{ type: "verified", scanId: 0 }], found)).toBe(found);
});

it("negeert ongeldige overgangen", () => {
  expect(run([{ type: "camera-ready" }])).toBe(initialScan);
  expect(run([{ type: "detect", ean: "1" }])).toBe(initialScan);
  const found = run([{ type: "open" }, { type: "camera-ready" }, { type: "detect", ean: "1" }, { type: "found", scanId: 1, product }]);
  expect(run([{ type: "detect", ean: "2" }], found)).toBe(found);
  expect(run([{ type: "camera-denied" }], found)).toBe(found);
});

it("negeert een verouderde scanId", () => {
  const first = run([{ type: "open" }, { type: "camera-ready" }, { type: "detect", ean: "1" }]);
  const closed = run([{ type: "close" }, { type: "open" }, { type: "camera-ready" }, { type: "detect", ean: "2" }], first);
  expect(closed.scanId).toBe(3);
  expect(run([{ type: "found", scanId: 1, product }], closed)).toBe(closed);
  expect(run([{ type: "found", scanId: 3, product }], closed).status).toBe("product-found");
});

it("gaat na een fout of afwijzing terug naar de camera", () => {
  const denied = run([{ type: "open" }, { type: "camera-denied" }]);
  expect(denied.status).toBe("permission-denied");
  expect(run([{ type: "detect", ean: "3017620422003" }], denied).status).toBe("barcode-detected");
  const failed = run([{ type: "open" }, { type: "camera-ready" }, { type: "detect", ean: "1" }, { type: "mismatch", scanId: 1 }]);
  expect(failed.status).toBe("verification-failed");
  expect(run([{ type: "retry" }], failed).status).toBe("opening-camera");
});
