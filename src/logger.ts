import pino from "pino";
import fs from "fs";
import path from "path";
import type { EnvConfig } from "./config";

export function initLogger(env: EnvConfig): pino.Logger {
  const level = env.logLevel === "DEBUG" ? "debug" : "info";

  const streams: { stream: pino.DestinationStream }[] = [
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
