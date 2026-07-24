const pino = require("pino");
const fs = require("fs");
const path = require("path");

export function initLogger(env: any): any {
  const level = env.logLevel === "DEBUG" ? "debug" : "info";

  const streams: any[] = [
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
