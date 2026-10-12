import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LandingHeader } from "../components/LandingHeader";
import { LandingFooter } from "../components/LandingFooter";

const sections = [
  {
    n: "01",
    title: "Create a payment",
    body: [
      "You POST an amount and an idempotency key to /v1/payments. That key is the whole trick for safe retries: send the same key twice and you get the same payment back, never a double charge.",
      "A Postgres unique constraint enforces it at the database level, so even two requests racing each other can't create duplicates.",
    ],
  },
  {
    n: "02",
    title: "Write it down, atomically",
    body: [
      "In one database transaction, Meridian inserts both the payment record and an outbox event. Either both land or neither does — the queue can never hear about a payment that doesn't exist.",
      "A poller picks up outbox events every 200ms and publishes them to BullMQ. No two-phase commits, no distributed transactions, no lost messages.",
    ],
  },
  {
    n: "03",
    title: "Process with retries",
    body: [
      "A BullMQ worker picks the job from the critical, default, or low queue — bigger amounts get higher priority — and calls the payment provider.",
      "Transient failures like a provider 503 go back in line with exponential backoff, up to 8 attempts. Validation errors like a 422 fail immediately instead of wasting retries. Anything failed can be replayed by hand with one API call.",
    ],
  },
  {
    n: "04",
    title: "Sweep for stragglers",
    body: [
      "Every 30 seconds a reconciliation job looks for payments stuck in pending for more than 2 minutes — crashed workers, lost messages, wedged queues — and re-enqueues them.",
      "Re-enqueueing is idempotent through deterministic job IDs, so a sweep can never double-process a payment.",
    ],
  },
];

const STATES: Array<{ label: string; dot: string }> = [
  { label: "pending", dot: "bg-[var(--m-sky)]" },
  { label: "processing", dot: "bg-[var(--m-amber)]" },
  { label: "success", dot: "bg-[var(--m-green)]" },
  { label: "failed_retryable", dot: "bg-[var(--m-amber)]" },
  { label: "failed_final", dot: "bg-[var(--m-red)]" },
];

export function AboutPage() {
  useEffect(() => {
    document.title = "How it works — Meridian";
  }, []);

  return (
    <div className="md-landing min-h-screen">
      <LandingHeader />

      <main className="mx-auto w-full max-w-[720px] px-6 py-16 md:py-24">
        <p className="text-[13px] font-medium tracking-wide text-[var(--m-dim)]">
          How it works
        </p>
        <h1
          className="mt-3 text-[34px] font-medium leading-[1.1] tracking-[-0.01em] text-[var(--m-text)] md:text-[40px]"
          style={{ textWrap: "balance" }}
        >
          Meridian, explained without the jargon
        </h1>
        <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[var(--m-muted)]">
          No distributed-systems background needed. Just a plain explanation
          of what happens between you clicking pay and the money moving.
        </p>

        <div className="mt-12 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--m-border-soft)] bg-[var(--m-panel)] p-4">
          {STATES.map((s, i) => (
            <span key={s.label} className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-md bg-[var(--m-bg)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--m-muted)]">
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </span>
              {i < STATES.length - 1 && (
                <span className="font-mono text-[11px] text-[var(--m-dim)]">
                  →
                </span>
              )}
            </span>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-14">
          {sections.map((s) => (
            <section key={s.n}>
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-[12px] font-medium text-[var(--m-dim)]">
                  {s.n}
                </span>
                <h2 className="text-[22px] font-medium tracking-[-0.01em] text-[var(--m-text)]">
                  {s.title}
                </h2>
              </div>
              <div className="mt-4 flex flex-col gap-3 pl-9">
                {s.body.map((p, i) => (
                  <p
                    key={i}
                    className="max-w-[56ch] text-[15px] leading-relaxed text-[var(--m-muted)]"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-xl border border-[var(--m-border)] bg-[var(--m-panel)] px-6 py-5">
          <h3 className="text-[14px] font-medium text-[var(--m-green)]">
            Reliable by construction
          </h3>
          <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-[var(--m-muted)]">
            Meridian never trusts a single step. Every state change is
            persisted, every queue write is idempotent, and a sweeper
            re-checks everything every 30 seconds. On top of that, 18
            Prometheus metrics and OpenTelemetry traces show exactly what
            the pipeline is doing at all times.
          </p>
        </div>

        <div className="mt-12 flex items-center gap-3">
          <Link
            to="/dashboard"
            className="rounded-lg bg-[var(--m-text)] px-5 py-2.5 text-[14px] font-medium text-[var(--m-bg)] transition-opacity hover:opacity-90"
          >
            Open dashboard
          </Link>
          <Link
            to="/"
            className="text-[14px] font-medium text-[var(--m-muted)] hover:text-[var(--m-text)]"
          >
            Back to home
          </Link>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
