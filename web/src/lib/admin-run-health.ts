/**
 * admin-run-health.ts — canonical deterministic founder run-health projection.
 *
 * ALM-I-016: project authoritative run health into a founder-only recovery
 * view. One pure, typed, dependency-free projection over the two authoritative
 * run records:
 *
 *   - `report_generation_runs` — PRIVATE report-attempt telemetry (status
 *     vocabulary: running/ready/needs_review/failed/blocked/crashed), owned by
 *     the report pipeline (ALM-I-015 owner matrix).
 *   - `intelligence_runs` — subject-domain run truth (status vocabulary:
 *     running/completed/failed), owned by the intelligence runtime.
 *
 * The two status vocabularies are NEVER conflated. `total_deadline` and
 * `cancellation` are UNSUPPORTED on both records (no deadline/cancellation
 * column exists; ALM-I-015 marks deadline_seconds/deadline_exceeded
 * unsupported) and therefore always project to UNKNOWN with the exact
 * correction path — never fabricated success. No recovery mutation is added
 * here; correction tips are non-mutating guidance only.
 *
 * Report attempts may carry the allowlisted current status of their parent
 * audit. A ready parent resolves older failed/crashed attempt telemetry without
 * rewriting that immutable history. Intelligence runs are reconciled only
 * within the same subject: a later completed run resolves an older failed or
 * stale run. The audit→batch→subject path remains many-to-many and is never
 * inferred here.
 *
 * Time is injected (`nowMs`) so every age/order decision is deterministic.
 * The serialized projection carries only allowlisted health fields — no
 * handles, emails, evidence bodies, stage payload values, raw exceptions,
 * credentials, or tracebacks.
 *
 * Fixtures prove projection/access/redaction behavior only — never live
 * persistence, transport cancellation, latency, or production health.
 */

import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Owner vocabularies (authoritative; ALM-I-015 telemetry-persistence contract)
// ---------------------------------------------------------------------------

/** report_generation_runs.status CHECK (report-pipeline vocabulary). */
export const REPORT_RUN_STATUS_VOCABULARY = [
  "running",
  "ready",
  "needs_review",
  "failed",
  "blocked",
  "crashed",
] as const;
export type ReportRunStatus = (typeof REPORT_RUN_STATUS_VOCABULARY)[number];

/** intelligence_runs.status CHECK (subject-run vocabulary). */
export const INTELLIGENCE_RUN_STATUS_VOCABULARY = [
  "running",
  "completed",
  "failed",
] as const;
export type IntelligenceRunStatus =
  (typeof INTELLIGENCE_RUN_STATUS_VOCABULARY)[number];

/** Shared cache/resume vocabulary on both records. */
export const CACHE_MODE_VOCABULARY = ["fresh", "reused", "resume"] as const;
export type CacheMode = (typeof CACHE_MODE_VOCABULARY)[number] | null;

export type RunOwner = "report_generation_run" | "intelligence_run";

/** Active (non-terminal) statuses per owner, used for delayed derivation. */
const REPORT_ACTIVE_STATUSES: readonly ReportRunStatus[] = ["running"];
const INTELLIGENCE_ACTIVE_STATUSES: readonly IntelligenceRunStatus[] = [
  "running",
];

// ---------------------------------------------------------------------------
// Options + thresholds
// ---------------------------------------------------------------------------

/**
 * Default delayed threshold (ms). A non-terminal run whose age exceeds this is
 * projected as `delayed`. 10 minutes matches the customer-facing staleness
 * default in `web/src/lib/intelligence/client-status.ts` so the founder view
 * and the customer view describe the same boundary.
 */
export const DEFAULT_DELAYED_THRESHOLD_MS = 10 * 60 * 1000;

export interface RunHealthProjectionOptions {
  /** Injectable clock (ms since epoch). Defaults to Date.now(). */
  nowMs?: number;
  /** Delayed threshold (ms). Defaults to DEFAULT_DELAYED_THRESHOLD_MS. */
  delayedThresholdMs?: number;
}

// ---------------------------------------------------------------------------
// Bounded projection output
// ---------------------------------------------------------------------------

/** A signal the records cannot prove; always UNKNOWN with an exact path. */
export interface UnsupportedSignal {
  signal: "total_deadline" | "cancellation";
  state: "UNKNOWN";
  correctionTip: string;
}

export const TOTAL_DEADLINE_UNSUPPORTED: UnsupportedSignal = {
  signal: "total_deadline",
  state: "UNKNOWN",
  correctionTip:
    "Total-deadline state is not persisted on report_generation_runs or intelligence_runs (no deadline column; ALM-I-015 marks deadline_seconds/deadline_exceeded unsupported). Observe deadline enforcement in worker runtime-budget telemetry; no founder action exists on run records.",
};

export const CANCELLATION_UNSUPPORTED: UnsupportedSignal = {
  signal: "cancellation",
  state: "UNKNOWN",
  correctionTip:
    "Cancellation state is not persisted on either run record (no cancellation column). In-flight provider-call cancellation is bounded by the worker per-call timeout; transport-level cancellation cannot be proven from run records.",
};

/** Allowlisted input shape for one report_generation_runs health row. */
export interface ReportRunHealthRow {
  id: string;
  audit_id: string | null;
  status: string;
  error_code: string | null;
  cache_mode: string | null;
  evidence_items: number | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string | null;
  /** Allowlisted current parent state from audit:audits(status). */
  audit?: { status: string } | null;
}

/** Allowlisted input shape for one intelligence_runs health row. */
export interface IntelligenceRunHealthRow {
  id: string;
  subject_id: string | null;
  status: string;
  cache_mode: string | null;
  latency_ms: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export type ReportHealthState =
  | "ready"
  | "running"
  | "delayed"
  | "failed"
  | "crashed"
  | "blocked"
  | "needs_review"
  | "resumed"
  | "contradictory"
  | "unknown";

export type IntelligenceHealthState =
  | "completed"
  | "running"
  | "delayed"
  | "failed"
  | "resumed"
  | "contradictory"
  | "unknown";

interface RunHealthBase {
  owner: RunOwner;
  recordId: string;
  /** Raw record status (kept distinct from the derived health state). */
  status: string;
  /** False when the raw status is outside the owner vocabulary. */
  statusKnown: boolean;
  /** Age in ms from the reference timestamp, or null when unknown. */
  ageMs: number | null;
  ageKnown: boolean;
  /** The timestamp age is measured from (started_at / created_at). */
  referenceAt: string | null;
  cacheMode: CacheMode;
  /** True when cache_mode === "resume" (cache/resume state). */
  resumed: boolean;
  contradictions: readonly string[];
  unsupported: readonly UnsupportedSignal[];
  /** Non-mutating recovery guidance; null when no founder action is useful. */
  correctionTip: string | null;
  /** True when later authoritative state proves this historical issue resolved. */
  recovered: boolean;
}

export interface ReportAttemptHealth extends RunHealthBase {
  owner: "report_generation_run";
  state: ReportHealthState;
  auditId: string | null;
  errorCode: string | null;
  evidenceItems: number | null;
}

export interface IntelligenceRunHealth extends RunHealthBase {
  owner: "intelligence_run";
  state: IntelligenceHealthState;
  subjectId: string | null;
  latencyMs: number | null;
}

export interface RunHealthBundle {
  reportAttempts: readonly ReportAttemptHealth[];
  intelligenceRuns: readonly IntelligenceRunHealth[];
  empty: boolean;
  nowMs: number;
  delayedThresholdMs: number;
  providerCalls: 0;
}

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function isReportStatus(value: string): value is ReportRunStatus {
  return (REPORT_RUN_STATUS_VOCABULARY as readonly string[]).includes(value);
}

function isIntelligenceStatus(value: string): value is IntelligenceRunStatus {
  return (INTELLIGENCE_RUN_STATUS_VOCABULARY as readonly string[]).includes(
    value,
  );
}

function normalizeCacheMode(value: string | null | undefined): CacheMode {
  if (value === null || value === undefined) return null;
  return (CACHE_MODE_VOCABULARY as readonly string[]).includes(value)
    ? (value as CacheMode)
    : null;
}

/**
 * Bounded error-code surface: a normalized ≤200-char single-line code is safe
 * to show the founder as scrubbed structured evidence. Any raw value carrying
 * control characters (multi-line tracebacks, embedded secrets) is rejected to
 * UNKNOWN *before* whitespace collapsing — never reshaped into a clean-looking
 * code. The DB CHECK additionally bounds stored codes to 120 chars.
 */
function boundErrorCode(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 200) return null;
  return cleaned;
}

// ---------------------------------------------------------------------------
// Projection: report_generation_runs (private attempt telemetry)
// ---------------------------------------------------------------------------

/**
 * Project one report-generation attempt. The state vocabulary is the report
 * pipeline's own; `running` beyond the delayed threshold becomes `delayed`;
 * impossible markers (finished_at while running, clock reversal, future
 * reference) become `contradictory`; an out-of-vocabulary status becomes
 * `unknown` — never success.
 */
export function projectReportAttempt(
  row: ReportRunHealthRow,
  options: RunHealthProjectionOptions = {},
): ReportAttemptHealth {
  const nowMs = options.nowMs ?? Date.now();
  const thresholdMs = options.delayedThresholdMs ?? DEFAULT_DELAYED_THRESHOLD_MS;

  const referenceMs = parseMs(row.started_at);
  const ageMs =
    referenceMs === null ? null : Math.max(0, nowMs - referenceMs);
  const ageKnown = referenceMs !== null;
  const contradictions = collectReportContradictions(row, nowMs);

  const statusKnown = isReportStatus(row.status);
  const unsupported: readonly UnsupportedSignal[] = [
    TOTAL_DEADLINE_UNSUPPORTED,
    CANCELLATION_UNSUPPORTED,
  ];
  const resumed = normalizeCacheMode(row.cache_mode) === "resume";

  let state: ReportHealthState;
  let correctionTip: string | null = null;

  if (!statusKnown) {
    state = "unknown";
    correctionTip =
      `Status ${JSON.stringify(row.status)} is not in the report-attempt ` +
      `vocabulary ${JSON.stringify([...REPORT_RUN_STATUS_VOCABULARY])}; treat ` +
      "as UNKNOWN until the record is reconciled.";
  } else if (contradictions.length > 0) {
    state = "contradictory";
    correctionTip =
      `Contradictory report attempt: ${contradictions.join("; ")}. ` +
      "Reconcile via worker logs before relying on this run.";
  } else {
    const status = row.status as ReportRunStatus;
    const active = (REPORT_ACTIVE_STATUSES as readonly string[]).includes(
      status,
    );
    if (active) {
      const delayed = ageKnown && ageMs !== null && ageMs > thresholdMs;
      state = delayed ? "delayed" : "running";
      if (delayed) {
        const minutes = Math.max(1, Math.round(thresholdMs / 60_000));
        correctionTip =
          `Attempt has been active past the ${minutes}-minute delayed ` +
          "threshold. Check worker health and queue state before acting.";
      }
    } else {
      state = status; // ready | needs_review | failed | blocked | crashed
      switch (status) {
        case "failed":
          correctionTip =
            `Attempt failed with error_code=${row.error_code ?? "none"}. Open ` +
            "the audit review surface to requeue or block (existing founder actions).";
          break;
        case "crashed":
          correctionTip =
            "Worker crashed mid-run. Check worker logs, then open the audit " +
            "review surface for recovery options.";
          break;
        case "blocked":
          correctionTip =
            "Founder decision required: open the audit review surface to " +
            "unblock or reject this attempt.";
          break;
        case "needs_review":
          correctionTip =
            "Founder decision required: confirm the platform on the audit " +
            "review surface before generation.";
          break;
        default:
          correctionTip = null;
      }
    }
  }

  const recovered = row.audit?.status === "ready" && state !== "ready";
  if (recovered) {
    correctionTip =
      "The audit is ready. This historical attempt is retained for provenance; " +
      "no founder action is required.";
  }

  return {
    owner: "report_generation_run",
    recordId: row.id,
    auditId: row.audit_id,
    status: row.status,
    statusKnown,
    state,
    ageMs,
    ageKnown,
    referenceAt: row.started_at,
    cacheMode: normalizeCacheMode(row.cache_mode),
    resumed,
    errorCode: boundErrorCode(row.error_code),
    evidenceItems:
      row.evidence_items === null || row.evidence_items === undefined
        ? null
        : Math.max(0, Number(row.evidence_items)),
    contradictions,
    unsupported,
    correctionTip,
    recovered,
  };
}

function collectReportContradictions(
  row: ReportRunHealthRow,
  nowMs: number,
): readonly string[] {
  const out: string[] = [];
  if (row.status === "running" && row.finished_at) {
    out.push("finished_at is set while status is running");
  }
  const startedMs = parseMs(row.started_at);
  const updatedMs = parseMs(row.updated_at);
  if (startedMs !== null && updatedMs !== null && updatedMs < startedMs) {
    out.push("updated_at precedes started_at");
  }
  if (startedMs !== null && startedMs > nowMs) {
    out.push("started_at is in the future");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Projection: intelligence_runs (subject-domain run truth)
// ---------------------------------------------------------------------------

/**
 * Project one intelligence run. `completed` is subject truth for a finished
 * run; `running` beyond the delayed threshold becomes `delayed`; latency while
 * running, clock reversal, or a future reference becomes `contradictory`; an
 * out-of-vocabulary status becomes `unknown`. The report-attempt vocabulary is
 * never applied here.
 */
export function projectIntelligenceRun(
  row: IntelligenceRunHealthRow,
  options: RunHealthProjectionOptions = {},
): IntelligenceRunHealth {
  const nowMs = options.nowMs ?? Date.now();
  const thresholdMs = options.delayedThresholdMs ?? DEFAULT_DELAYED_THRESHOLD_MS;

  const referenceMs = parseMs(row.created_at);
  const ageMs =
    referenceMs === null ? null : Math.max(0, nowMs - referenceMs);
  const ageKnown = referenceMs !== null;
  const contradictions = collectIntelligenceContradictions(row, nowMs);

  const statusKnown = isIntelligenceStatus(row.status);
  const unsupported: readonly UnsupportedSignal[] = [
    TOTAL_DEADLINE_UNSUPPORTED,
    CANCELLATION_UNSUPPORTED,
  ];
  const resumed = normalizeCacheMode(row.cache_mode) === "resume";

  let state: IntelligenceHealthState;
  let correctionTip: string | null = null;

  if (!statusKnown) {
    state = "unknown";
    correctionTip =
      `Status ${JSON.stringify(row.status)} is not in the intelligence-run ` +
      `vocabulary ${JSON.stringify([...INTELLIGENCE_RUN_STATUS_VOCABULARY])}; ` +
      "treat as UNKNOWN until the record is reconciled.";
  } else if (contradictions.length > 0) {
    state = "contradictory";
    correctionTip =
      `Contradictory intelligence run: ${contradictions.join("; ")}. ` +
      "Reconcile via worker logs before relying on this run.";
  } else {
    const status = row.status as IntelligenceRunStatus;
    const active = (INTELLIGENCE_ACTIVE_STATUSES as readonly string[]).includes(
      status,
    );
    if (active) {
      const delayed = ageKnown && ageMs !== null && ageMs > thresholdMs;
      state = delayed ? "delayed" : "running";
      if (delayed) {
        const minutes = Math.max(1, Math.round(thresholdMs / 60_000));
        correctionTip =
          `Run has been active past the ${minutes}-minute delayed threshold. ` +
          "Check worker health and runtime budget telemetry.";
      }
    } else {
      state = status; // completed | failed
      if (status === "failed") {
        correctionTip =
          "Run failed. Inspect runtime-budget telemetry and retry from the " +
          "subject surface.";
      }
    }
  }

  return {
    owner: "intelligence_run",
    recordId: row.id,
    subjectId: row.subject_id,
    status: row.status,
    statusKnown,
    state,
    ageMs,
    ageKnown,
    referenceAt: row.created_at,
    cacheMode: normalizeCacheMode(row.cache_mode),
    resumed,
    latencyMs:
      row.latency_ms === null || row.latency_ms === undefined
        ? null
        : Math.max(0, Number(row.latency_ms)),
    contradictions,
    unsupported,
    correctionTip,
    recovered: false,
  };
}

function collectIntelligenceContradictions(
  row: IntelligenceRunHealthRow,
  nowMs: number,
): readonly string[] {
  const out: string[] = [];
  if (row.status === "running" && row.latency_ms !== null && row.latency_ms !== undefined) {
    out.push("latency_ms is set while status is running");
  }
  const createdMs = parseMs(row.created_at);
  const updatedMs = parseMs(row.updated_at);
  if (createdMs !== null && updatedMs !== null && updatedMs < createdMs) {
    out.push("updated_at precedes created_at");
  }
  if (createdMs !== null && createdMs > nowMs) {
    out.push("created_at is in the future");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bundle + deterministic ordering
// ---------------------------------------------------------------------------

function orderByReferenceDesc<T extends { referenceAt: string | null; recordId: string }>(
  items: readonly T[],
): readonly T[] {
  return [...items].sort((a, b) => {
    const aMs = parseMs(a.referenceAt) ?? -Infinity;
    const bMs = parseMs(b.referenceAt) ?? -Infinity;
    if (bMs !== aMs) return bMs - aMs;
    return a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0;
  });
}

export interface ProjectRunHealthInput {
  reportAttempts: readonly ReportRunHealthRow[];
  intelligenceRuns: readonly IntelligenceRunHealthRow[];
}

/**
 * Project both records under their own vocabularies and order each list by
 * reference timestamp descending (stable, record-id tie-break). Recovery is
 * bounded to explicit parent-audit state or a later completed run for the same
 * subject. provider_calls is a typed literal 0 — this projection can never
 * spend model tokens.
 */
export function projectRunHealth(
  input: ProjectRunHealthInput,
  options: RunHealthProjectionOptions = {},
): RunHealthBundle {
  const nowMs = options.nowMs ?? Date.now();
  const delayedThresholdMs =
    options.delayedThresholdMs ?? DEFAULT_DELAYED_THRESHOLD_MS;
  const reportAttempts = orderByReferenceDesc(
    input.reportAttempts.map((row) =>
      projectReportAttempt(row, { nowMs, delayedThresholdMs }),
    ),
  );
  const projectedIntelligenceRuns = orderByReferenceDesc(
    input.intelligenceRuns.map((row) =>
      projectIntelligenceRun(row, { nowMs, delayedThresholdMs }),
    ),
  );
  const latestCompletedBySubject = new Map<string, number>();
  for (const run of projectedIntelligenceRuns) {
    if (run.subjectId && run.state === "completed") {
      const completedAt = parseMs(run.referenceAt);
      if (completedAt !== null) {
        latestCompletedBySubject.set(
          run.subjectId,
          Math.max(
            latestCompletedBySubject.get(run.subjectId) ?? -Infinity,
            completedAt,
          ),
        );
      }
    }
  }
  const intelligenceRuns = projectedIntelligenceRuns.map((run) => {
    const completedAt = run.subjectId
      ? latestCompletedBySubject.get(run.subjectId)
      : undefined;
    const referenceAt = parseMs(run.referenceAt);
    const recovered =
      run.state !== "completed" &&
      completedAt !== undefined &&
      referenceAt !== null &&
      completedAt > referenceAt;
    return recovered
      ? {
          ...run,
          recovered: true,
          correctionTip:
            "A later completed intelligence run resolved this historical record; " +
            "no founder action is required.",
        }
      : run;
  });
  return {
    reportAttempts,
    intelligenceRuns,
    empty: reportAttempts.length === 0 && intelligenceRuns.length === 0,
    nowMs,
    delayedThresholdMs,
    providerCalls: 0,
  };
}

// ---------------------------------------------------------------------------
// Deterministic age formatting (locale-independent, clock-free after ageMs)
// ---------------------------------------------------------------------------

/**
 * Format an age in ms as a short deterministic label: "45s", "12m", "3h 5m",
 * or "UNKNOWN" for an unknown age. Pure and locale-independent.
 */
export function formatRunAge(ageMs: number | null): string {
  if (ageMs === null) return "UNKNOWN";
  const totalSeconds = Math.max(0, Math.floor(ageMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// ---------------------------------------------------------------------------
// Redaction-safe serialization (used by tests and the contract artifact)
// ---------------------------------------------------------------------------

/**
 * Deterministic allowlisted serialization of one health projection. Only the
 * bounded health surface is emitted; handles, emails, evidence bodies, stage
 * payload values, raw exceptions, credentials, and tracebacks are structurally
 * absent.
 */
export function serializeReportAttemptHealth(
  h: ReportAttemptHealth,
): Record<string, unknown> {
  return {
    owner: h.owner,
    recordId: h.recordId,
    auditId: h.auditId,
    status: h.status,
    statusKnown: h.statusKnown,
    state: h.state,
    ageMs: h.ageMs,
    ageKnown: h.ageKnown,
    cacheMode: h.cacheMode,
    resumed: h.resumed,
    errorCode: h.errorCode,
    evidenceItems: h.evidenceItems,
    contradictions: [...h.contradictions],
    unsupported: h.unsupported.map((u) => ({ ...u })),
    correctionTip: h.correctionTip,
    recovered: h.recovered,
  };
}

export function serializeIntelligenceRunHealth(
  h: IntelligenceRunHealth,
): Record<string, unknown> {
  return {
    owner: h.owner,
    recordId: h.recordId,
    subjectId: h.subjectId,
    status: h.status,
    statusKnown: h.statusKnown,
    state: h.state,
    ageMs: h.ageMs,
    ageKnown: h.ageKnown,
    cacheMode: h.cacheMode,
    resumed: h.resumed,
    latencyMs: h.latencyMs,
    contradictions: [...h.contradictions],
    unsupported: h.unsupported.map((u) => ({ ...u })),
    correctionTip: h.correctionTip,
    recovered: h.recovered,
  };
}

export function serializeRunHealthBundle(bundle: RunHealthBundle): Record<string, unknown> {
  return {
    contract: "admin-run-health",
    version: ADMIN_RUN_HEALTH_VERSION,
    providerCalls: bundle.providerCalls,
    empty: bundle.empty,
    nowMs: bundle.nowMs,
    delayedThresholdMs: bundle.delayedThresholdMs,
    reportAttempts: bundle.reportAttempts.map(serializeReportAttemptHealth),
    intelligenceRuns: bundle.intelligenceRuns.map(serializeIntelligenceRunHealth),
  };
}

// ---------------------------------------------------------------------------
// Deterministic contract artifact
// ---------------------------------------------------------------------------

export const ADMIN_RUN_HEALTH_VERSION = "1.1.0";

export interface AdminRunHealthContract {
  contract: "admin-run-health";
  version: string;
  providerCalls: 0;
  delayedThresholdMs: number;
  owners: {
    report_generation_run: {
      statusVocabulary: readonly string[];
      allowlistedHealthFields: readonly string[];
      ownerNote: string;
    };
    intelligence_run: {
      statusVocabulary: readonly string[];
      allowlistedHealthFields: readonly string[];
      ownerNote: string;
    };
  };
  cacheModeVocabulary: readonly string[];
  unsupportedSignals: {
    total_deadline: "UNKNOWN";
    cancellation: "UNKNOWN";
    correctionTips: Record<"total_deadline" | "cancellation", string>;
  };
  fixtureCases: readonly string[];
  joinBehavior: string;
  redactionExcludes: readonly string[];
}

/**
 * The inspectable, deterministic contract backing the founder run-health view.
 * Static by construction: no timestamps, environment paths, customer data, or
 * provider calls. Used to emit `web/artifacts/admin-run-health-contract.json`.
 */
export function buildAdminRunHealthContract(): AdminRunHealthContract {
  return {
    contract: "admin-run-health",
    version: ADMIN_RUN_HEALTH_VERSION,
    providerCalls: 0,
    delayedThresholdMs: DEFAULT_DELAYED_THRESHOLD_MS,
    owners: {
      report_generation_run: {
        statusVocabulary: [...REPORT_RUN_STATUS_VOCABULARY],
        allowlistedHealthFields: [
          "id",
          "audit_id",
          "status",
          "error_code",
          "cache_mode",
          "evidence_items",
          "started_at",
          "finished_at",
          "updated_at",
          "audit.status",
        ],
        ownerNote:
          "Private report-attempt telemetry; report-pipeline status vocabulary. Never conjoined with intelligence-run vocabulary.",
      },
      intelligence_run: {
        statusVocabulary: [...INTELLIGENCE_RUN_STATUS_VOCABULARY],
        allowlistedHealthFields: [
          "id",
          "subject_id",
          "status",
          "cache_mode",
          "latency_ms",
          "created_at",
          "updated_at",
        ],
        ownerNote:
          "Subject-domain run truth; intelligence-run status vocabulary. Never conjoined with report-attempt vocabulary.",
      },
    },
    cacheModeVocabulary: [...CACHE_MODE_VOCABULARY],
    unsupportedSignals: {
      total_deadline: "UNKNOWN",
      cancellation: "UNKNOWN",
      correctionTips: {
        total_deadline: TOTAL_DEADLINE_UNSUPPORTED.correctionTip,
        cancellation: CANCELLATION_UNSUPPORTED.correctionTip,
      },
    },
    fixtureCases: [
      "ready",
      "running",
      "delayed",
      "failed",
      "crashed",
      "resumed",
      "empty",
      "contradictory",
      "recovered",
      "deadline-UNKNOWN",
      "cancellation-UNKNOWN",
    ],
    joinBehavior:
      "Report attempts use only audit_id→audits.status to distinguish recovered history from current founder work. Intelligence recovery uses only a later completed run for the same subject_id. The many-to-many audit→batch→subject path is not inferred.",
    redactionExcludes: [
      "handles",
      "emails",
      "evidence bodies",
      "stage payload values",
      "raw exceptions",
      "credentials",
      "tracebacks",
    ],
  };
}

// ---------------------------------------------------------------------------
// Direct execution: `node src/lib/admin-run-health.ts` writes the artifact
// deterministically (no timestamps, no absolute paths).
// ---------------------------------------------------------------------------

const moduleUrl = import.meta.url;
const argv1 = process.argv[1];
if (argv1) {
  const argvUrl = pathToFileURL(argv1).href;
  if (argvUrl === moduleUrl) {
    const here = dirname(fileURLToPath(moduleUrl));
    const webRoot = join(here, "..", "..");
    const artifactsDir = join(webRoot, "artifacts");
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }
    writeFileSync(
      join(artifactsDir, "admin-run-health-contract.json"),
      JSON.stringify(buildAdminRunHealthContract(), null, 2) + "\n",
      "utf8",
    );
    console.log(
      `admin-run-health ${ADMIN_RUN_HEALTH_VERSION}: artifact written (providerCalls=0)`,
    );
  }
}
