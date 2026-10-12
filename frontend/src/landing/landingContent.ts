export const hero = {
  eyebrow: "MERIDIAN - PAYMENT PIPELINE",
  headline: "Payments that never get lost.",
  subhead:
    "Meridian is a payment processing pipeline - every payment is written atomically, queued reliably, retried automatically, and reconciled continuously.",
  primaryCta: { label: "Open dashboard", to: "/dashboard" },
  secondaryCta: { label: "How it works", to: "/about" },
};

export type TechnicalPoint = {
  stat: string;
  title: string;
  body: string;
};

export const technicalPoints: TechnicalPoint[] = [
  {
    stat: "1txn",
    title: "Transactional outbox",
    body: "Payment record and outbox event are inserted in a single PostgreSQL transaction. A 200ms poller publishes to BullMQ - at-least-once delivery with no two-phase commits.",
  },
  {
    stat: "3q",
    title: "Priority queues",
    body: "Jobs route to critical, default, or low queues with priority weighted by amount. Big money moves first, automatically.",
  },
  {
    stat: "8x",
    title: "Automatic retries",
    body: "Failed jobs retry with exponential backoff, up to 8 attempts. Transient 503s go back in line; 422 validation errors fail fast. Anything failed can be replayed by hand.",
  },
  {
    stat: "30s",
    title: "Reconciliation sweeps",
    body: "Every 30 seconds a sweeper finds payments stuck in pending for over 2 minutes and re-enqueues them - idempotently, via deterministic job IDs.",
  },
];

export const landingNavLinks = [
  { label: "How it works", to: "/about" },
  { label: "Dashboard", to: "/dashboard" },
];
