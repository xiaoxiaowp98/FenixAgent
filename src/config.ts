const _defaultConfig = {
  version: process.env.RCS_VERSION || "0.1.0",
  port: parseInt(process.env.RCS_PORT || "3000"),
  host: process.env.RCS_HOST || "0.0.0.0",
  baseUrl: process.env.RCS_BASE_URL || "",
  pollTimeout: parseInt(process.env.RCS_POLL_TIMEOUT || "8"),
  heartbeatInterval: parseInt(process.env.RCS_HEARTBEAT_INTERVAL || "20"),
  /** Bun WebSocket idle timeout (seconds). Bun sends protocol-level pings after
   *  this many seconds of no received data. Set higher than
   *  wsKeepaliveInterval * 3 so that application-level keepalive detects dead
   *  connections before Bun closes them. Default 255s (Bun's built-in default). */
  wsIdleTimeout: parseInt(process.env.RCS_WS_IDLE_TIMEOUT || "255"),
  /** Server→client keep_alive data-frame interval (seconds). Keeps reverse
   *  proxies from closing idle connections. Default 20s. */
  wsKeepaliveInterval: parseInt(process.env.RCS_WS_KEEPALIVE_INTERVAL || "20"),
  /** Disconnect timeout (seconds). Environments/sessions with no activity for
   *  this long are considered disconnected. Default 120s. */
  disconnectTimeout: parseInt(process.env.RCS_DISCONNECT_TIMEOUT || "120"),
  /** JWT expiration time in seconds for worker tokens. Default 3600s (1 hour). */
  jwtExpiresIn: parseInt(process.env.RCS_JWT_EXPIRES_IN || "3600"),
  /** acpx-g workflow engine URL for reverse proxy. */
  acpxGUrl: process.env.ACPX_G_URL || "http://localhost:8848",
  /** Knowledge provider selection. Phase 1 supports OpenViking only. */
  knowledgeProvider: process.env.RCS_KNOWLEDGE_PROVIDER || "openviking",
  /** Knowledge provider HTTP base URL. */
  knowledgeBaseUrl: process.env.RCS_KNOWLEDGE_BASE_URL || "http://localhost:8090",
  /** Optional shared API key for the knowledge provider. */
  knowledgeApiKey: process.env.RCS_KNOWLEDGE_API_KEY || "",
  /** Timeout in milliseconds for knowledge provider requests. */
  knowledgeRequestTimeoutMs: parseInt(process.env.RCS_KNOWLEDGE_REQUEST_TIMEOUT_MS || "15000"),
  /** S3-compatible object storage (RustFS / MinIO / AWS S3). */
  s3: {
    enabled: process.env.RCS_S3_ENABLED === "true",
    endpoint: process.env.RCS_S3_ENDPOINT || "http://localhost:9000",
    region: process.env.RCS_S3_REGION || "us-east-1",
    accessKey: process.env.RCS_S3_ACCESS_KEY || "",
    secretKey: process.env.RCS_S3_SECRET_KEY || "",
    bucketSessions: process.env.RCS_S3_BUCKET_SESSIONS || "rcs-sessions",
    bucketAssets: process.env.RCS_S3_BUCKET_ASSETS || "rcs-assets",
    presignExpires: parseInt(process.env.RCS_S3_PRESIGN_EXPIRES || "3600"),
    presignUploadExpires: parseInt(process.env.RCS_S3_PRESIGN_UPLOAD_EXPIRES || "600"),
  },
};

export type AppConfig = typeof _defaultConfig;

/** 可替换的配置实例（测试时覆盖） */
export let config: AppConfig = _defaultConfig;

/** 测试用：注入自定义配置 */
export function setConfig(c: Partial<AppConfig>) {
  config = { ..._defaultConfig, ...c, s3: { ..._defaultConfig.s3, ...c.s3 } } as AppConfig;
}

/** 测试用：恢复默认配置 */
export function resetConfig() {
  config = _defaultConfig;
}

export function getBaseUrl(): string {
  const url = config.baseUrl || `http://localhost:${config.port}`;
  return url.replace(/\/+$/, "");
}
