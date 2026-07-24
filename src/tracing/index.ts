const { diag, DiagConsoleLogger, DiagLogLevel, context, trace, propagation } = require("@opentelemetry/api");
const { NodeTracerProvider, SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-node");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");

const TRACEPARENT_KEY = "traceparent";

let tracer: any = null;

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

export function getTracer(): any {
  if (!tracer) {
    tracer = trace.getTracer("meridian");
  }
  return tracer!;
}

export function injectTraceContext<T extends Record<string, unknown>>(payload: T): T {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  if (carrier.traceparent) {
    return { ...payload, [TRACEPARENT_KEY]: carrier.traceparent };
  }
  return payload;
}

export function extractTraceContext(payload: Record<string, unknown>): any {
  const traceparent = payload?.[TRACEPARENT_KEY];
  if (typeof traceparent === "string") {
    const carrier: Record<string, string> = { traceparent };
    return propagation.extract(context.active(), carrier);
  }
  return context.active();
}
