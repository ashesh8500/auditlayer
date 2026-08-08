import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
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
        order: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return query;
    },
  }),
}));

import {
  getSubjectHomeBundle,
  listSubjectsForUser,
} from "@/lib/intelligence/subjects";

describe("subject customer reads under broad admin visibility", () => {
  beforeEach(() => {
    state.filters.length = 0;
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
