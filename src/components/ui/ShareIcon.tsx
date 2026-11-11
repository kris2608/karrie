/** Compact share glyph for list cards and the review header. */
export function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="2.75" fill="currentColor" />
      <circle cx="6" cy="12" r="2.75" fill="currentColor" />
      <circle cx="18" cy="19" r="2.75" fill="currentColor" />
      <path d="M8.6 13.1l6.8 3.9M15.4 6.9l-6.8 3.9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
