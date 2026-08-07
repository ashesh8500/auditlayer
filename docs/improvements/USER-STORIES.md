# AuditLayer Improvement User Stories

Every queue idea must tag at least one story and one improvement program from `VISION.md`.

## Creator / client

- **C1 — Trust the report:** As a creator, I can distinguish observed facts, estimates, strategic interpretation, and unavailable data.
- **C2 — See why:** As a creator, I can walk a material score or recommendation back to source evidence and observation time.
- **C3 — Be compared fairly:** As a creator, I am compared with real, same-tier, relationship-appropriate peers unless I explicitly choose a Pro custom comparison.
- **C4 — Preserve identity:** As a creator, confirmed identity, goals, constraints, and positioning cannot be silently rewritten by a model.
- **C5 — See change over time:** As a creator, I can see what changed since the prior audit and whether the cause was new evidence, a changed brief, a methodology revision, or a correction.
- **C6 — Act next week:** As a creator, the report gives prioritized, specific actions with a measurable success condition rather than generic advice.
- **C7 — Stay calm while waiting:** As a creator, I see truthful Preparing, Analyzing, Finalizing, Delayed, and terminal states without internal worker noise.
- **C8 — Recover gracefully:** As a creator, I can leave and return without losing a valid run, and a delayed run never pretends to be progressing.
- **C9 — Control recommendations:** As a creator, I can accept, reject, or refine recommendations; rejected advice does not recur without new evidence.
- **C10 — Protect my work:** As a creator, my brief, reports, evidence, and channels remain private to my workspace.

## Founder / operator

- **F1 — Verify quality:** As Narin, I can review whether report framing, peers, strengths, limitations, and recommendations match the verified niche and account type.
- **F2 — Understand failures:** As Ashesh, I can diagnose a failed or delayed run from scrubbed structured evidence without reading raw production traces or customer content.
- **F3 — Operate without SQL:** As a founder, I can inspect onboarding, audit state, limitations, billing/access state, and recovery actions through authorized surfaces.
- **F4 — Bound cost and latency:** As a founder, I can see whether the deterministic runtime respected call, token, cost, and deadline budgets.
- **F5 — Preserve history:** As a founder, I can prove which evidence, brief, methodology, prompt, model configuration, and schema produced any report version.
- **F6 — Release safely:** As Ashesh, I can review local tests, preview evidence, migration safety, rollback steps, and production smoke results before explicitly approving promotion.

## Developer / system

- **D1 — Change one contract safely:** As a developer, I can modify a typed contract in an isolated worktree and run the narrow deterministic checks without live model spend.
- **D2 — Detect drift:** As a developer, parity tests expose divergence between web, worker, database, and report rendering contracts.
- **D3 — Fail closed:** As the system, missing evidence, invalid output, permission uncertainty, or stale state produces a structured limitation or rejection rather than a fabricated fallback.
- **D4 — Resume idempotently:** As the system, successful stages survive retry and duplicate requests do not duplicate authoritative writes.
- **D5 — Learn honestly:** As the system, recommendation outcomes can be analyzed only when linkage, timing, coverage, and confounding limits are explicit.
