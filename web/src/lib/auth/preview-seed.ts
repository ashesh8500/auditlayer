/**
 * Idempotent demo data for the preview tester workspace.
 * Preview / local only — never call from production paths.
 *
 * Seeds AuditLayerMedia from the live @auditlayermedia Instagram connection
 * (mirrored onto the preview tester) plus website, and optional demo subjects.
 */

import "server-only";

import {
  rpcCreateSubject,
  rpcLinkSubjectChannel,
  rpcRecordLivingBriefVersion,
} from "@/lib/intelligence/api";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Plan } from "@/lib/domain";

const ALM_SUBJECT_NAME = "AuditLayerMedia";
const ALM_IG_HANDLE = "auditlayermedia";
const ALM_WEBSITE = "https://auditlayermedia.com";

type DemoBrief = {
  identity: Record<string, string>;
  audience: Record<string, string>;
  positioning: Record<string, string>;
  offers: string[];
  goals: string[];
  constraints: string[];
  experiments: string[];
  decisions: string[];
};

const DEMO_SUBJECTS: Array<{
  name: string;
  subjectType: "person" | "brand";
  channels: Array<{
    channelType: "instagram" | "website" | "tiktok";
    locator: string;
  }>;
  brief: DemoBrief;
}> = [
  {
    name: "Narin Fazlalipour",
    subjectType: "person",
    channels: [
      { channelType: "instagram", locator: "narinfazlalipour" },
      {
        channelType: "website",
        locator: "https://example.com/narin-fazlalipour",
      },
    ],
    brief: {
      identity: {
        summary:
          "Co-founder and domain lead for evidence-based biohacking, med-tech, and wellness content strategy.",
        vision:
          "Make clinical-grade creator guidance the default for serious health audiences.",
        voice: "Precise, warm, anti-hype — scientist-next-door.",
        success_criteria:
          "Living Brief continuity across audits; calibrated peer benchmarks for biohacking creators.",
      },
      audience: {
        summary:
          "Evidence-seeking wellness creators and the operators who serve them.",
      },
      positioning: {
        summary:
          "Domain calibration over generic analytics — what “good” looks like in biohacking/health.",
      },
      offers: [
        "Audit methodology and report calibration",
        "Peer benchmark judgment for health creators",
      ],
      goals: [
        "Calibrate biohacking creator benchmarks in product QA",
        "Keep Living Brief continuity visible across repeat audits",
      ],
      constraints: ["No unverified clinical claims in public examples"],
      experiments: ["Same-tier peer comparison framing in Standard reports"],
      decisions: ["Treat Living Brief as the customer story, not a JSON dump"],
    },
  },
  {
    name: "GlowState Wellness",
    subjectType: "brand",
    channels: [
      { channelType: "instagram", locator: "glowstate" },
      { channelType: "tiktok", locator: "glowstate" },
    ],
    brief: {
      identity: {
        summary:
          "Fictional wellness brand used for product QA — longevity science translated into daily practice.",
        vision: "Become a trusted consumer filter for evidence-based wellness.",
        voice: "Warm, precise, anti-hype.",
        success_criteria: "Higher save rate on carousels; clearer peer set.",
      },
      audience: {
        summary:
          "Health-conscious adults overwhelmed by conflicting wellness advice.",
      },
      positioning: {
        summary: "Data over dogma — clinical credibility without bro-science.",
      },
      offers: ["Coaching", "Group program", "Affiliate partnerships"],
      goals: [
        "Grow same-tier peer comparisons",
        "Raise save rate on educational carousels",
      ],
      constraints: ["No conflicting sponsored claims"],
      experiments: ["Carousel-first vs reel-first weeks"],
      decisions: ["Keep demo brand clearly labeled as fixture for QA"],
    },
  },
];

const ALM_BRIEF: DemoBrief = {
  identity: {
    summary:
      "AuditLayerMedia is the research desk for evidence-based biohacking, health, and wellness creators. We turn public social signal into a clear next move — not another vanity dashboard.",
    vision:
      "Be the place serious wellness creators check before they post, pitch, or raise.",
    voice:
      "Calm, clinical, and human. Credible like a lab note; readable like a founder brief.",
    success_criteria:
      "Creators finish a report knowing where they stand, who their real peers are, and what to post next week.",
  },
  audience: {
    summary:
      "Evidence-minded biohacking, med-tech, and wellness creators — and the media managers who run their channels.",
  },
  positioning: {
    summary:
      "Domain-calibrated audits with same-tier peers and a Living Brief that remembers your story between reports.",
  },
  offers: [
    "Pulse — a free snapshot of where you stand",
    "Standard — the full audit creators actually use",
    "Extended / Blueprint — deeper plans when you’re ready to scale",
  ],
  goals: [
    "Grow @auditlayermedia with the same playbook we recommend to clients",
    "Make Living Brief continuity feel obvious on every return visit",
    "Prove the connected Instagram path end-to-end",
  ],
  constraints: [
    "Public-data research only — limits shown in every report",
    "No hype claims that outrun the evidence",
    "Keep the product founder-operable, never developer-facing",
  ],
  experiments: [
    "Subject home as the default desk (not a report list)",
    "Connected Instagram + website as the golden-path subject",
  ],
  decisions: [
    "The report is the product; the Living Brief is the memory",
    "AuditLayerMedia itself is the proof subject for the experience",
  ],
};

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

/**
 * Mirror the live @auditlayermedia Instagram connection onto the preview
 * tester so channel ownership shows as officially connected.
 */
export async function mirrorAuditlayerInstagramConnection(
  previewUserId: string,
): Promise<string | null> {
  const admin = createAdminClient();

  const { data: source, error: sourceError } = await admin
    .from("instagram_connections")
    .select(
      "ig_user_id, ig_username, access_token, long_lived_token, long_lived_expires_at, account_type, followers_count, media_count, is_active, last_refreshed_at",
    )
    .eq("ig_username", ALM_IG_HANDLE)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceError || !source) {
    return null;
  }

  const { data: existing } = await admin
    .from("instagram_connections")
    .select("id")
    .eq("user_id", previewUserId)
    .eq("ig_user_id", source.ig_user_id)
    .maybeSingle();

  let connectionId = existing?.id ?? null;

  if (connectionId) {
    const { error } = await admin
      .from("instagram_connections")
      .update({
        ig_username: source.ig_username,
        access_token: source.access_token,
        long_lived_token: source.long_lived_token,
        long_lived_expires_at: source.long_lived_expires_at,
        account_type: source.account_type,
        followers_count: source.followers_count,
        media_count: source.media_count,
        is_active: true,
        last_refreshed_at: source.last_refreshed_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    if (error) {
      throw new Error(`Failed to refresh mirrored IG connection: ${error.message}`);
    }
  } else {
    const { data: created, error } = await admin
      .from("instagram_connections")
      .insert({
        user_id: previewUserId,
        ig_user_id: source.ig_user_id,
        ig_username: source.ig_username,
        access_token: source.access_token,
        long_lived_token: source.long_lived_token,
        long_lived_expires_at: source.long_lived_expires_at,
        account_type: source.account_type,
        followers_count: source.followers_count,
        media_count: source.media_count,
        is_active: true,
        last_refreshed_at: source.last_refreshed_at,
      })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(
        `Failed to mirror IG connection: ${error?.message ?? "unknown"}`,
      );
    }
    connectionId = created.id;
  }

  const { data: accountExisting } = await admin
    .from("accounts")
    .select("id")
    .eq("user_id", previewUserId)
    .eq("platform", "instagram")
    .eq("handle", ALM_IG_HANDLE)
    .maybeSingle();

  if (accountExisting?.id) {
    const { error } = await admin
      .from("accounts")
      .update({
        ownership_status: "connected",
        ig_connection_id: connectionId,
        display_name: "AuditLayerMedia",
      })
      .eq("id", accountExisting.id);
    if (error) {
      throw new Error(`Failed to update ALM account: ${error.message}`);
    }
    return accountExisting.id;
  }

  const { data: account, error: accountError } = await admin
    .from("accounts")
    .insert({
      user_id: previewUserId,
      handle: ALM_IG_HANDLE,
      platform: "instagram",
      ownership_status: "connected",
      ig_connection_id: connectionId,
      display_name: "AuditLayerMedia",
    })
    .select("id")
    .single();

  if (accountError || !account) {
    throw new Error(
      `Failed to create ALM account: ${accountError?.message ?? "unknown"}`,
    );
  }
  return account.id;
}

async function writeBrief(
  userId: string,
  subjectId: string,
  brief: DemoBrief,
): Promise<void> {
  const admin = createAdminClient();
  await rpcRecordLivingBriefVersion(admin, {
    subjectId,
    version: 1,
    createdBy: userId,
    identity: brief.identity,
    audience: brief.audience,
    positioning: brief.positioning,
    offers: brief.offers,
    goals: brief.goals,
    constraints: brief.constraints,
    experiments: brief.experiments,
    decisions: brief.decisions,
    confirmed: true,
  });
}

async function ensureAlmSubject(
  userId: string,
  accountId: string | null,
): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .eq("name", ALM_SUBJECT_NAME)
    .maybeSingle();

  let subjectId = existing?.id ?? null;
  let created = false;
  if (!subjectId) {
    subjectId = await rpcCreateSubject(admin, {
      userId,
      name: ALM_SUBJECT_NAME,
      subjectType: "brand",
    });
    created = true;
  }

  if (created) {
    await writeBrief(userId, subjectId, ALM_BRIEF);
  }

  const { data: channels } = await admin
    .from("subject_channels")
    .select("id, channel_type, locator, account_id")
    .eq("subject_id", subjectId);

  const hasIg = (channels ?? []).some(
    (c) => c.channel_type === "instagram" && c.locator === ALM_IG_HANDLE,
  );
  const hasWeb = (channels ?? []).some(
    (c) => c.channel_type === "website" && c.locator === ALM_WEBSITE,
  );

  if (!hasIg) {
    await rpcLinkSubjectChannel(admin, {
      subjectId,
      channelType: "instagram",
      locator: ALM_IG_HANDLE,
      managed: true,
      accountId,
    });
  } else if (accountId) {
    const ig = (channels ?? []).find(
      (c) => c.channel_type === "instagram" && c.locator === ALM_IG_HANDLE,
    );
    if (ig && ig.account_id !== accountId) {
      await admin
        .from("subject_channels")
        .update({ account_id: accountId, managed: true })
        .eq("id", ig.id);
    }
  }

  if (!hasWeb) {
    await rpcLinkSubjectChannel(admin, {
      subjectId,
      channelType: "website",
      locator: ALM_WEBSITE,
      managed: true,
    });
  }

  return subjectId;
}

async function createDemoSubject(
  userId: string,
  demo: (typeof DEMO_SUBJECTS)[number],
): Promise<string> {
  const admin = createAdminClient();
  const subjectId = await rpcCreateSubject(admin, {
    userId,
    name: demo.name,
    subjectType: demo.subjectType,
  });
  for (const channel of demo.channels) {
    await rpcLinkSubjectChannel(admin, {
      subjectId,
      channelType: channel.channelType,
      locator: channel.locator,
      managed: true,
    });
  }
  await writeBrief(userId, subjectId, demo.brief);
  return subjectId;
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

  if (options?.force && (existing.data?.length ?? 0) > 0) {
    const { error: delError } = await admin
      .from("subjects")
      .delete()
      .eq("user_id", userId);
    if (delError) {
      throw new Error(`Failed to clear preview subjects: ${delError.message}`);
    }
  }

  const accountId = await mirrorAuditlayerInstagramConnection(userId);
  const almId = await ensureAlmSubject(userId, accountId);
  const subjectIds = [almId];

  const listed = await admin
    .from("subjects")
    .select("id, name")
    .eq("user_id", userId);
  const names = new Set((listed.data ?? []).map((s) => s.name));

  for (const demo of DEMO_SUBJECTS) {
    if (names.has(demo.name)) continue;
    subjectIds.push(await createDemoSubject(userId, demo));
  }

  return {
    subjectIds: [...new Set(subjectIds)],
    created: true,
  };
}

export async function bootstrapPreviewTesterWorkspace(
  userId: string,
  plan: Plan,
): Promise<void> {
  await applyPreviewTesterPlan(userId, plan);
  await seedPreviewDemoSubjects(userId);
}
