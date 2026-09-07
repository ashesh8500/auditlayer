import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  channels: [] as unknown[],
  filters: [] as Array<{ table: string; column: string; value: unknown }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireProfile: async () => ({ id: "admin-user", role: "admin" }),
}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          state.filters.push({ table, column, value });
          return query;
        },
        order: async () => ({ data: table === "subject_channels" ? state.channels : [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  }),
}));

import {
  listChannelsForSubject,
  getSubjectHomeBundle,
  listSubjectsForUser,
} from "@/lib/intelligence/subjects";

describe("subject customer reads under broad admin visibility", () => {
  beforeEach(() => {
    state.filters.length = 0;
    state.channels = [];
  });

  it("owner-filters the subject list for an admin profile", async () => {
    await expect(listSubjectsForUser()).resolves.toEqual({
      subjects: [],
      source: "live",
    });
    expect(state.filters).toContainEqual({
      table: "subjects",
      column: "user_id",
      value: "admin-user",
    });
  });

  it("owner-filters subject detail and returns null for a foreign subject", async () => {
    await expect(getSubjectHomeBundle("foreign-subject")).resolves.toBeNull();
    expect(state.filters).toEqual(
      expect.arrayContaining([
        { table: "subjects", column: "id", value: "foreign-subject" },
        { table: "subjects", column: "user_id", value: "admin-user" },
      ]),
    );
  });
});


describe("channel connection readiness", () => {
  it.each(["connected", "reconnect_required", "expired", "missing"])("reflects %s access instead of the historical account link", async (mode) => {
    state.channels = [{ id: "channel", subject_id: "subject", channel_type: "instagram", locator: "example", managed: true,
      accounts: { ownership_status: "connected", ig_connection_id: "connection", display_name: "Example",
        instagram_connections: mode === "missing" ? null : { is_active: true, connection_status: mode === "reconnect_required" ? mode : "connected", long_lived_expires_at: mode === "expired" ? "2000-01-01" : "2099-01-01" } } }];
    const [channel] = await listChannelsForSubject("subject");
    expect(channel.connected).toBe(mode === "connected");
    expect(channel.reconnectRequired).toBe(mode !== "connected");
    expect(channel.ownershipStatus).toBe("connected");
  });
});
