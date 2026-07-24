const { RateLimiter } = require("../src/ratelimit/index");
const express = require("express");
const request = require("supertest");

describe("RateLimiter", () => {
  it("allows requests under the limit", async () => {
    const store = {
      allow: vi.fn().mockResolvedValue(true),
    };

    const limiter = new RateLimiter(store, 10, 1000);

    const app = express();
    app.use(limiter.middleware());
    app.get("/test", (_req: any, res: any) => res.json({ ok: true }));

    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });

  it("rejects with 429 when over the limit", async () => {
    const store = {
      allow: vi.fn().mockResolvedValue(false),
    };
    const limiter = new RateLimiter(store, 10, 1000);

    const app = express();
    app.use(limiter.middleware());
    app.get("/test", (_req: any, res: any) => res.json({ ok: true }));

    const res = await request(app).get("/test");
    expect(res.status).toBe(429);
    expect(res.text).toBe("Too Many Requests");
  });
});

export {}