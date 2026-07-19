# Gap Remediation — Agentic Engineering Queue

**Source:** Gap Analysis & Scale Plan (2026-07-19, `master @ ad6d45a`)
**Purpose:** Convert the gap analysis into an ordered, agent-executable queue with explicit
verification per item and explicit deferrals. This doc is the queue; the gap analysis is the evidence.

**Importance logic (in order):**

1. **Live risk, fixable today, verifiable today** → do now. (Security holes, leaked PII.)
2. **Blindness** → you cannot verify anything else without it. (Error tracking, health, alerts.)
3. **External latency** → starts now because the clock is wall-time, not effort. (Meta App Review.)
4. **Strategic moat** → evals gate every future prompt/model decision. (Golden dataset first.)
5. **Demand-gated** → build only when a named trigger fires. (Scale-out, containers, orgs.)

Anything not in tiers 1–4 is deferred with a trigger. Do not build it early.

**Operating rules (binding on all agents):**

- Max 3 active tickets (AGENTS.md). Work the queue top-down, one lane per ticket.
- Agents open PRs on `feat/`/`fix/` branches. CI green + one human approval → merge. No agent merges to master, no agent applies migrations to prod (`supabase db push` stays human).
- Every PR: change + offline tests + contract-doc update if behavior changed + rollback note.
- Verification means running the check and pasting the result in the PR, not asserting it.
- Secrets never enter agent context — `.env.example` + Doppler names only.

---

## Wave 0 — Stop the bleeding (this week)

Tickets W0.1–W0.3 can run in parallel (different lanes). W0.4–W0.5 are human tasks.

### W0.1 — Fix `instagram_connections` RLS + CI guard [lane: supabase-data]

- New migration `0025_fix_instagram_connections_rls.sql`: drop the
  `"Service role can manage connections"` policy (`FOR ALL USING (true)` with no `TO`
  clause → applies to PUBLIC → any authenticated user can read/write all tokens),
  recreate as `FOR ALL TO service_role USING (true) WITH CHECK (true)`.
- Extend `scripts/check-migrations.py`: fail on any `CREATE POLICY` with `USING (true)`
  that lacks a `TO` clause in the same statement.
- Update `docs/architecture-contract.md` RLS section.
- **Verify:** with the anon key + a non-owner session, `select * from instagram_connections`
  returns 0 rows / permission denied; `check-migrations.py` fails on a reintroduced
  `USING (true)` policy (add a negative test fixture); `make check-v2` green.
- **Human follow-up (not agent):** rotate all stored `long_lived_token`s — assume compromise.

### W0.2 — Kill persisted signed URLs [lane: worker-pipeline]

- `AUDITLAYER_SIGNED_URL_TTL=900` in `worker/.env.example` and on the VM.
- Stop writing signed URLs to `audits.report_url`/`pdf_url`; store paths only. The web
  proxy already re-downloads server-side — confirm no client reads `report_url` directly.
- Migration `0026_null_stale_signed_urls.sql`: null out existing `report_url`/`pdf_url`.
- **Verify:** worker pytest green; one mock-generator audit end-to-end shows report +
  PDF load via `/api/audits/[id]/report|pdf` with `report_url IS NULL`; contract doc updated.

### W0.3 — Scrub public repo + delete root legacy duplicate [lane: infra-ops]

- Move `outreach-list.md`, `var/email-outbox.jsonl`, `carousel-*.html`, `slides/`,
  `carousel-dim1/`, `marketing-assets/` to the private marketing repo.
- Delete root `src/`, `templates/`, `tests/`, `pyproject.toml`, `requirements.txt`,
  `uv.lock` (byte-identical to `legacy/`); remove `[tool.vercel]` entrypoint.
- **Verify:** repo is private OR history-rewrite decision made by founder (handle-list PII
  is in git history — deletion from HEAD is not sufficient if repo stays public);
  `git ls-files | grep -E 'outreach|email-outbox'` empty; Vercel preview still builds.

### W0.4 — Human, same week

- Rotate Codex-era secrets (incident `e9124fd`); audit `git log -p` for what was exposed.
- Add Resend (`RESEND_API_KEY` + `AUTH_EMAIL_FROM` on Vercel) — this is open work #1 in
  `docs/agent-handoff.md`; verify magic link lands in a mail app, not just Google OAuth.
- Verify Stripe webhook in prod (`STRIPE_WEBHOOK_SECRET` + dashboard endpoint + one
  test checkout). 30 minutes, gates revenue.

### W0.5 — Start Meta App Review [human, Narin-facing]

Multi-week external dependency gating Instagram Graph (best data source). Submit now;
no engineering blocks on it.

---

## Wave 1 — See failures before customers do (week 2–3)

Minimum viable observability. Skip OTel/tracing — Sentry + health + alerts is the whole wave.

### W1.1 — Sentry both services [lanes: web-portal + worker-pipeline]

- `@sentry/nextjs` in `web/`, `sentry-sdk` in worker. One DSN per service, env-configured.
- **Verify:** throw a test exception in a preview branch and in `worker-once` with a bogus
  audit; both appear in Sentry with `audit_id` context. Free tier; no alert tuning yet.

### W1.2 — Health endpoints + Better Stack [lane: web-portal, worker-pipeline]

- Web: `/api/health` (checks Supabase connectivity).
- Worker: tiny `/healthz` HTTP server in the systemd unit — queue claim probe + gateway
  TCP check (automated `diagnose-hermes` subset).
- Better Stack free tier: web health, prod URL, worker healthz, PDF-worker cron monitor.
  Alerts → email/Telegram.
- **Verify:** kill the worker → alert fires within the check interval; restore → recovery
  alert. Paste both in the PR.

### W1.3 — One business-metrics admin page [lane: web-portal]

- SQL over existing `audit_events` + cost columns: audits/day by status, p50/p95 gen time,
  cost/audit, failure rate by phase, queue depth. One admin route, no new infra.
- **Verify:** numbers match hand-computed SQL on the same window for one known audit day.

**Deferred from Wave 1:** structlog/pino rollout (only where Sentry context is missing),
LLM spend rollup (the admin page's cost/audit covers it), tracing.

---

## Wave 2 — Harden the pipeline (week 3–5)

Order by failure-cost, not by list order in the gap analysis.

### W2.1 — Retries where they prevent burnt money [lane: worker-pipeline]

- Use the already-declared `tenacity`: wrap `hermes.py` chat calls (3 attempts, exp backoff,
  retry on 429/5xx/timeout) and mark gateway-down audits `retryable` fast instead of
  burning the 600s timeout. Supabase client retries: same wrapper, idempotent calls only.
- **Verify:** unit tests with a fake gateway that fails twice then succeeds; a permanently
  down gateway produces `failed/retryable` in <60s, not 600s.

### W2.2 — Atomic PDF claim + dead-letter [lane: supabase-data + worker-pipeline]

- PDF claim → RPC with `FOR UPDATE SKIP LOCKED` (mirror `0016` pattern).
- `sweep_retryable`: backoff math into SQL (`next_retry_at <= now()`); add `dead_lettered`
  status after max retries + admin-console view + `audit_events` entry.
- **Verify:** two concurrent claimers in a test → exactly one wins; an audit retried to the
  cap lands in `dead_lettered` and appears in admin. Contract doc enum updated.

### W2.3 — Rate limiting + secrets off the laptop [lane: web-portal, infra-ops]

- Upstash Ratelimit (or Vercel middleware) on intake + auth: 5 audits/IP/day unauth,
  10 req/min auth. Verify Supabase hosted-auth limits in dashboard.
- Doppler free tier: `worker/.env` via `doppler run` in the systemd unit; delete the
  rsync-from-laptop secrets path from `scripts/hermes-vm-sync.sh`.
- **Verify:** 6th intake from one IP → 429; VM worker boots and passes `diagnose-hermes`
  with no `.env` file present on disk.

### W2.4 — Hygiene batch [lane: infra-ops]

Fix E5 (model drift — `.env.example` says `gpt-5.6-sol`, prod runs `deepseek-v4-flash`),
E8 (`make install-hooks` missing), E9 (the three named defects), run vitest in CI,
add Dependabot + gitleaks. One PR, checklist verification in CI output.

**Deferred from Wave 2:** model fallback provider (move to Wave 3 — useless until the eval
harness can tell you whether the fallback's output is acceptable), broad `except: pass`
cleanup beyond logging a warning event.

---

## Wave 3 — Quality system (parallel track, starts week 2, human-heavy)

This is the moat. It is also mostly Narin-time, not agent-time — run it alongside Waves 1–2.

1. **Golden dataset first** (Narin, ~1 week): 10–15 real accounts, handwritten scores/notes
   per section → `evals/golden/`. Nothing else in this wave can start without it.
2. **promptfoo harness** [lane: evals-quality]: structural checks automated; LLM-judge
   rubric calibrated against Narin's scores until judge↔Narin agreement is acceptable on
   the golden set. **Verify:** harness reproduces Narin's pass/fail on ≥80% of golden
   reports before it gates anything.
3. **Then, and only then:** `quality_check` phase between `composing` and `ready`
   (structural for free tier, structural + judge for paid), eval-artifact-required rule
   for prompt/model PRs, and the model-fallback config from Wave 2's deferral.
4. **Evidence fetch step** (Firecrawl, top 3–5 URLs, ~30 KB cap, 7-day cache): implement
   only after the harness exists, so its quality delta is *measured*, not assumed. This is
   the plan's own claim for "biggest quality lever" — verify it on the golden set before
   shipping.
5. **`report_reviews` table:** every Narin review stored with score + notes → eval training
   data. Cheap, do with step 1.

---

## Explicitly deferred — build only when the trigger fires

| Item | Trigger |
|---|---|
| Containerize worker / multi-worker scale-out (R1) | Queue depth > 3 sustained for a week |
| Worker autoscaling via Hetzner API | Same, after containerization |
| Supabase Pro + branching/staging | First paying user (Pro); per-PR DB previews only when preview DB bugs actually bite |
| PITR, pg_dump→R2, restore drill | MRR > $1k |
| OpenRouter/Nous Portal consolidation | Do the pricing comparison only when monthly LLM+search spend > $100 |
| Agency workspace (`organizations`, white-label) | One agency actually commits to paying |
| Before/after comparison view | 5+ repeat-audit requests from real users |
| Design consolidation (1 renderer, token lint) | Next time report CSS is touched anyway |
| PostHog/product analytics | Funnel traffic > ~100 visits/week |
| ICP doc reconciliation (P1) | **Exception — do now, 1 hour, human:** pick the ICP and fix `docs/product-spec.md`; docs drift poisons every agent that reads it |

---

## Cadence (humans)

- **Weekly (30 min):** review merged PRs, eval trend (once harness exists), cost/audit on the W1.3 page.
- **Per release:** `release-preflight` + readiness checklist; evals green once Wave 3 lands.
- **Monthly:** vendor spend, Dependabot PRs, and the queue re-rank — this doc gets edited, not extended forever.
