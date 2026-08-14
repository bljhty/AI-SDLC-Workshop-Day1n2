import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { userDB, authenticatorDB } from "@/lib/db";
import { getRelyingParty, setChallengeCookie } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";

  if (!username) {
    return NextResponse.json({ error: "Enter your username." }, { status: 400 });
  }

  const user = userDB.getByUsername(username);
  if (!user) {
    return NextResponse.json(
      { error: "No account found for that username." },
      { status: 404 }
    );
  }

  const authenticators = authenticatorDB.listByUserId(user.id);
  if (authenticators.length === 0) {
    return NextResponse.json(
      { error: "No passkeys registered for this account." },
      { status: 400 }
    );
  }

  const { rpID } = getRelyingParty(request);

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: authenticators.map((a) => ({ id: a.credential_id })),
    userVerification: "preferred",
  });

  await setChallengeCookie({ challenge: options.challenge, username });

  return NextResponse.json(options);
}
