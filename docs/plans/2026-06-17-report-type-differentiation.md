# Report Type Differentiation — Implementation Plan

> **For Hermes:** Execute task-by-task. Each task is self-contained with verification.

**Goal:** Split the single 15-section report into 5 distinct report types, each with its own section structure, prompt, and plan gate.

**Architecture:** Add `report_type` column to audits table → wire through intake wizard → build per-type section definitions in the worker → each type gets its own prompt. Instagram Connect becomes more prominent on the landing page.

**Tech Stack:** Next.js 16 (TS), Supabase (Postgres + RLS), Python worker (auditlayer_worker), Tailwind 4, shadcn/ui

---

## Report Type Matrix

| # | Type | Sections | Structure | Price | Plan Gate |
|---|---|---|---|---|---|
| 1 | `pulse` | 3 | Score, Gaps, 3 Moves | Free | Free (2 runs) |
| 2 | `standard` | 15 | Current full report | $30/mo | Starter+ |
| 3 | `extended` | 20 | Full + 5 new sections | $50/mo | Pro+ |
| 4 | `enterprise` | Custom | Founder-driven | Book a call | Enterprise |
| 5 | `blueprint` | 15 | Pre-launch foundation | $79 one-time | One-time purchase |

---

## Task 1: DB Migration — `report_type` column

**File:** `supabase/migrations/0010_report_type.sql`

```sql
-- Add report_type to audits table
alter table public.audits add column if not exists report_type text not null default 'standard';

-- Backfill: existing audits are standard (15-section)
```

**Verify:** `curl` the audits table, confirm `report_type` column exists with default `'standard'`.

---

## Task 2: Add `ReportType` to domain layer

**File:** `web/src/lib/domain.ts`

```ts
export type ReportType = "pulse" | "standard" | "extended" | "enterprise" | "blueprint";

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  pulse: "Pulse — Free snapshot",
  standard: "Standard — Full 15-section report",
  extended: "Extended — 20-section deep dive",
  enterprise: "Enterprise — Custom engagement",
  blueprint: "Blueprint — Pre-launch foundation",
};

export const REPORT_TYPE_SECTIONS: Record<ReportType, number> = {
  pulse: 3,
  standard: 15,
  extended: 20,
  enterprise: 0, // custom
  blueprint: 15,
};
```

**File:** `worker/auditlayer_worker/core.py`

```python
class ReportType(str, Enum):
    PULSE = "pulse"
    STANDARD = "standard"
    EXTENDED = "extended"
    ENTERPRISE = "enterprise"
    BLUEPRINT = "blueprint"
```

Keep TS and Python in sync.

---

## Task 3: Section definitions per type

**File:** `worker/auditlayer_worker/core.py`

```python
PULSE_SECTIONS = [
    "Score Breakdown",
    "Key Gaps",
    "Three Immediate Moves",
]

STANDARD_SECTIONS = [
    "Executive Summary",
    "Key Metrics",
    "Strengths",
    "Weaknesses",
    "Root Cause Analysis",
    "Peer Comparison",
    "Content Format Analysis",
    "Engagement Growth Strategy",
    "Quick Wins — This Week",
    "Success Benchmarks",
    "Audience Profile",
    "Road to [Milestone]",
    "Audit Cadence",
    "Footer",
    "Powered by AuditLayerMedia",
]

EXTENDED_SECTIONS = [
    "Executive Summary",
    "Key Metrics",
    "Strengths",
    "Weaknesses",
    "Root Cause Analysis",
    "Peer Comparison",
    "Content Format Analysis",
    "Engagement Growth Strategy",
    "Quick Wins — This Week",
    "Success Benchmarks",
    "Audience Profile",
    "Road to [Milestone]",
    "Audit Cadence",
    "Content Pillars & Ideas",
    "Footer",
    "Power of Posting Stories",
    "Your Thumbnails Are the Lens",
    "Leave Genuine Comments",
    "Your First 3 Seconds",
    "Powered by AuditLayerMedia",
]

BLUEPRINT_SECTIONS = [
    "Niche & Positioning Audit",
    "Competitive Landscape",
    "Content Pillar Architecture",
    "Profile Optimization Checklist",
    "Visual Identity Framework",
    "Content Calendar — Month 1",
    "Story Strategy",
    "Engagement Playbook",
    "Growth Levers — First 90 Days",
    "Content Format Mix",
    "Brand Voice Guide",
    "Launch Readiness Score",
    "Risk & Blind Spots",
    "Footer",
    "Powered by AuditLayerMedia",
]

REPORT_SECTIONS: dict[str, list[str]] = {
    "pulse": PULSE_SECTIONS,
    "standard": STANDARD_SECTIONS,
    "extended": EXTENDED_SECTIONS,
    "blueprint": BLUEPRINT_SECTIONS,
}
```

**Key difference:** Blueprint sections are pre-launch focused — niche selection, profile setup, content architecture, launch readiness. Not growth/post-mortem like standard.

---

## Task 4: Update `AuditRecord` dataclass

**File:** `worker/auditlayer_worker/core.py`

Add `report_type` field:

```python
@dataclass
class AuditRecord:
    id: str
    handle: str
    platform: str
    goal: str
    context: str = ""
    status: str = "queued"
    limitations: list[str] = field(default_factory=list)
    milestone_label: str | None = None
    report_type: str = "standard"  # NEW
    plan: str = "free"             # NEW — for plan gating in the worker
    research_cache: str = ""
```

Update `from_row()` to read `report_type` and `plan` from the DB row.

---

## Task 5: Update prompt builder to use report type

**File:** `worker/auditlayer_worker/core.py` — `build_worker_prompt()`

```python
def build_worker_prompt(audit: AuditRecord, ig_metrics: Any = None) -> str:
    sections = REPORT_SECTIONS.get(audit.report_type, STANDARD_SECTIONS)
    section_ref = "\n".join(f"  {i}. {s}" for i, s in enumerate(sections, 1))
    
    # Blueprint gets a different preamble
    if audit.report_type == "blueprint":
        preamble = (
            "You are building a PRE-LAUNCH foundation audit. The creator has 0-1K followers "
            "and needs a solid base before scaling. Focus on niche positioning, profile architecture, "
            "content strategy, and launch readiness. Every recommendation should be actionable "
            "for someone starting from scratch."
        )
    elif audit.report_type == "pulse":
        preamble = (
            "You are building a PULSE snapshot — a lightweight 3-section scorecard. "
            "Keep it tight. Score + top 3 gaps + 3 numbered actions. No fluff."
        )
    else:
        preamble = "Follow the AuditLayer report framework exactly."
    
    # ... rest of prompt with preamble + section_ref ...
```

Also update `WORKER_SYSTEM_PROMPT` to be report-type-aware.

---

## Task 6: Wire report type into intake wizard

**File:** `web/src/app/(app)/audits/new/wizard.tsx`

Add report type selection as step 2 (between goal and context):

```tsx
// Report type selection
const REPORT_TYPES: { value: ReportType; label: string; desc: string; disabled?: boolean }[] = [
  { value: "pulse", label: "Pulse", desc: "Free 3-section snapshot" },
  { value: "standard", label: "Standard", desc: "Full 15-section report", disabled: plan === "free" },
  { value: "extended", label: "Extended", desc: "20-section deep dive", disabled: plan !== "pro" && plan !== "enterprise" },
  { value: "blueprint", label: "Blueprint", desc: "Pre-launch foundation", disabled: true /* separate purchase flow */ },
];
```

**File:** `web/src/lib/actions/audits.ts` — pass `report_type` in the insert.

---

## Task 7: Worker reads `report_type` from DB row

**File:** `worker/auditlayer_worker/supabase_client.py`

The `claim_next_queued()` method already selects `*` from audits. The new `report_type` column will come through automatically. The `AuditRecord.from_row()` needs to read it (done in Task 4).

---

## Task 8: Instagram Connect prominence on landing page

**File:** `web/src/app/page.tsx`

Add a compact Instagram Connect CTA between Pulse Preview and Full Mock Report:

```tsx
{/* Instagram Connect */}
<section className="relative z-10 mx-auto mt-14 max-w-2xl text-center">
  <div className="rounded-xl border border-border bg-card px-6 py-8 shadow-[var(--shadow-sm)]">
    <h2 className="text-lg font-semibold">Connect your Instagram for live metrics</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Get real follower counts, engagement rates, and content data — instead of public estimates.
    </p>
    <div className="mt-4">
      <InstagramConnectButton />
    </div>
  </div>
</section>
```

The `InstagramConnectButton` should link to `/login` if not authenticated, or trigger the Facebook OAuth flow if logged in.

---

## Task 9: Plan gating for report types

**File:** `web/src/lib/domain.ts` (add gating function)

```ts
export function allowedReportTypes(plan: Plan): ReportType[] {
  switch (plan) {
    case "free": return ["pulse"];
    case "starter": return ["pulse", "standard"];
    case "pro": return ["pulse", "standard", "extended"];
    case "enterprise": return ["pulse", "standard", "extended", "enterprise"];
  }
}
```

Blueprint bypasses plan gates — it's a one-time purchase.

---

## Task 10: Update worker plan limiting

**File:** `worker/auditlayer_worker/core.py` — `evaluate_intake()`

Check that the requested `report_type` is allowed for the user's plan. If a free user requests a standard report, block it at intake.

---

## Execution Order

```
Task 1 (DB) → Task 2 (types) → Task 3 (sections) → Task 4 (AuditRecord)
→ Task 5 (prompts) → Task 6 (wizard) → Task 7 (worker read)
→ Task 8 (IG Connect) → Task 9 (gating) → Task 10 (worker enforcement)
```

**Estimated:** ~30–45 min. DB migration is instant. The bulk of the work is in the wizard UI and prompt engineering.

---

## Verification

1. Submit a Pulse audit → worker generates 3-section report → verify in dashboard
2. Submit a Standard audit → worker generates 15-section report → verify
3. Submit an Extended audit (pro user) → worker generates 20-section report → verify
4. Free user tries to select Standard → blocked by plan gate
5. Instagram Connect CTA visible on landing page, links correctly
6. All existing audits remain `standard` (backward compatible)
