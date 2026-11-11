import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function TopBar({
  title,
  to = "/",
  label = "Terug",
  action,
  leading,
}: {
  title: string;
  to?: string;
  label?: string;
  action?: ReactNode;
  /** Replaces the default back link when provided. */
  leading?: ReactNode;
}) {
  return (
    <header className="topbar">
      {leading ?? (
        <Link to={to} className="round-button" aria-label={label}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      <h1>{title}</h1>
      {action && <div className="topbar-action">{action}</div>}
    </header>
  );
}
