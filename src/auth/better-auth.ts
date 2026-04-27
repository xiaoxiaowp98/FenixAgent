import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getBaseUrl } from "../config";
import { db } from "../db";
import * as schema from "../db/schema";

const authBaseUrl = (process.env.BETTER_AUTH_URL || getBaseUrl()).replace(/\/+$/, "");
const trustedOrigins = Array.from(new Set([
  "http://localhost:5173",
  new URL(authBaseUrl).origin,
]));

export const auth = betterAuth({
  baseURL: authBaseUrl,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh once per day
  },
  trustedOrigins,
});
