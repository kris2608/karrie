import { playPop, setSoundEnabled, unlockAudio } from "../../feedback/sound";
import { useAdventure } from "../../state/AdventureContext";

export function SoundSwitch() {
  const { settings, dispatch } = useAdventure();
  const on = settings.soundEnabled;

  function toggle() {
    const next = !on;
    if (next) {
      unlockAudio();
      setSoundEnabled(true);
      playPop();
    }
    dispatch({ type: "set-sound", enabled: next });
  }

  return (
    <button type="button" role="switch" aria-checked={on} className={on ? "switch-row is-on" : "switch-row"} onClick={toggle}>
      <span className="switch-label">
        <strong>Geluid</strong>
        <small>{on ? "Aan: plopjes en sterren" : "Uit"}</small>
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
