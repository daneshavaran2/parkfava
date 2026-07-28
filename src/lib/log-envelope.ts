// Structured log envelope. Never include access tokens, service role keys,
// or PII (email/phone) in `meta`. `user_id` must be a UUID or "anon".
import { getRequestId } from "./request-context";

export type LogLevel = "info" | "warn" | "error";

export type LogEnvelope = {
  ts: string;
  level: LogLevel;
  request_id: string;
  route?: string;
  user_id?: string;
  event: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type LogInput = Omit<LogEnvelope, "ts" | "request_id"> & {
  request_id?: string;
};

// In-memory ring buffer, enabled only when LOG_SINK=memory. Never enable in
// production — it retains log lines that would otherwise be flushed to stdout.
const MEMORY_SINK_ENABLED = process.env.LOG_SINK === "memory";
const MEMORY_BUFFER: LogEnvelope[] = [];
const MEMORY_MAX = 100;

export function _drainLogs(): LogEnvelope[] {
  const copy = MEMORY_BUFFER.slice();
  MEMORY_BUFFER.length = 0;
  return copy;
}

function emit(input: LogInput): void {
  const envelope: LogEnvelope = {
    ts: new Date().toISOString(),
    request_id: input.request_id ?? getRequestId() ?? "unknown",
    level: input.level,
    event: input.event,
    message: input.message,
    ...(input.route ? { route: input.route } : {}),
    ...(input.user_id ? { user_id: input.user_id } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  };
  if (MEMORY_SINK_ENABLED) {
    MEMORY_BUFFER.push(envelope);
    if (MEMORY_BUFFER.length > MEMORY_MAX) MEMORY_BUFFER.shift();
  }
  const line = JSON.stringify(envelope);
  if (input.level === "error") console.error(line);
  else if (input.level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(input: Omit<LogInput, "level">): void {
  emit({ ...input, level: "info" });
}
export function logWarn(input: Omit<LogInput, "level">): void {
  emit({ ...input, level: "warn" });
}
export function logError(input: Omit<LogInput, "level">): void {
  emit({ ...input, level: "error" });
}
