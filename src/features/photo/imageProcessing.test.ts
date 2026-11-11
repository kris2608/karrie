import { describe, expect, it } from "vitest";
import { CAMERA_GUIDE_INSET, centerCrop, guideCrop, mapCropToStill, matchCrop, outputSize } from "./imageProcessing";

const portraitVideo = { width: 1080, height: 1920 };
const landscapeVideo = { width: 1920, height: 1080 };
/** CSS box matching .camera-frame aspect 3:4. */
const frameBox = { width: 300, height: 400 };

describe("crop math", () => {
  it("takes the centred 3:4 part a cover-fitted frame shows", () => {
    expect(centerCrop(portraitVideo, 3 / 4)).toEqual({ sx: 0, sy: 240, sw: 1080, sh: 1440 });
    expect(centerCrop(landscapeVideo, 3 / 4)).toEqual({ sx: 555, sy: 0, sw: 810, sh: 1080 });
  });

  it("crops inside the corner markers, tighter than the full 3:4 cover region", () => {
    const full = centerCrop(portraitVideo, 3 / 4);
    const guide = guideCrop(portraitVideo, frameBox);
    expect(guide.sw).toBeLessThan(full.sw);
    expect(guide.sh).toBeLessThan(full.sh);
    expect(guide.sx).toBeGreaterThan(full.sx - 0.5);
    expect(guide.sy).toBeGreaterThan(full.sy - 0.5);
    expect(guide.sx + guide.sw).toBeLessThan(full.sx + full.sw + 0.5);
    expect(guide.sy + guide.sh).toBeLessThan(full.sy + full.sh + 0.5);
    // Insets match CSS 7% / 8% of the cover region when the box is exactly 3:4.
    expect(guide.sw / full.sw).toBeCloseTo(1 - CAMERA_GUIDE_INSET.left - CAMERA_GUIDE_INSET.right, 2);
    expect(guide.sh / full.sh).toBeCloseTo(1 - CAMERA_GUIDE_INSET.top - CAMERA_GUIDE_INSET.bottom, 2);
  });

  it("maps a video guide crop proportionally onto a taller still", () => {
    const videoCrop = guideCrop(portraitVideo, frameBox);
    const still = { width: 3024, height: 5376 };
    const mapped = mapCropToStill(videoCrop, portraitVideo, still);
    expect(mapped.sw / still.width).toBeCloseTo(videoCrop.sw / portraitVideo.width);
    expect(mapped.sh / still.height).toBeCloseTo(videoCrop.sh / portraitVideo.height);
    expect(mapped.sy).toBeGreaterThan(0);
    expect(mapped.sy + mapped.sh).toBeLessThan(still.height);
    // Not the entire still — the old matchCrop width-fraction path could keep full height.
    expect(mapped.sh).toBeLessThan(still.height);
  });

  it("keeps matchCrop proportional for landscape video onto a still", () => {
    const videoCrop = centerCrop(landscapeVideo, 3 / 4);
    const still = { width: 4032, height: 3024 };
    const mapped = matchCrop(landscapeVideo, still, 3 / 4);
    expect(mapped.sw / still.width).toBeCloseTo(videoCrop.sw / landscapeVideo.width);
    expect(mapped.sh / still.height).toBeCloseTo(videoCrop.sh / landscapeVideo.height);
  });

  it("downscales to the size limit without upscaling small crops", () => {
    expect(outputSize({ sx: 0, sy: 0, sw: 3000, sh: 3000 }, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(outputSize({ sx: 0, sy: 0, sw: 2250, sh: 3000 }, 512)).toEqual({ width: 384, height: 512 });
    expect(outputSize({ sx: 0, sy: 0, sw: 400, sh: 300 }, 1024)).toEqual({ width: 400, height: 300 });
  });
});
