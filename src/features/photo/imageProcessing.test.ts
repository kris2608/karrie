import { describe, expect, it } from "vitest";
import { clampView, coverScale, cropRect, outputSize } from "./imageProcessing";

const landscape = { width: 4000, height: 3000 };
const square = { width: 300, height: 300 };

describe("crop math", () => {
  it("covers the frame at zoom 1 and centres the crop", () => {
    expect(coverScale(landscape, square)).toBeCloseTo(0.1);
    expect(cropRect({ zoom: 1, x: 0, y: 0 }, landscape, square)).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000 });
  });

  it("never pans past the image edge", () => {
    expect(clampView({ zoom: 1, x: 999, y: 50 }, landscape, square)).toEqual({ zoom: 1, x: 50, y: 0 });
    expect(cropRect({ zoom: 1, x: 999, y: 0 }, landscape, square).sx).toBe(0);
    expect(cropRect({ zoom: 1, x: -999, y: 0 }, landscape, square).sx).toBe(1000);
  });

  it("zooms into a smaller region and clamps the zoom range", () => {
    const rect = cropRect({ zoom: 2, x: 0, y: 0 }, landscape, square);
    expect(rect).toEqual({ sx: 1250, sy: 750, sw: 1500, sh: 1500 });
    expect(clampView({ zoom: 9, x: 0, y: 0 }, landscape, square).zoom).toBe(4);
    expect(clampView({ zoom: 0.2, x: 0, y: 0 }, landscape, square).zoom).toBe(1);
  });

  it("portrait frames crop a 3:4 region", () => {
    const rect = cropRect({ zoom: 1, x: 0, y: 0 }, landscape, { width: 300, height: 400 });
    expect(rect.sw / rect.sh).toBeCloseTo(0.75);
    expect(rect.sh).toBe(3000);
  });

  it("downscales to the size limit without upscaling small crops", () => {
    expect(outputSize({ sx: 0, sy: 0, sw: 3000, sh: 3000 }, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(outputSize({ sx: 0, sy: 0, sw: 2250, sh: 3000 }, 512)).toEqual({ width: 384, height: 512 });
    expect(outputSize({ sx: 0, sy: 0, sw: 400, sh: 300 }, 1024)).toEqual({ width: 400, height: 300 });
  });
});
