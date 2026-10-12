import { Link } from "react-router-dom";
import { MeridianLogo } from "./MeridianLogo";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Dashboard", to: "/dashboard" },
      { label: "How it works", to: "/about" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Metrics", to: "/logs" },
      { label: "Webhooks", to: "/webhooks" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="mx-auto w-full max-w-[1100px] px-6 pb-8 pt-4">
      <div className="grid grid-cols-1 gap-10 border-t border-[var(--m-border-soft)] py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 text-[var(--m-text)]">
            <MeridianLogo size={18} />
            <span className="text-[13px] font-medium">Meridian</span>
          </div>
          <p className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-[var(--m-muted)]">
            A payment processing pipeline - written atomically, queued
            reliably, retried automatically.
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-[12px] font-medium tracking-wide text-[var(--m-dim)]">
              {col.title}
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-[13px] text-[var(--m-muted)] transition-colors hover:text-[var(--m-text)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center justify-between gap-2 border-t border-[var(--m-border-soft)] py-6 sm:flex-row">
        <span className="text-[12px] text-[var(--m-dim)]">© 2026 Meridian</span>
        <span className="text-center text-[12px] text-[var(--m-dim)]">
          At-least-once delivery, by design.
        </span>
      </div>
    </footer>
  );
}
