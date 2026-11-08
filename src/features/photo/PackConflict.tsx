import { useState } from "react";
import { PressButton } from "../../components/ui/PressButton";

export type PackConflictProps = {
  choices: string[];
  raw: string[];
  onConfirm: (quantity: string) => void;
};

/** Parent-only: when Open Food Facts and a retailer disagree on pack size. */
export function PackConflict({ choices, raw, onConfirm }: PackConflictProps) {
  const [other, setOther] = useState(false);
  const [custom, setCustom] = useState("");
  const shown = choices.map((label, index) => ({ label, value: raw[index] ?? label }));

  return (
    <section className="pack-conflict" data-testid="pack-conflict">
      <p>
        <strong>Klopt de inhoud?</strong> We vonden {choices.join(" en ")} voor dit product.
      </p>
      <div className="chips">
        {shown.map((choice) => (
          <button key={choice.value} type="button" className="chip" data-testid="pack-choice" onClick={() => onConfirm(choice.value)}>
            {choice.label}
          </button>
        ))}
        <button type="button" className={other ? "chip is-active" : "chip"} data-testid="pack-other" onClick={() => setOther(true)}>
          Anders
        </button>
      </div>
      {other && (
        <div className="pack-conflict-other">
          <input
            type="text"
            value={custom}
            maxLength={24}
            placeholder="bijv. 750 ml"
            aria-label="Andere inhoud"
            onChange={(event) => setCustom(event.target.value)}
          />
          <PressButton
            wide
            disabled={!custom.trim()}
            onClick={() => {
              const value = custom.trim();
              if (value) onConfirm(value);
            }}
          >
            Gebruik deze inhoud
          </PressButton>
        </div>
      )}
    </section>
  );
}
