# Launch stability release — 2026-09-18

## User directive and authorization

Ashesh requested: reconcile missing Subjects and fragmented Reports/Instagram UX; introduce one account-level Connections area; route subject reconnection there rather than AI connectors; fix latency; run stability tests and deploy the verified release. Separately produce an AWS migration plan using available credits and reconsider whether a permanent worker host is necessary. This authorizes a scoped production release after gates, not AWS provisioning or unrelated redesign.

## Scope

- Preserve the existing visual system; do not redesign landing, pricing, report templates, or navigation beyond the requested functional consolidation.
- Connections manages customer-authorized social data access. AI connectors are a distinct capability and must not be mistaken for Instagram access.
- Subjects is the complete owner-scoped list of durable monitored entities, including legacy accounts where applicable. Reports is the complete owner-scoped report library with correct subject/channel continuity.
- Reconnection changes credentials, not subject identity or report history. No implicit cross-tenant imports or cross-tenant founder visibility in customer routes.
- Connection health and capabilities are real states; Meta approval does not guarantee every metric is available for every account/post.
- Portal latency and asynchronous report-generation latency are measured separately.
- Production inference remains bounded DeepSeek V4 Flash; no unapproved provider change.

## Release workspace

- Integration: `/home/asheshkaji/projects/alm-launch-20260918`
- Branch: `fix/launch-connections-20260918`, starting at origin/master `0ca79ea`.
- Original `/home/asheshkaji/projects/auditlayer` has a stale feature checkout and unrelated dirty landing-page edits; preserve it and do not deploy from it.
- AWS memo lane owns only `docs/launch-20260918/aws-migration-plan.md`.
- Initial UX and performance lanes are read-only investigations.

## Acceptance matrix

1. Fresh ordinary user: sign in -> clear empty Subjects -> Connections -> consent -> correct connected account -> subject -> report submission -> actual ready report.
2. Returning user: all owned subjects and historical reports remain reachable, regardless of legacy account versus subject-era creation.
3. Reconnect from Subjects, subject detail, report library, and report failure/attention state reaches Connections with safe context; never AI connector setup.
4. OAuth cancel/failure/state mismatch/session expiry provides recoverable feedback; success returns to valid same-origin context with fresh state.
5. Reconnection preserves identity/history. Disconnect semantics match consent/privacy promises and do not silently orphan navigation.
6. Expired/revoked/missing-scope credentials do not masquerade as healthy or silently fall back to public metrics.
7. Ordinary user and admin-in-customer-view remain owner-scoped; cross-tenant IDs fail closed.
8. Reports handle empty, queued, running, failed, blocked, ready, and unavailable-source states truthfully. Existing report/share/reader paths keep working.
9. Desktop and 390px mobile journeys: no overflow, blocked actions, invisible feedback, or dead ends.
10. Measure portal TTFB/query waterfall and queue/research/composition/ready durations before and after relevant changes. No fabricated latency improvement claims.
11. Full deterministic web and worker suites; production-mode browser tests; independent final-diff review; preview QA; live schema probes before migration-dependent code; deploy and read-back verification.
12. Record pre-release deployment/service state and rollback path; verify live health, production routes, connection navigation and controlled report delivery after deployment. Mark any human-login or third-party-consent limitation explicitly.

## AWS deliverable

Current topology and measured constraints, simplest recommended target, async-job versus permanent-host distinction, region/data placement, bounded concurrency/retries/idempotency, credentials, staged rollout/rollback, credits eligibility unknowns, and referenced AWS service limits. No infrastructure migration during this stability release.

## Evidence discipline

A green unit test is not proof of real OAuth consent or successful report delivery. Report each acceptance item as verified, failed, or unverified with the exact source, commit, environment and timing. Never deploy the dirty original checkout or report a simulated test as a live result.
