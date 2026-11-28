/** Small blue snowflake shown on frozen-product tiles. */
export function FreezeBadge() {
  return (
    <span className="freeze-badge" data-testid="freeze-badge" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path
          d="M12 2.5v19M12 2.5l-2.4 2.4M12 2.5l2.4 2.4M12 21.5l-2.4-2.4M12 21.5l2.4-2.4M4.1 7.2l15.8 9.6M4.1 7.2l.6 3.4M4.1 7.2l3.4-.4M19.9 16.8l-.6-3.4M19.9 16.8l-3.4.4M19.9 7.2L4.1 16.8M19.9 7.2l-.6 3.4M19.9 7.2l-3.4-.4M4.1 16.8l.6-3.4M4.1 16.8l3.4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
