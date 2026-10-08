import { randomUUID } from "node:crypto";

import pino, { type DestinationStream, type LevelWithSilent } from "pino";
import { pinoHttp } from "pino-http";

import { env } from "../env";

// An inbound X-Request-Id is trusted only in this shape, so a caller cannot
// inject line breaks or huge values into the logs (T-05-02).
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export function pickRequestId(inbound: unknown): string {
  if (typeof inbound === "string" && REQUEST_ID_PATTERN.test(inbound)) {
    return inbound;
  }
  return randomUUID();
}

const defaultLevel: LevelWithSilent = env.NODE_ENV === "test" ? "silent" : "info";

interface LoggerOptions {
  // Tests pass a stream and a level to read what was logged.
  destination?: DestinationStream;
  level?: LevelWithSilent;
}

function buildLogger({ destination, level = defaultLevel }: LoggerOptions = {}) {
  const options = {
    level,
    // Secrets never reach the log output (T-05-03). Request bodies are not logged at all.
    redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
  };
  if (destination) {
    return pino(options, destination);
  }
  // JSON lines by default; readable output only while developing.
  if (env.NODE_ENV === "development") {
    return pino({ ...options, transport: { target: "pino-pretty" } });
  }
  return pino(options);
}

// For logging outside a request (start-up, scripts).
export const logger = buildLogger();

function httpLoggerFor(baseLogger: pino.Logger) {
  return pinoHttp({
    logger: baseLogger,
    // One request id per request: returned in the header and written on the log line.
    genReqId: (req, res) => {
      const id = pickRequestId(req.headers["x-request-id"]);
      res.setHeader("X-Request-Id", id);
      return id;
    },
  });
}

// One JSON line per request (pino-http default), carrying the request id.
export const httpLogger = httpLoggerFor(logger);

// Same as httpLogger, but writing to a stream the caller supplies. Used by tests.
export function createHttpLogger(loggerOptions?: LoggerOptions) {
  return loggerOptions ? httpLoggerFor(buildLogger(loggerOptions)) : httpLogger;
}
