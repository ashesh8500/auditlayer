-- Wellness benchmarks: normative engagement/format benchmarks per niche and
-- follower bracket. Powers MOAT scoring and peer comparison in audit reports.
-- One row = one niche × bracket combination (e.g. longevity / 10k-50k).
--
-- Idempotent: safe to re-run.

create table if not exists public.wellness_benchmarks (
  id               uuid primary key default gen_random_uuid(),
  niche            text not null,
  followers_bracket text not null,
  avg_engagement   numeric not null default 0,
  top_formats      jsonb not null default '[]'::jsonb,
  post_freq        text not null default '',
  cta              text not null default '',
  created_at       timestamptz not null default now(),

  unique(niche, followers_bracket)
);

-- Fail closed while later policies are installed. Service-role bypasses RLS.
alter table public.wellness_benchmarks enable row level security;

comment on table public.wellness_benchmarks is
  'Normative engagement/formats per niche and follower bracket. Powers MOAT scoring.';

comment on column public.wellness_benchmarks.niche is
  'Wellness sub-niche: longevity, biohacking, nootropics, functional-medicine, etc.';

comment on column public.wellness_benchmarks.followers_bracket is
  'Follower range bucket: 1k-10k, 10k-50k, 50k-100k, 100k-500k, 500k+.';

comment on column public.wellness_benchmarks.avg_engagement is
  'Average engagement rate (percentage) for this niche × bracket, e.g. 3.2.';

comment on column public.wellness_benchmarks.top_formats is
  'JSON array of top-performing content formats, e.g. ["carousel","reel","long-form"].';

comment on column public.wellness_benchmarks.post_freq is
  'Typical posting frequency for this bracket, e.g. ''3-5x/week''.';

comment on column public.wellness_benchmarks.cta is
  'Most common call-to-action pattern, e.g. ''link in bio → newsletter''.';

create index if not exists wellness_benchmarks_niche_idx
  on public.wellness_benchmarks (niche);

create index if not exists wellness_benchmarks_bracket_idx
  on public.wellness_benchmarks (followers_bracket);
