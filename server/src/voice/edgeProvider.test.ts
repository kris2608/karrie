import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSpokenAudio } from "./audioCheck.js";
import { createEdgeSpeechProvider } from "./edgeProvider.js";
import { composeSpeechRate } from "./prosody.js";

const fixtures = dirname(fileURLToPath(import.meta.url));
const hebbes = readFileSync(join(fixtures, "fixtures/hebbes.mp3"));
const silent = readFileSync(join(fixtures, "fixtures/silent.mp3"));

describe("Maarten delivery", () => {
  it("folds the 20% speed-up into the approved +8% rate", () => {
    expect(composeSpeechRate("+8%", 1.2)).toBe("+30%");
    expect(composeSpeechRate("+0%", 1.2)).toBe("+20%");
    expect(composeSpeechRate("fast", 1.2)).toBe("fast");
  });

  it("rejects a silent mp3 and accepts a spoken one", async () => {
    const quiet = await checkSpokenAudio(silent, "Kun jij de hagelslag vinden?", "audio/mpeg");
    expect(quiet.ok).toBe(false);
    if (!quiet.ok) expect(quiet.reason).toBe("silent");
    const spoken = await checkSpokenAudio(hebbes, "Hebbes!", "audio/mpeg");
    expect(spoken.ok).toBe(true);
  });

  it("serves Edge audio without an OpenAI usage bill", async () => {
    const provider = createEdgeSpeechProvider({
      synthesize: async (_text, options) => {
        expect(options.voice).toBe("nl-NL-MaartenNeural");
        expect(options.rate).toBe("+30%");
        expect(options.pitch).toBe("+16Hz");
        return hebbes;
      },
    });
    const result = await provider.generate("Hebbes!", { event: "positive" });
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.model).toBe("edge-tts");
    expect(result.voice).toBe("nl-NL-MaartenNeural");
    expect(result.usage).toBeUndefined();
    expect(result.audio.equals(hebbes)).toBe(true);
  });
});
