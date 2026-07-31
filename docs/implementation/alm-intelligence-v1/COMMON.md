# Common invariants

## Product thesis

AuditLayer is a longitudinal intelligence product, not an audit-file generator. A neutral **Subject** represents a person, creator, brand, organization, or project. A subject owns zero or more channels. A one-off public target remains observed and must never appear as managed workspace property unless connected or explicitly promoted.

The visible continuity artifact is the **Living Brief**: identity, vision, audience, offers, positioning, goals, constraints, experiments, and user-confirmed decisions. Every edit creates an immutable version. Models may propose diffs; they may not silently rewrite confirmed identity, vision, goals, or constraints.

## Canonical flow

Subject → Living Brief version → Channels → Evidence snapshot → Intelligence run → Scores/findings/recommendations → Immutable report version.

Every run pins subject context version, methodology version, evidence snapshot, expertise-pack version, prompt version, model configuration hash, and output schema version.

## Production inference policy

- DeepSeek V4 Flash only; no hidden fallback provider.
- Deterministic Python owns retrieval, context projection, fan-out/fan-in, retries, validation, scoring, rendering, persistence, and release checks.
- The model receives typed bounded projections and returns typed analysis data only.
- No model browsing, tools, memory writes, delegation, recursive spawning, section agents, judge loops, or open-ended continuation.
- Skip LLM fan-out for single-channel runs. Multi-channel runs may use at most three channel calls concurrently, followed by one small synthesis.
- Successful channel stages survive downstream retry.
- Exact unchanged evidence may reuse validated analysis only when every cache-key component matches.
- Customer report content, handles, context payloads, credentials, and tracebacks never enter operational telemetry.

## Customer safety and truth

- Connected API metrics are authoritative for connected fields.
- Every factual finding and score rationale resolves to evidence IDs.
- Unavailable data renders `Data needed`, never a punitive zero.
- Score movement names its cause: evidence, brief/lens, methodology, or prior correction.
- Rejected recommendations do not reappear without new evidence.
- Observed targets never appear as managed workspace property.
- Customer progress is an allowlisted projection, never filtered internal logs.

## UI direction

New Audit: choose/create subject → choose/add channels → confirm lens and Living Brief → build atomic batch → submit.

Waiting exposes only Preparing, Analyzing, Finalizing, plus a calm Delayed terminal/recovery state. Customers may leave and return. Internal event types, actors, cache hits, retries, heartbeat, worker names, and tracebacks remain founder-only.

Subject home exposes channels, Living Brief and version history, audit history, evidence-backed progression, recommendations, decisions, and controlled proposals.

## Infrastructure and release

Keep the existing three boxes: Vercel web, Supabase control plane, Hetzner worker. No new hosting platform. Use additive migrations and backfill before readers switch. Existing reports remain retrievable.

Parallel implementation is limited to three isolated worktrees. Only the release gate runs full builds, browser suites, migrations, deployments, and production smoke tests. Production promotion requires explicit Ashesh approval.
