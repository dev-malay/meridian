const pino = require("pino");
const { webhookDeliveriesTotal, webhookDeliveryDuration } = require("../metrics/index");

const logger = pino();

export class WebhookDeliveryService {
  private store: any;

  constructor(store: any) {
    this.store = store;
  }

  async runDeliveryPoller(
    ctx: { signal: AbortSignal },
    intervalMs: number,
    batchSize: number,
  ): Promise<void> {
    logger.info({ intervalMs }, "starting webhook delivery poller");

    while (true) {
      if (ctx.signal.aborted) return;

      try {
        const config = await this.store.getWebhookConfig(ctx);
        if (!config || !config.target_url) {
          await sleep(ctx, intervalMs);
          continue;
        }

        const events = await this.store.fetchUnpublishedWebhookEvents(ctx, batchSize);

    for (const ev of events) {
      if (ctx.signal.aborted) return;

      try {
        const deliveryId = await this.store.createWebhookDelivery(
          ctx,
          ev.payment_id,
          ev.event_type,
          ev.payload,
          config.target_url,
        );

        const start = performance.now();
        let responseStatus: number | null = null;
        let responseBody: string | null = null;

        try {
          const res = await fetch(config.target_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ev.payload),
            signal: ctx.signal,
          });
          responseStatus = res.status;
          responseBody = await res.text().catch(() => null);
        } catch (err) {
          responseStatus = 0;
          responseBody = err instanceof Error ? err.message : String(err);
        }

        const elapsed = (performance.now() - start) / 1000;
        webhookDeliveryDuration.observe({}, elapsed);

        const delivered = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;

        await this.store.updateWebhookDelivery(
          ctx,
          deliveryId,
          delivered ? "delivered" : "failed",
          responseStatus,
          responseBody ? responseBody.slice(0, 2000) : null,
        );

        await this.store.markOutboxEventPublished(ctx, ev.id);
        webhookDeliveriesTotal.inc({ result: delivered ? "delivered" : "failed" });

        logger.info(
          { delivery_id: deliveryId, payment_id: ev.payment_id, status: responseStatus, duration_ms: Math.round(elapsed * 1000) },
          delivered ? "webhook delivered" : "webhook delivery failed",
        );

        if (responseStatus === 429) {
          await sleep(ctx, 5000);
        }
      } catch (err) {
        logger.error({ outbox_id: ev.id, payment_id: ev.payment_id, error: err }, "webhook delivery error");
      }
    }
      } catch (err) {
        logger.error({ error: err }, "webhook poller query failed");
      }

      await sleep(ctx, intervalMs);
    }
  }
}

function sleep(ctx: { signal: AbortSignal }, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    ctx.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
