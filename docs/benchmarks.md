# Wellness Benchmarks

MOAT benchmarking data powering the peer comparison and engagement scoring
sections of AuditLayer reports. Two tables:

- **`wellness_benchmarks`** — normative benchmarks per niche × follower bracket.
- **`peer_graph`** — individual creator rows for a given benchmark.

## Schema

```
wellness_benchmarks   1 ──── *   peer_graph
    (niche, bracket)               (handle, niche, metrics)
```

`peer_graph.benchmarks_id` references `wellness_benchmarks.id` with cascade
delete. Unique constraint on `(handle, benchmarks_id)` prevents duplicate peers.
`wellness_benchmarks` is unique on `(niche, followers_bracket)`.

## Niches

| niche | description |
|---|---|
| `longevity` | Anti-aging, lifespan extension, senolytics, NAD+, epigenetics |
| `biohacking` | Self-experimentation, wearables, cold exposure, red light, supplements |
| `nootropics` | Cognitive enhancement, smart drugs, adaptogens, brain health |
| `functional-medicine` | Root-cause medicine, gut health, hormones, detox, labs |
| `sleep-science` | Circadian rhythm, sleep hygiene, chronotypes, sleep tech |
| `metabolic-health` | Blood sugar, insulin resistance, GLP-1, intermittent fasting, CGM |

## Follower brackets

| bracket | typical scale |
|---|---|
| `1k-10k` | Micro-influencer; high engagement, niche authority |
| `10k-50k` | Growing creator; monetisation starting |
| `50k-100k` | Established; consistent brand deals |
| `100k-500k` | Major creator; multiple revenue streams |
| `500k+` | Celebrity-level; broad audience, lower engagement |

## Columns

### wellness_benchmarks

| column | type | description |
|---|---|---|
| `id` | uuid | Primary key |
| `niche` | text | Wellness sub-niche (see Niches above) |
| `followers_bracket` | text | Follower range bucket (see Brackets above) |
| `avg_engagement` | numeric | Average engagement rate (%) for this niche × bracket |
| `top_formats` | jsonb | Array of top-performing content formats (reel, carousel, etc.) |
| `post_freq` | text | Typical posting cadence (e.g. "3-4x/week") |
| `cta` | text | Most common call-to-action pattern |
| `created_at` | timestamptz | Row creation timestamp |

### peer_graph

| column | type | description |
|---|---|---|
| `id` | uuid | Primary key |
| `handle` | text | Social handle without @ (e.g. `drwilliamli`) |
| `niche` | text | Denormalised niche for fast queries |
| `followers` | int | Follower count at last scrape |
| `platform` | text | Platform (instagram, tiktok, youtube, x, linkedin) |
| `avg_likes` | int | Average likes per post (last 30 days) |
| `avg_comments` | int | Average comments per post (last 30 days) |
| `top_format` | text | Dominant content format |
| `last_scraped` | timestamptz | When metrics were last updated |
| `benchmarks_id` | uuid | FK to `wellness_benchmarks.id` |
| `created_at` | timestamptz | Row creation timestamp |

## Access control

| role | wellness_benchmarks | peer_graph |
|---|---|---|
| Anonymous | — | — |
| Authenticated (client) | — | — |
| Authenticated (admin) | ALL | ALL |
| Service role (worker) | ALL (bypasses RLS) | ALL (bypasses RLS) |

The benchmark dataset is proprietary. Admins have full access, and the worker's
service role bypasses RLS. Ordinary authenticated clients cannot query it.

## RPC: `get_benchmarks(niche text, bracket text) → jsonb`

Returns a single JSON object:

```json
{
  "benchmark": { ...wellness_benchmarks row... },
  "peers": [ ...peer_graph rows ordered by avg_likes desc... ]
}
```

Returns `null` if no matching benchmark exists. Called by the Python worker
during the MOAT scoring phase.

## Seed data

Production rows are managed through the admin API/UI. The schema deliberately
does not ship creator metrics as a public repository seed; production data must
be backed up and restored through the Supabase operations workflow.

## Admin API

**Base:** `GET/POST /api/admin/benchmarks`

| method | params | description |
|---|---|---|
| `GET` | — | List all benchmarks (optional `?niche=`) |
| `GET` | `?id=<uuid>` | Single benchmark with nested peers |
| `POST` | JSON body | Create new benchmark |
| `PUT` | `?id=<uuid>` + JSON | Update benchmark fields |
| `DELETE` | `?id=<uuid>` | Delete benchmark (cascade deletes peers) |

All endpoints require authenticated admin (`profiles.role = 'admin'`). Returns
401/403 for non-admins.

## Admin UI

`/admin/benchmarks` — lists all benchmarks in a filterable table. Niche filter
pills at the top; peer counts shown per row. Requires admin login.

## Adding new benchmarks

1. **Admin:** add or update the benchmark through `/admin/benchmarks`.
2. **Peers:** add peer rows through the service-role admin workflow.
3. **Verify:** confirm the worker can fetch the row and that ordinary clients
   receive no rows through RLS.
