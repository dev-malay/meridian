import { useEffect, useRef, useState } from "react";
import { apiGet } from "../hooks/useApi";
import type { HealthResponse } from "../types";
import { BarChart3, ExternalLink } from "lucide-react";

interface Props {
  metricsUrl: string;
}

export default function SystemInfo({ metricsUrl }: Props) {
  const [data, setData] = useState<{ message: string; online: boolean } | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; fetch(); }
    const id = setInterval(fetch, 20000);
    return () => clearInterval(id);
  }, []);

  const fetch = async () => {
    try {
      const h = await apiGet<HealthResponse>("/v1/health");
      setData({ message: h.message, online: true });
    } catch {
      setData({ message: "unreachable", online: false });
    }
  };

  const status = data === null ? "Startup" : data.online ? "Operational" : "Disconnected";
  const dotColor = data === null ? "var(--color-gray-500)" : data.online ? "var(--color-green)" : "var(--color-red)";

  const items = [
    { label: "Queue", value: "BullMQ + Redis" },
    { label: "Database", value: "PostgreSQL" },
    { label: "Provider", value: "Mock (localhost:3000)" },
  ];

  return (
    <div className="card p-6 animate-mount" style={{ animationDelay: "40ms" }}>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-[500] text-white">System</h2>
            <p className="text-xs font-[400] text-[var(--color-gray-400)] mt-1">Service health and configuration</p>
          </div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md" style={{ background: "rgba(255,255,255,0.03)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
            <span className="text-xs font-[400] text-[var(--color-gray-300)]">{status}</span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-2">
            <span className="text-xs font-[400] text-[var(--color-gray-400)]">{item.label}</span>
            <span className="text-xs font-[400] text-[var(--color-gray-200)]">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 divider" />

      <a
        href={metricsUrl} target="_blank" rel="noopener noreferrer"
        className="mt-4 flex items-center justify-between text-xs font-[400] text-[var(--color-gray-400)] hover:text-[var(--color-gray-200)] transition-colors group"
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={13} />
          <span>Prometheus metrics</span>
        </div>
        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    </div>
  );
}
