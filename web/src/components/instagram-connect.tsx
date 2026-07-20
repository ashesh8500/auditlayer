import { CheckCircle2, ExternalLink, ShieldCheck, Unplug } from "lucide-react";

import { disconnectInstagram } from "@/lib/actions/instagram";
import { Button } from "@/components/ui/button";

interface ConnectedAccount {
  id: string;
  ig_user_id: string | number;
  ig_username: string;
  followers_count: number;
  media_count: number;
  account_type: string;
  long_lived_expires_at: string;
  last_refreshed_at: string;
}

interface Props {
  connectedAccount?: ConnectedAccount | null;
  plan?: string;
  searchParams?: { instagram_connected?: string; instagram_error?: string };
}

function InstagramIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "The connection session expired. Start again from this page.",
  permission_denied: "Instagram access was not approved. Nothing was connected.",
  no_code: "Instagram did not return an authorization code. Please try again.",
  not_authenticated: "Sign in again before connecting Instagram.",
  not_configured: "Instagram connection is temporarily unavailable.",
  instagram_oauth_not_configured: "Instagram connection is temporarily unavailable.",
  instagram_token_exchange_failed: "Instagram could not complete the connection. Please try again.",
  instagram_long_lived_exchange_failed: "Instagram could not create a durable connection. Please try again.",
  instagram_profile_fetch_failed: "We could not read the approved Instagram profile.",
  instagram_professional_account_required:
    "Connect an Instagram Business or Creator account. Personal accounts are not supported by this API.",
  instagram_connection_store_failed: "The account was approved but could not be saved. Please contact support.",
  connection_failed: "Instagram could not be connected. Please try again or contact support.",
};

export function InstagramConnect({ connectedAccount, searchParams }: Props) {
  const instagramError = searchParams?.instagram_error;
  const success = searchParams?.instagram_connected;

  if (connectedAccount) {
    const expiresAt = new Date(connectedAccount.long_lived_expires_at);
    return (
      <section className="alm-panel p-5 sm:p-6" aria-labelledby="instagram-connection-title">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--green-muted)] text-[color:var(--green)]">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="alm-kicker text-[color:var(--green)]">Live Instagram data</p>
              <h2 id="instagram-connection-title" className="mt-1 truncate text-lg font-semibold">
                @{connectedAccount.ig_username} is connected
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {connectedAccount.followers_count.toLocaleString()} followers ·{" "}
                {connectedAccount.media_count.toLocaleString()} posts ·{" "}
                {connectedAccount.account_type === "CREATOR" ? "Creator" : "Business"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Read-only access refreshes report metrics. Authorization expires{" "}
                {expiresAt.toLocaleDateString()} unless renewed by Instagram.
              </p>
            </div>
          </div>
          <form action={disconnectInstagram}>
            <input type="hidden" name="connection_id" value={connectedAccount.id} />
            <Button type="submit" variant="outline" className="min-h-10 w-full sm:w-auto">
              <Unplug className="size-4" />
              Disconnect and delete access
            </Button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="alm-panel p-5 sm:p-6" aria-labelledby="instagram-connection-title">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="alm-kicker">Connected data</p>
          <h2 id="instagram-connection-title" className="mt-2 text-xl font-semibold tracking-tight">
            Connect Instagram for verified metrics
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Approve read-only access to your Instagram Business or Creator account. No Facebook Page is required. AuditLayerMedia reads profile and recent-content metrics for your reports and cannot publish, edit, comment, or message on your behalf.
          </p>
        </div>
        <Button asChild size="lg" className="min-h-11 w-full px-5 lg:w-auto">
          <a href="/api/auth/instagram/start">
            <InstagramIcon />
            Connect Instagram
          </a>
        </Button>
      </div>

      <div className="mt-5 grid gap-3 border-t border-border pt-5 text-xs text-muted-foreground sm:grid-cols-3">
        <p className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[color:var(--accent)]" />Read-only professional-account access</p>
        <p className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[color:var(--accent)]" />Tokens stay server-side and owner-scoped</p>
        <p className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[color:var(--accent)]" />Disconnecting deletes stored access</p>
      </div>

      {success && (
        <p className="mt-4 border border-[color:var(--green)]/20 bg-[color:var(--green-muted)] px-4 py-3 text-sm text-[color:var(--green)]">
          Connected <strong>@{success}</strong>. Future audits for this account can use verified Instagram metrics.
        </p>
      )}
      {instagramError && (
        <p role="alert" className="mt-4 border border-[color:var(--red)]/20 bg-[color:var(--red-muted)] px-4 py-3 text-sm text-[color:var(--red)]">
          {ERROR_MESSAGES[instagramError] ?? ERROR_MESSAGES.connection_failed}
        </p>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <a href="/privacy#instagram-data" className="inline-flex items-center gap-1 hover:text-foreground">
          Instagram data use <ExternalLink className="size-3" />
        </a>
        <a href="/support#instagram" className="inline-flex items-center gap-1 hover:text-foreground">
          Connection help <ExternalLink className="size-3" />
        </a>
      </p>
    </section>
  );
}
