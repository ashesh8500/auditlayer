import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260808013907_compare_decision_retry_notes.sql",
  ),
  "utf8",
).toLowerCase();

describe("record_decision ownership-lock migration", () => {
  it("revalidates and locks subject ownership in the authoritative RPC", () => {
    expect(migration).toContain(
      "create or replace function public.record_decision",
    );
    expect(migration).toMatch(
      /from public\.subjects[\s\S]*?id = p_subject_id[\s\S]*?user_id = p_user_id[\s\S]*?for share/,
    );
    expect(migration).toContain("raise exception 'subject_not_owned'");
  });

  it("locks recommendation and proposal linkage through the decision write", () => {
    expect(migration).toMatch(
      /from public\.context_update_proposals[\s\S]*?for update/,
    );
    expect(migration).toMatch(
      /from public\.recommendations r[\s\S]*?join public\.intelligence_runs ir[\s\S]*?for update of r, ir/,
    );
    expect(migration).toMatch(
      /from public\.decisions[\s\S]*?user_id = p_user_id[\s\S]*?target_id = p_target_id/,
    );
    expect(migration).toMatch(/select id, decision, note/);
    expect(migration).toMatch(
      /v_prior_decision = p_decision[\s\S]*?v_prior_note[\s\S]*?p_note/,
    );
    expect(migration).toContain(
      "revoke all on function public.record_decision(uuid, uuid, text, uuid, text, text)",
    );
    expect(migration).toContain("to service_role");
  });
});
