import pino from "pino";
import type { Request, Response, NextFunction } from "express";
import { httpRequestsTotal, httpRequestDuration } from "../metrics/index";

const logger = pino()

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  logger.debug({ method: req.method, path: req.path, remote_addr: req.ip, user_agent: req.headers["user-agent"] }, "incoming request")

  const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
  const originalWrite = res.write.bind(res) as (...args: unknown[]) => boolean;

  let bytesWritten = 0;

  res.write = function (this: Response, ...args: [unknown, ...unknown[]]): boolean {
    if (args[0]) {
      bytesWritten += Buffer.byteLength(args[0] as string | Buffer);
    }
    return originalWrite.apply(this, args);
  };

  res.end = function (this: Response, ...args: unknown[]): Response {
    if (args[0]) {
      bytesWritten += Buffer.byteLength(args[0] as string | Buffer);
    }
    const duration = Date.now() - start;

    logger.info(
      {
        method: req.method,
        path: req.path,
        status: this.statusCode,
        duration_ms: duration,
        bytes_written: bytesWritten,
      },
      "request processed",
    );

    httpRequestsTotal.inc({ method: req.method, status: String(this.statusCode) });
    httpRequestDuration.observe(
      { method: req.method, status_class: `${Math.floor(this.statusCode / 100)}xx` },
      duration / 1000,
    );

    return originalEnd.apply(this, args);
  };

  next();
}
