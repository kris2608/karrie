export type DeviceSpeechResult = "ok" | "unavailable" | "failed" | "cancelled";

/**
 * On-device Dutch speech when Maarten audio cannot be fetched.
 * Nothing leaves the phone. Interrupted speech is not a failure.
 */
export function speakOnDevice(text: string, signal?: AbortSignal): Promise<DeviceSpeechResult> {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return Promise.resolve("unavailable");
  if (signal?.aborted) return Promise.resolve("cancelled");
  const spoken = text.replace(/\s+/g, " ").trim();
  if (!spoken) return Promise.resolve("unavailable");

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = "nl-NL";
    const dutch = synth.getVoices?.().find((voice) => voice.lang?.toLowerCase().startsWith("nl"));
    if (dutch) utterance.voice = dutch;

    let settled = false;
    const finish = (result: DeviceSpeechResult) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => {
      try {
        synth.cancel();
      } catch {
        // ignore
      }
      finish("cancelled");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    utterance.onend = () => finish("ok");
    utterance.onerror = (event) => {
      const reason = "error" in event ? String(event.error) : "";
      finish(reason === "canceled" || reason === "interrupted" ? "cancelled" : "failed");
    };
    try {
      synth.speak(utterance);
    } catch {
      finish("failed");
    }
  });
}
