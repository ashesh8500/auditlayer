# Non-goals

- No graph database, crawler fleet, new queue service, or new hosting platform.
- No **vector-memory layer as system of record** (chat transcripts, Hermes `MEMORY.md`, embedding neighborhoods, or truncated research TEXT treated as identity/scores/decisions). A pgvector **secondary index** over normalized `evidence` rows (`embedding_models` + `evidence_embeddings`, same Postgres/RLS) is allowed and is not a second SoR — see `docs/decisions/2026-07-30-alm-postgres-kernel.md`.
- No multi-agent production report swarm.
- No profile per report section or channel.
- No model-controlled research, tools, retries, persistence, rendering, or deployment.
- No unconditional fan-out for simple Instagram-only reports.
- No full regeneration for formatting repair or synthesis-only failure.
- No hidden provider fallback.
- No raw internal audit event stream in customer UI.
- No silent mutation of subject identity or user-confirmed strategy.
- No promotion of one-off public targets into managed workspace accounts.
- No fake scanning, fake progress, randomized scores, or simulated live product behavior.
- No production deployment by implementation workers.
- No simultaneous Hermes upgrade, broad visual redesign unrelated to product flows, or replacement of existing Vercel/Supabase/Hetzner infrastructure.
