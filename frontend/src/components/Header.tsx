import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiGet } from "../hooks/useApi";
import type { HealthResponse } from "../types";
import { BarChart3, Webhook } from "lucide-react";

export default function Header() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const mounted = useRef(false);
  const location = useLocation();

  const check = async () => {
    try {
      await apiGet<HealthResponse>("/v1/health");
      setHealthy(true)
    } catch {
      setHealthy(false)
    }
  };

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; check(); }
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [])

  const isLogs = location.pathname === "/logs"


  return (
    <header className="sticky top-0 z-40" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
               </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-[500] tracking-tight text-white">Meridian</span>
              <span className="text-xs font-[400] text-[var(--color-gray-400)] hidden sm:inline">Payment Processor System</span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={isLogs ? "/" : "/logs"}
            className={`flex items-center gap-1.5 text-xs font-[400] px-3 py-1.5 rounded-md transition-all no-underline ${
              isLogs
                ? "text-white bg-[rgba(255,255,255,0.06)]"
                : "text-[var(--color-gray-400)] hover:text-[var(--color-gray-200)] hover:bg-[rgba(255,255,255,0.03)]"
            }`}
          >
            <BarChart3 size={13} />
            Logs
          </Link>
          <Link
            to="/webhooks"
            className={`flex items-center gap-1.5 text-xs font-[400] px-3 py-1.5 rounded-md transition-all no-underline ${
              location.pathname === "/webhooks"
                ? "text-white bg-[rgba(255,255,255,0.06)]"
                : "text-[var(--color-gray-400)] hover:text-[var(--color-gray-200)] hover:bg-[rgba(255,255,255,0.03)]"
            }`}
          >
            <Webhook size={13} />
            Webhooks
          </Link>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md ml-1" style={{ background: "rgba(255,255,255,0.03)" }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: healthy === null ? "var(--color-gray-500)" : healthy ? "var(--color-green)" : "var(--color-red)",
              }}
            />
            <span className="text-xs font-[400] text-[var(--color-gray-400)]">
              {healthy === null ? "Checking" : healthy ? "Online" : "Offline"}
            </span>
          </div>
          <button onClick={check} className="btn-ghost-muted" title="Check health">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9" /><path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
