# Decision: Supabase Postgres remains SoR; additive ALM kernel + pgvector index

**Date:** 2026-07-30  
**Status:** Accepted  
**Amends:** `docs/implementation/alm-intelligence-v1/DECISIONS.md`, `NON_GOALS.md`

## Context

AuditLayer’s deployed schema is production-grade for queue, billing, report delivery, Instagram connections, operator control plane, and runtime telemetry. It is incomplete as a longitudinal intelligence world model: identity is handle-centric (`accounts`), continuity is thin (`account_progression` overall score), research lives in truncated TEXT blobs, and recommendations/decisions are regenerated as prose.

The question is whether to keep Supabase Postgres, migrate engines, or add a graph/vector SaaS for “AI memory.”

## Decision

1. **Supabase Postgres remains the sole system of record** for the next product horizon (3–5 years of AI growth on this stack).
2. **Implement the additive ALM kernel now** — subjects, channels, Living Brief versions/proposals, batches, evidence snapshots + membership, intelligence runs, score/finding/recommendation/decision ledgers, customer progress projection — before tenant scale makes backfill painful.
3. **Enable pgvector and embedding tables in the kernel wave**, empty-capable. Embeddings are a **secondary ANN index over evidence ledger text**, never the ledger and never a second brain.
4. **Reject** Neo4j/Neptune/Fuseki as SoR, Pinecone/Weaviate/Qdrant Cloud, Mongo/Firestore as primary, full event-sourcing platforms, and engine migrations.
5. **Keep `accounts` / `account_progression` / `audits` / `audit_report_versions`** as compatibility bridges. Connected/managed accounts backfill into subjects; observed public targets stay observed-only.
6. Ontology TTL/SHACL documents meaning; **SQL constraints + JSON Schema contracts enforce** closed-world rules.

## Options considered (verdicts)

| Option | Verdict |
|---|---|
| Status quo on `accounts` + HTML + MEMORY.md | Reject as intelligence path |
| Additive ALM kernel on same Postgres | **Choose** |
| Big-bang drop `accounts` / rewrite | Reject now |
| Graph DB as SoR | Reject (second SoR, RLS/ops cost; ontology ≠ Neo4j) |
| Dedicated vector DB | Reject until evidence volume exceeds comfortable pgvector+HNSW filtering |
| pgvector inside Supabase | **Choose** as AI reserve + light use |
| Document DB primary | Reject |
| Full CQRS / event store | Reject; append-only ledgers are enough |
| Analytics warehouse | Defer |

## Naming (shipped SQL vs plan prose)

Plan prose sometimes uses longer names. Shipped kernel tables (authoritative):

| Plan prose | Shipped table |
|---|---|
| `subject_brief_versions` | `living_brief_versions` |
| `subject_brief_proposals` | `context_update_proposals` |
| `evidence_items` | `evidence` |
| `audit_scores` | `scores` |
| `audit_findings` | `findings` |
| `subject_recommendations` | `recommendations` |
| `subject_decisions` | `decisions` |

Membership for immutable snapshot sets: `evidence_snapshot_members`.

## Non-goal clarification

`NON_GOALS.md` forbids a **vector-memory layer as system of record**. That ban does **not** forbid:

- `CREATE EXTENSION vector`
- `embedding_models` registry
- `evidence_embeddings` rows keyed to `evidence` with tenant/user denormalization, model id, dims, and RLS

Forbidden: treating chat transcripts, Hermes `MEMORY.md`, truncated research TEXT, or embedding neighborhoods as authoritative identity, scores, or decisions.

## Consequences

- Additive migrations only; no destructive drop of production audit history.
- Dual-read period until Subject home replaces account-centric UI.
- Release gate alone applies linked production migrations.
- Runtime/product packets consume the kernel RPCs; they do not invent parallel stores.
