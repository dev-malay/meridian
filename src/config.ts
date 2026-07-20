const dotenv = require("dotenv");

export interface EnvConfig {
  providerBaseURL: string;
  databaseURL: string;
  redisURL: string;
  redisAddr: string;
  appPort: string;
  logLevel: string;
  logFilePath: string;
  rateLimit: number;
  rateLimitWindowMs: number;
}

function mustGetEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`missing required env var: ${key}`);
    process.exit(1);
  }
  return value;
}

export function loadEnv(): EnvConfig {
  const result = dotenv.config();
  if (result.error) {
    console.warn("could not load .env file", result.error);
  }

  const providerBaseURL = mustGetEnv("PROVIDER_BASE_URL");
  const databaseURL = mustGetEnv("DATABASE_URL");
  const redisURL = process.env.REDIS_URL ?? "";
  const redisAddr = process.env.REDIS_ADDR ?? "";

  if (!redisURL && !redisAddr) {
    console.error("missing required env var: set REDIS_URL (Upstash) or REDIS_ADDR (local)");
    process.exit(1);
  }

  const appPort = process.env.PORT || "8080";
  const logLevel = process.env.LOG_LEVEL || "INFO";
  const logFilePath = process.env.LOG_FILE_PATH || "";
  const rateLimit = parseInt(process.env.RATE_LIMIT || "200", 10);
  const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);

  return { providerBaseURL, databaseURL, redisURL, redisAddr, appPort, logLevel, logFilePath, rateLimit, rateLimitWindowMs };
}
