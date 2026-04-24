export const config = {
  version: process.env.RCS_VERSION || "0.1.0",
  port: parseInt(process.env.RCS_PORT || "3000"),
  host: process.env.RCS_HOST || "0.0.0.0",
  baseUrl: process.env.RCS_BASE_URL || "",
  /** Legacy global API keys (RCS_API_KEYS env). Supported for backward compatibility
   *  with acp-link's ACP_RCS_TOKEN. Per-user API keys in SQLite take priority. */
  apiKeys: (process.env.RCS_API_KEYS || "").split(",").filter(Boolean),
  pollTimeout: parseInt(process.env.RCS_POLL_TIMEOUT || "8"),
  heartbeatInterval: parseInt(process.env.RCS_HEARTBEAT_INTERVAL || "20"),
  /** Bun WebSocket idle timeout (seconds). Bun sends protocol-level pings after
   *  this many seconds of no received data. Must be shorter than any reverse
   *  proxy's idle timeout (nginx default 60s, Cloudflare 100s). Default 30s. */
  wsIdleTimeout: parseInt(process.env.RCS_WS_IDLE_TIMEOUT || "30"),
  /** Server→client keep_alive data-frame interval (seconds). Keeps reverse
   *  proxies from closing idle connections. Default 20s. */
  wsKeepaliveInterval: parseInt(process.env.RCS_WS_KEEPALIVE_INTERVAL || "20"),
} as const;

export function getBaseUrl(): string {
  const url = config.baseUrl || `http://localhost:${config.port}`;
  return url.replace(/\/+$/, "");
}
