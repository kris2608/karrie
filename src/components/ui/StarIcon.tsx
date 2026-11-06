export function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M32 5l7.6 16.4 17.9 2-13.3 12.2 3.7 17.7L32 44.3 16.1 53.3l3.7-17.7L6.5 23.4l17.9-2z"
        fill="#ffd23f"
        stroke="#c98d08"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M24 26l5-1 3-7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}
