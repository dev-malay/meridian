type Request = import("express").Request;
type Response = import("express").Response;
type NextFunction = import("express").NextFunction;
const pino = require("pino");
import { rateLimiterDenied } from "../metrics/index.js";

const logger = pino();

export interface LimiterStore {
  allow(ctx: { signal: AbortSignal }, key: string, limit: number, windowMs: number): Promise<boolean>;
}

export class RateLimiter {
  private store: LimiterStore;
  private limit: number;
  private windowMs: number;

  constructor(store: LimiterStore, limit: number, windowMs: number) {
    this.store = store;
    this.limit = limit;
    this.windowMs = windowMs;
  }

  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIP = req.ip ?? req.socket.remoteAddress ?? "unknown";

      this.store
        .allow({ signal: new AbortController().signal }, clientIP, this.limit, this.windowMs)
        .then((allowed) => {
          if (!allowed) {
            rateLimiterDenied.inc();
            logger.debug({ client_ip: clientIP, limit: this.limit, window_ms: this.windowMs }, "rate limit exceeded");
            res.setHeader("Retry-After", String(this.windowMs / 1000));
            res.status(429).send("Too Many Requests");
            return;
          }

          next();
        })
        .catch((err) => {
          logger.error({ error: err }, "rate limiter failed, allowing request");
          next();
        });
    }
  }
}
