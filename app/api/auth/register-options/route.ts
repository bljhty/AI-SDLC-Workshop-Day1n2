import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { userDB } from "@/lib/db";
import { getRelyingParty, setChallengeCookie } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";

  if (!username || username.length < 3 || username.length > 32) {
    return NextResponse.json(
      { error: "Username must be 3-32 characters." },
      { status: 400 }
    );
  }

  if (userDB.getByUsername(username)) {
    return NextResponse.json(
      { error: "That username is already registered. Try signing in instead." },
      { status: 409 }
    );
  }

  const { rpID, rpName } = getRelyingParty(request);
  const userID = crypto.getRandomValues(new Uint8Array(16));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: username,
    userID,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await setChallengeCookie({ challenge: options.challenge, username });

  return NextResponse.json(options);
}
