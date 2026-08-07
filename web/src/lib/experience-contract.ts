/**
 * experience-contract.ts — AuditLayer portal experience contract (static).
 *
 * One versioned, deterministic contract that mechanically inspects every
 * portal route and route-state component and evaluates a fixed rule set:
 *
 *   route-coverage | semantic-color | radius | panel | header | button |
 *   banner | state | focus | target
 *
 * The scanner is deliberately pure (node builtins + relative imports only) so
 * it runs identically under vitest and under plain `node` type-stripping
 * (see the direct-execution block at the bottom, used to emit
 * `web/artifacts/experience-contract.json`).
 *
 * Explicit exceptions live in the typed registry below (owner / reason /
 * correctionTip). A finding that matches a registered exception is counted as
 * an exception; a finding with no matching exception is a violation. Stale
 * exception entries (registered but no longer triggered) are reported so the
 * registry cannot silently grow.
 *
 * This module proves source-level conformance only. Rendered 44px touch-target
 * compliance and production accessibility require a browser probe and are
 * reported as UNKNOWN with an exact future probe (see TARGET_44_PX_PROBE).
 */

import {
  readdirSync,
  readFileSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, relative, dirname, sep as pathSep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EXPERIENCE_CONTRACT_VERSION = "1.0.0";

export type RuleId =
  | "route-coverage"
  | "semantic-color"
  | "radius"
  | "panel"
  | "header"
  | "button"
  | "banner"
  | "state"
  | "focus"
  | "target";

export interface ExperienceException {
  id: string;
  rule: RuleId;
  /** Relative path under web/ the exception applies to ("" = whole scan). */
  path: string;
  /** Human owner of the reviewed decision. */
  owner: string;
  /** Why the deviation is accepted today. */
  reason: string;
  /** How to eliminate the deviation. */
  correctionTip: string;
}

export interface Finding {
  rule: RuleId;
  path: string;
  line: number;
  detail: string;
}

export interface RuleReport {
  status: "pass" | "violations" | "exceptions" | "unknown";
  findings: number;
  violations: Finding[];
  exceptions: Finding[];
  exceptionIds: string[];
}

export interface StateFileCounts {
  loading: string[];
  error: string[];
  globalError: string[];
}

export interface ExperienceReport {
  contract: "experience-contract";
  version: string;
  /** Relative to the web root, so the report contains no absolute paths. */
  scanRoot: string;
  routes: { total: number; files: string[] };
  stateFiles: StateFileCounts;
  primitives: { ui: string[]; shared: string[] };
  rules: Record<RuleId, RuleReport>;
  unknownBrowserOnly: { rule: RuleId; detail: string }[];
  correctionTips: string[];
}

// ---------------------------------------------------------------------------
// Bounded vocabulary
// ---------------------------------------------------------------------------

/** Radius utilities allowed on route/state/component surfaces. */
const ALLOWED_RADIUS = new Set([
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-full",
  "rounded-none",
  "rounded-t",
  "rounded-b",
  "rounded-l",
  "rounded-r",
  "rounded-t-sm",
  "rounded-t-md",
  "rounded-t-lg",
  "rounded-t-xl",
  "rounded-b-sm",
  "rounded-b-md",
  "rounded-b-lg",
  "rounded-b-xl",
  "rounded-tl",
  "rounded-tr",
  "rounded-bl",
  "rounded-br",
]);

const RADIUS_RE = /rounded-(?:[a-z0-9]+|\[[^\]]+\])/g;

/**
 * Raw interactive element tag matcher. Arrow-safe: consumes `=>` pairs so a
 * JSX arrow prop (`onClick={() => ...}`) does not terminate the tag early.
 */
const INTERACTIVE_RE =
  /<(button|summary|input|textarea|select|a)\b(?:[^>=]|=(?!>)|=>)*>/g;

/** Focus treatment markers the design system accepts (alm-focus or focus-visible). */
const FOCUS_RE = /(alm-focus|focus-visible:)/;

/** Declared height utilities that satisfy the 40px static floor. */
const HEIGHT_40_RE =
  /\b(h-10|h-11|min-h-10|min-h-11|min-h-12|min-h-14|size-10|size-11|size-12|size-14)\b/;

/** Exact future browser probe for rendered 44px touch targets. */
export const TARGET_44_PX_PROBE =
  "Playwright + axe-core target-size (wcag258) over representative product routes (dashboard, subjects, accounts, audits/[id], audits/new, login) at desktop (1280px) and mobile (390px) viewports; declare any sub-44px control as a registered exception or resize. Not provable from static source.";

// ---------------------------------------------------------------------------
// Explicit exception registry (reviewed, bounded)
// ---------------------------------------------------------------------------

export const EXPERIENCE_EXCEPTIONS: ExperienceException[] = [
  // --- semantic-color ------------------------------------------------------
  {
    id: "google-brand-glyph",
    rule: "semantic-color",
    path: "src/app/login/login-form.tsx",
    owner: "product-design",
    reason:
      "Google 'G' brand glyph requires Google's fixed brand palette (#4285F4/#34A853/#FBBC05/#EA4335); these are brand assets, not themeable UI tokens.",
    correctionTip:
      "Keep the four brand hex values isolated inside GoogleGlyph so token drift stays impossible; if a future brand-token layer is added, move them there.",
  },
  // --- panel ---------------------------------------------------------------
  {
    id: "panel-marketing-legacy",
    rule: "panel",
    path: "src/app/page.tsx",
    owner: "product-design",
    reason:
      "Marketing landing cards use inline panel styling with a distinct editorial rhythm; the card's bounded migration preserves the landing visual system.",
    correctionTip:
      "If the landing is ever rebuilt, route its surfaces through Card/alm-panel; do not assert compliance for marketing fixtures.",
  },
  {
    id: "panel-enterprise-legacy",
    rule: "panel",
    path: "src/app/enterprise/page.tsx",
    owner: "product-design",
    reason:
      "Enterprise landing surface predates the contract; marketing fixture, not product route state.",
    correctionTip: "Migrate to Card/alm-panel on next marketing refresh.",
  },
  {
    id: "panel-oauth-consent-legacy",
    rule: "panel",
    path: "src/app/oauth/consent/page.tsx",
    owner: "product-design",
    reason:
      "OAuth consent card is a narrowly-scoped legal/auth surface with bespoke layout.",
    correctionTip: "Reuse Card/alm-panel when consent screen is restyled.",
  },
  {
    id: "panel-preview-setup-legacy",
    rule: "panel",
    path: "src/app/(app)/preview-setup/",
    owner: "alm-build",
    reason:
      "Preview tester setup is an internal-only surface not part of the customer path.",
    correctionTip: "Reuse Card/alm-panel on next touch.",
  },
  {
    id: "panel-wizard-legacy",
    rule: "panel",
    path: "src/components/intelligence/intelligence-wizard.tsx",
    owner: "product-design",
    reason:
      "Intake wizard panels predate the contract; the three-screen intake flow is sacrosanct and this card does not restyle it.",
    correctionTip: "Migrate wizard step panels to Card/alm-panel in the wizard restyle card.",
  },
  {
    id: "panel-wait-state-legacy",
    rule: "panel",
    path: "src/components/intelligence/customer-wait-state.tsx",
    owner: "product-design",
    reason:
      "Waiting-state panels carry terminal/phase color semantics implemented before the shared state primitives existed; behavior is covered by the customer-status contract.",
    correctionTip: "Re-point terminal/delayed panels at ExperienceState primitives when the audit page is next touched.",
  },
  {
    id: "panel-live-timeline-legacy",
    rule: "panel",
    path: "src/components/live-timeline.tsx",
    owner: "product-design",
    reason: "Timeline event surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel on next timeline touch.",
  },
  {
    id: "panel-share-links-legacy",
    rule: "panel",
    path: "src/components/share-links.tsx",
    owner: "product-design",
    reason: "Share-links surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel on next share-surface touch.",
  },
  {
    id: "panel-report-viewer-legacy",
    rule: "panel",
    path: "src/components/report-viewer.tsx",
    owner: "product-design",
    reason: "Report viewer toolbar surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel on next viewer touch.",
  },
  {
    id: "panel-live-brief-view-legacy",
    rule: "panel",
    path: "src/components/intelligence/living-brief-view.tsx",
    owner: "product-design",
    reason: "Living Brief view surface predates the contract.",
    correctionTip: "Adopt Card/alm-panel during Living Brief surface work.",
  },
  {
    id: "panel-live-brief-editor-legacy",
    rule: "panel",
    path: "src/components/intelligence/living-brief-editor.tsx",
    owner: "product-design",
    reason: "Living Brief editor surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during Living Brief editor work.",
  },
  {
    id: "panel-public-shell-legacy",
    rule: "panel",
    path: "src/components/public-shell.tsx",
    owner: "product-design",
    reason: "Public footer/shell surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel on next public-shell touch.",
  },
  {
    id: "panel-testimonial-carousel-legacy",
    rule: "panel",
    path: "src/components/testimonial-carousel.tsx",
    owner: "product-design",
    reason: "Marketing carousel card predates the contract; marketing fixture.",
    correctionTip: "Adopt Card/alm-panel on marketing refresh.",
  },
  {
    id: "panel-accounts-detail-legacy",
    rule: "panel",
    path: "src/app/(app)/accounts/[id]/page.tsx",
    owner: "alm-build",
    reason:
      "Account detail stat panels predate the contract and were not part of this card's bounded page-state migration set.",
    correctionTip: "Adopt Card/alm-panel on next account-detail touch.",
  },
  {
    id: "panel-settings-ai-connections-legacy",
    rule: "panel",
    path: "src/app/(app)/settings/ai-connections/page.tsx",
    owner: "alm-build",
    reason:
      "AI-connections grant cards predate the contract; page-state empty branch was migrated, data cards deferred.",
    correctionTip: "Adopt Card/alm-panel on next settings touch.",
  },
  {
    id: "panel-benchmark-client-legacy",
    rule: "panel",
    path: "src/app/admin/benchmarks/benchmark-page-client.tsx",
    owner: "alm-build",
    reason: "Admin benchmark modal/table surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-audit-actions-legacy",
    rule: "panel",
    path: "src/app/admin/audits/[id]/audit-actions.tsx",
    owner: "alm-build",
    reason: "Admin audit-actions surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-operator-panel-legacy",
    rule: "panel",
    path: "src/app/admin/audits/[id]/operator-panel.tsx",
    owner: "alm-build",
    reason: "Admin operator panel predates the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-admin-users-legacy",
    rule: "panel",
    path: "src/app/admin/users/",
    owner: "alm-build",
    reason: "Admin user tables/forms predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-admin-trials-legacy",
    rule: "panel",
    path: "src/app/admin/trials/",
    owner: "alm-build",
    reason: "Admin trial surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-admin-settings-legacy",
    rule: "panel",
    path: "src/app/admin/settings/",
    owner: "alm-build",
    reason: "Admin settings surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-admin-audits-detail-legacy",
    rule: "panel",
    path: "src/app/admin/audits/[id]/page.tsx",
    owner: "alm-build",
    reason: "Admin audit detail surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-admin-benchmarks-legacy",
    rule: "panel",
    path: "src/app/admin/benchmarks/page.tsx",
    owner: "alm-build",
    reason: "Admin benchmark page surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  {
    id: "panel-admin-home-legacy",
    rule: "panel",
    path: "src/app/admin/page.tsx",
    owner: "alm-build",
    reason: "Admin home surfaces predate the contract.",
    correctionTip: "Adopt Card/alm-panel during admin cleanup.",
  },
  // --- header --------------------------------------------------------------
  {
    id: "header-immersive-read",
    rule: "header",
    path: "src/app/(app)/audits/[id]/read/page.tsx",
    owner: "product-design",
    reason:
      "The immersive report reader intentionally suppresses the product page header (h1 lives in the rendered report artifact itself).",
    correctionTip: "Verify h1 presence inside the rendered report HTML with the release-gate browser probe.",
  },
  {
    id: "header-client-delegated",
    rule: "header",
    path: "src/app/admin/benchmarks/page.tsx",
    owner: "alm-build",
    reason:
      "Admin benchmark page delegates its heading to a client component (BenchmarkPageClient renders the h1).",
    correctionTip: "Recheck with a DOM query (h1 count) in the admin browser probe.",
  },
  {
    id: "header-subject-home-delegated",
    rule: "header",
    path: "src/app/(app)/subjects/[id]/page.tsx",
    owner: "product-design",
    reason:
      "Subject detail delegates its heading to SubjectHome, which renders the canonical h1 for the subject.",
    correctionTip: "Recheck with a DOM query (h1 count) in the release-gate browser probe.",
  },
  // --- button --------------------------------------------------------------
  {
    id: "button-carousel-arrows",
    rule: "button",
    path: "src/components/testimonial-carousel.tsx",
    owner: "product-design",
    reason:
      "Marketing carousel arrow controls are raw buttons with explicit alm-focus and size-10 targets; not shared-action buttons.",
    correctionTip: "Keep or migrate to Button icon variant during marketing refresh.",
  },
  {
    id: "button-wizard-step-switch",
    rule: "button",
    path: "src/components/intelligence/intelligence-wizard.tsx",
    owner: "product-design",
    reason:
      "Wizard tab/step switches are raw buttons inside the sacrosanct three-screen intake flow; not migrated by this card.",
    correctionTip: "Migrate to Button variants in the wizard restyle card; verify focus+target in the browser probe.",
  },
  {
    id: "button-subject-home-actions",
    rule: "button",
    path: "src/components/intelligence/subject-home.tsx",
    owner: "product-design",
    reason:
      "Subject-home inline actions are raw buttons with explicit focus handling in a dense data surface.",
    correctionTip: "Migrate to Button variants on next subject-surface touch.",
  },
  {
    id: "button-share-links-copy",
    rule: "button",
    path: "src/components/share-links.tsx",
    owner: "product-design",
    reason:
      "Copy-to-clipboard buttons are raw buttons with explicit aria/focus handling inside the share surface.",
    correctionTip: "Migrate to Button variants on next share-surface touch.",
  },
  {
    id: "button-benchmark-actions",
    rule: "button",
    path: "src/app/admin/benchmarks/benchmark-page-client.tsx",
    owner: "alm-build",
    reason: "Admin benchmark edit/delete buttons are inline text actions in the founder console.",
    correctionTip: "Migrate to Button variants during admin cleanup.",
  },
  {
    id: "button-revoke-link",
    rule: "button",
    path: "src/app/admin/trials/revoke-button.tsx",
    owner: "alm-build",
    reason: "Admin revoke control is intentionally a link-style destructive action.",
    correctionTip: "Migrate to Button variant destructive/ghost during admin cleanup.",
  },
  {
    id: "button-share-report-view-reset",
    rule: "button",
    path: "src/app/s/[token]/share-report-view.tsx",
    owner: "product-design",
    reason:
      "Share-page reset control is a raw text button with explicit aria handling in a token-scoped surface.",
    correctionTip: "Migrate to Button ghost variant on next share-surface touch.",
  },
  {
    id: "button-admin-users-search",
    rule: "button",
    path: "src/app/admin/users/page.tsx",
    owner: "alm-build",
    reason: "Admin user search submit is a raw button with explicit target styling.",
    correctionTip: "Migrate to Button during admin cleanup.",
  },
  {
    id: "button-sample-preview",
    rule: "button",
    path: "src/components/sample-report-preview.tsx",
    owner: "product-design",
    reason: "Sample report toggle is a raw button inside the marketing sample fixture.",
    correctionTip: "Migrate to Button variant on marketing refresh.",
  },
  // --- banner --------------------------------------------------------------
  {
    id: "banner-wizard-observed-note",
    rule: "banner",
    path: "src/components/intelligence/intelligence-wizard.tsx",
    owner: "product-design",
    reason:
      "The intake wizard's 'previously observed targets' note is a contextual inline notice inside the sacrosanct three-screen flow; not migrated by this card.",
    correctionTip: "Migrate to ExperienceBanner during the wizard restyle card.",
  },
  {
    id: "banner-live-timeline-event",
    rule: "banner",
    path: "src/components/live-timeline.tsx",
    owner: "product-design",
    reason:
      "Timeline event notices are color-mix tone rows driven by dynamic status colors; converting them to a static banner primitive would lose event semantics.",
    correctionTip: "Migrate to a tone-driven ExperienceBanner variant on next timeline touch.",
  },
  // --- state ---------------------------------------------------------------
  {
    id: "state-no-route-error-files",
    rule: "state",
    path: "",
    owner: "product-design",
    reason:
      "There is no route-level error.tsx boundary; the single global-error.tsx boundary covers all routes and is the reviewed exception for route error surfaces.",
    correctionTip:
      "Add a route-level error.tsx under src/app/(app)/ if per-route recovery UX is needed; the contract will then report it.",
  },
  {
    id: "state-loading-public-static",
    rule: "state",
    path: "src/app/page.tsx",
    owner: "product-design",
    reason:
      "Public/marketing and auth routes are statically rendered; they do not require a loading.tsx boundary. Loading coverage is required for the (app) product group (present).",
    correctionTip: "Add loading boundaries if any public route becomes dynamic.",
  },
  {
    id: "state-loading-enterprise-static",
    rule: "state",
    path: "src/app/enterprise/page.tsx",
    owner: "product-design",
    reason: "Enterprise landing is statically rendered; no loading boundary required.",
    correctionTip: "Add a loading boundary if the enterprise page becomes dynamic.",
  },
  {
    id: "state-login-static-list",
    rule: "state",
    path: "src/app/login/page.tsx",
    owner: "product-design",
    reason: "Login side panel maps over a static 3-item array; no data-driven empty state applies.",
    correctionTip: "None.",
  },
  // --- focus ---------------------------------------------------------------
  {
    id: "focus-inline-prose-links",
    rule: "focus",
    path: "src/app/privacy/page.tsx",
    owner: "product-design",
    reason:
      "Privacy page uses inline prose links; the global base layer supplies outline-ring and the design treats these as sentence-level references, not controls.",
    correctionTip: "Add alm-focus to inline prose links if a keyboard-contrast regression is observed in the browser probe.",
  },
  {
    id: "focus-data-deletion-prose",
    rule: "focus",
    path: "src/app/data-deletion/page.tsx",
    owner: "product-design",
    reason: "Data-deletion page uses inline mailto prose links; same rationale as privacy.",
    correctionTip: "Add alm-focus if the browser probe shows no visible focus.",
  },
  {
    id: "focus-support-prose",
    rule: "focus",
    path: "src/app/support/support-form.tsx",
    owner: "product-design",
    reason: "Support mailto link is inline prose.",
    correctionTip: "Add alm-focus if the browser probe shows no visible focus.",
  },
  {
    id: "focus-immersive-back-links",
    rule: "focus",
    path: "src/components/immersive-report.tsx",
    owner: "product-design",
    reason: "Immersive reader back links carry alm-focus; secondary 'go back' error link is prose.",
    correctionTip: "Verify immersive focus ring in the browser probe.",
  },
  {
    id: "focus-report-viewer-download",
    rule: "focus",
    path: "src/components/report-viewer.tsx",
    owner: "product-design",
    reason: "Download anchor wraps a Button primitive that supplies focus-visible treatment.",
    correctionTip: "None; Button focus-visible applies.",
  },
  {
    id: "focus-instagram-connect-links",
    rule: "focus",
    path: "src/components/instagram-connect.tsx",
    owner: "product-design",
    reason:
      "Instagram data-use/help links are inline prose links in a section that otherwise uses primitives.",
    correctionTip: "Add alm-focus if the browser probe shows no visible focus.",
  },
  // --- target --------------------------------------------------------------
  {
    id: "target-inline-prose-links",
    rule: "target",
    path: "src/app/privacy/page.tsx",
    owner: "product-design",
    reason: "Inline prose links are sentence references, exempt from target-size requirements.",
    correctionTip: "None; prose links are not controls.",
  },
  {
    id: "target-data-deletion-prose",
    rule: "target",
    path: "src/app/data-deletion/page.tsx",
    owner: "product-design",
    reason: "Inline mailto prose link is a sentence reference.",
    correctionTip: "None.",
  },
  {
    id: "target-support-prose",
    rule: "target",
    path: "src/app/support/support-form.tsx",
    owner: "product-design",
    reason: "Inline mailto prose link is a sentence reference.",
    correctionTip: "None.",
  },
  {
    id: "target-admin-text-actions",
    rule: "target",
    path: "src/app/admin/",
    owner: "alm-build",
    reason:
      "Admin inline text actions are dense founder-console controls; not part of the customer product path.",
    correctionTip: "Enforce 44px targets during admin cleanup; verify with TARGET_44_PX_PROBE.",
  },
  {
    id: "target-share-copy",
    rule: "target",
    path: "src/components/share-links.tsx",
    owner: "product-design",
    reason: "Copy buttons are compact text actions in the share surface.",
    correctionTip: "Verify with TARGET_44_PX_PROBE on next share-surface touch.",
  },
  {
    id: "target-immersive-back-links",
    rule: "target",
    path: "src/components/immersive-report.tsx",
    owner: "product-design",
    reason:
      "Immersive reader back links are text-size navigation in a focused reading surface with alm-focus treatment.",
    correctionTip: "Verify with TARGET_44_PX_PROBE; bump to min-h-10 if flagged.",
  },
  {
    id: "target-instagram-connect-links",
    rule: "target",
    path: "src/components/instagram-connect.tsx",
    owner: "product-design",
    reason:
      "Instagram data-use/help links are inline prose references below the connection panel.",
    correctionTip: "Verify with TARGET_44_PX_PROBE; bump to min-h-10 if flagged.",
  },
  {
    id: "target-live-timeline-summary",
    rule: "target",
    path: "src/components/live-timeline.tsx",
    owner: "product-design",
    reason: "Timeline 'full event log' disclosure is a compact summary control.",
    correctionTip: "Verify with TARGET_44_PX_PROBE on next timeline touch.",
  },
  {
    id: "target-carousel-arrows",
    rule: "target",
    path: "src/components/testimonial-carousel.tsx",
    owner: "product-design",
    reason: "Carousel arrows are size-10 (40px) icon controls on a marketing fixture.",
    correctionTip: "Resize to 44px if the browser probe flags them.",
  },
  {
    id: "target-wizard-compact",
    rule: "target",
    path: "src/components/intelligence/intelligence-wizard.tsx",
    owner: "product-design",
    reason: "Wizard step/compact controls predate the contract.",
    correctionTip: "Verify all wizard targets in the browser probe during the wizard restyle.",
  },
  {
    id: "target-subject-home-actions",
    rule: "target",
    path: "src/components/intelligence/subject-home.tsx",
    owner: "product-design",
    reason:
      "Subject-home tab switches and score expanders are dense intelligence-surface controls predating the contract.",
    correctionTip: "Verify with TARGET_44_PX_PROBE during subject-surface work.",
  },
  {
    id: "target-share-report-view-reset",
    rule: "target",
    path: "src/app/s/[token]/share-report-view.tsx",
    owner: "product-design",
    reason: "Share-page reset is a compact text control in a token-scoped surface.",
    correctionTip: "Verify with TARGET_44_PX_PROBE on next share-surface touch.",
  },
];

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx") && !entry.includes(".test.")) out.push(full);
  }
  return out.sort();
}

function findFiles(root: string, name: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (entry === name) out.push(full);
    }
  }
  return out.sort();
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function exceptionFor(rule: RuleId, relPath: string): ExperienceException | undefined {
  const candidates = EXPERIENCE_EXCEPTIONS.filter((e) => {
    if (e.rule !== rule) return false;
    if (e.path === "") return relPath === "";
    if (e.path === relPath) return true;
    if (!relPath.startsWith(e.path)) return false;
    // Directory-prefix exceptions must end with "/".
    return e.path.endsWith("/");
  });
  if (candidates.length === 0) return undefined;
  // Prefer the most specific (longest) path.
  candidates.sort((a, b) => b.path.length - a.path.length);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Rule evaluators
// ---------------------------------------------------------------------------

function scanSemanticColor(files: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  for (const file of files) {
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
    let m: RegExpExecArray | null;
    while ((m = hexRe.exec(content)) !== null) {
      const exc = exceptionFor("semantic-color", rel);
      const finding: Finding = {
        rule: "semantic-color",
        path: rel,
        line: lineOf(content, m.index),
        detail: `hardcoded hex ${m[0]}`,
      };
      if (exc) {
        exceptions.push(finding);
        exceptionIds.add(exc.id);
      } else {
        violations.push(finding);
      }
    }
  }
  return summarize("semantic-color", violations, exceptions, [...exceptionIds]);
}

function scanRadius(files: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  for (const file of files) {
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = RADIUS_RE.exec(content)) !== null) {
      const token = m[0];
      const isBounded =
        ALLOWED_RADIUS.has(token) ||
        /^rounded-\[(var\(--radius|min\(var\(--radius)/.test(token);
      if (isBounded) continue;
      const finding: Finding = {
        rule: "radius",
        path: rel,
        line: lineOf(content, m.index),
        detail: `unbounded radius utility ${token}`,
      };
      const exc = exceptionFor("radius", rel);
      if (exc) {
        exceptions.push(finding);
        exceptionIds.add(exc.id);
      } else {
        violations.push(finding);
      }
    }
  }
  return summarize("radius", violations, exceptions, [...exceptionIds]);
}

function scanPanel(files: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  const RAW_PANEL_RE = /\b(?:rounded-\[var\(--radius\)\]\s+)?border border-border bg-card\b/g;
  for (const file of files) {
    // The ui/ primitives are the canonical implementation; they may define
    // panel surfaces themselves.
    if (file.includes(`${pathSep}ui${pathSep}`)) continue;
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = RAW_PANEL_RE.exec(content)) !== null) {
      const finding: Finding = {
        rule: "panel",
        path: rel,
        line: lineOf(content, m.index),
        detail: "raw panel-like surface (border border-border bg-card) without alm-panel/Card",
      };
      const exc = exceptionFor("panel", rel);
      if (exc) {
        exceptions.push(finding);
        exceptionIds.add(exc.id);
      } else {
        violations.push(finding);
      }
    }
  }
  return summarize("panel", violations, exceptions, [...exceptionIds]);
}

function scanHeader(pages: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  for (const file of pages) {
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    const hasHeaderConstruct =
      content.includes("PageHeader") || content.includes("alm-kicker") || /<h1\b/.test(content);
    if (hasHeaderConstruct) continue;
    const exc = exceptionFor("header", rel);
    const finding: Finding = {
      rule: "header",
      path: rel,
      line: 1,
      detail: "page has no PageHeader/alm-kicker/h1 construct",
    };
    if (exc) {
      exceptions.push(finding);
      exceptionIds.add(exc.id);
    } else {
      violations.push(finding);
    }
  }
  return summarize("header", violations, exceptions, [...exceptionIds]);
}

function scanButton(files: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  for (const file of files) {
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    // Raw <button> tags that are not part of the shared Button primitive.
    const rawButtonRe = /<button\b([^>]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = rawButtonRe.exec(content)) !== null) {
      const tag = m[1];
      if (FOCUS_RE.test(tag) && (HEIGHT_40_RE.test(tag) || /p-[xy]-\d|size-10|size-11/.test(tag))) {
        continue; // treated raw button with focus + target
      }
      const exc = exceptionFor("button", rel);
      const finding: Finding = {
        rule: "button",
        path: rel,
        line: lineOf(content, m.index),
        detail: `raw <button> without shared Button or explicit focus+target (${tag.slice(0, 60)})`,
      };
      if (exc) {
        exceptions.push(finding);
        exceptionIds.add(exc.id);
      } else {
        violations.push(finding);
      }
    }
  }
  return summarize("button", violations, exceptions, [...exceptionIds]);
}

function scanBanner(files: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  // Banner-like surfaces: color-mix tone boxes, three-pixel left-border notices,
  // or muted CSS-variable backgrounds with borders that are not ExperienceBanner.
  const BANNER_RE = /(color-mix\(in oklch|border-l-\[3px\])/g;
  for (const file of files) {
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = BANNER_RE.exec(content)) !== null) {
      const exc = exceptionFor("banner", rel);
      const finding: Finding = {
        rule: "banner",
        path: rel,
        line: lineOf(content, m.index),
        detail: `banner-like surface via ${m[1]}; prefer ExperienceBanner`,
      };
      if (exc) {
        exceptions.push(finding);
        exceptionIds.add(exc.id);
      } else {
        violations.push(finding);
      }
    }
  }
  return summarize("banner", violations, exceptions, [...exceptionIds]);
}

function scanState(
  pages: string[],
  loadingFiles: string[],
  errorFiles: string[],
  globalErrorFiles: string[],
  webRoot: string,
): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();
  const rel = (f: string) => relative(webRoot, f);

  // Loading boundaries must consume the canonical skeleton primitive.
  for (const f of loadingFiles) {
    const content = readFileSync(f, "utf8");
    if (!/AlmSkeleton|ExperienceLoading/.test(content)) {
      violations.push({
        rule: "state",
        path: rel(f),
        line: 1,
        detail: "loading.tsx does not consume AlmSkeleton/ExperienceLoading",
      });
    }
  }

  // Global-error boundary must be a self-contained error surface.
  for (const f of globalErrorFiles) {
    const content = readFileSync(f, "utf8");
    if (!/Something went wrong|ExperienceError/.test(content)) {
      violations.push({
        rule: "state",
        path: rel(f),
        line: 1,
        detail: "global-error.tsx lacks an explicit error message surface",
      });
    }
  }

  // Error boundaries: count them; absent route-level error files are a
  // registered exception (single global boundary).
  for (const f of errorFiles) {
    const exc = exceptionFor("state", rel(f));
    if (!exc) {
      violations.push({
        rule: "state",
        path: rel(f),
        line: 1,
        detail: "error.tsx present but not registered in the exception registry",
      });
    }
  }
  if (errorFiles.length === 0) {
    const exc = exceptionFor("state", "");
    if (exc) exceptionIds.add(exc.id);
  }

  // Data-driven pages must have an empty-state branch (length guard or
  // ExperienceEmpty/ExperienceState consumption).
  for (const f of pages) {
    const content = readFileSync(f, "utf8");
    const hasMap = /\.map\(/.test(content);
    if (!hasMap) continue;
    const hasEmptyBranch =
      /(?:\.length === 0|length === 0|\.length > 0|length > 0|\.length \?)|ExperienceEmpty|ExperienceState/.test(
        content,
      );
    if (hasEmptyBranch) continue;
    const r = rel(f);
    const exc = exceptionFor("state", r) ?? exceptionFor("state", r.replace(/\/[^/]+\.tsx$/, "/"));
    const finding: Finding = {
      rule: "state",
      path: r,
      line: 1,
      detail: "data-driven page maps without an empty-state branch/primitive",
    };
    if (exc) {
      exceptions.push(finding);
      exceptionIds.add(exc.id);
    } else {
      violations.push(finding);
    }
  }

  return summarize("state", violations, exceptions, [...exceptionIds]);
}

function scanFocus(files: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  for (const file of files) {
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = INTERACTIVE_RE.exec(content)) !== null) {
      const tag = m[0];
      // Shared primitives provide their own focus treatment.
      if (/data-slot="(button|input|textarea)"/.test(tag) || FOCUS_RE.test(tag)) continue;
      const isControl = /<(button|summary|input|textarea|select)\b/.test(tag);
      if (isControl) continue; // button/target rules own these
      const isAnchor = /<a\b[^>]*href=/.test(tag);
      if (!isAnchor) continue;
      // Raw anchor without focus treatment.
      const exc = exceptionFor("focus", rel);
      const finding: Finding = {
        rule: "focus",
        path: rel,
        line: lineOf(content, m.index),
        detail: "interactive element without alm-focus/focus-visible treatment",
      };
      if (exc) {
        exceptions.push(finding);
        exceptionIds.add(exc.id);
      } else {
        violations.push(finding);
      }
    }
  }
  return summarize("focus", violations, exceptions, [...exceptionIds]);
}

function scanTarget(files: string[], webRoot: string): RuleReport {
  const violations: Finding[] = [];
  const exceptions: Finding[] = [];
  const exceptionIds = new Set<string>();

  for (const file of files) {
    const rel = relative(webRoot, file);
    const content = readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = INTERACTIVE_RE.exec(content)) !== null) {
      const tag = m[0];
      // Hidden form fields are not visual interactive targets.
      if (/type="hidden"/.test(tag)) continue;
      // Shared primitives declare their own targets.
      if (/data-slot="(button|input|textarea)"/.test(tag)) continue;
      // Declared 40px+ height satisfies the static floor.
      if (HEIGHT_40_RE.test(tag)) continue;
      // Untreated prose anchors (no styling) are sentence references.
      const isAnchor = /<a\b[^>]*href=/.test(tag);
      if (isAnchor && !/<a\b[^>]*className=/.test(tag)) continue;
      const exc = exceptionFor("target", rel);
      const finding: Finding = {
        rule: "target",
        path: rel,
        line: lineOf(content, m.index),
        detail: "interactive element without declared 40px+ target (static floor; 44px is browser-only)",
      };
      if (exc) {
        exceptions.push(finding);
        exceptionIds.add(exc.id);
      } else {
        violations.push(finding);
      }
    }
  }
  return summarize("target", violations, exceptions, [...exceptionIds]);
}

function summarize(
  rule: RuleId,
  violations: Finding[],
  exceptions: Finding[],
  exceptionIds: string[],
): RuleReport {
  const status =
    violations.length > 0
      ? "violations"
      : exceptions.length > 0
        ? "exceptions"
        : "pass";
  return {
    status,
    findings: violations.length + exceptions.length,
    violations,
    exceptions,
    exceptionIds: [...new Set(exceptionIds)].sort(),
  };
}

// ---------------------------------------------------------------------------
// Public scan entry
// ---------------------------------------------------------------------------

export function scanExperienceContract(webRoot: string): ExperienceReport {
  const appRoot = join(webRoot, "src", "app");
  const componentsRoot = join(webRoot, "src", "components");
  const uiRoot = join(componentsRoot, "ui");

  const pages = findFiles(appRoot, "page.tsx");
  const loadingFiles = findFiles(appRoot, "loading.tsx");
  const errorFiles = findFiles(appRoot, "error.tsx");
  const globalErrorFiles = findFiles(appRoot, "global-error.tsx");
  const allTsx = walk(componentsRoot).concat(walk(appRoot));

  const report: ExperienceReport = {
    contract: "experience-contract",
    version: EXPERIENCE_CONTRACT_VERSION,
    scanRoot: "web/",
    routes: { total: pages.length, files: pages.map((f) => relative(webRoot, f)) },
    stateFiles: {
      loading: loadingFiles.map((f) => relative(webRoot, f)),
      error: errorFiles.map((f) => relative(webRoot, f)),
      globalError: globalErrorFiles.map((f) => relative(webRoot, f)),
    },
    primitives: {
      ui: existsSync(uiRoot)
        ? walk(uiRoot).map((f) => relative(webRoot, f))
        : [],
      shared: existsSync(componentsRoot)
        ? walk(componentsRoot)
            .filter((f) => !f.startsWith(uiRoot))
            .map((f) => relative(webRoot, f))
        : [],
    },
    rules: {
      "route-coverage": summarize("route-coverage", [], [], []),
      "semantic-color": scanSemanticColor(allTsx, webRoot),
      radius: scanRadius(allTsx, webRoot),
      panel: scanPanel(allTsx, webRoot),
      header: scanHeader(pages, webRoot),
      button: scanButton(allTsx, webRoot),
      banner: scanBanner(allTsx, webRoot),
      state: scanState(pages, loadingFiles, errorFiles, globalErrorFiles, webRoot),
      focus: scanFocus(allTsx, webRoot),
      target: scanTarget(allTsx, webRoot),
    },
    unknownBrowserOnly: [
      {
        rule: "target",
        detail: TARGET_44_PX_PROBE,
      },
    ],
    correctionTips: [],
  };

  // route-coverage is informational: any page is covered by construction.
  report.rules["route-coverage"] = {
    status: "pass",
    findings: 0,
    violations: [],
    exceptions: [],
    exceptionIds: [],
  };

  // Stale-exception detection: an exception is live if (a) a rule explicitly
  // referenced its id (e.g. whole-scan state exceptions), or (b) it covers at
  // least one real finding under its rule+path. Anything else has drifted.
  const usedIds = new Set<string>();
  for (const rule of Object.values(report.rules)) {
    for (const id of rule.exceptionIds) usedIds.add(id);
  }
  const findingsByPath = new Map<string, Finding[]>();
  for (const rule of Object.values(report.rules)) {
    for (const f of [...rule.violations, ...rule.exceptions]) {
      const key = `${f.rule}|${f.path}`;
      const list = findingsByPath.get(key) ?? [];
      list.push(f);
      findingsByPath.set(key, list);
    }
  }
  const stale = EXPERIENCE_EXCEPTIONS.filter((e) => {
    if (usedIds.has(e.id)) return false;
    for (const key of findingsByPath.keys()) {
      const [rule, path] = key.split("|");
      if (rule !== e.rule) continue;
      if (path === e.path || (path.startsWith(e.path) && e.path.endsWith("/"))) {
        return false; // covers at least one real finding
      }
    }
    return true;
  });
  report.correctionTips = [
    ...collectCorrectionTips(report),
    ...stale.map(
      (e) =>
        `Stale exception ${e.id} (${e.rule}) no longer matches any finding — remove it from EXPERIENCE_EXCEPTIONS.`,
    ),
  ].sort();
  return report;
}

function collectCorrectionTips(report: ExperienceReport): string[] {
  const tips = new Set<string>();
  for (const rule of Object.values(report.rules)) {
    for (const v of rule.violations) {
      const exc = exceptionFor(v.rule, v.path);
      tips.add(
        exc
          ? exc.correctionTip
          : `Rule ${v.rule}: fix ${v.path}:${v.line} (${v.detail}).`,
      );
    }
  }
  for (const e of EXPERIENCE_EXCEPTIONS) {
    if (e.correctionTip && e.correctionTip !== "None") tips.add(e.correctionTip);
  }
  tips.add(TARGET_44_PX_PROBE);
  return [...tips].sort();
}

// ---------------------------------------------------------------------------
// Direct execution: `node src/lib/experience-contract.ts` writes the artifact
// deterministically (no timestamps, no absolute paths).
// ---------------------------------------------------------------------------

const moduleUrl = import.meta.url;
const argv1 = process.argv[1];
if (argv1) {
  const argvUrl = pathToFileURL(argv1).href;
  if (argvUrl === moduleUrl) {
    const here = dirname(fileURLToPath(moduleUrl));
    const webRoot = join(here, "..", "..");
    const report = scanExperienceContract(webRoot);
    const artifactsDir = join(webRoot, "artifacts");
    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }
    writeFileSync(
      join(artifactsDir, "experience-contract.json"),
      JSON.stringify(report, null, 2) + "\n",
      "utf8",
    );
    console.log(
      `experience-contract ${report.version}: ${report.routes.total} routes, ${Object.keys(report.rules).length} rules`,
    );
  }
}
