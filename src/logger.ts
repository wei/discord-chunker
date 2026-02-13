import { USER_AGENT } from "./types";

const [service = "unknown", serviceVersion = "unknown"] = USER_AGENT.split("/");

type LogLevel = "info" | "error";

function emit(level: LogLevel, event: Record<string, unknown>): void {
  const payload = {
    ...event,
    timestamp: new Date().toISOString(),
    level,
    service,
    service_version: serviceVersion,
    service_user_agent: USER_AGENT,
    runtime: "cloudflare-workers",
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}

export function logInfo(event: Record<string, unknown>): void {
  emit("info", event);
}

export function logError(event: Record<string, unknown>): void {
  emit("error", event);
}
