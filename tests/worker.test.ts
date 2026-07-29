import Redis from "ioredis";
import { createWorker } from "../src/worker/index";

describe("Worker", () => {
  it("creates a worker successfully", () => {
    const processor = {
      processPayment: vi.fn(),
    };

    const mockRedis = {
      on: vi.fn(),
      disconnect: vi.fn(),
      status: "close",
    } as unknown as Redis;

    const worker = createWorker("test-queue", mockRedis, processor, 1);
    expect(worker).toBeDefined();

    worker.close();
  });
});
