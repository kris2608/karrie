import { useEffect, useState } from "react";
import { PressButton } from "../../components/ui/PressButton";
import { currentInstallVisible, dismissInstallOffer, promptInstall, subscribeInstall } from "./installPrompt";

/** One dismissible offer to install Karrie, after the app has been used. */
export function InstallCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(currentInstallVisible());
    update();
    return subscribeInstall(update);
  }, []);

  if (!visible) return null;

  return (
    <section className="install-card" data-testid="install-card">
      <strong>Zet Karrie op je startscherm</strong>
      <div className="install-card-actions">
        <PressButton variant="primary" size="s" data-testid="install-prompt" onClick={() => void promptInstall()}>
          Installeren
        </PressButton>
        <button type="button" className="text-button" data-testid="install-dismiss" onClick={dismissInstallOffer}>
          Niet nu
        </button>
      </div>
    </section>
  );
}
