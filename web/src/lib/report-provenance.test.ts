import { describe, expect, it } from "vitest";

import {
  projectReportProvenance,
  REPORT_PROVENANCE_FIELDS,
  REPORT_PROVENANCE_MANIFEST_VERSION,
  type ReportProvenanceSource,
} from "./report-provenance";

const RUN_ID = "33333333-3333-4333-8333-333333333333";
const SNAPSHOT_ID = "22222222-2222-4222-8222-222222222222";

function source(overrides: Partial<ReportProvenanceSource> = {}): ReportProvenanceSource {
  return {
    intelligence_run_id: RUN_ID,
    living_brief_version: 3,
    evidence_snapshot_id: SNAPSHOT_ID,
    methodology_version: "alm-bridge-v1",
    expertise_pack_version: "social-media-audit",
    prompt_version: "1.1",
    model_config_hash: "abc123def456",
    output_schema_version: "1.0",
    ...overrides,
  };
}

describe("report provenance manifest projection", () => {
  it("pins all seven canonical fields when complete", () => {
    const projected = projectReportProvenance(source());

    expect(projected).toEqual({
      status: "pinned",
      manifest_version: REPORT_PROVENANCE_MANIFEST_VERSION,
      intelligence_run_id: RUN_ID,
      manifest: {
        living_brief_version: 3,
        evidence_snapshot_id: SNAPSHOT_ID,
        methodology_version: "alm-bridge-v1",
        expertise_pack_version: "social-media-audit",
        prompt_version: "1.1",
        model_config_hash: "abc123def456",
        output_schema_version: "1.0",
      },
    });
    expect(REPORT_PROVENANCE_FIELDS).toHaveLength(7);
  });

  it("never mislabels prompt_version as methodology_version", () => {
    const projected = projectReportProvenance(
      source({ methodology_version: "" }),
    );

    expect(projected.status).toBe("unknown");
    if (projected.status === "unknown") {
      expect(projected.correction_tip).toContain("methodology_version");
    }
  });

  it("projects explicit UNKNOWN for legacy/null provenance with a correction tip", () => {
    for (const value of [null, undefined]) {
      const projected = projectReportProvenance(value);
      expect(projected.status).toBe("unknown");
      if (projected.status === "unknown") {
        expect(projected.correction_tip.length).toBeGreaterThan(10);
      }
    }
  });

  it("fails closed when any canonical field is missing", () => {
    const cases: Array<Partial<ReportProvenanceSource>> = [
      { evidence_snapshot_id: "" },
      { living_brief_version: null as unknown as number },
      { expertise_pack_version: "  " },
      { prompt_version: "" },
      { model_config_hash: "" },
      { output_schema_version: "" },
    ];
    for (const partial of cases) {
      const projected = projectReportProvenance(source(partial));
      expect(projected.status).toBe("unknown");
    }
  });

  it("never projects a partial manifest", () => {
    const projected = projectReportProvenance(
      source({ model_config_hash: "" }),
    );
    expect(projected.status).toBe("unknown");
    if (projected.status === "unknown") {
      expect("manifest" in projected).toBe(false);
    }
  });
});
