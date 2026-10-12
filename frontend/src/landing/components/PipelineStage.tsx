import { useEffect, useState } from "react";

type Status = "pending" | "processing" | "success" | "failed_retryable";

interface Pay {
  id: string;
  amount: number;
  status: Status;
  attempts: number;
}

interface Ev {
  id: number;
  text: string;
  tone: "ok" | "warn" | "info";
}

interface StageState {
  payments: Pay[];
  events: Ev[];
  processed: number;
  succeeded: number;
  seq: number;
  queues: [number, number, number];
  lagMs: number;
}

const STATUS_DOT: Record<Status, string> = {
  pending: "bg-[var(--m-sky)]",
  processing: "bg-[var(--m-amber)]",
  success: "bg-[var(--m-green)]",
  failed_retryable: "bg-[var(--m-red)]",
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "pending",
  processing: "processing",
  success: "success",
  failed_retryable: "retryable",
};

const NODES: Array<{ name: string; sub: string }> = [
  { name: "API", sub: "POST /v1/payments" },
  { name: "Outbox", sub: "atomic INSERT · 200ms poll" },
  { name: "Queue", sub: "critical / default / low" },
  { name: "Worker", sub: "retries · 8x backoff" },
  { name: "Provider", sub: "mock :3000" },
];

function randId(): string {
  return Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0");
}

function randAmount(): number {
  return Math.round((5 + Math.random() * 495) * 100) / 100;
}

function initialState(): StageState {
  return {
    payments: [
      { id: "8f3a", amount: 125.0, status: "processing", attempts: 0 },
      { id: "8f2e", amount: 42.5, status: "pending", attempts: 0 },
      { id: "8f11", amount: 310.75, status: "success", attempts: 1 },
    ],
    events: [
      { id: 2, text: "PAY 8f3a picked up by worker", tone: "info" },
      { id: 1, text: "PAY 8f2e created · $42.50", tone: "info" },
      { id: 0, text: "PAY 8f11 → success · $310.75", tone: "ok" },
    ],
    processed: 1284,
    succeeded: 1271,
    seq: 3,
    queues: [3, 7, 5],
    lagMs: 182,
  };
}

function tick(prev: StageState): StageState {
  const payments = prev.payments.map((p) => ({ ...p }));
  const events = [...prev.events];
  let { processed, succeeded, seq } = prev;
  const push = (text: string, tone: Ev["tone"]) => {
    events.unshift({ id: seq++, text, tone });
  };

  for (const p of payments) {
    if (p.status === "pending") {
      p.status = "processing";
      push(`PAY ${p.id} picked up by worker`, "info");
    } else if (p.status === "processing") {
      if (Math.random() < 0.82) {
        p.status = "success";
        processed += 1;
        succeeded += 1;
        push(`PAY ${p.id} → success · $${p.amount.toFixed(2)}`, "ok");
      } else {
        p.status = "failed_retryable";
        p.attempts += 1;
        push(`PAY ${p.id} → retryable (attempt ${p.attempts})`, "warn");
      }
    } else if (p.status === "failed_retryable") {
      p.status = "processing";
      push(`PAY ${p.id} replayed by sweeper`, "info");
    }
  }

  const id = randId();
  const amount = randAmount();
  payments.unshift({ id, amount, status: "pending", attempts: 0 });
  push(`PAY ${id} created · $${amount.toFixed(2)}`, "info");

  const queues: [number, number, number] = prev.queues.map((q) =>
    Math.max(0, Math.min(12, q + Math.round((Math.random() - 0.5) * 4))),
  ) as [number, number, number];

  return {
    payments: payments.slice(0, 7),
    events: events.slice(0, 14),
    processed,
    succeeded,
    seq,
    queues,
    lagMs: Math.round(120 + Math.random() * 160),
  };
}

function useStage(): StageState {
  const [state, setState] = useState<StageState>(initialState);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setState(tick), 1100);
    return () => clearInterval(id);
  }, []);

  return state;
}

const TONE_DOT = {
  ok: "bg-[var(--m-green)]",
  warn: "bg-[var(--m-amber)]",
  info: "bg-[var(--m-sky)]",
} as const;

export function PipelineStage() {
  const { payments, events, processed, succeeded, queues, lagMs } = useStage();
  const rate = processed > 0 ? (succeeded / processed) * 100 : 100;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[var(--m-panel-2)]/60">
      <div className="md-orb md-orb-green" />
      <div className="md-orb md-orb-amber" />
      <div className="md-stage-grid-bg pointer-events-none absolute inset-0" />

      {/* event ticker tape */}
      <div className="relative overflow-hidden border-b border-[var(--m-border-soft)] py-2">
        <div className="md-marquee-track items-center gap-10 pr-10">
          {[...events, ...events].map((e, i) => (
            <span
              key={`${e.id}-${i}`}
              aria-hidden={i >= events.length}
              className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-[var(--m-muted)]"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[e.tone]}`} />
              {e.text}
            </span>
          ))}
        </div>
      </div>

      <div className="relative grid grid-cols-1 items-center justify-center gap-6 p-6 lg:grid-cols-[230px_minmax(0,auto)_230px]">
        {/* left: live payments feed */}
        <div className="hidden w-[230px] rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-panel)]/80 p-3 backdrop-blur lg:block">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[12px] font-medium text-[var(--m-text)]">
              Live payments
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--m-muted)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--m-green)] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--m-green)]" />
              </span>
              LIVE
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md px-2 py-[5px] font-mono text-[11px]"
              >
                <span className="flex items-center gap-2 text-[var(--m-muted)]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[p.status]}`}
                  />
                  {p.id}
                  {p.attempts > 0 && (
                    <span className="text-[10px] text-[var(--m-dim)]">
                      #{p.attempts + 1}
                    </span>
                  )}
                </span>
                <span className="text-[var(--m-text)]">
                  ${p.amount.toFixed(2)}
                </span>
                <span className="w-[74px] text-right text-[10px] text-[var(--m-dim)]">
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* center: pipeline flow */}
        <div className="relative mx-auto w-[260px]">
          <div className="rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-panel)]/80 p-4 backdrop-blur">
            {NODES.map((n, i) => (
              <div key={n.name}>
                <div className="flex items-center justify-between rounded-lg border border-[var(--m-border-soft)] bg-[var(--m-bg)] px-3 py-2">
                  <span className="font-mono text-[12px] font-semibold text-[var(--m-text)]">
                    {n.name}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--m-dim)]">
                    {n.sub}
                  </span>
                </div>
                {i < NODES.length - 1 && (
                  <div className="relative mx-auto h-8 w-[2px]">
                    <div className="md-flow-line absolute inset-0" />
                    <span
                      className="md-packet absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[var(--m-green)]"
                      style={{ animationDelay: `${i * 0.45}s` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div
            className="md-float-chip absolute -left-8 top-10 hidden rounded-lg border border-[var(--m-green)]/30 bg-[var(--m-bg)]/90 px-3 py-2 shadow-xl backdrop-blur lg:block"
            style={{ animationDelay: "0.6s" }}
          >
            <p className="font-mono text-[10px] text-[var(--m-muted)]">
              AT-LEAST-ONCE
            </p>
            <p className="font-mono text-[13px] font-semibold text-[var(--m-green)]">
              0 lost payments
            </p>
          </div>
          <div
            className="md-float-chip absolute -right-8 bottom-16 hidden rounded-lg border border-[var(--m-border)] bg-[var(--m-bg)]/90 px-3 py-2 shadow-xl backdrop-blur lg:block"
            style={{ animationDelay: "2.1s" }}
          >
            <p className="font-mono text-[10px] text-[var(--m-muted)]">
              IDEMPOTENT REPLAY
            </p>
            <p className="font-mono text-[13px] font-semibold text-[var(--m-text)]">
              same jobId
            </p>
          </div>
        </div>

        {/* right: queues + metrics */}
        <div className="hidden w-[230px] flex-col gap-4 lg:flex">
          <div className="rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-panel)]/80 p-3 backdrop-blur">
            <p className="mb-2 px-1 font-mono text-[10px] tracking-wide text-[var(--m-dim)]">
              QUEUE DEPTH
            </p>
            {(
              [
                ["critical", queues[0], "bg-[var(--m-red)]"],
                ["default", queues[1], "bg-[var(--m-amber)]"],
                ["low", queues[2], "bg-[var(--m-sky)]"],
              ] as const
            ).map(([label, depth, bar], i) => (
              <div key={label} className="mb-1.5 px-1 last:mb-0">
                <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-[var(--m-muted)]">{label}</span>
                  <span className="text-[var(--m-text)]">{depth}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--m-bg)]">
                  <div
                    className={`md-queue-bar h-full rounded-full ${bar}`}
                    style={{
                      width: `${Math.max(6, (depth / 12) * 100)}%`,
                      animationDelay: `${i * 0.5}s`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            className="md-float-chip rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-panel)]/80 px-4 py-3 backdrop-blur"
            style={{ animationDelay: "1.2s" }}
          >
            <p className="font-mono text-[10px] tracking-wide text-[var(--m-dim)]">
              JOBS PROCESSED
            </p>
            <p className="mt-0.5 font-mono text-[16px] font-semibold text-[var(--m-text)]">
              {processed.toLocaleString()} · {rate.toFixed(1)}%
            </p>
          </div>
          <div
            className="md-float-chip rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-panel)]/80 px-4 py-3 backdrop-blur"
            style={{ animationDelay: "2.6s" }}
          >
            <p className="font-mono text-[10px] tracking-wide text-[var(--m-dim)]">
              OUTBOX LAG
            </p>
            <p className="mt-0.5 font-mono text-[16px] font-semibold text-[var(--m-green)]">
              {lagMs}ms
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
