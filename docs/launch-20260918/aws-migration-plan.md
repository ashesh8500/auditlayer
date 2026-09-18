# AWS migration and worker simplification decision

**Decision date:** 2026-09-18. **Status:** recommendation, not deployment approval.

**Evidence base:** release worktree `/home/asheshkaji/projects/alm-launch-20260918`, inspected at commit `0ca79eadc84c89bca31d05dc4fdbb9122bd3439b`; official AWS documentation fetched for this memo. Repository declarations are not proof of live configuration. No infrastructure, credentials, customer records, or runtime code were changed; no production benchmarks or AWS account/credit checks were performed.

## 1. Recommendation

**Keep asynchronous report execution; replace the VPS implementation, not the product's durable queue.** Use one small **ECS service on on-demand Fargate**, initially one worker process per task, with Supabase still owning queue, identity, connection state, report versions, and private artifacts. Retain Vercel for the portal. Start the isolated canary at one task; choose production task count only after measuring runtime and provider capacity, with an explicit hard ceiling. Do not silently halve the documented two-worker deployment's capacity.

This removes host patching, manual runtime installs, and systemd deployment drift without introducing another queue or rebuilding auth. It is **not scale-to-zero**: the initial service polls continuously and bills while idle. That is a deliberate launch trade-off, not a serverless cost claim.

**Do not gate go-to-market on a complete AWS replatform.** Complete the product release gates on the existing host while preparing the container in parallel. If moving off the current VPS before launch is mandatory and container/recovery gates cannot be completed, a single EC2 instance with the existing systemd model and encrypted persistent disk is the lowest-change bridge—not the simplification endpoint. It still requires OS operations. Do not migrate Postgres/Auth/Storage, replace DeepSeek, or add Kubernetes, SQS, Redis, Step Functions, an ALB, or EFS just to consume credits.

## 2. Existing versus proposed topology

### Repository-described current state

```text
Browser → Vercel Next.js → Supabase Auth / Postgres / Realtime / private Storage
                                  ↑ claim RPCs, events, versions, artifacts
                         VPS systemd worker@1 + worker@2
                                  ↓
                    embedded Hermes + bounded research → DeepSeek

Separate admin-only path: Vercel operator action → configured Hermes operator API
```

Sources: `worker/infra/auditlayer-worker@.service`, `worker/infra/deploy.sh`, `worker/auditlayer_worker/worker.py`, `hermes_runtime.py`, `web/src/lib/actions/operator.ts`, and `docs/agent-handoff.md`.

Important documentation drift: root `AGENTS.md` and the handoff diagram still show a report-generation gateway hop; `worker.py:build_generator` actually **requires `HERMES_MODE=inprocess`, provider `deepseek`, model `deepseek-v4-flash`**. `WorkerSettings` still defaults the mode to `http`, so deployment must explicitly override it. Old deployment prose claiming million-token audits is not a current measurement and is not used for sizing here.

The template unit sets `/opt/auditlayer/worker`, an external `.env`, per-instance output paths, and a 1G memory ceiling. `deploy.sh` syncs a repository and an optional profile checkout, then restarts two units; it is not an immutable container delivery pipeline and does not itself reconcile every path with the unit's `/opt` layout. Historical singleton/VM units remain in the repository. Their presence does not establish which units are live.

### Launch target

```text
Browser → unchanged Vercel portal → unchanged Supabase services
                                           ↑ HTTPS RPC / Storage
                 AWS ECS service → bounded Fargate worker replicas
                      ↑                  ↓
                ECR image        DeepSeek / search / Meta HTTPS
                      + Secrets Manager injection + CloudWatch logs
```

No public worker listener or load balancer is needed. Use an in-container loopback health probe after fixing the health semantics below. A public-subnet task with a public IP and **no inbound security-group rules** is the minimal internet-egress option; public IP is not permission to accept connections. Alternatively use private subnets and NAT if policy or stable egress requires it, accepting the additional cost. Record the choice explicitly.

**VPS retirement has a separate dependency:** `web/src/lib/actions/operator.ts` calls `ALM_OPERATOR_API_BASE` with an API key and a 55-second abort. Moving queue workers does not move that service. Before shutting down the VPS, either migrate the restricted operator endpoint separately with its auth and profile restrictions, or explicitly disable that optional admin feature with founder agreement. Inventory other host consumers; do not erase a shared Hermes host to retire one workload.

## 3. Why asynchronous execution remains necessary

A request should atomically submit authorized work, return a durable identifier, and allow the user to leave. The worker researches, calls the provider, validates, uploads HTML, and finalizes database state independently of the browser. Provider latency, failures, retries, and deployment interruptions remain even when compute moves to AWS. Running generation inside an intake request would couple those failure modes to a browser/server request lifetime.

The necessary abstraction is **a durable job plus bounded executor**, not an always-on VPS. The current always-on loop is merely the smallest compatible executor. `run_worker_loop(..., once=True)` exists, but it claims whichever audit/refinement is next and also performs sweeps; it is not yet a job-ID-addressed event handler or a reliable fleet dispatcher. Event-triggered Fargate tasks can follow later once wakeup, duplicate triggers, sweeper scheduling, and lost-wakeup recovery are designed. Scaling the service to zero today stops both consumption and its recovery sweeps.

### Runtime options

| Option | Fit now | Decision |
|---|---|---|
| ECS/Fargate service, existing polling loop | Preserves outbound-only model and existing DB queue. Needs container packaging, correct health, bounded shutdown/recovery. No ordinary Lambda-style per-invocation timeout. Tasks can still be stopped or replaced. | Preferred managed launch target, after gates below. |
| One EC2 host, existing systemd units | Lowest packaging change; persistent account directories easier to preserve. Retains host maintenance and single-host risk. | Conditional short bridge if AWS move is urgent and Fargate readiness would delay launch. |
| Standard Lambda function | Maximum invocation 900 seconds, maximum memory 10,240 MB, `/tmp` configurable 512–10,240 MB, container image up to 10 GB uncompressed [A1]. Stateless execution and trigger/retry adaptation required. | Not justified for the current report path. Reconsider only with an enforced total deadline safely below the limit and measured tail/cold-start margin. |
| One-shot Fargate tasks | Avoid idle worker billing but add cold starts and a durable dispatcher/reconciliation problem. | Later optimization if measured idle spend warrants it; do not dual-write two authoritative queues. |

AWS's current quota page also documents **Lambda Managed Instances** with up to 5,400 seconds for qualifying asynchronous/event-source invocations (with stated exceptions), and separate MicroVM/durable-function features [A1]. Thus “all Lambda always stops at 15 minutes” would be inaccurate. Those variants do not make this repository a drop-in Lambda workload; their additional execution/cost model is not the smallest launch change and has not been evaluated here.

**Bounds must be evaluated on the actual path.** `hermes_inprocess.py` bounds research to a 20-second deadline and kills its managed-search child on timeout. `generation.py` has bounded output and one correction call. However, its model calls reach `InProcessHermesClient.chat → AIAgent.run_conversation` with no worker-enforced total wall-clock timeout; `HERMES_TIMEOUT_SECONDS=600` is passed to the HTTP client, not that in-process call. Catching `TimeoutError` is not enforcing a deadline. The separate `intelligence/runtime.py` offers provider-timeout policy and an optional run deadline, but its presence does not prove the main paid report path has that bound. Neither old latency prose nor token caps establish Lambda suitability.

## 4. Queue, lease, and durability contract

Preserve these properties across hosts; AWS scheduling does not supply them automatically.

| Boundary | Evidence in current code | Migration implication / required gate |
|---|---|---|
| Intake deduplication and entitlements | `20260807233734_atomic_entitled_audit_batches.sql`, `20260808001443_rolling_batch_idempotency.sql`, `20260808004102_retry_lookup_before_entitlement.sql` implement atomic submission and rolling retry lookup. | Preserve the existing transaction and the rolling ten-minute key semantics. Do not claim a historical pre-atomic-intake bug is still present or promise permanent deduplication. Verify deployed RPCs and real intake retry behavior. |
| Claim | `0016_claim_rpc.sql` uses `FOR UPDATE SKIP LOCKED`, updates `running`, `claimed_at`, `claimed_by`; client refuses a non-atomic fallback. | Keep Supabase as queue authority. Unique task/worker identity for diagnostics. Multiple workers cannot simultaneously claim the same queued row, but this is not an exactly-once guarantee across crashes. |
| Heartbeat / stale recovery | `pipeline.py:SupabaseEventSink` updates audit `updated_at` on 60-second generation heartbeats; `0018_stale_running_reaper.sql` reclaims running audits older than a 30-minute cutoff and counts recoveries. | This is timestamp-based recovery, not an explicit renewable lease with a fencing token. A network-partitioned old worker could resume after reclaim. Add attempt ownership/fencing to heartbeat and finalization before aggressive rolling overlap, Spot, or elastic scale. At minimum enforce a total attempt deadline below reclaim and use a drained, no-overlap initial cutover; that operational mitigation is not equivalent to fencing. |
| Retry | `sweep_retryable()` invokes the DB retry RPC but catches errors and returns zero; loop-level errors otherwise re-raise. | Keep DB-owned retry count/backoff/exhaustion. Surface sweep failures, back off with jitter on transient control-plane outages, and avoid unbounded provider retries or restart storms. Do not turn an unknown commit outcome into a fresh job. |
| Report commit | `upload_report` creates UUID revision objects; initial/refinement RPCs allocate versions transactionally; regenerated finalization retries the same immutable path and reconciles a lost reply. | Upload success is not delivery success. Retain report-path/provenance reconciliation. Exercise initial, regenerated, and refinement lost-response cases independently—the client reconciliation wrapper is not shared by all three. Orphan uploaded objects need bounded cleanup after reconciliation, not overwrite. |
| Refinements | Atomic claim and finalization exist; loop processes them only when no audit was claimed. Inspected stale-audit reaper targets `audits`, not `refinements`. | Test refinement crash/recovery explicitly; add bounded recovery or an operator repair procedure before claiming full restart safety. Avoid starvation under an audit backlog. Never infer refinement safety from audit tests. |
| Generation telemetry | `start_report_generation_run` records attempts; separate stale-run sweep defaults to ten minutes. | Reconcile its cutoff with actual enforced attempt bounds; avoid falsely marking a long but active run crashed. Keep unknown provider usage honest after forced termination. |

### Two meanings of “connection durability”

1. **Network connections:** Supabase HTTP, provider streams, and Meta calls can break during task replacement. Reconnect clients with bounded transport timeouts; retry reads safely, but reconcile uncertain writes before retrying. No task-local HTTP connection is durable state. Keep Realtime on Supabase; the worker does not need a permanent browser socket.
2. **Customer OAuth connections:** owner-scoped Meta credentials/lifecycle belong in the existing database, not in a task filesystem. Preserve current RPC/token handling and `reconnect_required` behavior; a host move should not require blanket reconnects. The rolling-upgrade migration (`20260907180000_instagram_rolling_upgrade.sql`) deliberately treats legacy persistence conservatively. Test an already-connected account, expired/revoked token, successful reconnect, and cross-owner rejection after restart. Keep the portal origin and OAuth callbacks unchanged for this phase. Never copy customer tokens into the container image or model context.

## 5. Container and runtime readiness gaps

**No Dockerfile was found in the inspected repository.** Fargate is a build-and-verify task, not a task-definition-only switch.

Before customer traffic on Fargate:

- Build a non-root Linux image from a supported Python version (`worker/pyproject.toml`: `>=3.11,<3.14`). Freeze dependencies using the lockfile and embedded extras. Bundle a pinned compatible Hermes source revision: the worker imports `run_agent` from an external agent root, not a self-contained published dependency. Bake the canonical `hermes-profile` bundle, manifest, template, skills, and shared context. Record image digest, app commit, Hermes revision, prompt and bundle versions. Do not `git pull` or install dependencies at container startup.
- Explicitly configure `HERMES_MODE=inprocess`, model/provider contract, writable account/output roots, and health port. Exclude every `.env`, personal Hermes profile, session DB, and credential file from the image/build context. `config.py` lets worker `.env` override environment values, making accidental inclusion especially dangerous.
- Classify filesystem state. `account_homes.py` provisions per-account memories/sessions/logs and preserves mutable runtime state; canonical intelligence is intended to live in DB records. Prove report generation and refinement can reconstruct required state on a fresh task, including bundles, evidence cache, and subject context. Archive any required legacy local state before moving. Do not silently lose it, assume it is all disposable, or introduce EFS by default. If required local continuity cannot yet be reconstructed, use the persistent-disk EC2 bridge until that dependency is removed.
- Correct health semantics before using `/healthz` for ECS replacement. `observability.py` declares health stale after `max(60, poll_interval*4)` seconds, while `worker.py` heartbeats it only after a full drain. The separate database generation heartbeat does **not** refresh this local health state. A healthy long report can therefore return 503 and be killed by orchestration. Distinguish process liveness, active bounded progress, and queue/control-plane readiness; test the longest supported attempt.
- Implement termination handling: stop claiming, finish within the available window or cancel the killable attempt, preserve/reconcile its durable state, then exit. Fargate's `stopTimeout` defaults to 30 seconds and has a 120-second maximum [A2]; setting it to 120 cannot drain an arbitrarily long report. Use a pre-deployment drain mechanism outside that window for normal releases, plus tested forced-stop recovery for unavoidable interruptions. Avoid Fargate Spot at launch.
- Keep one audit/refinement at a time per task. `HERMES_HOME_LOCK` protects process-global environment scoping; do not replace process isolation with an unconstrained thread pool. Preserve bounded internal collectors, cap total fleet/provider concurrency, and measure CPU/RSS/disk before picking task size. The systemd 1G ceiling is not a measured memory requirement.
- Configure finite log retention and alert on oldest queued age, failed/exhausted jobs, missing worker progress, repeated restarts, and finalization-unknown outcomes. Reuse structured logs and private run telemetry; no additional monitoring vendor is required.

Fargate Linux platform 1.4.0+ provides 20 GiB ephemeral storage, configurable up to 200 GiB; compressed and unpacked images consume that space [A3]. This is working storage, not a persistent account-home database.

## 6. Region, security, and bounded launch exposure

**Region:** `docs/agent-handoff.md` says Supabase is in Singapore; this is a repository declaration, not a live verification. Confirm the actual project region and data obligations. If confirmed, evaluate AWS Singapore (`ap-southeast-1`) first to shorten the many worker–control-plane round trips. Measure from the candidate region to Supabase, DeepSeek, search, and Meta; do not infer latency or zero egress from a shared regional label. Check Vercel server-function placement separately. Keep customer-facing DNS, callbacks, and storage URLs unchanged during worker-only migration.

**Secrets:** use ECS Secrets Manager injection with least-privilege execution-role access to specific secret ARNs and KMS permissions when applicable. Task role and execution role have different purposes [A2, A4]; no broad administrator role and no static AWS access keys inside the task. Keep the Supabase service-role key and provider/search credentials server-side. Secret rotation requires new tasks for environment-injected values [A4]. Test rotation as a drained deployment, and redact logs/debug output.

**Tenant isolation:** RLS and authorized report routes remain unchanged. The worker's service role bypasses ordinary tenant protection, so container isolation is not tenant authorization. Preserve owner/subject/channel checks, scoped connection lookups, private buckets, immutable paths, short-lived access, and per-account filesystem containment. Test two tenants with deliberate cross-ID requests and sequential jobs in the same task; ensure neither memories nor credentials leak. Do not load the general personal Hermes profile into production.

**Concurrency:** begin canary at one task; approve the production replica ceiling based on observed work duration, provider rate limits, and memory. Bound per-user outstanding work and global queue admission in the product path; do not assume those controls are already complete. Include temporary rollout overlap in the ceiling. CPU alone is a poor scale signal for network-bound generation—use oldest queued age plus active jobs and provider saturation. A provider 429 is a reason to back off, not automatically add replicas.

## 7. Costs and credits: verify, do not assume

No traffic forecast, monthly dollar estimate, credit balance, or measured throughput is asserted here.

AWS bills Fargate for **requested** CPU/memory/storage, from image download until task termination; Linux billing is per second with a one-minute minimum [A5]. Continuous pollers incur idle cost. Other cost drivers: ECR image storage/pulls, CloudWatch ingestion/retention, Secrets Manager, public IPv4, network transfer, and optional NAT hourly/data-processing charges [A4–A6]. Size and architecture must be selected using measurements and the chosen region's rates. Do not use AWS's US-region worked examples as Singapore quotations.

Build an estimate from actual task-hours × selected CPU/memory rates, additional storage, log volume, network/IPv4/NAT, and secret/image usage. Keep two views: gross spend after credits expire and eligible net spend while credits remain. Include Vercel, Supabase, DeepSeek, search, email, and other external invoices separately: **moving a worker to AWS does not move external model billing onto AWS credits.** Switching provider to Bedrock is a separate evaluated product change, not part of this plan.

Before provisioning, the account owner must verify in Billing/Credits and the award terms:

- Correct recipient account/organization, redeemed balance, expiration, credit sharing, and project-purpose restrictions.
- Eligibility for the specific proposed compute, storage, logging, networking, and secret services—not just “AWS.”
- Whether taxes, support, Marketplace items, commitments or other charges are excluded. General promotional terms exclude various categories and upfront Savings Plan/Reserved Instance fees; awards may be narrower [A7].
- Service/region quotas and IAM authority; ability to run the chosen Fargate size.
- Budget notifications and credit-expiry alerts, acknowledging alerts are not a guaranteed hard spending stop. Keep task maximums and admission controls as actual containment.

**All account-specific credit eligibility and balances remain UNKNOWN.** Do not buy commitments or overbuild merely because credits reportedly exist.

## 8. Actionable phases, release gates, and rollback

| Phase / owner | Work | Exit evidence |
|---|---|---|
| 0 — founder + release owner | Confirm AWS account/credits, Supabase region, live worker units/runtime versions, provider quotas, local-state inventory, operator endpoint dependency, and launch-critical auth/billing/connection gates. | Written inventory without secret values; gross-cost estimate and explicit spending ceiling. No migration decision based only on old deployment prose. |
| 1 — runtime owner | Package pinned image and deployment definition; address health, cancellation, transient failures, refinement recovery, and state reconstruction. Keep provider and DB contracts unchanged. | Frozen build, offline unit/mock smoke, `release-preflight` against the intended schema, cold-task reconstruction and fault-injection results. Existing command names come from the repo; running `validate-hermes` spends live provider usage and requires explicit authorization. |
| 2 — release owner | Deploy isolated staging/canary with one task and non-customer queue/data. Measure cold start, report/correction/refinement durations, peak RSS, queue lag, and provider failures. | Verified connected and unconnected report paths, immutable artifact and DB finalization, tenant-isolation tests, secret rotation, network interruption, forced termination, duplicate claim, lost commit reply, and retry exhaustion. No “load-tested” claim without retained real output. |
| 3 — founder-approved cutover | Freeze intake briefly or otherwise pause new claims with a verified mechanism; drain old work, snapshot required local state, stop VPS queue workers, then enable production ECS consumption at the approved cap. | No old active attempts or unresolved commits; one known consumer fleet; new customer-safe canary reaches terminal DB state and authorized report retrieval; versions and connections survive task replacement. Observe a full supported job/retry lifecycle before retirement. |
| 4 — optional optimization | Retire only worker-specific VPS dependencies after resolving operator API; consider event-driven tasks if measured idle cost matters. | Restore drill, retained rollback artifacts, then deletion approval. Portal/data-plane migration gets a separate business case. |

**Rollback:** retain the old worker artifact, locked dependencies, bundle and compatible configuration securely. On abnormal crash loops, rising oldest-job age, cross-tenant issue, connection loss, or report/provenance regression: pause intake/claims, scale ECS consumers to zero, confirm tasks stopped and reconcile running rows/unknown commits, then restart the known-good VPS workers at the previous approved capacity. Do not simply run both fleets or bulk-reset every running row. Recover only confirmed abandoned attempts through the audited DB/operator path. Because this phase keeps Vercel and Supabase unchanged, rollback is a compute switch—not a database restore. Any required migrations must be additive/backward-compatible with the rollback worker; otherwise stop and redesign the cutover.

A successful ECS deployment is not launch acceptance. Acceptance is an authorized user's completed, correctly scoped report with durable versions and connections, plus proven failure recovery and an affordable post-credit operating model.

## Official AWS references

Fetched for this memo; confirm account-specific availability and quotas before implementation.

- **[A1] Lambda quotas:** https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
- **[A2] ECS Fargate task definition parameters** (roles, networking, resource sizing, health checks, `stopTimeout`): https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html
- **[A3] Fargate ephemeral storage:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-storage.html
- **[A4] ECS Secrets Manager environment injection:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
- **[A5] Fargate pricing:** https://aws.amazon.com/fargate/pricing/
- **[A6] VPC pricing** (NAT and public IPv4): https://aws.amazon.com/vpc/pricing/
- **[A7] AWS promotional credit terms:** https://aws.amazon.com/awscredits/
