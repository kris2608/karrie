import { describe, expect, it } from "vitest";
import {
  bandGeometry,
  coverLayout,
  mapBandToVideo,
  mapDecodeToOverlay,
  mapVideoToCover,
  padPolygon,
  pointsFromSegment,
  polygonPath,
} from "./barcodeGeometry";

describe("barcode geometry mapping", () => {
  it("maps decode-canvas points back through the centre band into video space", () => {
    const band = bandGeometry(1000, 800, 500)!;
    expect(band.cropW).toBe(850);
    expect(band.cropH).toBe(400);
    expect(band.scale).toBeCloseTo(500 / 850);
    const [video] = mapBandToVideo([{ x: 0, y: 0 }], band);
    expect(video.x).toBeCloseTo(band.cropX);
    expect(video.y).toBeCloseTo(band.cropY);
  });

  it("places object-fit cover video points inside the preview box", () => {
    const layout = coverLayout(1920, 1080, 300, 400)!;
    expect(layout.renderH).toBe(400);
    expect(layout.offsetY).toBe(0);
    expect(layout.offsetX).toBeLessThan(0);
    const [point] = mapVideoToCover([{ x: 960, y: 540 }], 1920, 1080, layout);
    expect(point.x).toBeCloseTo(150);
    expect(point.y).toBeCloseTo(200);
  });

  it("builds a parallelogram from two finder points and pads a polygon", () => {
    const box = pointsFromSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(box).toHaveLength(4);
    expect(box[0].y).toBeCloseTo(10);
    const padded = padPolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      5,
    );
    expect(padded[0].x).toBeLessThan(0);
    expect(polygonPath(padded).startsWith("M")).toBe(true);
  });

  it("returns overlay points for a full decode→preview pipeline", () => {
    const band = bandGeometry(1000, 1000, 1000)!;
    const overlay = mapDecodeToOverlay(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 200 },
        { x: 100, y: 200 },
      ],
      band,
      300,
      400,
      0,
    );
    expect(overlay).toHaveLength(4);
    expect(overlay![0].x).toBeGreaterThan(0);
  });

  it("refuses highlights when geometry is insufficient", () => {
    const band = bandGeometry(1000, 1000, 1000)!;
    expect(mapDecodeToOverlay([{ x: 1, y: 1 }], band, 100, 100)).toBeNull();
  });
});
