import { redirect } from "next/navigation";
import { Bot, Database, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { approveMcpAuthorization, denyMcpAuthorization } from "./actions";

export const metadata = { title: "Connect AI • AuditLayerMedia" };
export const dynamic = "force-dynamic";

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) redirect("/accounts");

  const user = await getSession();
  if (!user) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return <ConsentError message="This connection request is invalid or has expired." />;
  }
  if ("redirect_url" in details) redirect(details.redirect_url);

  const { data: accounts } = await (supabase as any)
    .from("accounts")
    .select("id,handle,platform")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[var(--shadow-md)]">
        <div className="border-b border-border bg-[color:var(--accent-muted)] px-6 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-card text-[color:var(--accent)] shadow-[var(--shadow)]">
              <Bot className="size-5" />
            </span>
            <div>
              <p className="alm-kicker">AI connection</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Connect {details.client.name}</h1>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-7 sm:px-8">
          <p className="text-sm leading-6 text-muted-foreground">
            This gives {details.client.name} read access to your AuditLayerMedia intelligence. It cannot publish content, change your account, or access Instagram credentials.
          </p>

          <section className="rounded-[var(--radius)] border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Database className="size-4 text-[color:var(--accent)]" />
              Included data
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Connected Instagram metrics and freshness</li>
              <li>Audit artifacts and historical progression</li>
              <li>Research snapshots and methodology versions</li>
            </ul>
          </section>

          <section className="rounded-[var(--radius)] border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-[color:var(--green)]" />
              Accounts available
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {(accounts ?? []).length ? (
                (accounts ?? []).map((account: { id: string; handle: string; platform: string }) => (
                  <li key={account.id}>@{account.handle}, {account.platform}</li>
                ))
              ) : (
                <li>No tracked accounts yet</li>
              )}
            </ul>
          </section>

          <p className="text-xs leading-5 text-muted-foreground">
            Requested permissions: {details.scope || "basic account access"}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <form action={denyMcpAuthorization}>
              <input type="hidden" name="authorization_id" value={authorizationId} />
              <Button type="submit" variant="outline" size="lg" className="w-full">Cancel</Button>
            </form>
            <form action={approveMcpAuthorization}>
              <input type="hidden" name="authorization_id" value={authorizationId} />
              <Button type="submit" size="lg" className="w-full">Allow Connection</Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md rounded-[var(--radius)] border border-border bg-card p-8 text-center shadow-[var(--shadow)]">
        <h1 className="text-xl font-semibold">Connection unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
