const Redis = require("ioredis");
const { RedisLimiterStore } = require("../src/ratelimit/redis-store");

async function isRedisAvailable(): Promise<boolean> {
  const testRedis = new Redis({ host: "localhost", port: 6379, maxRetriesPerRequest: null as any, retryStrategy: () => null as any, lazyConnect: true });
  try {
    await testRedis.connect();
    await testRedis.ping();
    await testRedis.quit();
    return true;
  } catch {
    return false;
  }
}

describe("RedisLimiterStore", () => {
  let redis: any;
  let redisAvailable: boolean;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      return;
    }
    redis = new Redis({ host: "localhost", port: 6379, maxRetriesPerRequest: null as any });
  });

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
  });

  it("allows requests within the limit", async () => {
    if (!redisAvailable) return;
    const store = new RedisLimiterStore(redis);
    const ctx = { signal: new AbortController().signal };
    const key = `test:allow:${Date.now()}`;

    const allowed = await store.allow(ctx, key, 10, 60000);
    expect(allowed).toBe(true);
  });

  it("rejects requests exceeding the limit", async () => {
    if (!redisAvailable) return;
    const store = new RedisLimiterStore(redis);
    const ctx = { signal: new AbortController().signal };
    const key = `test:reject:${Date.now()}`;

    const allow1 = await store.allow(ctx, key, 1, 60000);
    expect(allow1).toBe(true);

    const allow2 = await store.allow(ctx, key, 1, 60000);
    expect(allow2).toBe(false);
  });

  it("accepts after window expiry", async () => {
    if (!redisAvailable) return;
    const store = new RedisLimiterStore(redis);
    const ctx = { signal: new AbortController().signal };
    const key = `test:expiry:${Date.now()}`;

    const allow1 = await store.allow(ctx, key, 1, 500);
    expect(allow1).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const allow2 = await store.allow(ctx, key, 1, 500);
    expect(allow2).toBe(true);
  }, 10000);
});

export {}