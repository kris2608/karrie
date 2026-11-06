import { useAdventure } from "../../state/AdventureContext";

export function DiscoverySwitch() {
  const { settings, dispatch } = useAdventure();
  const on = settings.smartDiscovery;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={on ? "switch-row is-on" : "switch-row"}
      data-testid="discovery-switch"
      onClick={() => dispatch({ type: "set-discovery", enabled: !on })}
    >
      <span className="switch-label">
        <strong>Bonusmissies</strong>
        <small>{on ? "Aan: Karrie stelt soms een vergelijkbaar product voor" : "Uit"}</small>
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
