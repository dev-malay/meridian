import { diag, DiagConsoleLogger, DiagLogLevel, context, trace, propagation, Tracer, Context } from "@opentelemetry/api";
import { NodeTracerProvider, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const TRACEPARENT_KEY = "traceparent";

let tracer: Tracer | null = null;

export function initTracing(serviceName: string, otlpEndpoint?: string, otlpAuthHeader?: string): void {
  if (tracer) return;

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  const spanProcessors = [];

  if (otlpEndpoint) {
    const exporterOptions: Record<string, unknown> = { url: `${otlpEndpoint}/v1/traces` };
    if (otlpAuthHeader) {
      exporterOptions.headers = { Authorization: otlpAuthHeader };
    }
    const exporter = new OTLPTraceExporter(exporterOptions);
    spanProcessors.push(new SimpleSpanProcessor(exporter));
  }

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    spanProcessors,
  });

  provider.register();

  tracer = trace.getTracer(serviceName);
}

export function getTracer(): Tracer {
  if (!tracer) {
    tracer = trace.getTracer("meridian");
  }
  return tracer;
}

export function injectTraceContext<T extends Record<string, unknown>>(payload: T): T {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  if (carrier.traceparent) {
    return { ...payload, [TRACEPARENT_KEY]: carrier.traceparent };
  }
  return payload;
}

export function extractTraceContext(payload: Record<string, unknown>): Context {
  const traceparent = payload?.[TRACEPARENT_KEY];
  if (typeof traceparent === "string") {
    const carrier: Record<string, string> = { traceparent };
    return propagation.extract(context.active(), carrier);
  }
  return context.active();
}
