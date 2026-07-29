import express from "express";
import pg from "pg";
import Redis from "ioredis";
import { Queue } from "bullmq";
import pino from "pino";

import { loadEnv } from "./config";
import { initLogger } from "./logger";
import { PostgresStore } from "./store/postgres";
import { ProviderClient } from "./service/provider-client";
import { Service } from "./service/index";
import { APIHandler, setupRouter } from "./handler/handler";
import { loggingMiddleware } from "./handler/middleware";
import { RateLimiter } from "./ratelimit/index";
import { RedisLimiterStore } from "./ratelimit/redis-store";
import { createWorker } from "./worker/index";
import { metricsHandler, up, paymentsByStatus, outboxPendingGauge } from "./metrics/index";
import { initTracing } from "./tracing/index";
import { WebhookDeliveryService } from "./webhook/index";

const logger = pino();

const serverReadTimeout = 5000;
const serverWriteTimeout = 10000;
const serverIdleTimeout = 60000;
const serverShutdownTimeout = 30000;
const workerCnt = 5;

const outboxPollIntervalMs = 200;
const outboxBatchSize = 50;
const reconcileIntervalMs = 30000;
const reconcileStuckThresholdMs = 120000;
const reconcileBatchSize = 100;
const queueDepthPollIntervalMs = 5000;
const webhookPollIntervalMs = 10000;
const webhookBatchSize = 20;

async function main(): Promise<void> {
  const env = loadEnv();

  initLogger(env);
  initTracing("meridian", process.env.OTLP_ENDPOINT, process.env.OTLP_AUTH_HEADER);

  const dbPool = new pg.Pool({
    connectionString: env.databaseURL,
  });

  try {
    await dbPool.query("SELECT 1");
    logger.info("connected to db")
  } catch (err) {
    logger.error({ error: err }, "failed to connect to database");
    process.exit(1);
  }

  const paymentStore = new PostgresStore(dbPool);
  const providerClient = new ProviderClient(env.providerBaseURL);

  let redis: Redis;

  if (env.redisURL) {
    redis = new Redis(env.redisURL, {
      tls: { servername: new URL(env.redisURL).hostname },
      maxRetriesPerRequest: null,
    });
  } else {
    redis = new Redis(env.redisAddr, { maxRetriesPerRequest: null });
  }

  redis.on("error", (err: Error) => {
    logger.error({ error: err }, "redis connection error");
  });

  const criticalQueue = new Queue("critical", { connection: redis, defaultJobOptions: { removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } }});
  const defaultQueue = new Queue("default", { connection: redis, defaultJobOptions: { removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } } });
  const lowQueue = new Queue("low", { connection: redis, defaultJobOptions: { removeOnComplete: { age: 3600 }, removeOnFail: { age: 86400 } } });

  const svc = new Service(paymentStore, providerClient, criticalQueue, defaultQueue, lowQueue);
  const webhookDeliverySvc = new WebhookDeliveryService(paymentStore);
  const apiHandler = new APIHandler(svc, paymentStore);

  const workers = [
    createWorker("critical", redis, svc, Math.ceil(workerCnt * 0.6)),
    createWorker("default", redis, svc, Math.ceil(workerCnt * 0.3)),
    createWorker("low", redis, svc, Math.ceil(workerCnt * 0.1))]

  const outboxAbort = new AbortController();
  const reconcileAbort = new AbortController();
  const queueDepthAbort = new AbortController();
  const webhookAbort = new AbortController();

  const outboxPromise = svc.runOutboxPoller(
    { signal: outboxAbort.signal },
    outboxPollIntervalMs,
    outboxBatchSize,
  );
  const reconcilePromise = svc.runReconciliation(
    { signal: reconcileAbort.signal },
    reconcileIntervalMs,
    reconcileStuckThresholdMs,
    reconcileBatchSize,
  );
  const queueDepthPromise = svc.pollQueueDepth(
    { signal: queueDepthAbort.signal },
    queueDepthPollIntervalMs,
  );

  const webhookPromise = webhookDeliverySvc.runDeliveryPoller(
    { signal: webhookAbort.signal },
    webhookPollIntervalMs,
    webhookBatchSize,
  )

  up.set(1);

  const statusPollAbort = new AbortController();
  const statusPollPromise = pollPaymentStatuses(dbPool, { signal: statusPollAbort.signal }, 10000, paymentStore);

  const outboxGaugeAbort = new AbortController();
  const outboxGaugePromise = pollOutboxPending(dbPool, { signal: outboxGaugeAbort.signal }, 5000);

  const limiterStore = new RedisLimiterStore(redis);
  const rateLimiter = new RateLimiter(limiterStore, env.rateLimit, env.rateLimitWindowMs);

  const app = express();
  app.use(express.json());
  app.use(loggingMiddleware);
  app.use(rateLimiter.middleware());

  app.get("/metrics", metricsHandler());

  const router = setupRouter(apiHandler);
  app.use(router);

  const server = app.listen(env.appPort, () => {
    logger.info({ port: env.appPort, concurrency: workerCnt }, "starting server");
    logger.info({ concurrency: workerCnt }, "starting worker");
  });

  server.timeout = serverReadTimeout;
  server.keepAliveTimeout = serverIdleTimeout;

  await new Promise<void>((resolve) => {
    const onAbort = () => {
      logger.info("shutting down gracefully...");

      outboxAbort.abort();
      reconcileAbort.abort();
      queueDepthAbort.abort();
      webhookAbort.abort();
      statusPollAbort.abort();
      outboxGaugeAbort.abort();

      workers.forEach((w) => w.close());
      server.close(() => {
        dbPool.end().catch(() => {});
        redis.disconnect();
        logger.info("server shut down completely");
        resolve();
        process.exit(0)
      });

      setTimeout(() => {
        logger.error("shutdown timed out, forcing exit");
        process.exit(1);
      }, serverShutdownTimeout);
    };

    process.on("SIGINT", onAbort);
    process.on("SIGTERM", onAbort);
    process.on("SIGBREAK", onAbort);
  });

}

async function pollPaymentStatuses(
  db: pg.Pool,
  ctx: { signal: AbortSignal },
  intervalMs: number,
  _store: PostgresStore,
): Promise<void> {
  while (true) {
    if (ctx.signal.aborted) return;
    try {
      const res = await db.query(`
        select status, count(*)::int as cnt
        from payments
        group by status
      `);
      for (const row of res.rows) {
        paymentsByStatus.set({ status: row.status }, row.cnt);
      }
    } catch {
      logger.error("failed to poll payment statuses");
    }


    await sleep(ctx, intervalMs);
  }
}

async function pollOutboxPending(
  db: pg.Pool,
  ctx: { signal: AbortSignal },
  intervalMs: number,
): Promise<void> {
  while (true) {
    if (ctx.signal.aborted) return;
    try {
      const res = await db.query(`
        select count(*)::int as cnt
        from outbox_events
        where status = 'pending'
      `)
      outboxPendingGauge.set(res.rows[0]?.cnt ?? 0);
    } catch {}
    await sleep(ctx, intervalMs);
  }
}

function sleep(ctx: { signal: AbortSignal }, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    ctx.signal.addEventListener("abort",() => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

main().catch((err) => {
  logger.error({ error: err }, "fatal error");
  process.exit(1);
});
