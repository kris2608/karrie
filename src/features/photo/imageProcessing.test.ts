import { describe, expect, it } from "vitest";
import { centerCrop, matchCrop, outputSize } from "./imageProcessing";

const portraitVideo = { width: 1080, height: 1920 };
const landscapeVideo = { width: 1920, height: 1080 };

describe("crop math", () => {
  it("takes the centred 3:4 part a cover-fitted frame shows", () => {
    expect(centerCrop(portraitVideo, 3 / 4)).toEqual({ sx: 0, sy: 240, sw: 1080, sh: 1440 });
    expect(centerCrop(landscapeVideo, 3 / 4)).toEqual({ sx: 555, sy: 0, sw: 810, sh: 1080 });
  });

  it("maps the visible part of the video onto a taller full-resolution still", () => {
    const rect = matchCrop(portraitVideo, { width: 3024, height: 4032 }, 3 / 4);
    expect(rect.sw).toBe(3024);
    expect(rect.sh).toBe(4032);
    const narrow = matchCrop(landscapeVideo, { width: 4032, height: 3024 }, 3 / 4);
    expect(narrow.sw / 4032).toBeCloseTo(810 / 1920);
    expect(narrow.sw / narrow.sh).toBeCloseTo(0.75);
    expect(narrow.sx).toBeCloseTo((4032 - narrow.sw) / 2);
  });

  it("downscales to the size limit without upscaling small crops", () => {
    expect(outputSize({ sx: 0, sy: 0, sw: 3000, sh: 3000 }, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(outputSize({ sx: 0, sy: 0, sw: 2250, sh: 3000 }, 512)).toEqual({ width: 384, height: 512 });
    expect(outputSize({ sx: 0, sy: 0, sw: 400, sh: 300 }, 1024)).toEqual({ width: 400, height: 300 });
  });
});
