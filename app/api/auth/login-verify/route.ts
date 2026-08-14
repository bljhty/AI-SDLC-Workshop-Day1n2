import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { userDB, authenticatorDB } from "@/lib/db";
import { getRelyingParty, getChallengeCookie, clearChallengeCookie } from "@/lib/webauthn";
import { createSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const challengeData = await getChallengeCookie();
  if (!challengeData) {
    return NextResponse.json(
      { error: "Sign-in session expired. Please try again." },
      { status: 400 }
    );
  }

  const user = userDB.getByUsername(challengeData.username);
  if (!user) {
    await clearChallengeCookie();
    return NextResponse.json({ error: "No account found for that username." }, { status: 400 });
  }

  const authenticator = authenticatorDB.getByCredentialId(body.id);
  if (!authenticator || authenticator.user_id !== user.id) {
    return NextResponse.json({ error: "Passkey not recognized for this account." }, { status: 400 });
  }

  const { rpID, origin } = getRelyingParty(request);
  const storedCounter = authenticator.counter ?? 0;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credential_id,
        publicKey: new Uint8Array(authenticator.credential_public_key),
        counter: storedCounter,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sign-in verification failed." },
      { status: 400 }
    );
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Could not verify passkey sign-in." }, { status: 400 });
  }

  const newCounter = verification.authenticationInfo.newCounter ?? 0;
  const bothZero = storedCounter === 0 && newCounter === 0;
  if (!bothZero && newCounter <= storedCounter) {
    // Counter didn't advance — classic sign of a cloned authenticator.
    return NextResponse.json(
      { error: "This passkey failed a security check. Please try again or re-register." },
      { status: 400 }
    );
  }

  authenticatorDB.updateCounter(authenticator.id, newCounter);
  await clearChallengeCookie();
  await createSession(user.id, user.username);

  return NextResponse.json({ verified: true, username: user.username });
}
