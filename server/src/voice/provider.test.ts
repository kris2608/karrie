import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Mode = "match" | "missing-transcript" | "no-session-updated";

const state = {
  mode: "match" as Mode,
  openFail: false,
  instances: [] as Array<{ sent: string[]; readyState: number }>,
};

vi.mock("ws", () => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    sent: string[] = [];

    constructor(public url: string) {
      state.instances.push(this);
      void Promise.resolve().then(() => {
        if (state.openFail) {
          this.emit("error", new Error("connect failed"));
          return;
        }
        this.emit("open");
      });
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      const list = this.handlers.get(event) ?? [];
      list.push(handler);
      this.handlers.set(event, list);
    }

    send(data: string) {
      this.sent.push(data);
      const msg = JSON.parse(data) as { type?: string };
      if (msg.type === "session.update") {
        if (state.mode === "no-session-updated") return;
        void Promise.resolve().then(() => this.emit("message", Buffer.from(JSON.stringify({ type: "session.updated" }))));
      }
      if (msg.type === "response.create") {
        const pcm = state.mode === "missing-transcript" ? Buffer.alloc(12_000, 1) : Buffer.alloc(4, 1);
        void Promise.resolve().then(() => {
          this.emit(
            "message",
            Buffer.from(
              JSON.stringify({
                type: "response.output_audio.delta",
                delta: pcm.toString("base64"),
              }),
            ),
          );
          if (state.mode !== "missing-transcript") {
            this.emit(
              "message",
              Buffer.from(
                JSON.stringify({
                  type: "response.output_audio_transcript.done",
                  transcript: "Hebbes!",
                }),
              ),
            );
          }
          this.emit(
            "message",
            Buffer.from(
              JSON.stringify({
                type: "response.done",
                response: {
                  usage: {
                    input_tokens: 12,
                    output_tokens: 40,
                    input_token_details: { cached_tokens: 0 },
                    output_token_details: { audio_tokens: 30, text_tokens: 10 },
                  },
                },
              }),
            ),
          );
        });
      }
    }

    close() {
      this.emit("close");
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }
  return { default: MockWebSocket };
});

describe("createRealtimeSpeechProvider", () => {
  beforeEach(() => {
    state.mode = "match";
    state.openFail = false;
    state.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("rejects deprecated Speech API models at construction", async () => {
    const { createRealtimeSpeechProvider, createSpeechApiProvider } = await import("./provider.js");
    expect(() => createRealtimeSpeechProvider({ apiKey: "k", model: "gpt-4o-mini-tts" })).toThrow(/deprecated|Unsupported/i);
    expect(() => createSpeechApiProvider()).toThrow(/removed/i);
  });

  it("returns WAV audio and usage without calling audio.speech", async () => {
    const { createRealtimeSpeechProvider } = await import("./provider.js");
    const provider = createRealtimeSpeechProvider({ apiKey: "test-key", model: "gpt-realtime-2.1-mini", voice: "marin" });
    const result = await provider.generate("Hebbes!", { event: "positive" });
    expect(result.contentType).toBe("audio/wav");
    expect(result.audio.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.voice).toBe("marin");
    expect(result.usage?.audioOutputTokens).toBe(30);
  });

  it("accepts audio when transcript is missing but PCM is present", async () => {
    state.mode = "missing-transcript";
    const { createRealtimeSpeechProvider } = await import("./provider.js");
    const provider = createRealtimeSpeechProvider({ apiKey: "test-key", model: "gpt-realtime-2.1-mini", voice: "marin" });
    const result = await provider.generate("Hebbes!", { event: "positive" });
    expect(result.contentType).toBe("audio/wav");
    expect(result.audio.length).toBeGreaterThan(44);
  });

  it("still creates a response if session.updated never arrives", async () => {
    state.mode = "no-session-updated";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { createRealtimeSpeechProvider } = await import("./provider.js");
    const provider = createRealtimeSpeechProvider({ apiKey: "test-key", model: "gpt-realtime-2.1-mini", voice: "marin" });
    const pending = provider.generate("Hebbes!", { event: "positive" });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(900);
    const result = await pending;
    expect(result.contentType).toBe("audio/wav");
    const created = state.instances.some((socket) => socket.sent.some((line) => line.includes("response.create")));
    expect(created).toBe(true);
  });
});
