# AuditLayer Autonomous Improvements

This directory is the source of truth for the bounded `alm-build` mission.

Read in order:

1. `FOUNDER-BRIEF-2026-08-07.md` — durable founder intent and production-safety interpretation.
2. `VISION.md` — north star and twelve improvement programs.
3. `FUNDAMENTALS.md` — non-negotiable truth, experience, capability, and release constraints.
4. `OPERATING-MODEL.md` — autonomous cognition loop, observability, complexity budget, and production promotion state machine.
5. `USER-STORIES.md` — partner, founder, developer, commercial, and operational outcomes every idea must serve.
6. `IDEA-QUEUE.md` — append-only proposed/in-flight work.
7. `LEDGER.md` — append-only verified, failed, partial, and parked verdicts.

The mission works only on `improve/alm-recursive-2026-08-07` and isolated `wt/almbuild-*` worktrees. Ordinary cards never deploy, migrate production, restart services, spend live report tokens, or mutate customer data. Production promotion is a separate serialized release state machine requiring local and preview evidence, migration compatibility, rollback readiness, a bounded canary, and post-deploy verification.
