import pino from "pino";
import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { extractTraceContext, getTracer } from "../tracing/index";
import { workerJobsTotal, workerJobDuration } from "../metrics/index";

const logger = pino();

export interface PaymentProcessor {
  processPayment(ctx: { signal: AbortSignal }, paymentID: string): Promise<void>;
}

interface WorkerTaskPayload {
  payment_id: string;
  traceparent?: string;
}

export function createWorker(
  queueName: string,
  connection: Redis,
  processor: PaymentProcessor,
  concurrency: number,
): Worker {
  const worker = new Worker<WorkerTaskPayload>(
    queueName,
    async (job: Job<WorkerTaskPayload>) => {
      const payload = job.data;

      if (!payload || !payload.payment_id) {
        throw new Error("invalid payment task payload");
      }

      const parentCtx = extractTraceContext(payload as unknown as Record<string, unknown>);
      const tracer = getTracer();
      const start = performance.now();

      await context.with(parentCtx, async () => {
        const span = tracer.startSpan(`worker.${queueName}.process_payment`, {
          attributes: {
            "payment.id": payload.payment_id,
            "queue": queueName,
          },
        });

        const childCtx = trace.setSpan(context.active(), span);

        try {
          await context.with(childCtx, () =>
            processor.processPayment(
              { signal: job.token ? AbortSignal.timeout(5000) : new AbortController().signal },
              payload.payment_id,
            ),
          );
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
          throw err;
        } finally {
          span.end();
          const elapsed = (performance.now() - start) / 1000;
          workerJobDuration.observe({ queue: queueName }, elapsed);
        }
      });
    },
    {
      connection,
      concurrency,
    },
  );
  worker.on("completed", (job: Job<WorkerTaskPayload>) => {
    workerJobsTotal.inc({ queue: queueName, result: "completed" });
    logger.info({ payment_id: job?.data?.payment_id, queue: queueName }, "worker completed payment");
  });

  worker.on("failed", (job: Job<WorkerTaskPayload> | undefined, err: Error) => {
    workerJobsTotal.inc({ queue: queueName, result: "failed" });
    logger.error({ payment_id: job?.data?.payment_id, queue: queueName, error: err.message  }, "worker failed payment");
  })

  return worker
}
