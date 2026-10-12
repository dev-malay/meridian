import { Link } from "react-router-dom";
import { MeridianLogo } from "./MeridianLogo";
import { landingNavLinks } from "../landingContent";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--m-border-soft)] bg-[var(--m-bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-[var(--m-text)]"
        >
          <MeridianLogo size={22} />
          <span className="text-[15px] font-medium">Meridian</span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          {landingNavLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-[13px] font-medium text-[var(--m-muted)] transition-colors hover:text-[var(--m-text)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          to="/dashboard"
          className="whitespace-nowrap rounded-lg bg-[var(--m-text)] px-3 py-1.5 text-[13px] font-medium text-[var(--m-bg)] transition-opacity hover:opacity-90"
        >
          Open dashboard
        </Link>
      </div>
    </header>
  );
}
