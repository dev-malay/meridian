const pino = require("pino");
const { Worker } = require("bullmq");
const { context, trace, SpanStatusCode } = require("@opentelemetry/api");
const { extractTraceContext, getTracer } = require("../tracing/index");
const { workerJobsTotal, workerJobDuration } = require("../metrics/index");

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
  connection: any,
  processor: PaymentProcessor,
  concurrency: number,
): any {
  const worker = new Worker(
    queueName,
    async (job: any) => {
      const payload = job.data as WorkerTaskPayload;

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

  return worker
}
