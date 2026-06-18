"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitSupportRequest, type SupportState } from "./actions";

const initial: SupportState = { status: "idle" };

export function SupportForm() {
  const [state, action, pending] = useActionState(submitSupportRequest, initial);

  if (state.status === "ok") {
    return (
      <div className="space-y-3 py-4 text-center">
        <p className="font-medium text-[color:var(--green)]">Message sent</p>
        <p className="text-sm text-muted-foreground">
          We'll get back to you within 24 hours. If it's urgent, email{" "}
          <a
            href="mailto:support@auditlayermedia.com"
            className="text-[color:var(--accent)] hover:underline"
          >
            support@auditlayermedia.com
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Your email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          required
          placeholder="Billing question, report issue, etc."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          name="message"
          required
          rows={4}
          placeholder="Describe what's happening. Include your handle if it's about a report."
          className="w-full rounded-[var(--radius)] border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20"
        />
      </div>

      {state.status === "error" && state.message && (
        <p className="text-xs text-[color:var(--red)]">{state.message}</p>
      )}

      <Button type="submit" disabled={pending} className="font-medium">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Send message
      </Button>
    </form>
  );
}
