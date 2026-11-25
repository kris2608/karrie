import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { completePhrase, missionPhrase, productPhrase } from "../../domain/voiceScripts";
import { unlockAudio } from "../../feedback/sound";
import { getVoiceCacheConfig } from "../../services/voice/cache";
import { voiceController } from "../../services/voice/controller";

type LastResult = {
  status: string;
  code?: string;
  fetchMs?: number;
  source?: string;
  totalMs: number;
};

/**
 * Dev-only voice harness — not shown to children.
 * Route: /dev/voice-lab (import.meta.env.DEV only).
 */
export function VoiceLabScreen() {
  const [last, setLast] = useState<LastResult | null>(null);
  const [busy, setBusy] = useState(false);
  const config = useMemo(() => getVoiceCacheConfig(), [last]);
  const sample = useMemo(
    () => productPhrase({ productId: "banaan", name: "Banaan", quantity: 1 }, "lab"),
    [],
  );
  const mission = useMemo(() => missionPhrase("lab:mission"), []);
  const complete = useMemo(() => completePhrase("lab:complete"), []);

  if (!import.meta.env.DEV) return <Navigate to="/" replace />;

  async function run(label: string, phrase: typeof sample) {
    unlockAudio();
    voiceController.setEnabled(true);
    setBusy(true);
    const started = Date.now();
    const generation = voiceController.bump();
    const outcome = await voiceController.play(phrase, { generation, priority: "high" });
    setLast({
      status: `${label}:${outcome.status}`,
      code: outcome.code,
      fetchMs: outcome.fetchMs,
      source: outcome.source,
      totalMs: Date.now() - started,
    });
    setBusy(false);
  }

  function cancel() {
    voiceController.cancel();
    setLast({ status: "cancelled", totalMs: 0 });
    setBusy(false);
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, fontFamily: "ui-sans-serif, system-ui", lineHeight: 1.4 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Voice lab</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>Dev-only harness for cache / generate / cancel timings.</p>
      <pre style={{ background: "#f4f4f4", padding: 12, borderRadius: 8, fontSize: 12, overflow: "auto" }}>
        {JSON.stringify(config, null, 2)}
      </pre>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        <button type="button" disabled={busy} onClick={() => void run("product", sample)}>
          Play product
        </button>
        <button type="button" disabled={busy} onClick={() => void run("mission", mission)}>
          Play mission
        </button>
        <button type="button" disabled={busy} onClick={() => void run("complete", complete)}>
          Play complete
        </button>
        <button type="button" disabled={busy} onClick={() => void run("replay", sample)}>
          Replay
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
      <p style={{ marginTop: 12, fontSize: 13 }}>Sample: {sample.text}</p>
      {last && (
        <pre style={{ marginTop: 16, background: "#111", color: "#9f9", padding: 12, borderRadius: 8, fontSize: 12 }}>
          {JSON.stringify(last, null, 2)}
        </pre>
      )}
    </main>
  );
}
