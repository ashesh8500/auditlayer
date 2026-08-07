/**
 * Bounded typed projection from an immutable report version to its pinned
 * canonical intelligence run (ALM-I-025).
 *
 * A report version may reference at most one same-subject completed
 * intelligence run. This module owns the seven canonical pinned version
 * fields and the projection vocabulary used by report readers (MCP/dashboard).
 * It never reads report prose and never backfills: missing or legacy
 * provenance projects explicit UNKNOWN with a correction tip and never blocks
 * retrieval.
 *
 * The seven field names mirror the worker manifest module
 * (worker/auditlayer_worker/intelligence/report_provenance.py) and the
 * intelligence_runs kernel columns; focused parity tests catch drift.
 */

export const REPORT_PROVENANCE_MANIFEST_VERSION = "1.0" as const;

export const REPORT_PROVENANCE_FIELDS = [
  "living_brief_version",
  "evidence_snapshot_id",
  "methodology_version",
  "expertise_pack_version",
  "prompt_version",
  "model_config_hash",
  "output_schema_version",
] as const;

export type ReportProvenanceField = (typeof REPORT_PROVENANCE_FIELDS)[number];

/** The canonical typed manifest pinned to one intelligence run. */
export type ReportProvenanceManifest = {
  living_brief_version: number | string;
  evidence_snapshot_id: string;
  methodology_version: string;
  expertise_pack_version: string;
  prompt_version: string;
  model_config_hash: string;
  output_schema_version: string;
};

/** A run source row carrying the seven canonical fields (read from the
 * intelligence_runs table via the report version reference). */
export type ReportProvenanceSource = {
  intelligence_run_id: string;
  living_brief_version: number | string;
  evidence_snapshot_id: string;
  methodology_version: string;
  expertise_pack_version: string;
  prompt_version: string;
  model_config_hash: string;
  output_schema_version: string;
};

export type ReportProvenance =
  | {
      status: "pinned";
      manifest_version: typeof REPORT_PROVENANCE_MANIFEST_VERSION;
      intelligence_run_id: string;
      manifest: ReportProvenanceManifest;
    }
  | {
      status: "unknown";
      correction_tip: string;
    };

export const REPORT_PROVENANCE_CORRECTION_TIP_UNKNOWN =
  "This report version is not pinned to a same-subject completed " +
  "intelligence run; provenance is UNKNOWN. The report is legacy or was " +
  "produced outside the subject ledger bridge.";

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

/**
 * Project a provenance source into the bounded typed manifest.
 *
 * Pinned only when every canonical field is present and non-empty. Any
 * missing field returns explicit UNKNOWN with a correction tip — never a
 * partial manifest and never prose-derived backfill. prompt_version is always
 * projected under its own name; it is never promoted to methodology_version.
 */
export function projectReportProvenance(
  source: ReportProvenanceSource | null | undefined,
): ReportProvenance {
  if (!source || isEmpty(source.intelligence_run_id)) {
    return {
      status: "unknown",
      correction_tip: REPORT_PROVENANCE_CORRECTION_TIP_UNKNOWN,
    };
  }
  const manifest: Record<ReportProvenanceField, unknown> = {
    living_brief_version: source.living_brief_version,
    evidence_snapshot_id: source.evidence_snapshot_id,
    methodology_version: source.methodology_version,
    expertise_pack_version: source.expertise_pack_version,
    prompt_version: source.prompt_version,
    model_config_hash: source.model_config_hash,
    output_schema_version: source.output_schema_version,
  };
  for (const field of REPORT_PROVENANCE_FIELDS) {
    if (isEmpty(manifest[field])) {
      return {
        status: "unknown",
        correction_tip: `Intelligence run ${source.intelligence_run_id} is missing ${field}; provenance cannot be pinned.`,
      };
    }
  }
  return {
    status: "pinned",
    manifest_version: REPORT_PROVENANCE_MANIFEST_VERSION,
    intelligence_run_id: source.intelligence_run_id,
    manifest: manifest as ReportProvenanceManifest,
  };
}
