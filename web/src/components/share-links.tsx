"use client";

import { useActionState, useState } from "react";
import { shareLinkStatus } from "@/lib/share-link-public";
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

  const [copyStatus, setCopyStatus] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  async function copyToClipboard(text: string) {
    try { await navigator.clipboard.writeText(text); setCopyStatus("Link copied."); setCopyFallback(""); }
    catch { setCopyStatus("Copy failed. Select and copy the link below."); setCopyFallback(text); }
  }
  const activeLinks = links.filter((l) => shareLinkStatus(l) === "active");
  const revokedLinks = links.filter((l) => shareLinkStatus(l) !== "active");

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

          <div className="min-w-0 flex-1 space-y-1.5">
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
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-[color:var(--green-muted)] px-3 py-2">
            <span className="min-w-0 break-all text-xs font-mono text-[color:var(--green)]">
              {shareUrl(createState.link.token)}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(shareUrl(createState.link!.token))}
              className="ml-auto flex min-h-11 min-w-11 items-center justify-center gap-1 text-xs text-[color:var(--green)] hover:underline focus-visible:outline-2"
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
                  <span className="min-w-0 break-all font-mono text-xs">
                    /s/{link.token}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {link.mode}
                  </span>
                </div>
                {link.mode === "email" && link.email && (
                  <p className="mt-0.5 break-all text-[10px] text-muted-foreground">
                    {link.email}{" "}
                    — email verification required
                  </p>
                )}
                <p className="mt-0.5 break-all text-[10px] text-muted-foreground">
                  {link.view_count} view{link.view_count !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(shareUrl(link.token))}
                  className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2"
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
                    className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-[color:var(--red)] focus-visible:outline-2"
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
            {revokedLinks.length} inactive link
            {revokedLinks.length !== 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1">
            {revokedLinks.map((link) => (
              <li
                key={link.id}
                className="break-all text-[10px] text-muted-foreground"
              >
                /s/{link.token} — {link.mode} — {shareLinkStatus(link)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p role="status" className="mt-2 break-words text-xs text-muted-foreground">{copyStatus || (revokeState.status === "ok" ? revokeState.message : "")}</p>
      {copyFallback && <textarea aria-label="Share link to copy" readOnly value={copyFallback} onFocus={(event) => event.target.select()} className="mt-2 min-h-20 w-full min-w-0 break-all rounded border p-2 text-xs" />}
      {revokeState.status === "error" && (
        <p className="mt-2 text-xs text-[color:var(--red)]">
          {revokeState.message}
        </p>
      )}
    </section>
  );
}
