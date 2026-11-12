import { describe, expect, it } from "vitest";
import { centerCrop, matchCrop, outputSize } from "./imageProcessing";

const portraitVideo = { width: 1080, height: 1920 };
const landscapeVideo = { width: 1920, height: 1080 };

describe("crop math", () => {
  it("takes the centred 3:4 part a cover-fitted frame shows", () => {
    expect(centerCrop(portraitVideo, 3 / 4)).toEqual({ sx: 0, sy: 240, sw: 1080, sh: 1440 });
    expect(centerCrop(landscapeVideo, 3 / 4)).toEqual({ sx: 555, sy: 0, sw: 810, sh: 1080 });
  });

  it("keeps the same width fraction of a taller still, not a tighter guide crop", () => {
    const still = { width: 3024, height: 5376 };
    const mapped = matchCrop(portraitVideo, still, 3 / 4);
    expect(mapped.sw / still.width).toBeCloseTo(1);
    expect(mapped.sh / mapped.sw).toBeCloseTo(4 / 3);
    expect(mapped.sy).toBeGreaterThan(0);
    expect(mapped.sy + mapped.sh).toBeLessThan(still.height + 1);
  });

  it("keeps matchCrop inside a landscape still", () => {
    const mapped = matchCrop(landscapeVideo, { width: 4032, height: 3024 }, 3 / 4);
    expect(mapped.sw / 4032).toBeCloseTo(810 / 1920);
    expect(mapped.sh / mapped.sw).toBeCloseTo(4 / 3);
    expect(mapped.sx).toBeGreaterThan(0);
    expect(mapped.sy).toBeGreaterThan(0);
  });

  it("downscales to the size limit without upscaling small crops", () => {
    expect(outputSize({ sx: 0, sy: 0, sw: 3000, sh: 3000 }, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(outputSize({ sx: 0, sy: 0, sw: 2250, sh: 3000 }, 512)).toEqual({ width: 384, height: 512 });
    expect(outputSize({ sx: 0, sy: 0, sw: 400, sh: 300 }, 1024)).toEqual({ width: 400, height: 300 });
  });
});
