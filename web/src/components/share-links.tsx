"use client";

import { useActionState } from "react";
import { Copy, Link2, Lock, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createShareLink,
  revokeShareLink,
  type ShareActionState,
  type ShareLinkRow,
} from "@/lib/actions/shares";

const initial: ShareActionState = { status: "idle" };

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function shareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}

export function ShareLinks({
  auditId,
  links,
}: {
  auditId: string;
  links: ShareLinkRow[];
}) {
  const [createState, createAction, creating] = useActionState(
    createShareLink,
    initial
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    revokeShareLink,
    initial
  );

  const activeLinks = links.filter((l) => !l.revoked_at);
  const revokedLinks = links.filter((l) => l.revoked_at);

  return (
    <section className="rounded-[var(--radius)] border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-[color:var(--accent)]" />
        <h3 className="text-sm font-semibold">Share</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Generate a link to share this report. Public links work for anyone.
        Email-gated links require the recipient to verify their email first.
      </p>

      {/* Create form */}
      <form action={createAction} className="mt-4 space-y-3">
        <input type="hidden" name="auditId" value={auditId} />

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="share-mode" className="text-xs">
              Access
            </Label>
            <select
              id="share-mode"
              name="mode"
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
              defaultValue="public"
            >
              <option value="public">Anyone with the link</option>
              <option value="email">Specific email</option>
            </select>
          </div>

          <div className="flex-1 space-y-1.5">
            <Label htmlFor="share-email" className="text-xs">
              Email (for email-gated)
            </Label>
            <Input
              id="share-email"
              name="email"
              type="email"
              placeholder="recipient@example.com"
              className="h-9"
            />
          </div>

          <Button type="submit" size="sm" disabled={creating}>
            {creating ? "Creating…" : "Generate link"}
          </Button>
        </div>

        {createState.status === "error" && (
          <p className="text-xs text-[color:var(--red)]">
            {createState.message}
          </p>
        )}
        {createState.status === "ok" && createState.link && (
          <div className="flex items-center gap-2 rounded-md bg-[color:var(--green-muted)] px-3 py-2">
            <span className="text-xs font-mono text-[color:var(--green)]">
              {shareUrl(createState.link.token)}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(shareUrl(createState.link!.token))}
              className="ml-auto flex items-center gap-1 text-xs text-[color:var(--green)] hover:underline"
            >
              <Copy className="size-3" />
              Copy
            </button>
          </div>
        )}
      </form>

      {/* Active links */}
      {activeLinks.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-border pt-4">
          {activeLinks.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {link.mode === "public" ? (
                    <Users className="size-3.5 text-muted-foreground" />
                  ) : (
                    <Lock className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="font-mono text-xs">
                    /s/{link.token}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {link.mode}
                  </span>
                </div>
                {link.mode === "email" && link.email && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {link.email}{" "}
                    {link.verified_at ? "✓ verified" : "— pending"}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {link.view_count} view{link.view_count !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(shareUrl(link.token))}
                  className="text-muted-foreground hover:text-foreground"
                  title="Copy link"
                >
                  <Copy className="size-3.5" />
                </button>

                <form action={revokeAction}>
                  <input type="hidden" name="linkId" value={link.id} />
                  <input type="hidden" name="auditId" value={auditId} />
                  <button
                    type="submit"
                    disabled={revoking}
                    className="text-muted-foreground hover:text-[color:var(--red)]"
                    title="Revoke link"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Revoked links (collapsed) */}
      {revokedLinks.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[10px] text-muted-foreground">
            {revokedLinks.length} revoked link
            {revokedLinks.length !== 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1">
            {revokedLinks.map((link) => (
              <li
                key={link.id}
                className="text-[10px] text-muted-foreground line-through"
              >
                /s/{link.token} — {link.mode}
              </li>
            ))}
          </ul>
        </details>
      )}

      {revokeState.status === "error" && (
        <p className="mt-2 text-xs text-[color:var(--red)]">
          {revokeState.message}
        </p>
      )}
    </section>
  );
}
