# AuditLayerMedia native iOS implementation plan

> For Hermes: implement in bounded, isolated lanes after the design preview is approved. Use subagent-driven-development for implementation; require actual Xcode builds and Simulator tests, not syntax-only claims.

**Goal:** A beautiful, simple native iPhone experience for keeping a brand's social presence connected, understanding its latest report, and taking the next useful action.

**Architecture:** SwiftUI app in this monorepo, sharing the existing Supabase identity/data and AuditLayer worker. Native navigation and interaction; canonical immutable report HTML remains the faithful full-report artifact, rendered only inside a constrained reader, not as a website wrapper. A narrow authenticated mobile API must reuse existing business rules rather than duplicate billing/queue logic on the device.

**Tech stack:** SwiftUI, Swift Concurrency, Swift Package Manager, official supabase-swift, Keychain, AuthenticationServices, WebKit for the report document only. Use Apple system Liquid Glass controls with the current stable SDK. Provisional minimum iOS 18 with availability-guarded iOS 26 Liquid Glass; confirm actual Xcode/SDK/device availability before fixing the deployment target.

## Exact user intent

"given the heavy social media nature of the app, a phone native app is a must ... really really good native ios app ... beautifully designed with liquid glass, simple, straightforward, and amazing"

This is an additional workstream. Existing report metadata, broken upgrade links, and mobile overflow fixes continue on the separate `fix/report-mobile-20260919` branch. Do not mix those unreviewed web/worker edits into the iOS branch. This branch starts at production commit `38ab957b7669a0525af390882bad3c305f971660`.

## Experience proposal — pending visual approval

Three stable destinations, no admin console in the customer app:

1. **Today:** latest meaningful report/change and one suggested next step. No invented engagement movements, notifications, or live processing animation.
2. **Brands:** the user's Subjects and their connected channels. A personal creator fits this model; existing workspace/subject IDs remain canonical regardless of friendly UI wording.
3. **Reports:** searchable report history with a comfortable focused reader, source notes, and native sharing when access permits.

New review is a sheet, not another permanent tab. Account settings/connection health are reachable from the account button. Do not invent scheduling, auto-posting, a social inbox, DMs, or publishing permissions that the product does not support.

### Visual and interaction direction

- Warm ivory content, deep forest text, restrained accessible teal; native system typography and SF Symbols.
- Liquid Glass on the tab bar, toolbar and selected floating controls. Opaque, readable report/content surfaces beneath. Do not turn every card into frosted glass.
- Native back gestures, sheets, search, refresh, sharing and meaningful haptics; no decorative onboarding carousel or busy dashboard.
- Minimum 44-point targets; Dynamic Type, VoiceOver labels/order, Reduce Motion, Reduce Transparency, dark appearance and large accessibility text verified.
- Report body never horizontally scrolls. Only semantically wide tables do, with a discoverable accessible table container.
- Internal model/prompt/cost/token fields stay out of customer views. Source provenance and actual observation dates remain visible.
- Design preview is explicitly a browser-based approximation with labeled sample content, not an iOS Simulator capture or a working backend-connected app.

## Discovery already verified

- `web/src/lib/auth.ts` authenticates using Next request cookies and the server Supabase client. Native bearer auth is not interchangeable with these cookie-dependent routes.
- `web/src/lib/intelligence/subjects.ts` performs explicit root owner filtering even for admin users; preserve that invariant in mobile read APIs.
- Report reads use `getAuditForViewer` then server-side private Storage download. Never put the service-role key in the iPhone app or expose unrestricted report objects.
- `web/src/lib/intelligence/api.ts` declares `submit_audit_batch` service-role-only. The iOS client must not bypass the canonical intake/entitlement path by inserting audit rows directly.
- Existing MCP bearer auth is a separate scoped connector contract, not a general-purpose customer mobile API. Reuse authentication primitives where appropriate, not its grants indiscriminately.
- No Swift source was found in the current repository.
- `ssh mac` timed out; Tailscale reports the Mac offline. This Linux environment has no available `swift` executable. iOS compilation, Simulator execution, signing and TestFlight are not verified or available yet.

## Staged delivery and acceptance

### 0 — Approve a tangible design, unblock the native build

Files: `docs/ios/preview.html`, `docs/ios/exports/`, this plan.

- Build one polished tappable direction covering Today → brand → report → source sheet and New review.
- Exercise tabs, back, sheet dismissal, keyboard focus and 320/390/430px overflow in Playwright; visually inspect screenshots.
- Ask for approval of the visual direction, not an abstract feature checklist.
- When Mac is online, inspect `sw_vers`, `xcode-select -p`, `xcodebuild -version`, `xcrun simctl list devices available`, available SDKs and signing team configuration. Do not change active Xcode, install large software or choose an Apple team without checking existing setup.

### 1 — One native vertical slice

Proposed files: `ios/AuditLayerMedia.xcodeproj`, `ios/AuditLayerMedia/App/`, `ios/AuditLayerMedia/Design/`, `ios/AuditLayerMedia/Features/Reports/`, `ios/AuditLayerMediaTests/`, `ios/AuditLayerMediaUITests/`.

- Use a standard Xcode project and SPM; avoid a custom generation/build framework for a small app.
- First failing UI test: open clearly labeled bundled sample report, navigate sections, open source notes, return; no whole-document overflow at smallest supported phone.
- Implement native TabView/NavigationStack and report reader from the approved design. Standard system components get Liquid Glass automatically on compatible SDK/OS; use custom `glassEffect` only where justified.
- Build and launch with `xcodebuild`/`simctl`; retain real screenshots and test results. Sample mode stays explicitly separate from signed-in live mode.

### 2 — Real account and real report

Proposed files: `ios/AuditLayerMedia/Auth/`, `ios/AuditLayerMedia/Networking/`, `web/src/app/api/mobile/v1/`, `web/src/lib/mobile/` and colocated regression tests.

- Pin official supabase-swift version after verifying the released interface.
- Support approved native email/Apple/Google methods with PKCE/system browser where needed, Keychain persistence and state-checked deep links; do not transplant web cookies or use embedded OAuth WebViews.
- Start with authenticated, paginated, read-only brand/report endpoints. Validate bearer token server-side, derive identity from it, root-owner-filter, then return bounded DTOs. Never trust a caller's owner ID.
- Tests must first fail for foreign-owned Subjects/reports, revoked/absent token, pagination gaps and expired report access. Then implement through shared server modules without changing existing cookie routes.
- Download report through authorized endpoint and preserve safety isolation; block arbitrary scripts/navigation, keep safe external links in the system browser. Clear per-user caches and pending state on sign-out/account change.
- Native UITest acceptance: dedicated QA account authenticates, sees its own brand and real saved report, reads sources, signs out; another identity cannot read cached/private first-account content.

### 3 — Creation, connections and return paths

- Add authenticated mobile adapters around canonical intake/admission rather than duplicate rules or direct client service-role RPC calls.
- Preserve idempotent submission, explicit report status and truthful recovery. Do not enable new mobile paid intake while known monthly quota/idempotency deficiencies remain unresolved.
- Instagram uses backend-bound OAuth state and canonical account identity; system browser returns through verified links. No Instagram credential/token exposed to the app.
- Test interrupted OAuth, cancel, wrong identity, expired state, reconnect, sign-out during request, foreground/background return and retry after lost response.
- Notifications/share extension are later additions only if the first live slice warrants them; neither is required to prove a high-quality native core.

### 4 — Distribution gate, separate from visual approval

- Verify Apple Developer membership, bundle ID, signing team and TestFlight access before promising an installable build. Never purchase membership or publish without approval.
- Review current App Store Guidelines 3.1.1/3.1.3, 4.8 and account deletion requirements. ALM is not automatically a qualifying "reader app" or advertising-management exemption merely because it displays reports about social media.
- Provisional lean launch: companion experience using existing entitlements, with no in-app purchase or external-purchase CTA until storefront/business-model rules are deliberately resolved. If sales are needed in-app, design StoreKit 2 and server reconciliation explicitly; do not simply embed Stripe checkout worldwide.
- Existing report HTML contains web upgrade links: the native reader must apply the decided storefront purchase policy too, not accidentally inherit those CTAs.
- Decide compliant equivalent login (including Sign in with Apple where applicable), in-app account deletion, privacy disclosures, SDK privacy manifests and permission purposes before App Store submission.
- TestFlight is a separate acceptance criterion: successful Xcode archive, upload and read-back of a processed build. A browser prototype, Swift source tree or unsigned Simulator build is not TestFlight delivery.

## Authoritative references consulted

- https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- https://developer.apple.com/design/human-interface-guidelines/materials
- https://developer.apple.com/app-store/review/guidelines/
- https://supabase.com/docs/guides/getting-started/quickstarts/ios-swiftui

No production state, billing policy, provider or product pricing is changed by this plan.
