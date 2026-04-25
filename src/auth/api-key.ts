import { config } from "../config";
import { createHash } from "node:crypto";

/** Validate a legacy global API key (RCS_API_KEYS env var) */
export function validateApiKey(token: string | undefined): boolean {
  if (!token || config.apiKeys.length === 0) return false;
  return config.apiKeys.includes(token);
}

/** Hash an API key with SHA-256 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
