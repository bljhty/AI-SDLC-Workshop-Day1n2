import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

const CHALLENGE_COOKIE_NAME = "webauthn_challenge";
const CHALLENGE_MAX_AGE = 60 * 5; // 5 minutes — just long enough for one round trip

export interface ChallengeData {
  challenge: string;
  username: string;
}

/**
 * Derives the WebAuthn relying-party ID/origin from the actual request host
 * rather than a hardcoded value. A hardcoded `localhost` breaks the moment
 * the app is reached over a LAN IP or a different hostname (the real-world
 * bug this fixes on Windows, where `127.0.0.1` vs `localhost` mismatches are
 * common) — the RP ID must match what the browser considers the page's host.
 */
export function getRelyingParty(request: NextRequest): {
  rpID: string;
  rpName: string;
  origin: string;
} {
  const url = new URL(request.url);
  return { rpID: url.hostname, rpName: "Todo App", origin: url.origin };
}

export async function setChallengeCookie(data: ChallengeData): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE_NAME, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_MAX_AGE,
  });
}

export async function getChallengeCookie(): Promise<ChallengeData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CHALLENGE_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChallengeData;
  } catch {
    return null;
  }
}

export async function clearChallengeCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CHALLENGE_COOKIE_NAME);
}
