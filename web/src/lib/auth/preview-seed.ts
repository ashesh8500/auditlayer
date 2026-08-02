/**
 * Idempotent demo data for the preview tester workspace.
 * Preview / local only — never call from production paths.
 */

import "server-only";

import {
  rpcCreateSubject,
  rpcLinkSubjectChannel,
  rpcRecordLivingBriefVersion,
} from "@/lib/intelligence/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "@/lib/domain";

const DEMO_SUBJECTS = [
  {
    name: "Narin Fazlalipour",
    subjectType: "person" as const,
    channels: [
      { channelType: "instagram" as const, locator: "narinfazlalipour" },
      {
        channelType: "website" as const,
        locator: "https://example.com/narin-fazlalipour",
      },
    ],
    identity: {
      name: "Narin Fazlalipour",
      role: "Co-founder, domain expert",
      niche: "biohacking, med-tech, wellness",
    },
    goals: [
      "Calibrate biohacking creator benchmarks",
      "Ship Living Brief continuity across audits",
    ],
  },
  {
    name: "GlowState Wellness",
    subjectType: "brand" as const,
    channels: [
      { channelType: "instagram" as const, locator: "glowstate" },
      { channelType: "tiktok" as const, locator: "glowstate" },
    ],
    identity: {
      name: "GlowState Wellness",
      category: "wellness brand",
    },
    goals: ["Grow same-tier peer comparisons", "Raise save rate on carousels"],
  },
] as const;

export async function applyPreviewTesterPlan(
  userId: string,
  plan: Plan,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      plan,
      gifted_audits: 50,
      full_name: "Preview Tester",
    })
    .eq("id", userId);
  if (error) {
    throw new Error(`Failed to set preview plan: ${error.message}`);
  }
}

export async function seedPreviewDemoSubjects(
  userId: string,
  options?: { force?: boolean },
): Promise<{ subjectIds: string[]; created: boolean }> {
  const admin = createAdminClient();

  const existing = await admin
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId);

  if (existing.error) {
    throw new Error(`Failed to list preview subjects: ${existing.error.message}`);
  }

  if ((existing.data?.length ?? 0) > 0 && !options?.force) {
    return {
      subjectIds: (existing.data ?? []).map((row) => row.id),
      created: false,
    };
  }

  if (options?.force && (existing.data?.length ?? 0) > 0) {
    const { error: delError } = await admin
      .from("subjects")
      .delete()
      .eq("user_id", userId);
    if (delError) {
      throw new Error(`Failed to clear preview subjects: ${delError.message}`);
    }
  }

  const subjectIds: string[] = [];
  for (const demo of DEMO_SUBJECTS) {
    const subjectId = await rpcCreateSubject(admin, {
      userId,
      name: demo.name,
      subjectType: demo.subjectType,
    });
    subjectIds.push(subjectId);

    for (const channel of demo.channels) {
      await rpcLinkSubjectChannel(admin, {
        subjectId,
        channelType: channel.channelType,
        locator: channel.locator,
        managed: true,
      });
    }

    await rpcRecordLivingBriefVersion(admin, {
      subjectId,
      version: 1,
      createdBy: userId,
      identity: { ...demo.identity },
      goals: [...demo.goals],
      confirmed: true,
    });
  }

  return { subjectIds, created: true };
}

export async function bootstrapPreviewTesterWorkspace(
  userId: string,
  plan: Plan,
): Promise<void> {
  await applyPreviewTesterPlan(userId, plan);
  await seedPreviewDemoSubjects(userId);
}
