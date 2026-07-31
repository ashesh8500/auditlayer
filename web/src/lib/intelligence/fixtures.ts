/**
 * Compatibility fixtures for intelligence types.
 *
 * Until the kernel worker generates real subject/brief/evidence rows, these
 * static fixtures let product components render real-looking states without
 * faking live behavior. All data is explicitly labelled as test/fixture data.
 */

import type {
  SubjectSummary,
  ChannelSummary,
  LivingBriefContent,
  LivingBriefVersion,
  LivingBriefProposal,
  EvidenceItemSummary,
  ScoreEvidence,
  RecommendationSummary,
  BatchReview,
  SinceLastAuditItem,
  ReportArchiveItem,
} from "./types";

// ---- Subjects ----

export function fixtureSubjects(): SubjectSummary[] {
  return [
    {
      id: "subj-001",
      name: "Narin Kaji",
      type: "person",
      avatarUrl: null,
      channelCount: 2,
      lastAuditAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
      id: "subj-002",
      name: "GlowState Wellness",
      type: "brand",
      avatarUrl: null,
      channelCount: 3,
      lastAuditAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
  ];
}

// ---- Channels ----

export function fixtureChannels(subjectId: string): ChannelSummary[] {
  const all: Record<string, ChannelSummary[]> = {
    "subj-001": [
      {
        id: "ch-001",
        platform: "instagram",
        handle: "narinkaji",
        url: null,
        ownershipStatus: "connected",
        displayName: "Narin Kaji",
        avatarUrl: null,
        connected: true,
        subjectId: "subj-001",
      },
      {
        id: "ch-002",
        platform: "website",
        handle: "",
        url: "https://narinkaji.com",
        ownershipStatus: "managed",
        displayName: "narinkaji.com",
        avatarUrl: null,
        connected: false,
        subjectId: "subj-001",
      },
    ],
    "subj-002": [
      {
        id: "ch-010",
        platform: "instagram",
        handle: "glowstate",
        url: null,
        ownershipStatus: "connected",
        displayName: "GlowState",
        avatarUrl: null,
        connected: true,
        subjectId: "subj-002",
      },
      {
        id: "ch-011",
        platform: "tiktok",
        handle: "glowstate",
        url: null,
        ownershipStatus: "managed",
        displayName: "GlowState TikTok",
        avatarUrl: null,
        connected: false,
        subjectId: "subj-002",
      },
      {
        id: "ch-012",
        platform: "website",
        handle: "",
        url: "https://glowstate.co",
        ownershipStatus: "managed",
        displayName: "glowstate.co",
        avatarUrl: null,
        connected: false,
        subjectId: "subj-002",
      },
    ],
  };
  return all[subjectId] ?? [];
}

// ---- Living Brief ----

export function fixtureBriefContent(): LivingBriefContent {
  return {
    subjectType: "brand",
    identity:
      "Clinical wellness brand translating longevity science into daily practice. Evidence-backed, approachable, anti-hype.",
    vision:
      "Become the most trusted consumer voice in evidence-based wellness, reaching 100K followers across platforms.",
    audience:
      "Health-conscious 25–45 year olds with disposable income, overwhelmed by conflicting wellness advice and seeking a trusted filter.",
    offers:
      "1:1 coaching ($200/hr), group program 'Metabolic Reset' ($499), supplement affiliate partnerships.",
    voice:
      "Warm, precise, scientist-next-door. Jargon translated. Confident but not dogmatic. Uses personal experiment narrative.",
    positioning:
      "The longevity space for people who trust data over dogma. Anti-Andrew-Huberman-bro-science, pro-clinical-evidence.",
    goals:
      "Grow Instagram to 25K by Q4 2026. Launch Metabolic Reset cohort 3 with 40 sign-ups. Secure 2 supplement brand partnerships.",
    successCriteria:
      "25K followers, <5% churn on group program, 2 signed brand deals, 8% engagement rate maintained.",
    constraints:
      "No sponsored content that conflicts with clinical positioning. No unverified supplement claims. Weekly content cadence maximum.",
    activeExperiments:
      "Carousel vs reel-first posting (A/B test). Tuesday vs Thursday publishing. Long-form caption depth experiment.",
    plannedChanges:
      "Launching YouTube channel Q3. Adding Substack newsletter for deeper dives. Considering TikTok presence.",
  };
}

export function fixtureBriefVersions(
  subjectId: string,
): LivingBriefVersion[] {
  const now = Date.now();
  return [
    {
      id: "bv-003",
      subjectId,
      version: 3,
      content: fixtureBriefContent(),
      source: "user",
      parentVersionId: "bv-002",
      changeSummary: "Updated goals to 25K, added YouTube launch to planned changes.",
      createdAt: new Date(now - 86400000).toISOString(),
    },
    {
      id: "bv-002",
      subjectId,
      version: 2,
      content: {
        ...fixtureBriefContent(),
        goals: "Grow Instagram to 15K. Launch Metabolic Reset cohort 2. Secure 1 supplement partnership.",
        plannedChanges: "Considering YouTube channel later this year.",
      },
      source: "model_proposal",
      parentVersionId: "bv-001",
      changeSummary: "Refined voice from 'clinical' to 'scientist-next-door'. Narrowed audience age range.",
      createdAt: new Date(now - 7 * 86400000).toISOString(),
    },
    {
      id: "bv-001",
      subjectId,
      version: 1,
      content: {
        ...fixtureBriefContent(),
        vision: "Share evidence-based health content and build a following.",
        goals: "Grow Instagram to 5K. Test coaching offer viability.",
        plannedChanges: "",
        activeExperiments: "",
      },
      source: "user",
      parentVersionId: null,
      changeSummary: null,
      createdAt: new Date(now - 30 * 86400000).toISOString(),
    },
  ];
}

// ---- Evidence ----

export function fixtureEvidence(): EvidenceItemSummary[] {
  return [
    {
      id: "IG#profile-bio-20260720",
      sourceType: "instagram_profile",
      sourceUrl: null,
      observedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 4 * 86400000).toISOString(),
      confidence: 0.95,
      coverage: 1.0,
      summary: "Bio analysis: clinical wellness, longevity focus, coaching link in bio.",
    },
    {
      id: "WEB#official-about-7f1a",
      sourceType: "web_page",
      sourceUrl: "https://narinkaji.com/about",
      observedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 11 * 86400000).toISOString(),
      confidence: 0.90,
      coverage: 0.85,
      summary: "About page: clinical background, approach philosophy, services offered.",
    },
    {
      id: "CTX#brief-v3",
      sourceType: "living_brief",
      sourceUrl: null,
      observedAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: null,
      confidence: 1.0,
      coverage: 1.0,
      summary: "Living Brief v3 — user-confirmed identity, goals, and planned changes.",
    },
  ];
}

// ---- Scores ----

export function fixtureScores(): ScoreEvidence[] {
  return [
    {
      dimensionId: "content_quality",
      dimensionLabel: "Content Quality",
      evidenceIds: ["IG#profile-bio-20260720", "CTX#brief-v3"],
      score: 73,
      maxScore: 100,
      rationale:
        "Strong clinical credibility and consistent visual identity. Carousels outperform reels 2:1 in saves.",
      changeReason: "evidence_changed",
      previousScore: 68,
    },
    {
      dimensionId: "engagement",
      dimensionLabel: "Engagement Rate",
      evidenceIds: ["IG#profile-bio-20260720"],
      score: 8.4,
      maxScore: 15,
      rationale:
        "8.4% engagement is well above the 3% niche average. Best posts are long-form carousels with cited studies.",
      changeReason: "new",
      previousScore: null,
    },
    {
      dimensionId: "consistency",
      dimensionLabel: "Posting Consistency",
      evidenceIds: ["IG#profile-bio-20260720"],
      score: 62,
      maxScore: 100,
      rationale:
        "2–3 posts/week average but irregular cadence. 12-day gap in June dropped reach 40%.",
      changeReason: null,
      previousScore: null,
    },
    {
      dimensionId: "audience_growth",
      dimensionLabel: "Audience Growth",
      evidenceIds: ["IG#profile-bio-20260720"],
      score: 55,
      maxScore: 100,
      rationale:
        "Steady but slow at +85 followers/week. Reels reach 3x more non-followers than carousels.",
      changeReason: null,
      previousScore: null,
    },
    {
      dimensionId: "monetization_readiness",
      dimensionLabel: "Monetization Readiness",
      evidenceIds: ["WEB#official-about-7f1a", "CTX#brief-v3"],
      score: null, // Data needed
      maxScore: 100,
      rationale:
        "Coaching landing page exists but no tracked conversion data. Connect analytics for a score.",
      changeReason: null,
      previousScore: null,
    },
  ];
}

// ---- Recommendations ----

export function fixtureRecommendations(
  subjectId: string,
): RecommendationSummary[] {
  return [
    {
      id: "rec-001",
      subjectId,
      auditId: "audit-001",
      text: "Post one long-form carousel every Tuesday at 10am EST. Carousels drive 2x saves over reels for this audience.",
      status: "accepted",
      evidenceIds: ["IG#profile-bio-20260720"],
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
    {
      id: "rec-002",
      subjectId,
      auditId: "audit-001",
      text: "Cut Stories volume from 7/day to 3/day. Current volume dilutes reach without adding engagement.",
      status: "rejected",
      evidenceIds: ["IG#profile-bio-20260720"],
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
    {
      id: "rec-003",
      subjectId,
      auditId: "audit-002",
      text: "Run a 2-week A/B test: carousel-first Monday/Thursday vs reel-first Tuesday/Friday. Track saves and profile visits.",
      status: "in_progress",
      evidenceIds: ["IG#profile-bio-20260720"],
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "rec-004",
      subjectId,
      auditId: "audit-002",
      text: "Add Substack CTA to top 3 carousels this month. Your audience profile matches long-form reader demographics.",
      status: "proposed",
      evidenceIds: ["IG#profile-bio-20260720", "CTX#brief-v3"],
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ];
}

// ---- Batch Review ----

export function fixtureBatchReview(): BatchReview {
  return {
    subjectName: "Narin Kaji",
    channelCount: 2,
    auditCount: 2,
    reportTypes: { pulse: 1, standard: 1 },
    duplicateChannelNames: [],
    entitlementWarnings: [],
  };
}

// ---- Proposals (distinct from confirmed versions) ----

export function fixtureBriefProposals(
  subjectId: string,
): LivingBriefProposal[] {
  return [
    {
      id: "prop-001",
      subjectId,
      parentVersionId: "bv-003",
      baseVersion: 3,
      path: "/goals",
      operation: "replace",
      proposedValue:
        "Grow Instagram to 30K by Q1 2027. Keep Metabolic Reset at 40 seats.",
      evidenceIds: ["IG#profile-bio-20260720"],
      changeExplanation:
        "Recent growth velocity supports a higher follower target without changing offer constraints.",
      status: "proposed",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "prop-002",
      subjectId,
      parentVersionId: "bv-003",
      baseVersion: 3,
      path: "/positioning",
      operation: "replace",
      proposedValue:
        "Clinical longevity for busy professionals — less anti-bro framing, more protocol clarity.",
      evidenceIds: ["WEB#official-about-7f1a"],
      changeExplanation:
        "Perceived positioning on the website emphasizes protocols more than anti-hype contrast.",
      status: "proposed",
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  ];
}

// ---- Since last audit ----

export function fixtureSinceLastAudit(): SinceLastAuditItem[] {
  const now = Date.now();
  return [
    {
      id: "sla-1",
      kind: "brief",
      title: "Living Brief updated to v3",
      detail: "Goals raised to 25K; YouTube launch added to planned changes.",
      at: new Date(now - 86400000).toISOString(),
    },
    {
      id: "sla-2",
      kind: "decision",
      title: "Rejected: cut Stories volume",
      detail: "Client kept higher Stories cadence; recommendation stays rejected.",
      at: new Date(now - 14 * 86400000).toISOString(),
    },
    {
      id: "sla-3",
      kind: "evidence",
      title: "Instagram profile re-observed",
      detail: "Bio and follower signals refreshed; original observed_at preserved on reuse.",
      at: new Date(now - 3 * 86400000).toISOString(),
    },
    {
      id: "sla-4",
      kind: "recommendation",
      title: "Accepted: Tuesday carousel cadence",
      detail: "Now in progress — tracking saves vs prior baseline.",
      at: new Date(now - 14 * 86400000).toISOString(),
    },
  ];
}

// ---- Report archive ----

export function fixtureReportArchive(subjectId: string): ReportArchiveItem[] {
  return [
    {
      id: "rpt-001",
      auditId: "audit-002",
      channelLabel: "@narinkaji",
      reportVersion: 1,
      promptVersion: "alm-report-v4",
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      href: "/audits/audit-002/read",
    },
    {
      id: "rpt-002",
      auditId: "audit-001",
      channelLabel: "@narinkaji",
      reportVersion: 1,
      promptVersion: "alm-report-v3",
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      href: "/audits/audit-001/read",
    },
  ].map((row) => ({ ...row, id: `${subjectId}-${row.id}` }));
}
