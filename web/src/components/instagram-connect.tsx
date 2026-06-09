"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit?: () => void;
  }
}

interface ConnectedAccount {
  ig_username: string;
  followers_count: number;
  media_count: number;
  account_type: string;
  last_refreshed_at: string;
}

interface Props {
  connectedAccount?: ConnectedAccount | null;
  plan?: string;
  searchParams?: { instagram_connected?: string; instagram_error?: string };
}

export function InstagramConnect({
  connectedAccount,
  plan,
  searchParams,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(
    searchParams?.instagram_connected ?? null,
  );
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    // Initialize FB SDK
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: "1919113942129447",
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setSdkReady(true);
    };
  }, []);

  const handleConnect = useCallback(() => {
    if (!window.FB) {
      setError("Facebook SDK not loaded. Try refreshing the page.");
      return;
    }

    setLoading(true);
    setError(null);

    window.FB.login(
      (response: any) => {
        if (response.authResponse) {
          // Got Facebook access token — send to backend
          const accessToken = response.authResponse.accessToken;
          fetch("/api/auth/instagram/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: accessToken }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.error) {
                setError(data.error);
              } else {
                setSuccess(data.ig_username);
                // Reload to show connected state
                window.location.href = `/dashboard?instagram_connected=${data.ig_username}`;
              }
            })
            .catch(() => setError("Failed to connect. Please try again."))
            .finally(() => setLoading(false));
        } else {
          setError("Login was cancelled or failed.");
          setLoading(false);
        }
      },
      {
        scope: "instagram_basic,pages_show_list",
        return_scopes: true,
      },
    );
  }, []);

  // Connected state
  if (connectedAccount) {
    return (
      <div className="rounded-[var(--radius)] border border-green-200 bg-green-50 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-base leading-none text-green-600">✓</div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-green-900">
              Instagram Connected
            </h3>
            <p className="mt-0.5 text-sm text-green-700">
              @{connectedAccount.ig_username} ·{" "}
              {connectedAccount.followers_count.toLocaleString()} followers ·{" "}
              {connectedAccount.account_type}
            </p>
            <p className="mt-1 text-xs text-green-600/80">
              Connected{" "}
              {new Date(
                connectedAccount.last_refreshed_at,
              ).toLocaleDateString()}
              {" · "}
              Audits for this account will use live metrics from Instagram.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const instagramError = searchParams?.instagram_error;

  return (
    <>
      {/* Facebook SDK */}
      <Script
        src="https://connect.facebook.net/en_US/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.fbAsyncInit?.();
        }}
      />

      <div className="rounded-[var(--radius)] border border-border bg-card p-5">
        <h3 className="font-semibold">Instagram Integration</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Instagram Business or Creator account to get real
          follower counts, engagement metrics, and content data in your audit
          reports — instead of estimated figures.
        </p>

        {/* Qualifying tip */}
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Works with:</strong> Instagram Business and Creator accounts
          connected to a Facebook Page.{" "}
          <strong>Not supported:</strong> Personal Instagram accounts. If you
          don&apos;t have a Business/Creator account, audits will use web
          research and industry benchmarks instead.
        </div>

        {/* Messages */}
        {success && (
          <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            ✓ Connected <strong>@{success}</strong> successfully. Your audits
            will now include live Instagram data.
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {instagramError && (
          <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Connection failed:{" "}
            {instagramError === "permission_denied"
              ? "You denied the permission request. Try again when ready."
              : instagramError === "no_code"
                ? "No authorization code received. Please try again."
                : instagramError === "not_authenticated"
                  ? "You must be signed in to connect Instagram."
                  : instagramError.replace(/_/g, " ")}
          </div>
        )}

        <div className="mt-4">
          <Button
            onClick={handleConnect}
            disabled={loading || !sdkReady}
            className="gap-2 font-medium"
            style={{ background: "#1877F2" }}
          >
            {loading ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Instagram"
            )}
          </Button>
          {!sdkReady && (
            <span className="ml-2 text-xs text-muted-foreground">
              Loading Facebook SDK...
            </span>
          )}
        </div>
      </div>
    </>
  );
}
