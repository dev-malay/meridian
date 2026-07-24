const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

function createMockProviderApp(): any {
  const app = express();

  app.get("/health", (_req: any, res: any) => {
    res.json({ message: "don't worry about me, mate" });
  });

  app.all("*", (_req: any, res: any) => {
    const n = Math.random() * 100;

    if (n < 80) {
      res.json({ provider_ref: uuidv4() });
    } else if (n < 90) {
      res.status(503).end();
    } else {
      res.status(422).end();
    }
  });

  return app;
}

describe("MockProvider", () => {
  it("returns health check response", async () => {
    const app = createMockProviderApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("don't worry about me, mate");
  });

  it("returns one of the expected status codes", async () => {
    const app = createMockProviderApp();

    for (let i = 0; i < 20; i++) {
      const res = await request(app).get("/anything");
      expect([200, 503, 422]).toContain(res.status);
    }
  });

  it("returns JSON body with provider_ref on 200", async () => {
    const app = createMockProviderApp();

    let found200 = false;
    for (let i = 0; i < 100; i++) {
      const res = await request(app).get("/anything");
      if (res.status === 200) {
        found200 = true;
        expect(res.body).toHaveProperty("provider_ref");
        expect(typeof res.body.provider_ref).toBe("string");
        break;
      }
    }

    expect(found200).toBe(true);
  });
});

export {}