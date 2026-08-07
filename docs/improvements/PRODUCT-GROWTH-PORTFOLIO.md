# Product, Commercial, and Growth Maturity Portfolio

This portfolio makes AuditLayerMedia's sellable product maturity observable. It is not a feature wishlist and does not turn intended capabilities into public claims.

## Purpose

For the next bounded improvement waves, prioritize customer and founder outcomes over internal engineering elegance:

1. a buyer can understand who the product is for and what each offer enables;
2. an organization owner can create a real workspace, invite people, assign least privilege, and understand seat use;
3. a member can collaborate without gaining billing, admin, or cross-tenant authority;
4. founders can issue offers, demonstrate real workflows, see funnel progression, and learn why prospects convert or stop;
5. every claim remains tied to implemented, preview-verified, or production-observed evidence.

## Maturity vocabulary

`unknown → discovered → contracted → implemented → preview_verified → production_verified → observed`

- **unknown:** no authoritative evidence yet.
- **discovered:** current behavior and owners are mapped.
- **contracted:** versioned user, permission, event, and failure contracts exist.
- **implemented:** deterministic local checks pass.
- **preview_verified:** real preview behavior is verified on desktop and mobile.
- **production_verified:** bounded production checks pass with rollback evidence.
- **observed:** real usage or commercial outcomes exist with coverage and confounding limits.

No stage may be skipped. "Implemented" is not "customers value it."

## Current capability map

| Area | Current maturity | Existing evidence | Missing before a sellable claim |
|---|---|---|---|
| Individual authentication | implemented | Supabase login, callback, Google OAuth, magic-link paths, server-side session checks | Live callback/delivery verification and measured recovery outcomes |
| Founder administration | implemented | Admin role, access assignment, trial links, gifted audits, action records, run-health and recovery contracts | One coherent founder commercial workspace and production workflow verification |
| Individual offers and entitlements | implemented | Profile plan/account type, gifted-audit allowance, deterministic offer contract, Stripe checkout/webhook reconciliation | Production offer parity, buyer-visible allowance clarity, renewal/cancellation observations |
| Trial acquisition | implemented | Bounded trial links, expiry/redemption limits, trial signup path | Campaign/source attribution, invite-to-activation funnel, founder follow-up state |
| Organization tenancy | discovered | Subjects may represent organizations, but this is intelligence-domain identity—not an access-control tenant | Authoritative organization/workspace owner, lifecycle, isolation, transfer, deletion, and audit contract |
| Members, roles, and invitations | unknown | No authoritative organization membership or team-invitation contract | Owner/admin/member/viewer permissions, invitation lifecycle, revocation, transfer, and negative access tests |
| Seats | unknown | Enterprise access is founder-assigned per individual; trial maximum uses are not seats | Seat definition, assignment lifecycle, allowance source, overage behavior, billing/manual precedence, and founder view |
| Team collaboration | unknown | Recommendation decisions exist for an owner-scoped subject workspace | Shared subject/report/decision permissions, attribution, concurrency, and cross-tenant denial |
| Founder sales narratives | discovered | Landing/pricing/enterprise/trial/report surfaces and user stories exist | Persona-specific demo paths whose claims are generated from implemented capability evidence |
| Funnel and product learning | discovered | Audit events, admin actions, Stripe receipts, recommendation decisions, and outcome ledgers exist | One canonical event vocabulary joining acquisition → activation → value → conversion → retention without customer-content leakage |

## Product-first delivery portfolio

| Order | Outcome | Primary user story | Observable acceptance | Boundary |
|---|---|---|---|---|
| 1 | Establish a canonical identity, tenancy, and entitlement map | As a founder, I can explain exactly what a user, organization, workspace, subject, member, role, seat, plan, and entitlement mean | One versioned map finds every current owner and collision across Auth, profiles, subjects, accounts, trials, Stripe, and admin; unresolved ownership stays `unknown` | No schema or UI until ambiguous owners are resolved |
| 2 | Create organization workspaces with explicit ownership | As a buyer, I can create an organization and know its data and billing boundary | Owner creates, renames, transfers, and archives one organization; individual mode remains compatible; other tenants are denied | A subject of type `organization` is not an IAM tenant |
| 3 | Add invitation and least-privilege membership lifecycle | As an organization owner, I can invite, resend, revoke, and remove members with bounded roles | Pending/accepted/expired/revoked invitations and owner/admin/member/viewer matrices pass; every mutation is attributed and auditable | No client-authoritative role or service-role leakage |
| 4 | Make seats real and understandable | As a buyer, I can see seats purchased, assigned, invited, available, and over limit | Seat counts derive once from active membership and the authoritative commercial allowance; duplicate invite/accept/revoke is idempotent; manual enterprise precedence is explicit | Do not equate gifted audits, invite max uses, accounts, or subjects with seats |
| 5 | Give founders a commercial operations workspace | As Narin or Ashesh, I can issue an offer, assign access, inspect an organization, and see the next sales/onboarding action without SQL | Founder view joins offer, contact/account identity, membership, seat, entitlement, trial, activation, billing, and bounded notes; every mutation creates an admin/commercial event | Not a generic CRM; no invented pipeline stage or outcome |
| 6 | Build evidence-backed founder sales stories | As a founder seller, I can demonstrate the right real workflow for a creator, small team, agency/brand, or enterprise prospect | Each story names buyer, job, trigger, live route, implemented capability, proof artifact, limitation, CTA, and production verification state; unsupported claims fail closed | No fake customer logos, outcomes, scans, seats, or enterprise promises |
| 7 | Instrument the acquisition-to-value funnel | As founders, we can see where a prospect or account stops and what evidence exists for the next product decision | Canonical events cover source/offer viewed, trial issued/redeemed, signup, organization created, invitation accepted, first subject, first audit submitted/ready/viewed/shared, recommendation decided, checkout started/completed, renewal/cancel; coverage and unknown rates are visible | Never store report/customer content in analytics events; correlation is not causation |
| 8 | Turn funnel evidence into bounded product experiments | As founders, we can choose the next product or messaging change from observed friction rather than intuition alone | Every experiment has segment, hypothesis, exposure, success/guardrail measures, stop rule, coverage, result, confounders, and decision; low sample size remains inconclusive | No automated pricing or entitlement mutation from weak evidence |

## User stories

### Buyer and organization owner

- **O1 — Establish my boundary:** As a buyer, I can create an individual or organization workspace and understand what it owns.
- **O2 — Invite safely:** As an organization owner, I can invite, resend, revoke, remove, and transfer ownership without sharing credentials.
- **O3 — Assign least privilege:** As an owner, I can grant only the access each teammate needs and preview what that role can do.
- **O4 — Understand seats:** As a buyer, I can see the difference between purchased, assigned, invited, available, and over-limit seats.
- **O5 — Preserve continuity:** As an owner, membership changes do not orphan subjects, reports, decisions, billing, or audit history.

### Member and collaborator

- **M1 — Enter the right workspace:** As a member, accepting an invitation lands me in the intended organization without exposing another tenant.
- **M2 — Collaborate with attribution:** As a member, my recommendation decisions, notes, and approvals are attributed to me.
- **M3 — Know my limits:** As a member, unavailable actions explain the required role rather than failing ambiguously.
- **M4 — Leave safely:** As a member, leaving or being removed revokes access without deleting organization intelligence.

### Founder seller and operator

- **F11 — Sell a real story:** As a founder, I can choose a prospect type and show a verified workflow with explicit limitations.
- **F12 — Operate the offer:** As a founder, I can issue a trial or custom access package and see its redemption, entitlement, seat, and expiry state.
- **F13 — See funnel truth:** As a founder, I can inspect acquisition, activation, value, conversion, and retention events with coverage and unknowns.
- **F14 — Follow up coherently:** As a founder, I can see the last verified product/commercial event and record the next human action without inventing customer intent.
- **F15 — Learn from objections:** As a founder, I can classify a loss, delay, or support issue using bounded reason codes plus optional notes and preserve uncertainty.

## Canonical funnel contract

| Stage | Minimum events | Core measure | Honest-null condition |
|---|---|---|---|
| Acquisition | `offer_viewed`, `trial_issued`, `sales_story_opened` | Known source/offer coverage | Unknown source remains unknown, not "direct" |
| Activation | `signup_completed`, `organization_created`, `invitation_accepted`, `first_subject_created` | Time and conversion to first configured workspace | Missing historical events prevent cohort claims |
| Value | `audit_submitted`, `audit_ready`, `report_viewed`, `report_shared`, `recommendation_decided` | Time to first value and repeat value events | A ready report does not prove it was read or useful |
| Commercial | `checkout_started`, `checkout_completed`, `trial_expired`, `subscription_changed`, `seat_limit_reached` | Offer conversion and friction by verified segment | Provider state remains authoritative; failed events never become success |
| Retention/expansion | `return_session`, `repeat_audit`, `member_added`, `seat_allowance_changed`, `subscription_renewed`, `subscription_cancelled` | Returning active organizations and expansion signals | Activity is not satisfaction; sparse cohorts remain inconclusive |

Every event requires: `event_id`, `event_version`, `occurred_at`, `actor_kind`, pseudonymous actor/account/organization references where authorized, `source_surface`, `offer_version` when applicable, `result`, `failure_or_unknown_reason`, and `correlation_id`. Customer content, report prose, credentials, tokens, and unrestricted URLs are prohibited.

## Autonomous allocation policy

For the next six waves:

- reserve **at least two of three implementation slots** for product/commercial outcomes from this portfolio;
- permit at most one engineering/reliability card, and only when it is a direct dependency or safety gate for a selected product outcome;
- create zero cards rather than filling capacity with unrelated engineering cleanup;
- every product card must name the customer/founder behavior, actual route or workflow, permission/entitlement owner, observable event, demo path, and truthful public-claim boundary;
- the serialized merge gate remains independent and must preserve schema, security, billing, and production safety.

Reassess the allocation after six waves using completed product outcomes and observed evidence—not card counts.
