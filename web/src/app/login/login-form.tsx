"use client";

import { useActionState } from "react";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithGoogle,
  signInWithMagicLink,
  type AuthFormState,
} from "./actions";

const initialState: AuthFormState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(
    signInWithMagicLink,
    initialState,
  );

  return (
    <div className="space-y-6">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="w-full font-medium"
        >
          <GoogleGlyph />
          Continue with Google
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>

      {state.status === "sent" ? (
        <div className="rounded-[var(--radius)] border border-[color:var(--green)]/30 bg-[color:var(--green-muted)] px-4 py-5 text-center">
          <Mail className="mx-auto mb-2 size-5 text-[color:var(--green)]" />
          <p className="text-sm font-medium text-[color:var(--green)]">
            {state.message}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The link expires shortly and can only be used once.
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-1.5 text-left">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              aria-invalid={state.status === "error"}
            />
          </div>
          {state.status === "error" && state.message && (
            <p className="text-xs text-[color:var(--red)]">{state.message}</p>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={pending}
            className="w-full font-medium"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Send magic link
          </Button>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        First audit is free. No credit card required.
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
