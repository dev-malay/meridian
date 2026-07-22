export class ErrInvalidStateTransition extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrInvalidStateTransition";
  }
}

export interface Payment {
  id: string;
  amount: number;
  status: string;
  idempotency_key: string;
  provider_ref: string | null;
  attempts: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentParams {
  amount: number;
  status: string;
  idempotency_key: string;
}

export interface OutboxEvent {
  id: string;
  payment_id: string;
  event_type: string;
  payload: object;
  status: "pending" | "published";
  created_at: Date;
  published_at: Date | null;
}

export interface WebhookConfig {
  target_url: string;
  updated_at: Date;
}

export interface WebhookDelivery {
  id: string;
  payment_id: string;
  event_type: string;
  payload: object;
  target_url: string;
  status: "pending" | "delivered" | "failed";
  attempt: number;
  response_status: number | null;
  response_body: string | null;
  created_at: Date;
  delivered_at: Date | null;
}

export interface Store {
  createPayment(ctx: { signal: AbortSignal }, params: CreatePaymentParams): Promise<{ payment: Payment; created: boolean }>;
  getPaymentByID(ctx: { signal: AbortSignal }, id: string): Promise<Payment>;
  getPaymentByIdempotencyKey(ctx: { signal: AbortSignal }, key: string): Promise<Payment>;
  updatePayment(
    ctx: { signal: AbortSignal },
    id: string,
    fromStatus: string,
    toStatus: string,
    lastError: string,
    incrementAttempts: boolean,
  ): Promise<Payment>;
  updateProviderRef(ctx: { signal: AbortSignal }, id: string, providerRef: string): Promise<void>;
  recordProcessingFailure(
    ctx: { signal: AbortSignal },
    id: string,
    lastError: string,
    incrementAttempts: boolean,
  ): Promise<void>;

  findStuckPending(ctx: { signal: AbortSignal }, since: Date, limit: number): Promise<Payment[]>;
  createPaymentWithOutbox(
    ctx: { signal: AbortSignal },
    params: CreatePaymentParams,
  ): Promise<{ payment: Payment; created: boolean }>;
  fetchUnpublishedOutboxEvents(ctx: { signal: AbortSignal }, limit: number): Promise<OutboxEvent[]>;
  markOutboxEventPublished(ctx: { signal: AbortSignal }, id: string): Promise<void>;

  insertOutboxEvent(ctx: { signal: AbortSignal }, paymentId: string, eventType: string, payload: object): Promise<void>;
  fetchUnpublishedWebhookEvents(ctx: { signal: AbortSignal }, limit: number): Promise<OutboxEvent[]>;

  getWebhookConfig(ctx: { signal: AbortSignal }): Promise<WebhookConfig | null>;
  upsertWebhookConfig(ctx: { signal: AbortSignal }, targetUrl: string): Promise<void>;

  createWebhookDelivery(
    ctx: { signal: AbortSignal },
    paymentId: string,
    eventType: string,
    payload: object,
    targetUrl: string,
  ): Promise<string>;
  updateWebhookDelivery(
    ctx: { signal: AbortSignal },
    deliveryId: string,
    status: "delivered" | "failed",
    responseStatus: number | null,
    responseBody: string | null,
  ): Promise<void>;
  getWebhookDeliveries(ctx: { signal: AbortSignal }, limit: number, offset: number): Promise<WebhookDelivery[]>;
  getWebhookDeliveryByID(ctx: { signal: AbortSignal }, id: string): Promise<WebhookDelivery>;
}
