const express = require("express");
const Router = express.Router;
const pino = require("pino");
const { z } = require("zod");
const _paymentTypes = require("../payment/types");
const Status = _paymentTypes.Status;

const logger = pino();

const createPaymentSchema = z.object({
  amount: z.number().int().positive(),
  idempotency_key: z.string().min(1),
});

const webhookConfigSchema = z.object({
  target_url: z.string().url().min(1),
});

export interface PaymentService {
  createPaymentWithOutbox(
    ctx: { signal: AbortSignal },
    params: { amount: number; status: string; idempotency_key: string },
  ): Promise<{ payment: any; created: boolean }>;
  getPaymentByID(ctx: { signal: AbortSignal }, id: string): Promise<any>;
  enqueuePayment(ctx: { signal: AbortSignal }, paymentID: string): Promise<void>;
  retryFailedPayment(ctx: { signal: AbortSignal }, paymentID: string): Promise<void>;
  emitWebhookDelivery(ctx: { signal: AbortSignal }, paymentID: string): Promise<void>;
}

export interface StoreService {
  getWebhookConfig(ctx: { signal: AbortSignal }): Promise<any>;
  upsertWebhookConfig(ctx: { signal: AbortSignal }, targetUrl: string): Promise<void>;
  getWebhookDeliveries(ctx: { signal: AbortSignal }, limit: number, offset: number): Promise<any[]>;
  getWebhookDeliveryByID(ctx: { signal: AbortSignal }, id: string): Promise<any>;
}

export class APIHandler {
  private svc: PaymentService;
  private store: StoreService;

  constructor(svc: PaymentService, store: StoreService) {
    this.svc = svc;
    this.store = store;
  }

  health(_req: any, res: any): void {
    res.json({ message: "don't worry about me, mate" });
  }

  async createPayment(req: any, res: any): Promise<void> {
    const parseResult = createPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "validation failed, invalid request body" });
      return;
    }

    const { amount, idempotency_key } = parseResult.data;
    const ctx = { signal: new AbortController().signal };

    const result = await this.svc.createPaymentWithOutbox(
      ctx,
      { amount, status: Status.Pending, idempotency_key },
    );

    if (!result.created) {
      res.json({ payment: result.payment, created: false, enqueued: false });
      return;
    }

    res.status(202).json({ payment: result.payment, created: true, enqueued: false });
  }

  async getPaymentByID(req: any, res: any): Promise<void> {
    const id = req.params.id;
    const ctx = { signal: new AbortController().signal };

    if (!id) {
      res.status(400).json({ error: "failed to get payment id in req" });
      return;
    }

    try {
      const p = await this.svc.getPaymentByID(ctx, id);
      res.json({ payment: p });
    } catch (err) {
      const e = err as Error;
      if (e.message?.includes?.("payment not found")) {
        res.status(404).json({ error: "payment not found" });
        return;
      }
      logger.error({ error: e, payment_id: id }, "failed to get payment");
      res.status(500).json({ error: "failed to get payment" });
    }
  }

  async retryPayment(req: any, res: any): Promise<void> {
    const id = req.params.id;
    const ctx = { signal: new AbortController().signal };

    if (!id) {
      res.status(400).json({ error: "missing payment id" });
      return;
    }

    try {
      await this.svc.retryFailedPayment(ctx, id);
      res.json({ status: "queued" });
    } catch (err) {
      const e = err as Error;
      if (e.message?.includes?.("task not found")) {
        res.status(404).json({ error: "payment task not found in archived or retry queue" });
        return;
      }
      res.status(500).json({ error: `failed to retry payment: ${e.message}` });
    }
  }

  // ─── Webhook config ───────────────────────────────────────

  async getWebhookConfig(_req: any, res: any): Promise<void> {
    const ctx = { signal: new AbortController().signal };
    try {
      const config = await this.store.getWebhookConfig(ctx);
      res.json({ config: config ?? { target_url: "", updated_at: null } });
    } catch (err) {
      logger.error({ error: err }, "failed to get webhook config");
      res.status(500).json({ error: "failed to get webhook config" });
    }
  }

  async setWebhookConfig(req: any, res: any): Promise<void> {
    const parseResult = webhookConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "invalid target_url" });
      return;
    }

    const ctx = { signal: new AbortController().signal };
    try {
      await this.store.upsertWebhookConfig(ctx, parseResult.data.target_url);
      res.json({ status: "ok" });
    } catch (err) {
      logger.error({ error: err }, "failed to set webhook config");
      res.status(500).json({ error: "failed to set webhook config" });
    }
  }

  // ─── Webhook deliveries ───────────────────────────────────

  async getWebhookDeliveries(req: any, res: any): Promise<void> {
    const ctx = { signal: new AbortController().signal };
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    try {
      const deliveries = await this.store.getWebhookDeliveries(ctx, limit, offset);
      res.json({ deliveries });
    } catch (err) {
      logger.error({ error: err }, "failed to get webhook deliveries");
      res.status(500).json({ error: "failed to get webhook deliveries" });
    }
  }

  async retryWebhookDelivery(req: any, res: any): Promise<void> {
    const id = req.params.id;
    const ctx = { signal: new AbortController().signal };

    if (!id) {
      res.status(400).json({ error: "missing delivery id" });
      return;
    }

    try {
      const delivery = await this.store.getWebhookDeliveryByID(ctx, id);
      await this.svc.emitWebhookDelivery(ctx, delivery.payment_id);
      res.json({ status: "queued" });
    } catch (err) {
      const e = err as Error;
      logger.error({ delivery_id: id, error: e }, "failed to retry webhook delivery");
      if (e.message?.includes?.("not found")) {
        res.status(404).json({ error: "webhook delivery not found" });
        return;
      }
      res.status(500).json({ error: "failed to retry webhook delivery" });
    }
  }
}

export function setupRouter(handler: APIHandler): any {
  const router = Router();

  router.get("/v1/health", (req: any, res: any) => handler.health(req, res));
  router.post("/v1/payments", (req: any, res: any, next: any) => {
    handler.createPayment(req, res).catch(next);
  });
  router.get("/v1/payments/:id", (req: any, res: any, next: any) => {
    handler.getPaymentByID(req, res).catch(next);
  });
  router.post("/v1/payments/:id/retry", (req: any, res: any, next: any) => {
    handler.retryPayment(req, res).catch(next);
  });

  router.get("/v1/webhooks/config", (req: any, res: any, next: any) => {
    handler.getWebhookConfig(req, res).catch(next);
  });
  router.post("/v1/webhooks/config", (req: any, res: any, next: any) => {
    handler.setWebhookConfig(req, res).catch(next);
  });
  router.get("/v1/webhooks/deliveries", (req: any, res: any, next: any) => {
    handler.getWebhookDeliveries(req, res).catch(next);
  });
  router.post("/v1/webhooks/deliveries/:id/retry", (req: any, res: any, next: any) => {
    handler.retryWebhookDelivery(req, res).catch(next);
  });

  return router;
}
