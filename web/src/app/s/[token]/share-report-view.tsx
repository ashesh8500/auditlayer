"use client";

import { Brand } from "@/components/brand";
import { useState, useRef } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImmersiveReport } from "@/components/immersive-report";

export function ShareReportView({ token, needsVerification }: {
  token: string; auditHandle?: string; mode?: string; needsVerification: boolean; email?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "verified">(needsVerification ? "email" : "verified");
  const [pending, setPending] = useState<"send" | "verify" | null>(null);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(0);

  async function submit(action: "send_code" | "verify_code") {
    if (busy.current) return;
    if (action === "send_code" && Date.now() < retryAt) {
      setError("Please wait a minute before requesting another code."); return;
    }
    busy.current = true;
    setPending(action === "send_code" ? "send" : "verify");
    setError("");
    try {
      const res = await fetch(`/s/${token}/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, ...(action === "verify_code" ? { code } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Verification failed. Please retry."); return; }
      if (action === "send_code") {
        setStage("code"); setCode(""); setRetryAt(Date.now() + 60_000);
        setNotice("If this email matches the recipient, a code has been sent. Check your inbox and spam folder. Codes expire in 10 minutes.");
      } else if (data.verified === true) {
        setStage("verified");
      } else { setError("Verification was not confirmed. Please retry."); }
    } catch { setError("Network error. Please retry."); }
    finally { busy.current = false; setPending(null); }
  }
  if (stage === "verified") return <ImmersiveReport reportUrl={`/api/share/${token}/report`} backHref="/" backLabel="AuditLayerMedia" />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full min-w-0 max-w-sm py-8">
        <div className="text-center">
          <Mail className="mx-auto size-8 text-[color:var(--accent)]" />
          <h1 className="mt-4 text-lg font-bold tracking-tight">Verify your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">The owner has restricted this report to a specific email. Enter the recipient email to receive a verification code.</p>
        </div>
        {stage === "email" ? (
          <form onSubmit={(e) => { e.preventDefault(); void submit("send_code"); }} className="mt-6 space-y-3">
            <Label htmlFor="verify-email">Your email</Label>
            <Input id="verify-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!pending} className="h-11" />
            <Button type="submit" className="min-h-11 w-full" disabled={!!pending}>{pending === "send" && <Loader2 className="size-4 animate-spin" />}Send code</Button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit("verify_code"); }} className="mt-6 space-y-3" aria-busy={!!pending}>
            <p role="status" className="break-words text-xs text-muted-foreground">{notice}</p>
            <p className="break-all text-xs">{email}</p>
            <Label htmlFor="verify-code">Verification code</Label>
            <Input id="verify-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required disabled={!!pending} className="h-11 text-center text-lg tracking-[0.3em]" autoFocus />
            <Button type="submit" className="min-h-11 w-full" disabled={!!pending || code.length !== 6}>{pending === "verify" && <Loader2 className="size-4 animate-spin" />}Verify</Button>
            <Button type="button" variant="outline" className="min-h-11 w-full" disabled={!!pending} onClick={() => void submit("send_code")}>Resend code</Button>
            <button type="button" disabled={!!pending} onClick={() => { setStage("email"); setError(""); setCode(""); }} className="min-h-11 w-full text-xs text-muted-foreground hover:underline focus-visible:outline-2">Use a different email</button>
          </form>
        )}
        {error && <p role="alert" className="mt-3 break-words text-xs text-[color:var(--red)]">{error}</p>}
        <div className="mt-6 text-center"><Brand /></div>
        <div className="mt-2 text-center text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Powered by AuditLayerMedia</div>
      </div>
    </div>
  );
}
