import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InstagramConnect, InstagramConnectionFeedback } from "@/components/instagram-connect";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INSTAGRAM_CONNECTION_CARD_FIELDS, type InstagramConnectionCard } from "@/lib/instagram-connection-public";
import { CONNECTION_ID_PATTERN, safeInstagramReturnPath } from "@/lib/instagram-oauth-url";

export const metadata = { title: "Connections — AuditLayerMedia" };
const PAGE_SIZE = 24;

export default async function ConnectionsPage({ searchParams }: {
  searchParams: Promise<{ page?: string; connection_id?: string; return_to?: string; instagram_connected?: string; instagram_error?: string; disconnected?: string }>;
}) {
  const [profile, params] = await Promise.all([requireProfile(), searchParams]);
  const page = /^\d{1,6}$/.test(params.page ?? "") ? Math.max(1, Number(params.page)) : 1;
  const returnTo = safeInstagramReturnPath(params.return_to);
  const supabase = await createClient();
  const { data, error, count } = await supabase.from("instagram_connections")
    .select(INSTAGRAM_CONNECTION_CARD_FIELDS, { count: "exact" })
    .eq("user_id", profile.id).order("created_at", { ascending: false }).order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const connections = (data ?? []) as InstagramConnectionCard[];
  let target: InstagramConnectionCard | null = connections.find(connection => connection.id === params.connection_id) ?? null;
  if (params.connection_id && !target && CONNECTION_ID_PATTERN.test(params.connection_id)) {
    const result = await supabase.from("instagram_connections").select(INSTAGRAM_CONNECTION_CARD_FIELDS)
      .eq("user_id", profile.id).eq("id", params.connection_id).maybeSingle();
    if (!result.error) target = result.data as InstagramConnectionCard | null;
  }
  const pageHref = (next: number) => `/settings/connections?${new URLSearchParams({ page: String(next), ...(params.return_to ? { return_to: returnTo } : {}) })}`;

  return <main className="alm-shell py-8 sm:py-12 animate-page-in">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-7">
      <div><p className="alm-kicker">Account settings</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Connections</h1><p className="mt-2 text-sm text-muted-foreground">Manage Instagram access for your accounts.</p></div>
      <Button asChild><a className="alm-focus inline-flex min-h-11 items-center" href={`/api/auth/instagram/start?${new URLSearchParams({ return_to: returnTo })}`}>Add Instagram</a></Button>
    </div>
    <InstagramConnectionFeedback searchParams={params} />
    {params.connection_id && !target && <p role="alert" className="mb-4 text-sm text-muted-foreground">This connection is no longer available. Select an account below or add Instagram again.</p>}
    {target && <section className="mb-6"><p className="alm-kicker mb-3">Selected connection</p><InstagramConnect connectedAccount={target} returnTo={returnTo} /></section>}
    {params.disconnected === "1" && <p role="status" className="mb-4 text-sm text-muted-foreground">Stored Instagram access deleted. Your subjects and report history are retained.</p>}
    {returnTo !== "/settings/connections" && <Link href={returnTo} className="mb-5 inline-block text-sm text-[color:var(--accent)]">Return to Previous Page</Link>}
    {error ? <section className="alm-panel p-6" role="alert"><h2 className="text-lg font-semibold">Connections could not be loaded</h2><p className="mt-2 text-sm text-muted-foreground">Please try again. Your stored access has not changed.</p><Link href="/settings/connections" className="mt-4 inline-block text-[color:var(--accent)]">Try Again</Link></section> : <>
      <p className="mb-4 text-sm text-muted-foreground">{count ?? connections.length} {(count ?? connections.length) === 1 ? "connection" : "connections"}</p>
      {connections.length === 0 && page === 1 ? <InstagramConnect returnTo={returnTo} /> : <div className="space-y-4">{connections.filter(connection => connection.id !== target?.id).map(connection => <InstagramConnect key={connection.id} connectedAccount={connection} returnTo={returnTo} />)}</div>}
      {connections.length === 0 && page > 1 && <p className="text-sm text-muted-foreground">No connections on this page.</p>}
      {(page > 1 || (count !== null && page * PAGE_SIZE < count)) && <nav aria-label="Connection pages" className="mt-6 flex flex-wrap items-center gap-4 text-sm">
        {page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {count !== null && page * PAGE_SIZE < count && <Link href={pageHref(page + 1)}>Next</Link>}
      </nav>}
           </>}
    <section className="alm-panel mt-8 p-6"><h2 className="text-lg font-semibold">AI apps</h2><p className="mt-2 text-sm text-muted-foreground">AI app grants let external assistants read authorized workspace content, including reports. Manage those permissions separately from Instagram connections.</p><Link href="/settings/ai-connections" className="mt-4 inline-block text-sm font-semibold text-[color:var(--accent)]">Manage AI App Grants</Link></section>
    <p className="mt-6 text-xs leading-5 text-muted-foreground">Disconnecting deletes stored Instagram access without deleting subjects or report history. <Link href="/privacy#instagram-data" className="underline">Instagram data use</Link> · <Link href="/support#instagram" className="underline">Connection help</Link></p>
  </main>;
}
