import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ws", () => {
  class MockWebSocket {
    static instances: MockWebSocket[] = [];
    static openFail = false;
    handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    sent: string[] = [];

    constructor(public url: string) {
      MockWebSocket.instances.push(this);
      void Promise.resolve().then(() => {
        if (MockWebSocket.openFail) {
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
        void Promise.resolve().then(() => this.emit("message", Buffer.from(JSON.stringify({ type: "session.updated" }))));
      }
      if (msg.type === "response.create") {
        const pcm = Buffer.alloc(4, 1);
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
          this.emit(
            "message",
            Buffer.from(
              JSON.stringify({
                type: "response.output_audio_transcript.done",
                transcript: "Hebbes!",
              }),
            ),
          );
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
  afterEach(() => {
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
});
