# ALM consolidated workspace release

## Authority / supersession

2026-09-19 Telegram DM message 19332: Ashesh explicitly asks to implement the earlier pricing/reader overhaul, credit-based billing, model picker and associated product changes in this same release. Defer AWS hosting. Avoid throwaway core changes and use the useful Fractal primitives: universal/shared typed contracts, ownership, deterministic commands and explicit resource freshness.

This expands, rather than discards, `release-sweep-20260919.md`. The earlier no-new-pricing/model boundary and old DeepSeek-only product restriction no longer describe the target implementation. Production remains unchanged until the combined candidate passes release review. Engineering agent credentials are NEVER product provider credentials.

Canonical source proposal: `/home/asheshkaji/projects/PLANS/ALM_GTM/GTM_V0_1.md`, `PILOT_OFFER.md`, `ENGINEERING_SCALE_DISCUSSION.md`. Fractal study: `/tmp/fractal-patterns-for-alm.md`. Older proposal status/approval caveats remain historical evidence, not a reason to ignore the new implementation authorization. Do not interpret engineering approval as approval to migrate existing subscriptions, charge a customer, invent retention/legal terms, or spend without bounded controls.

## Product, not a new infrastructure project

Keep Next.js/Vercel, Supabase/Postgres/Auth/Storage and the current isolated worker fleet. Keep canonical subjects, context versions, evidence, decisions, immutable report versions, tenant boundaries, cache policies, sharing and revocation fixes. Brand Context is customer terminology over existing versioned brief records, not a second context database. Existing reports remain useful entry artifacts. Preserve confirmed history and unknown historical provenance without inventing backfills.

No AWS/Bedrock migration, gRPC/Rust rewrite, graph database, custom client cache engine, BYOK, auto-posting, unrestricted external tools, multi-seat/SSO or generic workflow-builder expansion. Transport is ordinary authorized HTTPS JSON plus existing SQL RPCs. Web, Python worker and future native clients consume a versioned schema source; generated types/validation are projections, never competing authorities. SQL retains financial/state-transition authority.

## Recovered proposed commercial configuration (P-01)

Implement as explicit versioned configuration, with truthful availability and preserved legacy purchases: USD129/month, one owner/one brand, 3,000 included credits worth USD30 usage; 100 credits = USD1 usage value, not cash. Fixed dated retail rates based on 3x reference costs. USD10 explicit top-ups, no auto-reload; USD70 newly purchased per cycle; USD100 consumption/cycle; USD15 maximum reservation/run; separate USD60 actual upstream liability ceiling including failures. Integer monetary units; no binary floating financial arithmetic. Before dispatch reserve worst-case customer and upstream exposure atomically.

Consume included expiry-first then earliest-expiring purchased lots. Included allowance resets only at confirmed Stripe billing boundaries. Purchased lots have proposal 12-month expiry subject to final lawful policy. Charge a successful path once; internal retries/terminal provider/platform failures are ALM cost. Ambiguous usage stays pending reconciliation. Record actual cost separately from tariff and cash separately from unconsumed prepaid liability. Release unused holds; no double spending or negative wallets. Cancellation stops new schedules/renewal; pilot cancellation-request flow refunds unconsumed purchased amounts idempotently, subject to final published policy. No invented conversion of old report counts into money. Existing subscriber obligations remain under their bought contract until explicit documented change.

The source proposal leaves retention/deletion duration and final customer terms unresolved. Implementation must surface these as real enrollment blockers, not silently make up a policy. Product can be verified locally/test-mode without charging anyone or claiming live enrollment is enabled.

## Required vertical slices

1. **Shared contracts and commercial policy**: one schema source for model catalog/rates, quote/run intent, reservation/usage receipt, wallet/lot projection, errors; generated TS/Python and shared fixtures; drift test. Domain records remain existing SQL authority. No schema-only claim of feature completion.
2. **Credit accounting and payment lifecycle**: owner-scoped append-only ledger, lots, quote/reserve/settle/release, independent caps, atomic concurrency, idempotent paid allowance/top-ups/refunds, duplicate/out-of-order webhooks and reconciliation. Preserve legacy/gift/trial correctness until explicit opt-in.
3. **Model execution**: standard provider-independent bounded interface, economical default plus one genuinely evaluated frontier alternative; explicit model/data destination, tool permissions, fixed rate/config pin and no silent fallback; usage receipts and spend admission before each costly operation. Unsupported/unconfigured providers are unavailable, never fake buttons or personal credentials.
4. **Customer workspace and reader**: Brand Context/version history and confirmed proposals, model/cost preview/consent, balance/usage receipts/top-up/cancel recovery, reports reader/evidence/version continuity, consistent ALM branding and mobile UX. Public offer only describes executable supported features.
5. **One recurring workflow**: save a bounded brand review/update, timezone/schedule, pinned workflow + trigger-resolved confirmed context, independent run/schedule/delivery permissions, review-before-send default, recipient grant and revocation checks, pause/cancel/resume, idempotent execution/delivery receipts. No arbitrary automation engine.
6. **Integrated release**: existing sweep findings closed; real local SQL/concurrency and browser journeys, full regression/typecheck/lint/build, measured cold/warm loaded-content latency and request budgets, model/provider capability probes within approved spend, independent spec/security/quality review of exact candidate, preview/CI, rollback-ready schema/worker/web promotion and deployed readback.

## Execution discipline

Worktree `/home/asheshkaji/projects/alm-report-mobile-20260919`, branch `fix/report-mobile-20260919`, base `38ab957b7669a0525af390882bad3c305f971660`. Main checkout is stale/dirty; never modify it. No child commits, production DB/API writes, deploys, service restarts, env changes or personal/shared-profile access. Use offline strict TDD and disposable loopback-only SQL. Parent serializes integration/build/browser/release. Existing in-flight refinement lane owns pipeline/core/supabase_client/hermes_inprocess until its handoff; new lanes must not race those files.

## Current verification boundary

Previous sweep local results are useful regression evidence, not proof of this expanded product. New credit/model/workflow functionality is NOT implemented or released merely because this scope document exists. New state and acceptance results must be recorded with exact tested paths and outputs. No production enrollment/payment migration has been authorized as an automatic side effect of this document.

### Foundation handoff and active integration

`deleg_4c2619f7` delivered shared contracts, transactional credit primitives, standalone model execution and source-backed reader/workflow intake. These are foundations, not integrated customer features. Parent reproduced the 3 shared-contract tests, 62 TS/Python fixtures, projection drift check and isolated installed-wheel JSON/validator smoke on supported Python 3.13.13. `jsonschema==4.26.0` is now declared and locked; local frozen all-extras sync also installed released OpenAI SDK 2.45.0. No production environment changed.

Canonical policy identifier is **`P-01.v1`**. Billing integration owns explicit correction of unshipped SQL `p01.v1`, with rejection tests; adapters must not silently normalize either identifier. Provider public documentation/rates were fetched independently by parent; this does not qualify either model for paid product execution.

`deleg_9e1c2875` owns four disjoint integration lanes:
- Billing: checkout/webhook/credit mapping, wallet/quote UI, existing intake/refinement actions, existing credit SQL; no worker/reader/shared-schema edits.
- Reader: owner/shared rich navigation and evidence/version continuity, Brand Context display over existing records; no billing actions/worker/SQL edits.
- Execution: pipeline/generation/gateway and new durable dispatch/receipt SQL; preserves legacy path, owns the single shared run-admission authority.
- Workflow: new workflow SQL/UI and bounded scheduler hook in worker.py; consumes execution admission, no duplicate run/wallet engine.

Parent owns dependencies, schema/projection generation, shared integration and final verification. Existing parser review remains separately bounded. Enrollment terms, model qualification/ALM credentials, payment/sender configuration and explicit legacy transition decisions remain release gates; AWS stays deferred.
