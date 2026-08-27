import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "..",
    "supabase",
    "migrations",
    "20260827203000_instagram_connection_graph_family.sql",
  ),
  "utf8",
);

describe("Instagram connection Graph API family migration", () => {
  it("adds a nullable explicit family and requires it in the transactional persistence RPC", () => {
    expect(migration).toMatch(
      /add column if not exists graph_api_family text(?![^;]*(?:not null|default))/i,
    );
    expect(migration).toMatch(
      /graph_api_family is null\s+or graph_api_family in \('instagram', 'facebook'\)/i,
    );
    expect(migration).not.toMatch(/update\s+public\.instagram_connections/i);
    expect(migration).toContain("p_graph_api_family text");
    expect(migration).toMatch(
      /p_graph_api_family not in \('instagram', 'facebook'\)/i,
    );
    expect(migration).toMatch(
      /insert into public\.instagram_connections[\s\S]*graph_api_family[\s\S]*p_graph_api_family/i,
    );
    expect(migration).toMatch(
      /drop function if exists public\.persist_instagram_connection\(\s*uuid, bigint, text, text, timestamptz, text, bigint, bigint, text\s*\)/i,
    );
    expect(migration).toContain(
      "graph_api_family = excluded.graph_api_family",
    );
    expect(migration).toMatch(
      /revoke all on function public\.persist_instagram_connection\(\s*uuid, bigint, text, text, timestamptz, text, bigint, bigint, text\s*\)/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.persist_instagram_connection\(\s*uuid, bigint, text, text, timestamptz, text, bigint, bigint, text\s*\) to service_role/i,
    );
  });
});
