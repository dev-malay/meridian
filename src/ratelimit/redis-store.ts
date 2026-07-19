const pino = require("pino");
type Redis = import("ioredis").Redis;
type LimiterStore = import("./index").LimiterStore;

const logger = pino();

export class RedisLimiterStore implements LimiterStore {
  private rdb: Redis;

  constructor(rdb: Redis) {
    this.rdb = rdb;
  }

  async allow(ctx: { signal: AbortSignal }, key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const clearBefore = now - windowMs;

    const redisKey = `ratelimit:${key}`;
    const member = `${now}:${process.hrtime.bigint()}`;

    const pipeline = this.rdb.pipeline();

    pipeline.zremrangebyscore(redisKey, "-inf", clearBefore);
    pipeline.zadd(redisKey, now, member);
    pipeline.zcard(redisKey);
    pipeline.expire(redisKey, Math.ceil(windowMs / 1000) + 1);

    const results = await pipeline.exec();

    if (!results) {
      logger.error("failed to execute rate limit pipeline");
      return false;
    }

    const zCardResult = results[2];
    if (zCardResult[0]) {
      logger.error({ error: zCardResult[0] }, "failed to read rate limit window capacity");
      return false;
    }

    const count = zCardResult[1] as number;
    return count <= limit;
  }
}
