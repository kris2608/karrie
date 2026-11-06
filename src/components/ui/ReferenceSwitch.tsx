import { useAdventure } from "../../state/AdventureContext";

export function ReferenceSwitch() {
  const { settings, dispatch } = useAdventure();
  const on = settings.referenceImages;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={on ? "switch-row is-on" : "switch-row"}
      data-testid="reference-switch"
      onClick={() => dispatch({ type: "set-reference-images", enabled: !on })}
    >
      <span className="switch-label">
        <strong>Voorbeeldfoto's</strong>
        <small>{on ? "Echte foto bij merkproducten" : "Alleen tekeningen en eigen foto's"}</small>
      </span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
