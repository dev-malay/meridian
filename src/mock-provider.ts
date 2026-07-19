const express = require("express") as typeof import("express");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const pino = require("pino") as typeof import("pino");
type StreamEntry = import("pino").StreamEntry;
const fs = require("fs");
const path = require("path");

export {};

const result = dotenv.config();
if (result.error) {
  console.warn("could not load .env file", result.error);
}

const logLevel = process.env.LOG_LEVEL === "DEBUG" ? "debug" : "info";

const streams: StreamEntry[] = [{ stream: pino.destination({ fd: 1 }) }];

const logFilePath = process.env.LOG_FILE_PATH;
// console.log("logFilePath", logFilePath);
if (logFilePath) {
  const dir = path.dirname(logFilePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const fileStream = pino.destination({ dest: logFilePath, append: true });
    streams.push({ stream: fileStream });
  } catch (err) {
    console.error("failed to open log file", logFilePath, err);
  }
}

const logger = pino(
  {
    level: logLevel,
    formatters: { level(label: string) { return { level: label }; } },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream(streams),
);

const app = express();
const port = process.env.MOCK_PROVIDER_PORT || "3000";

app.get("/health", (_req, res) => {
  res.json({ message: "don't worry about me, mate" });
});

app.all("*", (_req, res) =>{
  const n = Math.random() * 100;
  if (n < 80) {
    res.json({ provider_ref: uuidv4() });
    logger.info({ status: 200 }, "mock provider response");
  } else if (n < 90) {
    res.status(503).end();
    logger.info({ status: 503 }, "mock provider response");
  } else {
    res.status(422).end();
    logger.info({ status: 422 }, "mock provider response");
  }
});

app.listen(port, () => {
  logger.info({ port }, "starting mock provider server");
});
