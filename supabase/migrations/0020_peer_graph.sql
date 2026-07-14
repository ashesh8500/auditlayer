-- Peer graph: individual creator rows that populate the peer/comparison
-- section of audit reports. Each row references a wellness_benchmarks parent.
--
-- Idempotent: safe to re-run.

create table if not exists public.peer_graph (
  id               uuid primary key default gen_random_uuid(),
  handle           text not null,
  niche            text not null,
  followers        int not null default 0,
  platform         text not null default 'instagram',
  avg_likes        int not null default 0,
  avg_comments     int not null default 0,
  top_format       text not null default '',
  last_scraped     timestamptz,
  benchmarks_id    uuid not null references public.wellness_benchmarks(id) on delete cascade,
  created_at       timestamptz not null default now(),

  unique(handle, benchmarks_id)
);

-- Fail closed while later policies are installed. Service-role bypasses RLS.
alter table public.peer_graph enable row level security;

comment on table public.peer_graph is
  'Peer creators per niche × bracket. Powers the peer comparison section.';

comment on column public.peer_graph.handle is
  'Social handle (without @), e.g. ''drwilliamli''.';

comment on column public.peer_graph.niche is
  'Wellness sub-niche, denormalised from the parent benchmark for fast queries.';

comment on column public.peer_graph.followers is
  'Follower count at last scrape.';

comment on column public.peer_graph.platform is
  'Platform: instagram, tiktok, youtube, x, linkedin.';

comment on column public.peer_graph.avg_likes is
  'Average likes per post in the last 30 days at time of scrape.';

comment on column public.peer_graph.avg_comments is
  'Average comments per post in the last 30 days at time of scrape.';

comment on column public.peer_graph.top_format is
  'Dominant content format: reel, carousel, static, long-form, thread.';

comment on column public.peer_graph.last_scraped is
  'When this peer''s metrics were last updated from the data source.';

comment on column public.peer_graph.benchmarks_id is
  'FK to the wellness_benchmarks row this peer belongs to.';

create index if not exists peer_graph_benchmarks_id_idx
  on public.peer_graph (benchmarks_id);

create index if not exists peer_graph_niche_idx
  on public.peer_graph (niche);

create index if not exists peer_graph_handle_idx
  on public.peer_graph (handle);
