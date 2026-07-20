const pg = require("pg");
const { v4: uuidv4 } = require("uuid");
const _paymentTypes = require("../payment/types");
const PaymentStatus = _paymentTypes.Status;

const { ErrInvalidStateTransition } = require("./index");
const pino = require("pino");



const logger = pino();

function scanPayment(row: any): any {
  return {
    id: row.id,
    amount: Number(row.amount),
    status: row.status,
    idempotency_key: row.idempotency_key,
    provider_ref: row.provider_ref ?? null,
    attempts: row.attempts,
    last_error: row.last_error ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class PostgresStore {
  private pool: any;

  constructor(pool: any) {
    this.pool = pool;
  }

  async createPayment(
    _ctx: { signal: AbortSignal },
    params: any,
  ): Promise<{ payment: any; created: boolean }> {
    const query = `
      insert into payments (id, amount, status, idempotency_key)
      values ($1, $2, $3, $4)
      returning id, amount, status, idempotency_key, created_at, updated_at;
    `;

    try {
      const res = await this.pool.query(query, [
        uuidv4(), params.amount, params.status, params.idempotency_key,
      ])
      const payment = scanPayment(res.rows[0]);
      return { payment, created: true };
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        const existing = await this.getPaymentByIdempotencyKey(_ctx, params.idempotency_key);
        return { payment: existing, created: false };
      }
      logger.error({ error: err, idempotency_key: params.idempotency_key }, "failed to create payment");
      throw err;
    }
  }

  async getPaymentByID(_ctx: { signal: AbortSignal }, id: string): Promise<any> {
    const query = `
      select id, amount, status, idempotency_key, provider_ref, attempts, last_error, created_at, updated_at
      from payments where id = $1;
    `;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) {
      throw new ErrInvalidStateTransition(`payment not found: ${id}`);
    }
    return scanPayment(res.rows[0]);
  }

  async getPaymentByIdempotencyKey(_ctx: { signal: AbortSignal }, key: string): Promise<any> {
    const query = `
      select id, amount, status, idempotency_key, provider_ref, attempts, last_error, created_at, updated_at
      from payments where idempotency_key = $1 limit 1;
    `;
    const res = await this.pool.query(query, [key]);
    if (res.rows.length === 0) {
      throw new ErrInvalidStateTransition(`payment not found by idempotency key: ${key}`);
    }
    return scanPayment(res.rows[0])
  }

  async updatePayment(
    _ctx: { signal: AbortSignal },
    id: string,
    fromStatus: string,
    toStatus: string,
    lastError: string,
    incrementAttempts: boolean,
  ): Promise<any> {
    const query = `
      update payments
      set status = $1,
          last_error = $2,
          attempts = attempts + $3,
          updated_at = now()
      where id = $4
        and status = $5
      returning id, amount, status, idempotency_key, provider_ref, attempts, last_error, created_at, updated_at;
    `;

    const attemptDelta = incrementAttempts ? 1 : 0;
    const res = await this.pool.query(query, [
      toStatus, nullableText(lastError), attemptDelta, id, fromStatus,
    ]);

    if (res.rows.length === 0) {
      throw new ErrInvalidStateTransition(`${fromStatus} -> ${toStatus} for payment ${id}`)
    }

    return scanPayment(res.rows[0]);
  }

  async updateProviderRef(_ctx: { signal: AbortSignal }, id: string, providerRef: string): Promise<void> {
    const query = `
      update payments
      set provider_ref = $1,
          updated_at = now()
      where id = $2
        and status = $3;
    `;

    const res = await this.pool.query(query, [providerRef, id, PaymentStatus.Success]);

    if (res.rowCount === 0 || res.rowCount === null) {
      throw new ErrInvalidStateTransition(`expected ${PaymentStatus.Success} before provider ref update for payment ${id}`);
    }
  }

  async recordProcessingFailure(
    _ctx: { signal: AbortSignal },
    id: string,
    lastError: string,
    incrementAttempts: boolean,
  ): Promise<void> {
    const query = `
      update payments
      set last_error = $1,
          attempts = attempts + $2,
          updated_at = now()
      where id = $3
        and status = $4;
    `;

    const attemptDelta = incrementAttempts ? 1 : 0;
    const res = await this.pool.query(query, [
      nullableText(lastError), attemptDelta, id, PaymentStatus.Processing,
    ]);

    if (res.rowCount === 0 || res.rowCount === null) {
      throw new ErrInvalidStateTransition(`expected ${PaymentStatus.Processing} for payment ${id}`);
    }
  }

  async findStuckPending(
    _ctx: { signal: AbortSignal },
    since: Date,
    limit: number,
  ): Promise<any[]> {
    const query = `
      select id, amount, status, idempotency_key, provider_ref, attempts, last_error, created_at, updated_at
      from payments
      where status = 'pending'
        and updated_at < $1
      order by updated_at asc
      limit $2;
    `;
    const res = await this.pool.query(query, [since.toISOString(), limit]);
    return res.rows.map(scanPayment);
  }

  async createPaymentWithOutbox(
    _ctx: { signal: AbortSignal },
    params: any,
  ): Promise<{ payment: any; created: boolean }> {
    const paymentID = uuidv4();
    const outboxID = uuidv4();
    const payload = JSON.stringify({ amount: params.amount, idempotency_key: params.idempotency_key });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const payRes = await client.query(
        `insert into payments (id, amount, status, idempotency_key)
         values ($1, $2, $3, $4)
         returning id, amount, status, idempotency_key, created_at, updated_at;`,
        [paymentID, params.amount, params.status, params.idempotency_key],
      );

      await client.query(
        `insert into outbox_events (id, payment_id, payload)
         values ($1, $2, $3);`,
        [outboxID, paymentID, payload],
      );

      await client.query("COMMIT");

      const payment = scanPayment(payRes.rows[0]);
      return { payment, created: true };
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        const existing = await this.getPaymentByIdempotencyKey(_ctx, params.idempotency_key);
        return { payment: existing, created: false };
      }
      logger.error({ error: err, idempotency_key: params.idempotency_key }, "failed to create payment with outbox");
      throw err;
    } finally {
      client.release();
    }
  }

  async fetchUnpublishedOutboxEvents(
    _ctx: { signal: AbortSignal },
    limit: number,
  ): Promise<any[]> {
    const query = `
      select id, payment_id, event_type, payload, status, created_at, published_at
      from outbox_events
      where event_type = 'payment.process' and status = 'pending'
      order by created_at asc
      limit $1
      for update skip locked;
    `;
    const res = await this.pool.query(query, [limit]);
    return res.rows.map((row: any) => ({
      id: row.id,
      payment_id: row.payment_id,
      event_type: row.event_type,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      status: row.status as "pending" | "published",
      created_at: row.created_at,
      published_at: row.published_at ?? null,
    }));
  }

  async markOutboxEventPublished(
    _ctx: { signal: AbortSignal },
    id: string,
  ): Promise<void> {
    await this.pool.query(
      `update outbox_events
       set status = 'published', published_at = now()
       where id = $1 and status = 'pending';`,
      [id],
    );
  }

  // Webhook config 

  async getWebhookConfig(_ctx: { signal: AbortSignal }): Promise<any> {
    const query = `select target_url, updated_at from webhook_config where id = 1;`;
    const res = await this.pool.query(query);
    if (res.rows.length === 0) return null;
    return { target_url: res.rows[0].target_url, updated_at: res.rows[0].updated_at };
  }

  async upsertWebhookConfig(_ctx: { signal: AbortSignal }, targetUrl: string): Promise<void> {
    const query = `
      insert into webhook_config (id, target_url, updated_at)
      values (1, $1, now())
      on conflict (id) do update set target_url = $1, updated_at = now();
    `;
    await this.pool.query(query, [targetUrl]);
  }

  // outbox events 

  async insertOutboxEvent(
    _ctx: { signal: AbortSignal },
    paymentId: string,
    eventType: string,
    payload: object,
  ): Promise<void> {
    await this.pool.query(
      `insert into outbox_events (id, payment_id, event_type, payload)
       values ($1, $2, $3, $4);`,
      [uuidv4(), paymentId, eventType, JSON.stringify(payload)],
    );
  }

  async fetchUnpublishedWebhookEvents(
    _ctx: { signal: AbortSignal },
    limit: number,
  ): Promise<any[]> {
    const query = `
      select id, payment_id, event_type, payload, status, created_at, published_at
      from outbox_events
      where event_type = 'webhook.deliver' and status = 'pending'
      order by created_at asc
      limit $1
      for update skip locked;
    `;
    const res = await this.pool.query(query, [limit]);
    return res.rows.map((row: any) => ({
      id: row.id,
      payment_id: row.payment_id,
      event_type: row.event_type,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      status: row.status as "pending" | "published",
      created_at: row.created_at,
      published_at: row.published_at ?? null,
    }));
  }

  // webhook deliveries 

  async createWebhookDelivery(
    _ctx: { signal: AbortSignal },
    paymentId: string,
    eventType: string,
    payload: object,
    targetUrl: string,
  ): Promise<string> {
    const id = uuidv4();
    await this.pool.query(
      `insert into webhook_deliveries (id, payment_id, event_type, payload, target_url)
       values ($1, $2, $3, $4, $5);`,
      [id, paymentId, eventType, JSON.stringify(payload), targetUrl],
    );
    return id;
  }

  async updateWebhookDelivery(
    _ctx: { signal: AbortSignal },
    deliveryId: string,
    status: "delivered" | "failed",
    responseStatus: number | null,
    responseBody: string | null,
  ): Promise<void> {
    const query = `
      update webhook_deliveries
      set status = $1,
          response_status = $2,
          response_body = $3,
          delivered_at = case when $1 = 'delivered' then now() else delivered_at end
      where id = $4;
    `;
    await this.pool.query(query, [status, responseStatus, responseBody, deliveryId]);
  }

  async getWebhookDeliveries(
    _ctx: { signal: AbortSignal },
    limit: number,
    offset: number,
  ): Promise<any[]> {
    const query = `
      select id, payment_id, event_type, payload, target_url, status, attempt,
             response_status, response_body, created_at, delivered_at
      from webhook_deliveries
      order by created_at desc
      limit $1 offset $2;
    `;
    const res = await this.pool.query(query, [limit, offset]);
    return res.rows.map((row: any) => ({
      id: row.id,
      payment_id: row.payment_id,
      event_type: row.event_type,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      target_url: row.target_url,
      status: row.status as "pending" | "delivered" | "failed",
      attempt: row.attempt,
      response_status: row.response_status ?? null,
      response_body: row.response_body ?? null,
      created_at: row.created_at,
      delivered_at: row.delivered_at ?? null,
    }));
  }

  async getWebhookDeliveryByID(_ctx: { signal: AbortSignal }, id: string): Promise<any> {
    const query = `
      select id, payment_id, event_type, payload, target_url, status, attempt,
             response_status, response_body, created_at, delivered_at
      from webhook_deliveries
      where id = $1;
    `;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) throw new ErrInvalidStateTransition(`webhook delivery not found: ${id}`);
    const row = res.rows[0];
    return {
      id: row.id,
      payment_id: row.payment_id,
      event_type: row.event_type,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      target_url: row.target_url,
      status: row.status as "pending" | "delivered" | "failed",
      attempt: row.attempt,
      response_status: row.response_status ?? null,
      response_body: row.response_body ?? null,
      created_at: row.created_at,
      delivered_at: row.delivered_at ?? null,
    };
  }
}

function nullableText(value: string): string | null {
  return value === "" ? null : value;
}
