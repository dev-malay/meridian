const pino = require("pino");
const { httpRequestsTotal, httpRequestDuration } = require("../metrics/index");

const logger = pino()


export function loggingMiddleware(req: any, res: any, next: any): void {
  const start = Date.now();

  logger.debug({ method: req.method, path: req.path, remote_addr: req.ip, user_agent: req.headers["user-agent"] }, "incoming request")

  const originalEnd = res.end;
  const originalWrite = res.write;


  let bytesWritten = 0;

  res.write = function (chunk: any, encoding?: any, callback?: any): boolean {
    if (chunk) {
      bytesWritten += Buffer.byteLength(chunk);
    }
    return originalWrite.call(res, chunk, encoding, callback);
  };

  res.end = function (chunk?: any, encoding?: any, callback?: any): any {
    if (chunk) {
      bytesWritten += Buffer.byteLength(chunk);
    }
    const duration = Date.now() - start;

    logger.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        bytes_written: bytesWritten,
      },
      "request processed",
    );

    // httpmetrics 
    httpRequestsTotal.inc({ method: req.method, status: String(res.statusCode) });
    httpRequestDuration.observe(
      { method: req.method, status_class: `${Math.floor(res.statusCode / 100)}xx` },
      duration / 1000,
    );

    return originalEnd.call(res, chunk, encoding, callback);
  };

  next();
}
