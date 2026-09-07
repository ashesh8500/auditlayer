"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPassword, type AuthFormState } from "./actions";

const initialState: AuthFormState = { status: "idle" };

export function PasswordLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, initialState);
  return (
    <details className="border-t border-border pt-4">
      <summary className="flex min-h-11 cursor-pointer items-center justify-center text-center text-sm font-medium underline alm-focus">Sign in with a password</summary>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <Label htmlFor="password-email">Email address</Label>
          <Input id="password-email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.status === "error" && <p role="alert" className="text-xs text-[color:var(--red)]">{state.message}</p>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Signing in…" : "Sign in"}</Button>
      </form>
    </details>
  );
}
