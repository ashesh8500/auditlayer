# Refinement review closure — 2026-09-19

## Outcome and scope

Closed the three findings in `/tmp/alm-final-worker-review.md` with offline RED → GREEN regressions. No provider calls, production/control-plane access, database execution, builds, shared-server changes, migrations, commits, or deployment. Existing parent and sibling changes are retained; `web/src/lib/actions/refinements.ts` was not edited.

**Canonical prompt stamp is now `1.12`.** The evidence closure used `1.10`; parser closures used `1.11` for block-in-paragraph rejection and `1.12` for table/list/anchor content models. Prior unshipped customer-shell and evidence changes retain their changelog entries. No bundle-version change or generation-model change in this closure.

### Independent review reconciliation and parser delta

`/tmp/alm-commercial-refinement-closure-review.md` independently closed commercial B1/B2, section evidence, whole-attempt deadline/accounting, and standalone resume recovery. It withheld scoped approval for an actual producer/consumer mismatch: valid table rows caused parse5 to insert an implicit `tbody`, and the web validator then returned no editable headings.

Parent correction permits only an inert parser-generated, attribute-free `tbody` beneath a table with row children. Authored/unclosed containers and cells retain their closing-tag requirements; active attributes still fail closed. Heading bounds use Unicode code points, matching Python. Both sides reject block descendants within paragraphs rather than accepting browser repairs.

Observed RED: two web regressions (implicit tbody and Unicode heading length); three subsequent cross-language paragraph regressions. GREEN: **55 worker tests** across parser parity, evidence, security, lineage, lifecycle, deadline and prompt tests; **25 web tests** across parser, refinement actions and owner detail. Whole-web typecheck, scoped ESLint and whitespace checks passed. The new `worker/tests/test_refinement_parser_crosslang.py` invokes the actual Python generator with an offline fake provider, actual version replacement, and actual TS consumer using Node; no paid calls or database writes. It covers implicit/explicit tbody, supplementary-plane headings, and malformed paragraph variants.

The initial `deleg_cf7fd8a2` delta review closed implicit tbody but reproduced four remaining malformed-structure gaps (nested anchors, nested list items, direct table cells, nested rows). Parent observed **13 RED regressions** covering those and the structural parent/child/text model, then enforced explicit table/list content models, nonnested anchors and inline-only subheadings. Canonical stamp advanced to **1.12** with changelog. Web acceptance was not weakened. **68 focused worker tests passed**; rerunning the independent actual producer→replacement→TS corpus returned **34 cases, zero mismatches**, retaining every expected heading across five report types.

Broad worker rerun: **824 passed, 12 skipped, 1 deliberately deselected** (`test_is_tcp_reachable_open_port`) with the Python network-denial hook. An initial inherited Node network guard also blocked tsx's Unix IPC, producing two intake-harness failures; repeating with `NODE_OPTIONS=''` restored the existing local IPC runner and passed. This distinction is a harness correction, not a product fix or full subprocess network-isolation claim.

Final content-model delta review `deleg_aa11080c` returned **bounded PASS**, report `/tmp/alm-refinement-content-model-review.md`. Independent actual-code corpus: **34 cases, zero mismatches**, plus five additional safe nested-list/table/anchor cases (the supplementary 16-case probe overlaps the corpus, so totals are not added). **56 focused worker tests passed**; all five canonical renderer types retained expected headings. Parent compared the report's eight exact SHA-256 entries against current files: **8/8 unchanged**. The four reproduced parser mismatches are closed; prior commercial/deadline/drain closures remain undisturbed. This is not a universal parser-equivalence proof or release approval. Final integrated build, authenticated browser stories, latency and expanded-product gates remain pending; subsequent changes to reviewed integration surfaces require delta verification.

## Evidence completeness

- The prompt receives the **complete selected section**, identified structurally, plus report-visible supporting text and HTTP(S) source URLs. It no longer receives the first 12,000 characters of the document shell.
- Head/style/script/SVG content is excluded from supporting evidence. Snapshot dates and public-data limitations outside sections are retained, as are sources in the appended aside.
- Selected HTML is limited to 32,000 characters; supporting visible evidence is limited to 48,000. Overflow fails before inference instead of silently truncating observations or citations. The instruction explicitly preserves facts, numeric observations, uncertainty, attribution, and as-of dates, and treats artifact content as untrusted.
- Ten renderer regressions cover **first and last sections in all five actual structured-rendered types**: Pulse, Standard, Extended, Blueprint, Enterprise. Unique section content and source markers must reach the exact prompt; CSS must not. Separate cases cover oversized evidence, very large CSS that must not consume the evidence allowance, and out-of-section snapshot limitations.
- This supplies available artifact evidence; it does not recover raw research that was never stored in the artifact or claim model factuality from HTML validation alone.

## Safe section identity

- Worker replacement and prompt extraction share an offset-preserving structural section parser and the existing strict producer validator. Replacement still inserts literal bytes, not regex replacement syntax.
- The web parser mirrors the safe section tag/attribute subset, decodes heading text structurally, and accepts safe historical `h2` classes and inline spans/emphasis. Safe producer output remains editable on subsequent edits.
- Nested sections, extra/nested headings, active attributes, duplicate attributes, duplicate heading identities, and block markup inside a heading fail closed. The producer now rejects block markup inside `h2` too. The parsers do not sanitize an unsafe heading into an authorized identity.
- A separate offline cross-language probe passed actual mock-renderer artifacts through the TypeScript parser: Pulse 3, Standard 15, Extended 20, Blueprint 15, Enterprise 15 headings, including each first/last heading. No browser/server was involved.

## Enforced runtime and lease contract

`_process_refinement` supervises the **whole attempt**, not a thread around `run_conversation`:

1. Capture a monotonic start before any attempt work. Require an explicit valid lease; refuse missing/invalid/insufficient leases before starting a child.
2. Bound execution to `min(900 seconds, remaining lease − 180 seconds)`. Lock wait consumes this same budget. No deadline renewal or queue replay is introduced.
3. Run setup, artifact download, all provider retries/conversation, validation, usage writes, upload, finalization/reconciliation, events, and runtime shutdown in one killable Linux child. Construct fresh gateway/runtime clients there rather than sharing the parent's HTTP connection pools across the fork.
4. Reuse the existing managed-search fork/Pipe containment pattern in `hermes_inprocess.py`. The intelligence runtime's cooperative thread deadline was inspected and intentionally not used as hard cancellation.
5. Hold the parent's home lock until containment completes; TERM, a bounded 0.25-second grace, group KILL, and a bounded 0.5-second join follow. Wait on the sentinel before reaping so the process-group leader's PID cannot be reused before group KILL. Close both pipe endpoints and the process handle. If a child cannot be reaped even after KILL, fail-stop the supervisor instead of returning a reusable worker with a live attempt.
6. Install Linux `PR_SET_PDEATHSIG=SIGKILL` before executing the child operation, with a parent-PID race check. Unsupported setup fails before paid work.
7. On timeout/unknown child outcome, perform no unbounded post-deadline database cleanup, overwrite no possibly committed result, and fabricate no zero spend. The existing fenced reaper reconciles an immutable source version or fails the attempt terminally. A timed-out running row can therefore remain visible until the fixed lease expires; sibling claims remain excluded until then.

A fresh claim has a 15-minute execution ceiling plus less than one second of bounded termination waits, comfortably inside its 20-minute lease. Older claims reserve three minutes before expiry. The fixed SQL lease, same-audit exclusion, source-identity reconciliation, and drain claim fence are unchanged.

**Boundary of proof:** offline tests prove local process termination, including a SIGTERM-ignoring fake provider, not that a remote provider refunds or stops an already accepted request when its socket closes. Such spend remains unknown when no usage response was received. No live cancellation/provider behavior is claimed.

## Accounting and exclusivity evidence

Real fork/supervisor tests exercise a fake provider and file-backed fake durable control plane, not parent-only Mock call lists. They cover:

- a stubborn `InProcessHermesClient.chat` conversation, exact DeepSeek/tool-free/context-free construction, killed PID, no active child, and a home lock reacquirable from another thread;
- lock contention consuming the entire deadline without starting an operation;
- process/Pipe setup failure releasing the lock;
- remaining-lease budget and pre-start refusal;
- hanging download and hanging persistence bounded by the whole-job deadline;
- successful and invalid-response known token usage remaining reported;
- transport failure without usage remaining NULL rather than zero;
- committed-but-lost finalization response retaining `done` and known usage;
- exactly one fake provider attempt, never an automatic replay.

No migration was added or edited. The final `claim_next_refinement` override remains **`20260919211532_worker_fleet_drain.sql`**, even though a later commercial migration exists in this shared worktree. Its shared drain-control lock, pause check, audit-row lock, sibling-running recheck, base capture, and 20-minute lease remain intact. Observed SHA-256 of that exact drain file: `91c5cba3a418a3e488673293ad5e018373247170158cf9ea43459afdf3be3bbb`. This lane did not rerun PostgreSQL integration; the separate drain lane's real SQL evidence is not presented as new execution here.

## Verification and reproduction

Final verification:

- Full worker suite: **762 passed, 12 skipped, 1 deselected**. The deselected test is the real loopback socket reachability test; network denial would correctly prevent its bind. The parent's pinned-brief fixture fix remains intact.
- Focused web refinement action/parser/status/hook/viewer suite: **18 passed** across five files.
- Whole-web `tsc --noEmit --incremental false`: passed.
- Targeted ESLint for `refinement.ts` and its test: passed.
- Repository `git diff --check`: passed.

Worker command, from `worker/` (audit hook denies connection, bind, and DNS; inherited by the fork tests):

```sh
.venv/bin/python -c "import sys,pytest; sys.addaudithook(lambda e,a: (_ for _ in ()).throw(RuntimeError('offline '+e)) if e in {'socket.connect','socket.bind','socket.getaddrinfo'} else None); raise SystemExit(pytest.main(['tests','-q','--tb=short','-k','not test_is_tcp_reachable_open_port']))"
```

For focused reproduction, substitute `tests/test_refinement_review_closure.py` and `tests/test_refinement_deadline.py` for `tests` in the pytest arguments.

The Node deny guard used at `/tmp/alm-review-deny-network.cjs` contains:

```js
const deny = () => { throw new Error('review: network forbidden'); };
require('node:net').Socket.prototype.connect = deny;
require('node:net').Server.prototype.listen = deny;
require('node:dns').lookup = deny;
require('node:tls').connect = deny;
globalThis.fetch = deny;
```

From `web/`, after creating that guard if reproducing on another machine:

```sh
NODE_OPTIONS=--require=/tmp/alm-review-deny-network.cjs node_modules/.bin/vitest run src/lib/refinement.test.ts src/lib/actions/refinements.test.ts src/lib/use-refinement-status.test.tsx src/components/report-viewer.refinement.test.tsx 'src/app/api/audits/[id]/refinements/route.test.ts'
NODE_OPTIONS=--require=/tmp/alm-review-deny-network.cjs node_modules/.bin/tsc --noEmit --incremental false
NODE_OPTIONS=--require=/tmp/alm-review-deny-network.cjs node_modules/.bin/eslint src/lib/refinement.ts src/lib/refinement.test.ts
```

RED runs reproduced missing first/last evidence in all five types, silently truncated oversized evidence, rejected safe historical headings, accepted nested/duplicate structural identities, absent killable deadline boundary, leaked lock on Pipe setup failure, accepted block markup inside a heading, and missing external snapshot context. The corresponding GREEN runs preceded full-suite verification. Tests of previously correct accounting behavior were retained/expanded, not weakened to accommodate process isolation.

## Files touched by this lane

Production: `worker/auditlayer_worker/{core.py,refinement_sections.py,hermes_inprocess.py,worker.py}` and `web/src/lib/refinement.ts`.

Tests: new `worker/tests/test_refinement_review_closure.py`, new `worker/tests/test_refinement_deadline.py`, expanded `web/src/lib/refinement.test.ts`; updated version assertion in `test_prompt_version.py`, canonical input fixture in `test_hermes_embedded.py`, and direct attempt-unit targets in `test_refinement_bundle_lineage.py` / `test_worker_job_health.py`. The latter continue testing the same accounting/ambiguous-finalization implementation; new tests separately exercise the real process supervisor.

Documentation: this handoff. Temporary cross-language fixture: `/tmp/alm-refinement-rendered.json`.

Release integration, reviewed-source deployment, production lease/provider observation, full migration-chain validation, and any live factual-quality evaluation remain parent/operator gates, not claims of this offline closure.
