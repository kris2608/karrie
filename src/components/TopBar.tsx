import { Link } from "react-router-dom";

export function TopBar({ title, to = "/", label = "Terug" }: { title: string; to?: string; label?: string }) {
  return (
    <header className="topbar">
      <Link to={to} className="round-button" aria-label={label}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <h1>{title}</h1>
    </header>
  );
}
