// Edge-safe session primitives — no `next/headers`, no `lib/db` value import,
// so this module can be imported from `middleware.ts` (edge runtime) as well
// as from `lib/auth.ts` (Node runtime, route handlers).
import { SignJWT, jwtVerify } from "jose";
import type { Session } from "./db";

export const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const SESSION_MAX_AGE = SESSION_DURATION_SECONDS;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: number, username: string): Promise<string> {
  return new SignJWT({ userId, username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.userId !== "number" || typeof payload.username !== "string") {
      return null;
    }
    return { userId: payload.userId, username: payload.username };
  } catch {
    return null;
  }
}
