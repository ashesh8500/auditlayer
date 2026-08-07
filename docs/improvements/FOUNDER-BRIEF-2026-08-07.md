# Founder Brief — 2026-08-07

This document normalizes Ashesh Kaji's voice brief into durable product and operating direction. It is intent evidence, not proof that any product claim or implementation already works.

## Product intent

AuditLayerMedia should grow beyond a report generator into the brand-intelligence home for anyone who partners with the company: individuals, creators, small businesses, brands, and enterprises.

The system should help a partner understand:

- what is known and where it came from;
- what causes or plausibly influences an outcome;
- what is uncertain or missing;
- what decision is available now;
- what changed after that decision;
- what the appropriate product and price should be for the value delivered.

The intelligence layer is the source of truth. Audit reports are valuable, immutable accessibility and communication layers over that intelligence, not the only state the product knows.

## Experience intent

The product must feel simple while remaining deeply useful. Simplicity means a streamlined composition, not absence of capability.

Quality includes:

- one coherent design language;
- restrained, deliberate color, spacing, radii, typography, and motion;
- intuitive information architecture and action vocabulary;
- truthful loading, delayed, failure, empty, and recovery states;
- accessibility and mobile/desktop parity;
- shared primitives rather than page-specific visual languages;
- no simulated scans, fabricated progress, or AI theater.

UI and UX are part of epistemic quality: intelligence that cannot be understood or acted upon is not complete.

## Commercial intent

Product and sales should evolve in the same evidence loop. The system should generate and test hypotheses about partner segments, needs, offers, entitlements, pricing, onboarding, willingness to pay, delivery cost, and observed value.

Commercial learning must remain honest:

- no invented demand, efficacy, conversion, or causal claims;
- no plan distinction unless code and contracts deliver it deterministically;
- no manipulative friction;
- preserve consultative enterprise discovery where requirements are genuinely bespoke;
- treat pricing and positioning as versioned hypotheses with observable checks.

## Engineering intent

The entire repository is in scope for examination: product, web, worker, intelligence contracts, reports, database, authentication, performance, infrastructure, operations, and release mechanics.

The architecture should:

- begin with the live Vercel, Supabase, and Hetzner system;
- measure slowness before optimizing it;
- separate browser responsiveness, database/network latency, audit runtime, and model latency;
- improve stability and authentication options end to end;
- remain portable through explicit interfaces if hosting changes;
- keep canonical state in typed systems rather than prose or hidden agent memory;
- avoid spaghetti complexity and duplicate loops.

## Autonomous-system intent

The assigner is an intelligent governor, not a queue-filling daemon. It may choose not to assign work. It must inspect board state, evidence, composition, current failures, capabilities, credentials, and recent verdicts before dispatch.

Workers must not:

- loop because a capability or credential is missing;
- invent substitute features to escape a block;
- retry provider/auth failures indefinitely;
- overwrite another worktree or drift from the assignment commit;
- declare success without runnable evidence and durable artifacts.

The system must remain observable and leave plans, checks, verdicts, measurements, and recovery tips.

## Production intent

Do not bring down production. Production promotion is allowed only when the change is demonstrably ready and then verified on production.

Operational interpretation:

- ordinary workers do not deploy;
- integration and release are serialized;
- local checks precede preview;
- preview and migration compatibility precede production;
- rollback is prepared before the canary;
- production changes are the smallest reversible unit;
- live routes, health, state, latency, and affected behavior are checked after deploy;
- a failed check stops or rolls back rather than being rationalized.

The fact that the product is not broadly released lowers compatibility pressure; it does not remove the obligation to protect live state and preserve valuable artifacts.

## Success criterion

The improvement system is successful when it repeatedly makes AuditLayerMedia more truthful, useful, coherent, sellable, fast, stable, accessible, and operable—while retaining the judgment to stop when the next action is not sufficiently evidenced or safe.
