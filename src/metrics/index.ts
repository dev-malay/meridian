const prometheus = require("prom-client");

// ─── HTTP / API ────────────────────────────────────────────

export const httpRequestsTotal = new prometheus.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests by method and status",
  labelNames: ["method", "status"] as const,
});

export const httpRequestDuration = new prometheus.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency by method and status class",
  labelNames: ["method", "status_class"] as const,
  buckets: prometheus.exponentialBuckets(0.001, 2, 12),
});

// ─── Payments Pipeline ─────────────────────────────────────

export const paymentsCreatedTotal = new prometheus.Counter({
  name: "payments_created_total",
  help: "Payments created (new vs duplicate idempotency key)",
  labelNames: ["result"] as const, // new | duplicate
});

export const paymentsAmount = new prometheus.Histogram({
  name: "payments_amount",
  help: "Distribution of payment amounts",
  buckets: prometheus.linearBuckets(0, 5000, 10).concat([50000, 100000, 500000]),
});

export const paymentsEnqueuedTotal = new prometheus.Counter({
  name: "payments_enqueued_total",
  help: "Payments enqueued into BullMQ by queue",
  labelNames: ["queue"] as const,
});

export const paymentsTotal = new prometheus.Counter({
  name: "payments_total",
  help: "Payments by terminal outcome",
  labelNames: ["outcome"] as const,
});

export const retryAttempts = new prometheus.Histogram({
  name: "payment_retry_attempts",
  help: "Number of attempts before a payment reached a terminal state",
  buckets: [1, 2, 3, 4, 5, 6, 7, 8],
});

export const paymentsByStatus = new prometheus.Gauge({
  name: "payments_by_status",
  help: "Current count of payments by status",
  labelNames: ["status"] as const,
});

// ─── Outbox ────────────────────────────────────────────────

export const outboxEventsCreated = new prometheus.Counter({
  name: "outbox_events_created_total",
  help: "Outbox events created",
});

export const outboxEventsPublished = new prometheus.Counter({
  name: "outbox_events_published_total",
  help: "Outbox events successfully published to Redis",
});

export const outboxEventsFailed = new prometheus.Counter({
  name: "outbox_events_failed_total",
  help: "Outbox events that failed to publish",
});

export const outboxPendingGauge = new prometheus.Gauge({
  name: "outbox_events_pending",
  help: "Current number of pending (unpublished) outbox events",
});

// ─── Reconciliation ────────────────────────────────────────

export const reconciledTotal = new prometheus.Counter({
  name: "payments_reconciled_total",
  help: "Stuck payments re-enqueued by reconciliation job",
});

// ─── Worker / Queue ────────────────────────────────────────

export const workerJobsTotal = new prometheus.Counter({
  name: "worker_jobs_total",
  help: "Worker jobs processed by queue and result",
  labelNames: ["queue", "result"] as const, // completed | failed
});

export const workerJobDuration = new prometheus.Histogram({
  name: "worker_job_duration_seconds",
  help: "Worker job processing duration by queue",
  labelNames: ["queue"] as const,
  buckets: prometheus.exponentialBuckets(0.01, 2, 10),
});

export const queueDepth = new prometheus.Gauge({
  name: "asynq_queue_depth",
  help: "Pending tasks per queue",
  labelNames: ["queue"] as const,
});

// ─── Provider ──────────────────────────────────────────────

export const providerCallsTotal = new prometheus.Counter({
  name: "provider_calls_total",
  help: "Provider calls by HTTP status code",
  labelNames: ["status_code"] as const,
});

export const providerLatency = new prometheus.Histogram({
  name: "provider_call_duration_seconds",
  help: "Latency of external payment provider calls",
  labelNames: ["outcome"] as const,
  buckets: prometheus.exponentialBuckets(0.005, 2, 10),
});

// ─── Rate Limiter ──────────────────────────────────────────

export const rateLimiterDenied = new prometheus.Counter({
  name: "rate_limiter_denied_total",
  help: "Requests denied by rate limiter",
});

// ─── Webhooks ──────────────────────────────────────────────

export const webhookDeliveriesTotal = new prometheus.Counter({
  name: "webhook_deliveries_total",
  help: "Webhook deliveries by result",
  labelNames: ["result"] as const, // delivered | failed
});

export const webhookDeliveryDuration = new prometheus.Histogram({
  name: "webhook_delivery_duration_seconds",
  help: "Webhook HTTP call duration",
  buckets: prometheus.exponentialBuckets(0.01, 2, 10),
});

// ─── System ────────────────────────────────────────────────

export const up = new prometheus.Gauge({
  name: "up",
  help: "1 if the server is accepting requests, 0 otherwise",
});

export function metricsHandler(): (req: any, res: any) => void {
  return async (_req: any, res: any) => {
    res.set("Content-Type", prometheus.register.contentType);
    res.end(await prometheus.register.metrics());
  };
}
