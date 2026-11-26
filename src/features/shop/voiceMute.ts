/**
 * Shop mute control. Stops speech in the same turn as the tap, then persists the choice.
 */
export function commitVoiceEnabled(
  enabled: boolean,
  deps: {
    setEnabled: (on: boolean) => void;
    unlock: () => void;
    persist: (on: boolean) => void;
    onMuted?: () => void;
  },
): void {
  if (enabled) deps.unlock();
  deps.setEnabled(enabled);
  if (!enabled) deps.onMuted?.();
  deps.persist(enabled);
}
