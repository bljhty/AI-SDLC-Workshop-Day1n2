import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { userDB, authenticatorDB } from "@/lib/db";
import { getRelyingParty, getChallengeCookie, clearChallengeCookie } from "@/lib/webauthn";
import { createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RegistrationResponseJSON | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const challengeData = await getChallengeCookie();
  if (!challengeData) {
    return NextResponse.json(
      { error: "Registration session expired. Please try again." },
      { status: 400 }
    );
  }

  if (userDB.getByUsername(challengeData.username)) {
    await clearChallengeCookie();
    return NextResponse.json(
      { error: "That username is already registered. Try signing in instead." },
      { status: 409 }
    );
  }

  const { rpID, origin } = getRelyingParty(request);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Registration verification failed." },
      { status: 400 }
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Could not verify passkey registration." }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;

  const user = userDB.create(challengeData.username);
  authenticatorDB.create({
    user_id: user.id,
    credential_id: credential.id,
    credential_public_key: Buffer.from(credential.publicKey),
    // Real-world pitfall: platform authenticators (Touch ID, Windows Hello)
    // often never report a counter and stay at 0 — always coalesce.
    counter: credential.counter ?? 0,
  });

  await clearChallengeCookie();
  await createSession(user.id, user.username);

  return NextResponse.json({ verified: true, username: user.username });
}
