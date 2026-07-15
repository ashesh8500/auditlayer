"use client";

import { useState, useActionState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImmersiveReport } from "@/components/immersive-report";

type VerificationStatus = "idle" | "sending" | "sent" | "verifying" | "error" | "verified";

export function ShareReportView({
  token,
  auditHandle,
  mode,
  needsVerification,
  email: linkEmail,
}: {
  token: string;
  auditHandle: string;
  mode: string;
  needsVerification: boolean;
  email: string | null;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [vStatus, setVStatus] = useState<VerificationStatus>(
    needsVerification ? "idle" : "verified"
  );
  const [vEmail, setVEmail] = useState("");
  const [vError, setVError] = useState("");

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setVStatus("sending");
    setVError("");

    try {
      const res = await fetch(`/s/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_code", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVError(data.error ?? "Failed to send code.");
        setVStatus("error");
      } else {
        setVEmail(email);
        setVStatus("sent");
      }
    } catch {
      setVError("Network error.");
      setVStatus("error");
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code || vStatus !== "sent") return;
    setVStatus("verifying");
    setVError("");

    try {
      const res = await fetch(`/s/${token}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify_code",
          email: vEmail,
          code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVError(data.error ?? "Invalid code.");
        setVStatus("error");
      } else {
        setVStatus("verified");
      }
    } catch {
      setVError("Network error.");
      setVStatus("error");
    }
  }

  // Show email verification UI
  if (vStatus !== "verified") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <Mail className="mx-auto size-8 text-[color:var(--accent)]" />
            <h1 className="mt-4 text-lg font-bold tracking-tight">
              Verify your email
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The owner has restricted this report to{" "}
              <span className="font-medium text-foreground">
                {linkEmail ?? "a specific email"}
              </span>
              . Enter your email to receive a verification code.
            </p>
          </div>

          {/* Send code form */}
          {vStatus !== "sent" && (
            <form onSubmit={handleSendCode} className="mt-6 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="verify-email">Your email</Label>
                <Input
                  id="verify-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-10"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={vStatus === "sending"}
              >
                {vStatus === "sending" && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Send code
              </Button>
              {vError && (
                <p className="text-xs text-[color:var(--red)]">{vError}</p>
              )}
            </form>
          )}

          {/* Verify code form */}
          {vStatus === "sent" && (() => {
            const isVerifying = (vStatus as string) === "verifying";
            return (
            <form onSubmit={handleVerifyCode} className="mt-6 space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                A 6-digit code was sent to{" "}
                <span className="font-medium">{vEmail}</span>
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="verify-code">Verification code</Label>
                <Input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                  className="h-10 text-center text-lg tracking-[0.3em]"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isVerifying || code.length < 6}
              >
                {isVerifying && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Verify
              </Button>
              {vError && (
                <p className="text-xs text-[color:var(--red)]">{vError}</p>
              )}
              <button
                type="button"
                onClick={() => { setVStatus("idle"); setVError(""); }}
                className="w-full text-xs text-muted-foreground hover:underline"
              >
                ← Use a different email
              </button>
            </form>
            );
          })()}

          <div className="mt-10 text-center text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Powered by AuditLayerMedia
          </div>
        </div>
      </div>
    );
  }

  // Show immersive report
  return (
    <ImmersiveReport
      reportUrl={`/api/share/${token}/report`}
      backHref="/"
      backLabel="AuditLayerMedia"
    />
  );
}
