import { unlockAudio } from "../../feedback/sound";
import { trackEvent } from "../../services/analytics";
import { voiceController } from "../../services/voice/controller";
import { useAdventure } from "../../state/AdventureContext";

export function VoiceSwitch() {
  const { settings, dispatch } = useAdventure();
  const on = settings.voiceEnabled;

  function toggle() {
    const next = !on;
    if (next) {
      unlockAudio();
      voiceController.setEnabled(true);
    } else {
      voiceController.setEnabled(false);
      trackEvent({ name: "voice_muted" });
    }
    dispatch({ type: "set-voice", enabled: next });
  }

  return (
    <button type="button" role="switch" aria-checked={on} className={on ? "switch-row is-on" : "switch-row"} onClick={toggle}>
      <span className="switch-label">
        <strong>Stem van Karrie</strong>
        <small>{on ? "Aan: Karrie praat mee in de winkel" : "Uit"}</small>
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
