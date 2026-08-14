"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";

type Mode = "signin" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (mode === "register") {
      platformAuthenticatorIsAvailable().then((available) => {
        if (!cancelled && !available) {
          setWarning(
            "No platform passkey (Windows Hello, Touch ID, etc.) was detected on this device. You can still register using a security key or your phone."
          );
        } else if (!cancelled) {
          setWarning(null);
        }
      });
    } else {
      setWarning(null);
    }
    return () => {
      cancelled = true;
    };
  }, [mode]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const optionsRes = await fetch("/api/auth/register-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const optionsJSON = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsJSON.error || "Registration failed.");

      const attResp = await startRegistration({ optionsJSON });

      const verifyRes = await fetch("/api/auth/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attResp),
      });
      const verifyJSON = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyJSON.error || "Could not verify passkey.");

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const optionsRes = await fetch("/api/auth/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const optionsJSON = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsJSON.error || "Sign-in failed.");

      const authResp = await startAuthentication({ optionsJSON });

      const verifyRes = await fetch("/api/auth/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authResp),
      });
      const verifyJSON = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyJSON.error || "Could not verify passkey.");

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Todo App</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with a passkey — no passwords.</p>
        </div>

        {!supported && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            This browser doesn&apos;t support passkeys (WebAuthn). Try a recent Chrome, Edge, or
            Safari.
          </p>
        )}

        <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              mode === "signin" ? "bg-white shadow dark:bg-slate-700" : "text-slate-500"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
              mode === "register" ? "bg-white shadow dark:bg-slate-700" : "text-slate-500"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={mode === "signin" ? handleSignIn : handleRegister} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username webauthn"
              disabled={busy || !supported}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800"
              placeholder="e.g. alex"
            />
          </div>

          {warning && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {warning}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !supported || !username.trim()}
            className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in with passkey"
                : "Register new passkey"}
          </button>
        </form>
      </div>
    </main>
  );
}

function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError") {
      return "Passkey prompt was cancelled or timed out. Please try again.";
    }
    if (err.name === "InvalidStateError") {
      return "This device already has a passkey registered for this account.";
    }
    return err.message;
  }
  return "Something went wrong. Please try again.";
}
