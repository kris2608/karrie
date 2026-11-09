/** Compact share glyph for list cards and the review header. */
export function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8.4 13.2l7.2 4.1M15.6 6.7l-7.2 4.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
