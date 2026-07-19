const pino = require("pino") as typeof import("pino");
type Logger = import("pino").Logger;
type StreamEntry = import("pino").StreamEntry;
const fs = require("fs");
const path = require("path");
type EnvConfig = import("./config").EnvConfig;

export function initLogger(env: EnvConfig): Logger {
  const level = env.logLevel === "DEBUG" ? "debug" : "info";

  const streams: StreamEntry[] = [
    { stream: pino.destination({ fd: 1 }) },
  ];

  if (env.logFilePath) {
    const dir = path.dirname(env.logFilePath);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const fileStream = pino.destination({ dest: env.logFilePath, append: true });
      streams.push({ stream: fileStream });
    } catch (err) {
      console.error("failed to open log file", env.logFilePath, err);
    }
  }

  const logger = pino(
    {
      level,
      formatters: {
        level(label: string) {
          return { level: label };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams),
  );

  return logger;
}
