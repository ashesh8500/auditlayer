import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "..",
  "supabase",
  "migrations",
  "20260827205927_instagram_connection_lifecycle.sql",
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8");
}

describe("Instagram connection lifecycle migration", () => {
  it("persists connected or reconnect-required and backfills legacy rows fail-closed", () => {
    const migration = migrationSql();

    expect(migration).toMatch(
      /add column if not exists connection_status text not null default 'connected'/i,
    );
    expect(migration).toMatch(
      /connection_status in \('connected', 'reconnect_required'\)/i,
    );
    expect(migration).toMatch(
      /update public\.instagram_connections[\s\S]*connection_status = 'reconnect_required'[\s\S]*graph_api_family is null or is_active = false/i,
    );
    expect(migration).toMatch(
      /update public\.instagram_connections[\s\S]*reconnect_required_at = coalesce\(reconnect_required_at, now\(\)\)[\s\S]*reconnect_reason = coalesce\(reconnect_reason, 'legacy_connection'\)/i,
    );
    expect(migration).not.toMatch(/'disconnected'/i);
  });

  it("marks exactly one owner connection reconnect-required through an idempotent least-privilege RPC", () => {
    const migration = migrationSql();

    expect(migration).toMatch(
      /add column if not exists reconnect_required_at timestamptz/i,
    );
    expect(migration).toMatch(
      /add column if not exists reconnect_reason text/i,
    );
    expect(migration).toMatch(
      /create function public\.mark_instagram_connection_reconnect_required\(\s*p_user_id uuid,\s*p_connection_id uuid\s*\)[\s\S]*returns boolean[\s\S]*security definer[\s\S]*set search_path = ''/i,
    );
    expect(migration).toMatch(
      /update public\.instagram_connections[\s\S]*connection_status = 'reconnect_required'[\s\S]*is_active = false[\s\S]*reconnect_required_at = coalesce\(reconnect_required_at, now\(\)\)[\s\S]*reconnect_reason = 'auth_permission'[\s\S]*where id = p_connection_id[\s\S]*and user_id = p_user_id/i,
    );
    expect(migration).toMatch(/get diagnostics v_updated = row_count/i);
    expect(migration).toMatch(/return v_updated = 1/i);
    expect(migration).not.toMatch(
      /mark_instagram_connection_reconnect_required\([\s\S]*p_(?:token|handle|body|content)/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.mark_instagram_connection_reconnect_required\(uuid, uuid\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.mark_instagram_connection_reconnect_required\(uuid, uuid\) to service_role/i,
    );
    expect(migration).toMatch(
      /grant select \(\s*connection_status,\s*reconnect_required_at,\s*reconnect_reason\s*\) on table public\.instagram_connections to authenticated/i,
    );
  });

  it("resets reconnect-required state only inside successful OAuth persistence", () => {
    const migration = migrationSql();

    expect(migration).toMatch(
      /drop function if exists public\.persist_instagram_connection\(\s*uuid, bigint, text, text, timestamptz, text, bigint, bigint, text\s*\)/i,
    );
    expect(migration).toMatch(
      /create function public\.persist_instagram_connection\([\s\S]*insert into public\.instagram_connections[\s\S]*connection_status,[\s\S]*reconnect_required_at,[\s\S]*reconnect_reason[\s\S]*'connected',[\s\S]*null,[\s\S]*null/i,
    );
    expect(migration).toContain("connection_status = 'connected'");
    expect(migration).toContain("reconnect_required_at = null");
    expect(migration).toContain("reconnect_reason = null");
    expect(migration).toMatch(
      /revoke all on function public\.persist_instagram_connection\(\s*uuid, bigint, text, text, timestamptz, text, bigint, bigint, text\s*\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.persist_instagram_connection\(\s*uuid, bigint, text, text, timestamptz, text, bigint, bigint, text\s*\) to service_role/i,
    );
  });

  it("preserves current account update timestamps during OAuth persistence", () => {
    const normalized = migrationSql().replace(/\s+/g, " ");
    const persistBody = normalized.match(
      /create function public\.persist_instagram_connection[\s\S]*?\$\$;/i,
    )?.[0];

    expect(persistBody).toBeDefined();
    expect(persistBody).toMatch(
      /update public\.accounts[\s\S]*?updated_at = now\(\)/i,
    );
    expect(persistBody).toMatch(
      /insert into public\.accounts \([\s\S]*?ig_connection_id, updated_at[\s\S]*?v_connection_id, now\(\)/i,
    );
  });

  it("keeps generated table and RPC types synchronized with the lifecycle schema", () => {
    const types = readFileSync(
      path.join(process.cwd(), "src/lib/supabase/types.ts"),
      "utf8",
    );

    expect(types).toContain(
      'connection_status: "connected" | "reconnect_required"',
    );
    expect(types).toContain("reconnect_required_at: string | null");
    expect(types).toContain(
      'reconnect_reason: "auth_permission" | "legacy_connection" | null',
    );
    expect(types).toMatch(
      /mark_instagram_connection_reconnect_required:\s*{\s*Args:\s*{ p_connection_id: string; p_user_id: string }\s*Returns: boolean/i,
    );
  });
});
