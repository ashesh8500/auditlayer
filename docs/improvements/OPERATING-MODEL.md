# AuditLayer Autonomous Improvement Operating Model

## System boundary

AuditLayerMedia is one product composed of three existing deployment planes:

- **Vercel:** public and authenticated web experience.
- **Supabase:** authoritative identity, commercial, intelligence, evidence, and artifact state.
- **Hetzner:** bounded workers, operators, and background execution.

The architecture may move later, but changes must preserve explicit interfaces and domain truth. Do not add infrastructure merely because it is available.

## Sources of truth

| Concern | Authority |
|---|---|
| Partner, subject, brief, evidence, decisions, outcomes | Typed Supabase contracts |
| Product and semantic meaning | Versioned Git contracts and tests |
| Reports and dashboards | Immutable or reproducible projections of canonical intelligence |
| Engineering procedure | Hermes skills and repository instructions |
| Work state | `alm-build` Kanban board plus worktree and Git state |
| Mutable production state | Live systems queried immediately before action |

Presentation prose never silently becomes canonical intelligence.

## Improvement cognition loop

Each assigner tick executes this bounded cycle:

1. **Perceive:** inspect board state, origin, ledger, queue, current contracts, capabilities, failures, and recent artifacts.
2. **Model:** identify the affected domain objects, relationships, state transitions, evidence, policy, time, and user/commercial consequence.
3. **Hypothesize:** state one falsifiable improvement with baseline, expected effect, honest-null condition, and blast radius.
4. **Choose:** assign zero to three isolated cards. Zero is correct when no card is sufficiently evidenced, composable, safe, or feasible.
5. **Validate capability:** check commands, credentials, permissions, model features, sources, worktree base, and deterministic checks before dispatch. Never print secrets.
6. **Implement:** ordinary workers change only assigned worktrees and leave uncommitted verified artifacts.
7. **Judge:** the downstream merge gate independently reruns narrow and union checks and integrates only verified work.
8. **Observe:** compare expected and actual results; preserve failed and partial verdicts.
9. **Record:** update queue, ledger, checks, metrics, correction tips, and Git history.
10. **Decide next:** replenish, stop, park, or proceed from observed evidence rather than momentum.

## Card admission contract

A card is admissible only when it declares:

- object and authoritative owner;
- claim and expected composition into the product;
- observed or fixture-backed evidence;
- current baseline;
- verified, failed, partial, and parked verdict rules;
- capability prerequisites;
- exact deterministic checks and observable output;
- safety boundary and rollback/correction tip;
- partner, founder, developer, and commercial consequences where applicable.

A missing capability is not permission to build a substitute feature. Park the card or create a bounded capability-remediation card with its own check.

## Observability contract

Every consequential task leaves durable artifacts:

- task ID, branch, assignment commit, model/provider, and capability preflight;
- changed paths and explicit ownership;
- exact test commands and outputs;
- relevant before/after measurements;
- verdict and unresolved uncertainty;
- queue and ledger transition;
- correction, rollback, or recovery tip.

Operator telemetry should distinguish blocked-human, blocked-capability, crashed, timed-out, stale, running, dependency-waiting, verified, failed, partial, and parked. Repeated provider/auth failures stop after one bounded attempt.

## Production promotion state machine

Ordinary implementation and merge-gate cards never deploy. Promotion is a separate, serialized release responsibility.

```text
integrated_local
  → preview_candidate
  → preview_verified
  → release_ready
  → production_canary
  → promoted | rolled_back | held
```

Required gates:

1. **Integrated local:** clean mission branch; deterministic narrow and union suites pass; no unresolved high-risk review.
2. **Preview candidate:** web build and preview deploy succeed; migration and worker compatibility are checked without mutating production.
3. **Preview verified:** desktop and 390px mobile flows, accessibility, console/network errors, auth boundaries, and affected end-to-end behavior pass.
4. **Release ready:** exact diff, secrets/capability preflight, database compatibility, worker rollout order, rollback command, health probes, and owner-visible release evidence exist.
5. **Production canary:** smallest reversible promotion; no broad migration or service restart unless required by the verified plan.
6. **Post-deploy verification:** query live routes and authoritative state, inspect health/errors/latency, exercise the changed path, and compare expected observations.
7. **Promote or contain:** continue only when all checks pass. Otherwise stop, roll back, preserve evidence, and open a bounded correction card.

The founder's permission to deploy when confident is interpreted as permission to use this release process, never as blanket permission for autonomous production mutation.

## Complexity budget

Prefer:

- one canonical interface over wrappers;
- shared primitives over route-local visual languages;
- typed states over prose conventions;
- bounded contexts over one giant schema or ontology;
- measured performance work over speculative rewrites;
- one causal hypothesis per card;
- one serialized integration/release gate after parallel discovery or implementation.

Everything in the repository may be examined. Not everything should be changed.
