# ALM iOS design approval preview

Open `preview.html` directly in a browser. It is self-contained HTML/CSS/JavaScript, **not a native app**. No network requests, backend calls, credentials or external assets are used.

## One direction

A focused Today, understandable Brands, and a readable Reports library. The warm ivory, forest, mint and dark action teal come from the repository's DESIGN.md and globals.css. System sans typography and large touch controls translate the brand toward iOS rather than copying the website. A single opaque forest priority card gives Today a clear center of gravity. Report content stays opaque, legible and unornamented. Navigation alone has a restrained translucent browser approximation; a future SwiftUI implementation should use Apple's system Liquid Glass navigation/controls, not custom glass content cards.

Mobile is edge-to-edge with no invented status bar or device frame. Desktop adds a restrained frame and design notes. Every screen and sheet identifies fictional sample content. Fern & Form is not a real connected account; all report text and evidence are illustrative. There are no invented performance metrics or simulated scan completions.

## Implemented interactions

- Today / Brands / Reports navigation, brand detail and contextual back navigation.
- Report reading, outline jumping and sample evidence sheet.
- Recommendation save/unsave and saved empty state; state persists locally when browser storage is available.
- New review sheet with handle and question validation, error clearing during editing, and request-summary preview. Nothing is submitted.
- Account/settings sheet and locally persisted reduce-transparency setting.
- Connection explanation instead of a fake OAuth flow.
- Native HTML modal dismissal, Escape, explicit keyboard focus wrapping and focus indicators.
- Reduced motion, reduced transparency, safe-area offsets, 44px minimum controls, rem-based principal text, wrapping and scrollable content/sheets.

## Verification

Run from the repository root:

```sh
node docs/ios/verify.cjs
```

The script uses the existing Playwright install at `/home/asheshkaji/projects/alm-report-mobile-20260919/web/node_modules/@playwright/test`; the HTML itself has no dependency on that path.

Chromium verification passed at **320, 390, 430 and 1280px** viewport widths, all with zero page/console errors. Tests cover the principal path, back navigation, saved persistence/empty state, outline scrolling, sheets and Escape, form invalid/valid paths, stale error clearing, modal Tab wrapping, connection boundary, transparency toggle, initial control minimum sizes, document/main horizontal overflow and larger root text. Report content can scroll to its end with the main viewport physically above the navigation bar.

The first visual review identified stale validation copy and distracting content behind navigation. Both were fixed; the final contact-sheet vision review reported no remaining visible blockers. Native iOS Safari, VoiceOver, actual Dynamic Type and the software keyboard are **not** verified by Chromium. Native sheet gestures and real provider/backend connections are not implemented. These remain implementation/device-validation work after design approval.

## Artifacts

- `preview.html` — portable interactive source.
- `verify.cjs` — reproducible browser checks and screenshot capture.
- `exports/verification.json` — last successful viewport results.
- `exports/mobile.png` — 390px Today capture, 2× raster.
- `exports/contact-sheet.png` — Today, report reading and New review; actual HTML screenshots, not native screenshots.
- `exports/today.png`, `exports/reading.png`, `exports/new-review.png` — individual captures.
- `exports/desktop.png` — annotated desktop view.

No app code, web implementation, backend, deployment or commit is included in this proposal.
