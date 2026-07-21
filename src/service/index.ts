const pino = require("pino");
const bullmq = require("bullmq");
const Queue = bullmq.Queue;
const _paymentTypes = require("../payment/types");
const Status = _paymentTypes.Status;
const _providerClient = require("./provider-client");
const ProviderClient = _providerClient.ProviderClient;
const {
  paymentsTotal,
  retryAttempts,
  queueDepth,
  paymentsCreatedTotal,
  paymentsAmount,
  paymentsEnqueuedTotal,
  outboxEventsCreated,
  outboxEventsPublished,
  outboxEventsFailed,
  reconciledTotal,
  providerCallsTotal,
} = require("../metrics/index");
const { injectTraceContext } = require("../tracing/index");

const logger = pino();

function determineQueue(amount: number): string {
  if (amount >= 10000) return "critical";
  if (amount < 1000) return "low";
  return "default";
}

function pickQueue(queues: Record<string, any>, amount: number): any {
  const name = determineQueue(amount);
  const q = queues[name];
  if (!q) throw new Error(`unknown queue: ${name}`);
  return q;
}

export class Service {
  private store: any;
  private providerClient: any;
  private criticalQueue: any;
  private defaultQueue: any;
  private lowQueue: any;

  constructor(
    paymentStore: any,
    providerClient: any,
    criticalQueue: any,
    defaultQueue: any,
    lowQueue: any,
  ) {
    this.store = paymentStore;
    this.providerClient = providerClient;
    this.criticalQueue = criticalQueue;
    this.defaultQueue = defaultQueue;
    this.lowQueue = lowQueue;
  }

  async createPayment(
    ctx: { signal: AbortSignal },
    params: any,
  ): Promise<{ payment: any; created: boolean }> {
    return this.store.createPayment(ctx, params);
  }

  async createPaymentWithOutbox(
    ctx: { signal: AbortSignal },
    params: any,
  ): Promise<{ payment: any; created: boolean }> {
    const result = await this.store.createPaymentWithOutbox(ctx, params);

    paymentsCreatedTotal.inc({ result: result.created ? "new" : "duplicate" });
    if (result.created) {
      paymentsAmount.observe(result.payment.amount);
      outboxEventsCreated.inc();
    }

    return result;
  }

  async getPaymentByID(ctx: { signal: AbortSignal }, id: string): Promise<any> {
    return this.store.getPaymentByID(ctx, id);
  }

  async enqueuePayment(ctx: { signal: AbortSignal }, paymentID: string): Promise<void> {
    const p = await this.store.getPaymentByID(ctx, paymentID);
    const maxRetriesEnv = process.env.MAX_RETRIES;
    const maxRetries = maxRetriesEnv ? parseInt(maxRetriesEnv, 10) : 8;

    const queueMap: Record<string, any> = {
      critical: this.criticalQueue,
      default: this.defaultQueue,
      low: this.lowQueue,
    };

    const queue = pickQueue(queueMap, p.amount);
    const queueName = determineQueue(p.amount);

    const payload = injectTraceContext({ payment_id: paymentID });

    await queue.add(
      "payment:process",
      payload,
      {
        jobId: paymentID,
        attempts: maxRetries,
        backoff: { type: "exponential" as const, delay: 15000 },
      },
    );

    paymentsEnqueuedTotal.inc({ queue: queueName });
  }

  async emitWebhookDelivery(ctx: { signal: AbortSignal }, paymentID: string): Promise<void> {
    try {
      const payment = await this.store.getPaymentByID(ctx, paymentID);
      if (payment.status !== Status.Success && payment.status !== Status.FailedFinal) return;

      const payload = {
        event: "payment.completed",
        payment_id: payment.id,
        amount: payment.amount,
        status: payment.status,
        idempotency_key: payment.idempotency_key,
        provider_ref: payment.provider_ref,
        attempts: payment.attempts,
        last_error: payment.last_error,
        completed_at: new Date().toISOString(),
      };

      await this.store.insertOutboxEvent(ctx, paymentID, "webhook.deliver", payload);
      logger.info({ payment_id: paymentID, status: payment.status }, "webhook delivery event enqueued");
    } catch (err) {
      logger.error({ payment_id: paymentID, error: err }, "failed to enqueue webhook delivery");
    }
  }

  async processPayment(ctx: { signal: AbortSignal }, paymentID: string): Promise<void> {
    const p = await this.store.getPaymentByID(ctx, paymentID);

    switch (p.status) {
      case Status.Success:
      case Status.FailedFinal:
        return;
      case Status.Pending:
        await this.store.updatePayment(ctx, paymentID, Status.Pending, Status.Processing, "", false);
        break;
      case Status.FailedRetryable:
        await this.store.updatePayment(ctx, paymentID, Status.FailedRetryable, Status.Processing, "", false);
        break;
      default:
        return;
    }

    let providerRef: string;
    let statusCode: number;
    try {
      const resp = await this.providerClient.executePayment(ctx);
      providerRef = resp.providerRef;
      statusCode = resp.statusCode;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.store.recordProcessingFailure(ctx, paymentID, errMsg, true);
      providerCallsTotal.inc({ status_code: "error" });
      throw err;
    }

    providerCallsTotal.inc({ status_code: String(statusCode) });

    switch (statusCode) {
      case 200: {
        await this.store.updatePayment(ctx, paymentID, Status.Processing, Status.Success, "", true);
        await this.store.updateProviderRef(ctx, paymentID, providerRef);
        paymentsTotal.inc({ outcome: "success" });
        break;
      }
      case 503: {
        await this.store.recordProcessingFailure(ctx, paymentID, "service unavailable", true);
        await this.store.updatePayment(
          ctx,
          paymentID,
          Status.Processing,
          Status.FailedRetryable,
          "service unavailable",
          false,
        );
        throw new Error(`provider unavailable for payment ${paymentID}`);
      }
      case 422: {
        await this.store.updatePayment(
          ctx,
          paymentID,
          Status.Processing,
          Status.FailedFinal,
          "unprocessable payment",
          false,
        );
        paymentsTotal.inc({ outcome: "failed_final" });
        break;
      }
      default:{
        const errMsg = `provider returned status ${statusCode}`;
        await this.store.recordProcessingFailure(ctx, paymentID, errMsg, true);
        await this.store.updatePayment( ctx,paymentID, Status.Processing, Status.FailedRetryable, errMsg, false);
        throw new Error(`unexpected status ${statusCode} from provider for payment ${paymentID}`);
      }
    }

    await this.emitWebhookDelivery(ctx, paymentID);
  }

  async retryFailedPayment(ctx: { signal: AbortSignal }, paymentID: string): Promise<void> {
    const p = await this.store.getPaymentByID(ctx, paymentID)
    const queueMap: Record<string, any> = {
      critical: this.criticalQueue,
      default: this.defaultQueue,
      low: this.lowQueue,
    }

    const queue = pickQueue(queueMap, p.amount);

    const job = await queue.getJob(paymentID);
    if (!job) {
      throw new Error(`task not found in retryable/archived queues for payment ${paymentID}`);
    }

    const jobState = await job.getState();
    if (jobState === "failed") {
      await job.retry();
    } else {
      await queue.add(
        "payment:process",
        { payment_id: paymentID },
        {
          jobId: paymentID,
          attempts: job.opts.attempts ?? 8,
          backoff: job.opts.backoff ?? { type: "exponential" as const, delay: 15000 },
        },
      )
    }

    await this.store.updatePayment(
      ctx,
      paymentID,
      Status.FailedFinal,
      Status.Pending,
      "manual retry initiated",
      false,
    );
  }

  async recordTerminalOutcome(paymentID: string): Promise<void> {
    try {
      const p = await this.store.getPaymentByID({ signal: new AbortController().signal }, paymentID);
      if (p.status === Status.Success) {
        retryAttempts.observe(p.attempts);
      }
      if (p.status === Status.FailedFinal) {
        retryAttempts.observe(p.attempts);
      }
    } catch {

    }
  }

  async runReconciliation(
    ctx: { signal: AbortSignal },
    intervalMs: number,
    stuckThresholdMs: number,
    batchSize: number,
  ): Promise<void> {
    logger.info({ intervalMs, stuckThresholdMs }, "starting reconciliation job");

    while (true) {
      if (ctx.signal.aborted) return;

      try {
        const since = new Date(Date.now() - stuckThresholdMs);
        const stuck = await this.store.findStuckPending(ctx, since, batchSize);

        for (const p of stuck) {
          try {
            await this.enqueuePayment(ctx, p.id);
            reconciledTotal.inc();
            logger.warn({ payment_id: p.id }, "reconciled stuck payment");
          } catch (err) {
            logger.error({ payment_id: p.id, error: err }, "reconciliation re-enqueue failed");
          }
        }
      } catch (err) {
        logger.error({ error: err }, "reconciliation query failed");
      }

      await sleep(ctx, intervalMs);
    }
  }

  async runOutboxPoller(
    ctx: { signal: AbortSignal },
    intervalMs: number,
    batchSize: number,
  ): Promise<void> {
    logger.info({ intervalMs }, "starting outbox poller");

    while (true) {
      if (ctx.signal.aborted) return;

      try {
        const events = await this.store.fetchUnpublishedOutboxEvents(ctx, batchSize);

        for (const ev of events) {
          try {
    const queueMap: Record<string, any> = {
              critical: this.criticalQueue,
              default: this.defaultQueue,
              low: this.lowQueue,
            };

            const p = await this.store.getPaymentByID(ctx, ev.payment_id);
            const queue = pickQueue(queueMap, p.amount);

            const maxRetriesEnv = process.env.MAX_RETRIES;
            const maxRetries = maxRetriesEnv ? parseInt(maxRetriesEnv, 10) : 8;

            await queue.add(
              "payment:process",
              { payment_id: ev.payment_id },
              {
                jobId: ev.payment_id,
                attempts: maxRetries,
                backoff: { type: "exponential" as const, delay: 15000 },
              },
            );

            await this.store.markOutboxEventPublished(ctx, ev.id);
            outboxEventsPublished.inc();
            logger.info({ payment_id: ev.payment_id, outbox_id: ev.id }, "outbox event published");
          } catch (err) {
            outboxEventsFailed.inc();
            logger.error({ outbox_id: ev.id, payment_id: ev.payment_id, error: err }, "outbox publish failed");
          }
        }

      } catch (err) { logger.error({ error: err }, "outbox poller query failes")}

      await sleep(ctx, intervalMs);
    }
  }

  async pollQueueDepth(ctx: { signal: AbortSignal }, intervalMs: number): Promise<void> {
    const queues: Record<string, any> = {
      critical: this.criticalQueue,
      default: this.defaultQueue,
      low: this.lowQueue,
    };

    while (true) {
      if (ctx.signal.aborted) return;

      for (const [name, q] of Object.entries(queues)) {
        try {
          const counts = await q.getJobCounts("waiting", "active", "delayed");
          const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
          queueDepth.set({ queue: name }, depth);
        } catch (err) {
          logger.error({ queue: name, error: err }, "queue depth poll failed");
        }
      }

      await sleep(ctx, intervalMs);
    }
  }
}

function sleep(ctx: { signal: AbortSignal }, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    ctx.signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
