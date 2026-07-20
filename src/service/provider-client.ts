const { context, trace, SpanStatusCode } = require("@opentelemetry/api");
const { providerLatency } = require("../metrics/index");
const { getTracer } = require("../tracing/index");

export interface ProviderResponse {
  providerRef: string;
  statusCode: number;}

export class ProviderClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async executePayment(ctx: { signal: AbortSignal }): Promise<ProviderResponse> {
    const tracer = getTracer();
    const span = tracer.startSpan("provider.execute_payment");

    const start = performance.now()

    try {
      const response = await fetch(this.baseURL, {
        method: "GET",
        signal: ctx.signal,
      });

      const elapsed = (performance.now() - start) / 1000;

      let providerRef = "";
      try {
        const body = await response.json() as { provider_ref?: string };
        providerRef = body.provider_ref ?? "";
      } catch {
      }

      const outcome = outcomeFromStatus(response.status);

      span.setAttribute("http.status_code", response.status);
      span.setAttribute("provider.outcome", outcome);
      span.setAttribute("provider.ref", providerRef || "none");

      providerLatency.observe({ outcome }, elapsed);

      if (response.status >= 400) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end()

      return { providerRef, statusCode: response.status };
    } catch (err) {
      const elapsed = (performance.now() - start) / 1000;
      const errMsg = err instanceof Error ? err.message : String(err);

      span.setAttribute("error", errMsg);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errMsg });
      span.end();

      providerLatency.observe({ outcome: "error" }, elapsed);

      throw err;
    }
  }
}

function outcomeFromStatus(status: number): string{
  if (status === 200) return "success";
  if (status === 422) return "terminal_error";
  if (status === 503) return "retryable_error";
  return `status_${status}`;
 }
