import { useEffect, useState, useRef, useCallback } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface Sample {
  labels: Record<string, string>;
  value: number;
}

interface Metric {
  name: string;
  type: string;
  help: string;
  samples: Sample[];
}

interface Category {
  name: string;
  metrics: Metric[];
}

const CATEGORIES: [string, RegExp][] = [
  ["HTTP / API", /^http_/],
  ["Payments", /^payments?_/],
  ["Worker", /^(worker_|asynq_)/],
  ["Outbox", /^outbox_/],
  ["Provider", /^provider_/],
  ["Rate Limiter", /^rate_limiter_/],
  ["Reconciliation", /^payments_reconciled_/],
  ["System", /^up$/],
];

function categorize(name: string): string {
  for (const [cat, regex] of CATEGORIES) {
    if (regex.test(name)) return cat;
  }
  return "Other";
}

const LABEL_ALIASES: Record<string, string> = {
  le: "≤",
  status_code: "Code",
  status_class: "Class",
  queue: "Queue",
  method: "Method",
  result: "Result",
  outcome: "Outcome",
  status: "Status",
};

function alias(k: string): string {
  return LABEL_ALIASES[k] ?? k;
}

const SUFFIXES = ["_bucket", "_count", "_sum", "_created"];

function baseName(name: string, types: Set<string>): string {
  if (types.has(name)) return name;
  for (const s of SUFFIXES) {
    if (name.endsWith(s)) {
      const cand = name.slice(0, -s.length);
      if (types.has(cand)) return cand;
    }
  }
  return name;
}

function parseLabels(rest: string): { labels: Record<string, string>; valStr: string } {
  if (!rest.startsWith("{")) return { labels: {}, valStr: rest };
  const close = rest.indexOf("}");
  if (close === -1) return { labels: {}, valStr: rest };
  const raw = rest.slice(1, close);
  const valStr = rest.slice(close + 1).trim();
  const labels: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    labels[part.slice(0, eq).trim()] = part.slice(eq + 1).trim().replace(/^"|"$/g, "");
  }
  return { labels, valStr };
}

function parseMetrics(text: string): Metric[] {
  const lines = text.split("\n");
  const types = new Map<string, string>();
  const helps = new Map<string, string>();
  const samples = new Map<string, Sample[]>();

  for (const raw of lines) {
    if (raw.startsWith("# HELP ")) {
      const rest = raw.slice(7);
      const i = rest.indexOf(" ");
      if (i === -1) continue;
      helps.set(rest.slice(0, i), rest.slice(i + 1));
    } else if (raw.startsWith("# TYPE ")) {
      const rest = raw.slice(7);
      const i = rest.indexOf(" ");
      if (i === -1) continue;
      types.set(rest.slice(0, i), rest.slice(i + 1));
    }
  }

  const typeNames = new Set(types.keys());

  for (const raw of lines) {
    if (raw.startsWith("#") || raw.trim() === "") continue;
    try {
      const m = raw.match(/^[a-zA-Z_:][a-zA-Z0-9_:]*/);
      if (!m) continue;
      const rawName = m[0];
      if (rawName.endsWith("_created")) continue;
      const rest = raw.slice(rawName.length).trim();
      const base = baseName(rawName, typeNames);
      const { labels, valStr } = parseLabels(rest);
      const parts = valStr.split(/\s+/);
      const value = parseFloat(parts[0]);
      if (isNaN(value)) continue;
      if (!samples.has(base)) samples.set(base, []);
      samples.get(base)!.push({ labels, value });
    } catch {
      // skip unparseable lines
    }
  }

  const all = new Set([...typeNames, ...samples.keys()]);
  return Array.from(all)
    .filter((name) => samples.has(name))
    .map((name) => ({
      name,
      type: types.get(name) || "unknown",
      help: helps.get(name) || "",
      samples: samples.get(name)!,
    }));
}

function round(v: number): string {
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(3);
}

function ValueDisplay({ value }: { value: number }) {
  return <span className="font-mono text-xs font-[500] text-white">{round(value)}</span>;
}

function SampleRow({ sample }: { sample: Sample }) {
  const entries = Object.entries(sample.labels);
  return (
    <div className="flex items-center justify-between py-1.5 px-3 border-b border-[rgba(255,255,255,0.02)] last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        {entries.map(([k, v]) => (
          <span key={k} className="text-xs font-[400] text-[var(--color-gray-400)]">
            <span className="text-[var(--color-gray-500)]">{alias(k)}</span>
            <span className="text-[var(--color-gray-200)] ml-1">{v}</span>
          </span>
        ))}
      </div>
      <ValueDisplay value={sample.value} />
    </div>
  );
}

const TYPE_BADGES: Record<string, string> = {
  counter: "bg-[rgba(56,189,248,0.08)] text-[var(--color-sky)]",
  gauge: "bg-[rgba(245,158,11,0.08)] text-[var(--color-amber)]",
  histogram: "bg-[rgba(168,85,247,0.08)] text-purple-400",
  summary: "bg-[rgba(187,247,208,0.08)] text-[var(--color-green)]",
};

function MetricCard({ metric }: { metric: Metric }) {
  const badge = TYPE_BADGES[metric.type] ?? "bg-[rgba(255,255,255,0.04)] text-[var(--color-gray-400)]";
  return (
    <div className="card-subtle p-4">
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <span className="font-mono text-sm font-[500] text-white">{metric.name}</span>
          <span className={`ml-2 text-[10px] font-[500] px-1.5 py-0.5 rounded ${badge}`}>{metric.type}</span>
        </div>
      </div>
      {metric.help && (
        <p className="text-xs font-[400] text-[var(--color-gray-500)] mb-2.5 leading-relaxed">{metric.help}</p>
      )}
      <div className="rounded-md" style={{ background: "rgba(255,255,255,0.015)" }}>
        {metric.samples.map((s, i) => (
          <SampleRow key={i} sample={s} />
        ))}
      </div>
    </div>
  );
}

function CategorySection({ category }: { category: Category }) {
  if (category.metrics.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="text-sm font-[500] text-white mb-3 tracking-tight">{category.name}</h2>
      <div className="grid grid-cols-1 gap-2">
        {category.metrics.map((m) => (
          <MetricCard key={m.name} metric={m} />
        ))}
      </div>
    </div>
  );
}

export default function Logs() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/metrics");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const text = await res.text();
      const metrics = parseMetrics(text);
      const grouped = new Map<string, Metric[]>();
      for (const m of metrics) {
        const cat = categorize(m.name);
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(m);
      }
      const result: Category[] = [];
      for (const [name] of CATEGORIES) {
        const ms = grouped.get(name);
        if (ms && ms.length > 0) result.push({ name, metrics: ms });
      }
      const rest = grouped.get("Other");
      if (rest && rest.length > 0) result.push({ name: "Other", metrics: rest });
      setCategories(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch metrics");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!mounted.current) { mounted.current = true; load(); }
    const id = setInterval(() => { if (alive.current) load(); }, 10000);
    return () => { alive.current = false; clearInterval(id); };
  }, [load]);

  const totalMetrics = categories.reduce((s, c) => s + c.metrics.length, 0);
  const totalSamples = categories.reduce((s, c) => s + c.metrics.reduce((ss, m) => ss + m.samples.length, 0), 0);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-base font-[500] text-white tracking-tight">Metrics</h1>
          <p className="text-xs font-[400] text-[var(--color-gray-500)] mt-1">
            {totalMetrics} metrics · {totalSamples} data points
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-[400] text-[var(--color-gray-500)]">Auto-refresh 10s</span>
          <button onClick={load} className="btn-ghost-muted p-1.5" title="Refresh now">
            <RefreshCw size={13} style={refreshing ? { animation: "spin-slow 0.8s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-5 mb-6 flex items-center gap-3 border-[rgba(239,68,68,0.15)]">
          <AlertTriangle size={14} className="text-[var(--color-red)]" />
          <span className="text-sm font-[400] text-[var(--color-red)]">{error}</span>
          <button onClick={load} className="btn-ghost text-xs ml-auto py-1.5 px-3">Retry</button>
        </div>
      )}

      {categories.length === 0 && !error && (
        <div className="py-20 text-center">
          <p className="text-sm font-[400] text-[var(--color-gray-400)]">Loading metrics…</p>
        </div>
      )}

      {categories.map((cat) => (
        <CategorySection key={cat.name} category={cat} />
      ))}
    </main>
  );
}
