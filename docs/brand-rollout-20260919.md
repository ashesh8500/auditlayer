# ALM typography rollout — 2026-09-19

## Outcome

Implemented the approved **ALM.** direction in this worktree, without committing or deploying. Dark near-black typography and a green period replace the old tall teal raster logo. Product copy remains **AuditLayerMedia**. Existing mobile/report fixes and the concurrent latency lane were preserved.

Reference inspected: `/home/asheshkaji/projects/alm-ios-20260919/docs/ios/preview.html`:

```css
.wordmark { font-size:24px; font-weight:800; letter-spacing:-1.2px }
/* inherited ink #14241f; period #0f766e */
```

The web/report wordmark is portable **outlined SVG**, using licensed Liberation Sans Bold rather than adding an external font. It follows the reference's system-sans direction; it is not claimed to be pixel-identical to Apple's system face. On dark surfaces the inverse uses off-white letters and a brighter green period, rather than illegible black-on-dark typography.

## Implementation inventory / ownership

| Files | Change |
|---|---|
| `web/src/components/brand.tsx` | Canonical ALM. asset; inverse variant; full accessible link name; decorative image; 44px link target. Default no redundant full-name lockup; `showName` remains available. Existing props/callers remain compatible. |
| `web/public/brand/alm-wordmark.svg`, `alm-wordmark-inverse.svg`, `alm-icon.svg` | Self-contained paths; no font, linked image, CSS or network dependency. |
| `web/public/brand/alm-favicon.svg`, `alm-favicon-16.png` | Pixel-hinted 16px ALM. variant with a visible green period. Larger sizes retain the outlined typography. |
| `web/public/brand/alm-mark.png` | Old public path regenerated as the new square icon for compatibility; no current TSX references it. |
| `web/src/app/{favicon.ico,icon.png,apple-icon.png,opengraph-image.png}` | Rebuilt ICO 16/32/48/64, app icon 512, Apple icon 180, social card 1200×630. |
| `web/src/app/opengraph-image.alt.txt` | Full-name descriptive social-image alternative text. |
| `web/src/app/layout.tsx` | **Metadata only**: sized SVG favicon entries. Next file-based icon/Apple/OG conventions continue to own their metadata. No font, region, or layout changes. |
| `web/src/app/oauth/consent/page.tsx` | Brand on consent and invalid-request views; no auth/action changes. |
| `web/src/app/s/[token]/{page.tsx,share-report-view.tsx}` | Brand on share-error and email-verification views; no access/verification changes. |
| `web/src/lib/auth/magic-link-email.ts` | **Header markup only**: live-text ALM. for mail-client compatibility. No sending, token, URL, or auth logic changes. |
| `supabase/templates/magic_link.html` | Same live-text wordmark; expanded product name in email copy/title; token placeholders unchanged. |
| `worker/auditlayer_worker/templates/master-skeleton.html` | Light ribbon + canonical embedded SVG; same SVG in footer; full product name in title/label. Existing table/mobile/footer behavior left intact. |
| `worker/auditlayer_worker/core.py` | **One branding-only replacement line**: `"AuditLayerMedia Standard Report", f"AuditLayerMedia {report_type} Report"`. Necessary to preserve per-tier labels after renaming the shell title. No other lane changes overwritten. |
| `web/src/components/brand.test.ts` | Source coverage guards, asset portability, email/report branding, standalone gate coverage. |
| `worker/tests/test_brand_surface.py` | All five report tiers: correct title, two embedded marks, SVG path equality, no external image/font links or internal telemetry. |
| `scripts/generate-brand-assets.py`, `web/scripts/verify-brand.mjs` | Reproducible outlined assets + standalone real-component rendering/raster generation. |
| `web/public/brand/README.md` | Source/font provenance, variants and regeneration instructions. |
| `docs/brand-rollout-20260919/` | Screenshots and machine-readable source/geometry/contrast evidence. |

No edits to app layout, dashboard, connections, app-header, immersive-report, resource modules, package or lockfiles by this lane. Those files may already be dirty from other owners.

## Active-surface sweep

`source-sweep.json` records the exact Brand JSX callsites. No stale `alm-mark.png` or `alm-logo*` references remain in active TSX.

- Landing and public marketing/support/privacy/deletion/sample pages: inherited through `public-shell.tsx` header/footer.
- Authenticated navigation, including accounts, subjects, reports, settings and AI connections: inherited through `app-header.tsx` without touching parent-owned markup.
- Desktop inverse and mobile light login: existing `Brand` consumers.
- Trial invite: existing inverse `Brand` consumer.
- Immersive and shared reader chrome: existing inverse `Brand` consumer.
- OAuth consent/error, share verification/error: explicit new Brand callsites.
- Resend and Supabase HTML authentication emails: no old AL badge remains. Other email delivery surfaces are plain text, not logo-bearing HTML.
- Browser/home-screen/share-preview assets: regenerated, including the legacy public PNG URL.
- Future deterministic report HTML/PDF: local master shell, checked for every report tier.

Historical root assets, stored reports, legacy app, live-example reports, and old docs were deliberately not rewritten.

### Prompt/profile handoff — not silently changed

`PROMPT_VERSION` remains **1.9**. No prompt text was edited. The existing legacy `WORKER_SYSTEM_PROMPT` in `core.py` still mentions a black footer badge, and bundled profile skill references still mention Humane/teal ribbons. The current deterministic renderer owns report markup and the tested output uses the new canonical shell, so those old instructions do not determine the rendered brand. Parent should decide separately whether to update legacy prompt/profile guidance with a semantic version change; do not silently fold that into this branding patch.

No additional parent-owned header/layout markup change is required: their existing `<Brand ... />` calls inherit the new assets. The only cross-lane code edit was the explicitly listed report-title replacement line.

## Verification

Tests were added before implementation and observed failing for missing assets, stale badge/email sources, missing standalone callsites, and old report title labels.

- Web focused suite: **15 passed** (`brand.test.ts`, `brand-positioning.test.ts`, existing `report-mobile.browser.test.ts`). The latter exercises actual iframe/shadow readers at 320/390/768/1440 and verifies table scrolling is still local.
- Worker focused suite: **26 passed** (`test_brand_surface.py`, `test_report_customer_surface.py`, `test_prompt_version.py`, `test_release_safety.py`). Final rerun after the report-title fix also passed.
- `pnpm exec tsc --noEmit --incremental false`: passed, including final rerun.
- Focused ESLint: **0 errors**; 5 pre-existing unused-symbol warnings in the share page/view. No unrelated cleanup done.
- `git diff --check`: passed.
- `node scripts/verify-brand.mjs`: actual Brand component bundled with esbuild and actual Tailwind CSS; offline Playwright routes only, no server. Passed at 320/390/768/1440, no page errors. Document widths matched viewports; marks 55×30, links ≥44px tall. Emails and report shell contained at 390 and 1440.
- ICO inspection: exactly 16/32/48/64 entries; 16px dot verified at its green pixel; larger entries compared equal to corresponding outlined-logo raster resizes.
- Measured contrast: ink/light **15.87:1**, period/light **5.38:1**, inverse/dark **15.87:1**, inverse period/dark **9.84:1**.
- Vision inspection: light/dark/mobile wordmarks, OG card, email, and report shell showed no clipping or distortion. Initial unhinted 16px icon lost detail; replaced by a pixel-hinted variant. 16px remains necessarily a simplified micro-mark, not the full-size outlines squeezed smaller.

### Images

- [390px real component](brand-rollout-20260919/brand-390.png)
- [1440px real component](brand-rollout-20260919/brand-1440.png)
- [16/32/48/64 icon contact sheet](brand-rollout-20260919/icons-contact-sheet.png)
- [Resend email, mobile](brand-rollout-20260919/resend-email-390.png)
- [Supabase email, mobile](brand-rollout-20260919/supabase-email-390.png)
- [Report shell, mobile](brand-rollout-20260919/report-shell-390.png)
- [Open Graph card](../web/src/app/opengraph-image.png)

Additional widths and desktop email/report images are in the evidence directory. Report-shell images intentionally show placeholders, not fabricated customer results.

## Honest limits / integration gate

- No full shared build, persistent dev server, authenticated live navigation, external email delivery, provider call, deployment, commit, or Storage rewrite was performed.
- Full app-route visuals still belong to the parent's integrated preview gate. Standalone component QA is not proof of authenticated route layout or live OAuth.
- Emails were rendered in Chromium, not Outlook/Gmail/iOS Mail. Their intentional live-text fallback avoids SVG/image blocking, but mail-client forced-dark styling still needs client QA.
- Browser favicon selection/caching varies; new files and metadata were verified locally, not through deployed browser tabs.
- Root app fonts were not changed. The brand itself has no external-font dependency; surrounding page typography still uses the existing app font setup.
- The worker test uses bounded offline fixture sections, not live generated analysis. Existing footer/table fixes and prompt-version tests stayed green.
