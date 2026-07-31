import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { SubjectSummary, SubjectType } from "@/lib/intelligence/types";
import { fixtureSubjects } from "@/lib/intelligence/fixtures";

export type SubjectListSource = "live" | "fixture";

export async function listSubjectsForUser(): Promise<{
  subjects: SubjectSummary[];
  source: SubjectListSource;
}> {
  if (!isSupabaseConfigured()) {
    return { subjects: fixtureSubjects(), source: "fixture" };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subjects")
      .select("id, name, subject_type, created_at")
      .order("created_at", { ascending: false });

    if (error || !data) {
      return { subjects: fixtureSubjects(), source: "fixture" };
    }

    if (data.length === 0) {
      return { subjects: [], source: "live" };
    }

    const subjects: SubjectSummary[] = await Promise.all(
      data.map(async (row) => {
        const { count } = await supabase
          .from("subject_channels")
          .select("id", { count: "exact", head: true })
          .eq("subject_id", row.id);
        return {
          id: row.id,
          name: row.name,
          type: row.subject_type as SubjectType,
          avatarUrl: null,
          channelCount: count ?? 0,
          lastAuditAt: null,
        };
      }),
    );

    return { subjects, source: "live" };
  } catch {
    return { subjects: fixtureSubjects(), source: "fixture" };
  }
}
