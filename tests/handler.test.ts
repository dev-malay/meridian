const express = require("express");
const request = require("supertest");
const { APIHandler } = require("../src/handler/handler");
const { Status } = require("../src/payment/types");

function createMockService() {
  return {
    createPaymentWithOutbox: vi.fn(),
    getPaymentByID: vi.fn(),
    enqueuePayment: vi.fn(),
    retryFailedPayment: vi.fn(),
    emitWebhookDelivery: vi.fn(),
  };
}

function createApp(handler: any): any {
  const app = express();
  app.use(express.json());

  app.get("/v1/health", (req: any, res: any) => handler.health(req, res));
  app.post("/v1/payments", (req: any, res: any, next: any) => {
    handler.createPayment(req, res).catch(next);
  });
  app.get("/v1/payments/:id", (req: any, res: any, next: any) => {
    handler.getPaymentByID(req, res).catch(next);
  });
  app.post("/v1/payments/:id/retry", (req: any, res: any, next: any) => {
    handler.retryPayment(req, res).catch(next);
  });

  return app;
}

describe("APIHandler", () => {
  describe("CreatePayment", () => {
    it("returns 202 Accepted for new payment", async () => {
      const mockSvc = createMockService();
      const payment = {
        id: "test-id",
        amount: 1000,
        status: Status.Pending,
        idempotency_key: "key-1",
        provider_ref: null,
        attempts: 0,
        last_error: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (mockSvc.createPaymentWithOutbox as any).mockResolvedValue({ payment, created: true });

      const handler = new APIHandler(mockSvc);
      const app = createApp(handler);

      const res = await request(app)
        .post("/v1/payments")
        .send({ amount: 1000, idempotency_key: "key-1" });

      expect(res.status).toBe(202);
      expect(res.body.created).toBe(true);
      expect(res.body.enqueued).toBe(false);
    });

    it("returns 400 for invalid JSON body", async () => {
      const mockSvc = createMockService();
      const handler = new APIHandler(mockSvc);
      const app = createApp(handler);

      const res = await request(app)
        .post("/v1/payments")
        .set("Content-Type", "application/json")
        .send("invalid-json");
      expect(res.status).toBe(400);
    });

    it("returns 200 for duplicate idempotency key", async () => {
      const mockSvc = createMockService();
      const payment = {
        id: "existing-id",
        amount: 1000,
        status: Status.Pending,
        idempotency_key: "key-duplicate",
        provider_ref: null,
        attempts: 0,
        last_error: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (mockSvc.createPaymentWithOutbox as any).mockResolvedValue({ payment, created: false });

      const handler = new APIHandler(mockSvc);
      const app = createApp(handler);

      const res = await request(app)
        .post("/v1/payments")
        .send({ amount: 1000, idempotency_key: "key-duplicate" });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
    });
  });

  describe("GetPaymentByID", () => {
    it("returns payment when found", async () => {
      const mockSvc = createMockService();
      const payment = {
        id: "pay-1",
        amount: 500,
        status: Status.Success,
        idempotency_key: "key-1",
        provider_ref: "ref-1",
        attempts: 1,
        last_error: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      (mockSvc.getPaymentByID as any).mockResolvedValue(payment);

      const handler = new APIHandler(mockSvc);
      const app = createApp(handler);

      const res = await request(app).get("/v1/payments/pay-1");
      expect(res.status).toBe(200);
      expect(res.body.payment.id).toBe("pay-1");
    });

    it("returns 404 when payment not found", async () => {
      const mockSvc = createMockService();
      (mockSvc.getPaymentByID as any).mockRejectedValue(new Error("payment not found"));

      const handler = new APIHandler(mockSvc);
      const app = createApp(handler);

      const res = await request(app).get("/v1/payments/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("RetryPayment", () => {
    it("returns queued on success", async () => {
      const mockSvc = createMockService();
      (mockSvc.retryFailedPayment as any).mockResolvedValue(undefined);

      const handler = new APIHandler(mockSvc);
      const app = createApp(handler);

      const res = await request(app).post("/v1/payments/pay-1/retry");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("queued");
    });

    it("returns 404 when task not found", async () => {
      const mockSvc = createMockService();
      (mockSvc.retryFailedPayment as any).mockRejectedValue(new Error("task not found"));

      const handler = new APIHandler(mockSvc);
      const app = createApp(handler);

      const res = await request(app).post("/v1/payments/pay-1/retry");
      expect(res.status).toBe(404);
    });
  });
});

export {}