import { Karrie } from "../../components/mascot/Karrie";
import { PressButton } from "../../components/ui/PressButton";
import { collectedLine } from "../../domain/homeAdventure";

/** The child's way into the camera; the list itself can still be built by hand. */
export function DiscoverBanner({ count, onStart }: { count: number; onStart: () => void }) {
  return (
    <section className="discover-banner" data-testid="discover-banner">
      <Karrie mood={count ? "happy" : "greeting"} className="discover-banner-karrie" />
      <div className="discover-banner-text">
        <strong>{count ? collectedLine(count) : "Help jij Karrie boodschappen verzamelen?"}</strong>
        <PressButton variant="go" size="s" data-testid="discover-start" onClick={onStart}>
          {count ? "Verder ontdekken" : "Ga op ontdekking!"}
        </PressButton>
      </div>
    </section>
  );
}
