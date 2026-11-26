import { Karrie } from "../../components/mascot/Karrie";
import { PressButton } from "../../components/ui/PressButton";
import { Sheet } from "../../components/ui/Sheet";
import { unlockAudio } from "../../feedback/sound";
import { trackEvent } from "../../services/analytics";
import { voiceController } from "../../services/voice/controller";
import { staticFeedbackPhrases } from "./useShopVoice";

type VoiceOptInSheetProps = {
  open: boolean;
  /** `false` also covers closing the sheet. The hunt may start after either answer. */
  onAnswer: (enabled: boolean) => void;
};

/** Ask once, before a hunt, so the sheet never sits on top of Gevonden. */
export function VoiceOptInSheet({ open, onAnswer }: VoiceOptInSheetProps) {
  function answer(enabled: boolean) {
    unlockAudio();
    trackEvent({ name: "voice_opt_in", data: { enabled: enabled ? 1 : 0 } });
    voiceController.setEnabled(enabled);
    if (enabled) voiceController.prefetch(staticFeedbackPhrases());
    onAnswer(enabled);
  }

  return (
    <Sheet open={open} onClose={() => answer(false)} label="Stem van Karrie">
      <div className="voice-opt-in" data-testid="voice-opt-in">
        <Karrie mood="greeting" className="voice-opt-in-karrie" />
        <h2>Wil je dat Karrie met je praat?</h2>
        <p>Karrie kan hardop zeggen welk product je zoekt. De stem is gemaakt met AI.</p>
        <div className="voice-opt-in-actions">
          <PressButton variant="go" wide data-testid="voice-opt-in-yes" onClick={() => answer(true)}>
            Ja, graag
          </PressButton>
          <PressButton variant="quiet" wide data-testid="voice-opt-in-no" onClick={() => answer(false)}>
            Nee, liever niet
          </PressButton>
        </div>
      </div>
    </Sheet>
  );
}
