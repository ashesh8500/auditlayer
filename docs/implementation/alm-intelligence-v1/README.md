# AuditLayer Longitudinal Intelligence v1 — Canonical Implementation Plan

This directory is the canonical, durable implementation contract for the AuditLayer longitudinal-intelligence and product rehaul. Future sessions and workers must start here rather than reconstructing the plan from chat history.

## Mission

Move AuditLayer from one-off, handle-centric reports to a durable system:

**Subject → Living Brief → Channels → Evidence → Decisions → Audits**

Reports remain immutable outputs. Canonical continuity lives in validated, versioned database records. Production report inference remains DeepSeek V4 Flash-only, bounded, stateless, tool-free, and controlled by deterministic Python.

## Execution topology

After this packet is committed, three isolated implementation worktrees run in parallel:

1. **Kernel** — subject/channel ontology, Living Brief versions, intelligence-run persistence, RLS/RPCs.
2. **Runtime** — evidence normalization, bounded adaptive channel analysis, synthesis, reuse, resume, validation and telemetry.
3. **Product** — subject/channel intake, batch submission, three-state waiting, Living Brief and evidence/change surfaces.

One independent release gate integrates the three branches and alone owns full builds, browser QA, preview, migrations, worker rollout, and rollback evidence. Production promotion requires Ashesh's explicit approval.

## Read order

1. `COMMON.md`
2. `DECISIONS.md`
3. `NON_GOALS.md`
4. `FILE_OWNERSHIP.yaml`
5. `ACCEPTANCE.yaml`
6. Your role packet in `packets/`
7. Only the contracts and source files named by that packet

## Related authoritative context

- `docs/alm-longitudinal-intelligence-plan.html`
- `docs/report-runtime-slo.md`
- `docs/architecture-contract.md`
- `docs/agent-handoff.md`
- `AGENTS.md`, `worker/AGENTS.md`, `web/AGENTS.md`

Chat transcripts are not implementation authority when they conflict with this packet or current user direction.
