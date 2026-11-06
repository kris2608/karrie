import type { ScannedProduct } from "../../domain/types";

export type ScanStatus =
  | "idle"
  | "opening-camera"
  | "scanning"
  | "camera-unavailable"
  | "permission-denied"
  | "barcode-detected"
  | "loading-product"
  | "product-found"
  | "product-not-found"
  | "verification-success"
  | "verification-failed"
  | "network-error";

export type ScanState = {
  status: ScanStatus;
  scanId: number;
  ean?: string;
  product?: ScannedProduct;
};

export type ScanEvent =
  | { type: "open" }
  | { type: "camera-ready" }
  | { type: "camera-denied" }
  | { type: "camera-unavailable" }
  | { type: "detect"; ean: string }
  | { type: "load"; scanId: number }
  | { type: "found"; scanId: number; product: ScannedProduct }
  | { type: "not-found"; scanId: number }
  | { type: "network-error"; scanId: number }
  | { type: "verified"; scanId: number; product?: ScannedProduct }
  | { type: "mismatch"; scanId: number }
  | { type: "retry" }
  | { type: "close" };

export const initialScan: ScanState = { status: "idle", scanId: 0 };

const CAN_DETECT: ScanStatus[] = ["opening-camera", "scanning", "camera-unavailable", "permission-denied"];
const CAN_RETRY: ScanStatus[] = [
  "camera-unavailable",
  "permission-denied",
  "product-found",
  "product-not-found",
  "verification-failed",
  "network-error",
];
const BUSY: ScanStatus[] = ["barcode-detected", "loading-product"];

export function scannerReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case "open":
      return state.status === "idle" ? { status: "opening-camera", scanId: state.scanId } : state;
    case "camera-ready":
      return state.status === "opening-camera" ? { ...state, status: "scanning" } : state;
    case "camera-denied":
      return state.status === "opening-camera" || state.status === "scanning" ? { ...state, status: "permission-denied" } : state;
    case "camera-unavailable":
      return state.status === "opening-camera" || state.status === "scanning" ? { ...state, status: "camera-unavailable" } : state;
    case "detect":
      if (!CAN_DETECT.includes(state.status)) return state;
      return { status: "barcode-detected", scanId: state.scanId + 1, ean: event.ean };
    case "retry":
      return CAN_RETRY.includes(state.status) ? { status: "opening-camera", scanId: state.scanId } : state;
    case "close":
      return { status: "idle", scanId: state.scanId + 1 };
    default:
      break;
  }

  if (event.scanId !== state.scanId) return state;
  if (event.type === "verified" && state.status === "product-found") {
    return { ...state, status: "verification-success", product: event.product ?? state.product };
  }
  if (!BUSY.includes(state.status)) return state;
  switch (event.type) {
    case "load":
      return state.status === "barcode-detected" ? { ...state, status: "loading-product" } : state;
    case "found":
      return { ...state, status: "product-found", product: event.product };
    case "not-found":
      return { ...state, status: "product-not-found" };
    case "network-error":
      return { ...state, status: "network-error" };
    case "verified":
      return { ...state, status: "verification-success", product: event.product };
    case "mismatch":
      return { ...state, status: "verification-failed" };
  }
}

export function cameraWanted(status: ScanStatus): boolean {
  return status === "opening-camera" || status === "scanning";
}
