---
name: narin-brand-audits
description: Create brand audit reports, pulse reports, opportunity analyses, and social media strategy for Narin Fazlalipour's AuditLayer. Covers all five deliverable formats, the compact pulse template, the pre-pitch opportunity analysis, AuditLayer IG content strategy, and founder outreach research.
---

Narin Fazlalipour (narinfazlalipour.com) runs AuditLayer, a social media brand auditing service. She produces forensic brand analyses — scored, data-backed audits for CPG, DTC, and founder-led brands. This skill covers the creative output side: report formats, templates, content strategy, and outreach research.

Reference: `references/narin-15-section-framework.md` — the definitive 15-section audit framework Narin specified May 2026. This is the product spec for all future AuditLayer reports.

Reference: `references/auditlayer-standard-report-compliance.md` — strict compliance checklist for older canonical/Hemal-style AuditLayer 15-section HTML reports: exact `<h2>` headings, byte-for-byte Hemal CSS, no fabricated live Instagram metrics, data-limited/OAuth handling, same-tier peer fallback rules, milestone deferral, following-ratio rationale, Footer/Powered-by placement, and final validation checklist. Use this framework by default unless Narin explicitly asks for a format variation.

Reference: `references/shaima-style-standard-report.md` — variant to use when Narin asks for the newer @shaimastrategist-style report structure ("Shaima format," "restructure like Shaima," "like the one we created for @shaimastrategist"). This variant allows/requires score diagrams, Section 15 "Get the Execution Plan," Creative Board + calendar-grid in Section 9, and footer/powered-by after Section 15; it overrides the older Hemal compliance constraints for those requests.

Reference: `references/circular-scoring-component.md` — SVG donut ring score diagram (replaces horizontal bars). Narin's preferred scoring visualization (June 2026). Use this when she says "make the scoring circular" or "use circles." Includes full CSS, HTML template, ring math, color thresholds, and dimension labels by account type.

Reference: `references/street-interview-contract.md` — full service contract template for in-person content work (street interviews, event coverage). Formal contract with cancellation terms, payment structure, and legal clauses. Use for new or arms-length clients.

Reference: `references/street-interview-rate-sheet.md` — lightweight rate-sheet variant for familiar clients (former employers, warm relationships). Strips the legal language — keeps only: the rate ($1,500/half-day), what's included/excluded, add-ons, the interview approach, and a sample question arc. No cancellation terms, no signatures, no legalese. Use when Narin says "this is with a former company" or "I just need to share my rate — don't treat this like a contract" (June 2026: Verséa/mescreen rate sheet).

## Naming Conventions

- **Dr Joe Dispenza**: no period after "Dr" — he uses "Dr Joe" without the dot.
- **Dr. Hemal Patel**: with period and space — he uses "Dr. Hemal Patel."
- **Do not mix these up.** Getting the dot wrong on either name looks sloppy to a client.

## Audit Formats

**Default for all new audits: the 15-section framework** specified May 2026. See `references/narin-15-section-framework.md` for the complete spec and the live canonical reference at `/tmp/narin-pages/projects/hemalpatelphd-scorecard.html`.

**Default scoring visualization: horizontal bars** (same as the Hemal report). Narin explicitly prefers the clean horizontal bar format and reverted a circular SVG implementation (June 2026). Only use circular/ring scoring if she explicitly asks for it. The `.score-diagram` CSS with `.sd-row`/`.sd-track`/`.sd-fill` horizontal bars is the canonical pattern.

The four original format variants below are retained for reference but are superseded. Use the 15-section framework unless Narin explicitly asks for one of these:

| Format | Best For | Accent | Vibe |
|---|---|---|---|
| **Brand Pulse Report** | Quick reads, cold outreach | Teal (#0d9488) | Compact, scannable, 90-second read |
| **Competitive Battlefield** | Scientific/clinical brands | Navy + copper/gold | Data-viz heavy, clinical precision |
| **Founder Story Arc** | Personal brand founders | Cream + deep burgundy | Narrative-forward, editorial/magazine |
| **Research Translation Scorecard** | Academics/researchers | Teal (shared with Pulse) | Research → content translation |
| **Brand Opportunity Analysis** | Pre-pitch, warm introduction | Teal on dark (#0D9488 / #0F172A) | Strategic but warm — shows gaps, maps fit, no pricing |

Reference: `templates/opportunity-analysis.html` — the canonical starter template (Bahamii project, June 2026).

## Brand Opportunity Analysis — Pre-Pitch Format

Use this when Narin wants a soft, warm document to send a potential client — something that shows she's done the work, identifies gaps in their Instagram, and maps where she fits as a media manager. **No pricing. No legal terms. No hard sell.** This is "I put this together to better show you what we can work on."

The Opportunity Analysis is NOT a full audit (no score, no peer comparison, no 90-day map, no hashtag strategy). It's also NOT a contract proposal (no tiers, no terms, no investment section). It's a strategic pre-pitch — forensic enough to prove she's serious, warm enough to feel like a gift.

**Structure (9 sections):**

1. **Hero** — "Brand Opportunity Analysis" eyebrow, brand name + sub, stats strip (followers, posts, key retail/distribution metrics)
2. **Intro Note** — italic, warm, left-accent-border. "I put this together to better show you what we could work on." Acknowledge what's great about the brand before showing gaps.
3. **What's Working** — 3 strength cards (green left-border). Fair, genuine — don't manufacture praise. Find the real wins (retail presence, product quality, brand story potential, press mentions).
4. **What's Missing** — 4-5 gap cards (red left-border, numbered GAP 01–05). Each card has: bold header, explanation paragraph, and a "What's there now" sub-line in muted italic. Be specific — reference actual posts/content patterns observed.
5. **Diagnosis** — amber left-border callout. One paragraph: what does this pattern mean? Frame it constructively — not "they're failing," but "the feed hasn't caught up to the brand."
6. **Feed Identity Comparison** — two-column "Current Feed" vs. "Where It Could Go" with tagged items (`.tag-missing` / `.tag-have`). Shows the visual gap without being harsh.
7. **Content Pillar Map** — row list with status tags (STRONG in green, WEAK in amber, MISSING in red). Shows what content pillars exist vs. don't.
8. **Where I Fit** — 2×2 grid of service pillars (Strategy, Creation, Community, Reporting). Bullet points of specific deliverables. This is where Narin's role is mapped to the gaps — the "here's what I'd actually do" section.
9. **The Open Lane + Soft CTA** — teal gradient callout summarizing the opportunity, then a centered CTA: "Let's Talk" with a DM link. No pricing, no commitment ask.

**Design rules:**
- Dark background (#0F172A) with teal accent (#0D9488) — Narin's research-grade aesthetic
- Playfair Display for headers, Inter for body, JetBrains Mono for stats/labels
- Cards with 3px left-border accents (green/red/amber) and subtle surface backgrounds
- No gradients, no glow effects — keep it clean and forensic
- Skip AuditLayer footer badge on client-facing docs — Narin prefers these unbranded. Only add the footer if she explicitly asks for it (June 2026: she had it removed from the Bahamii analysis)
- File at: `/tmp/narin-pages/projects/<brand>-opportunity.html`

**PITFALL**: Do NOT add pricing, investment tiers, key terms, weekly calendars, or performance targets. Those turn it into a contract. The Opportunity Analysis ends at "DM me" — it's a door opener, not a closer.

**PITFALL — Remove CTA if she's already in conversation.** If Narin says "I already spoke to him" or mentions existing contact with the founder, drop the CTA section entirely. The document becomes a supporting artifact — pure analysis, no ask. She'll send it as follow-up, not as a pitch opener (June 2026: Bahamii — removed "Let's Talk" + DM button).

**PITFALL — Skip AuditLayer footer on client sends.** Narin prefers these documents unbranded when they go to a client. If she asks to remove the footer or CTA, do it immediately — she's thinking about how it lands on the other side. The default is no footer; add it only if she asks (June 2026: removed from Bahamii).

**PITFALL**: Do NOT manufacture fake gaps. Every gap card must be backed by actual observation of the brand's Instagram feed. If you can't see the feed (login-gated), use browser_snapshot (which returns profile structure even without auth) + web_search to gather evidence.

**PITFALL — Language tone:** Keep language polite and professional for partner-facing documents. Avoid casual or confrontational phrasing like "nobody is doing this" — prefer "few are doing this." The document may be shown to the brand's team or discussed in a formal meeting. Read the room: if Narin is preparing for a meeting, raise the register accordingly (June 2026: Bahamii analysis, Hemal-Dispenza collab page).

**When to use:** Narin says things like "put together something that shows the gaps," "something for me to send over," "show where I can fit," or "no need to give pricing, just something pretty." If she mentions pricing or terms, pivot to Pattern A (Easy-Yes Proposal) or Pattern B (Full Contract).

**Canonical reference:** `/tmp/narin-pages/projects/bahamii-opportunity.html` — the Bahamii analysis built June 2026. Use its CSS variables, section structure, and card component HTML as the starter for new Opportunity Analyses. Copy the `<style>` block and the section HTML patterns; swap brand-specific content.

Template: `templates/opportunity-analysis.html` — a stripped-down starter with placeholder content, ready to fill in.

## Instagram Research — Login-Gated Profiles

When Instagram blocks unauthenticated access (login wall), don't give up. Two techniques that work:

1. **`browser_snapshot` still works** — even behind the login modal, the accessibility tree exposes: follower/post/following counts, bio text, highlight names, pinned post captions, and the post grid's alt text. You can read their entire feed structure without logging in.
2. **`web_search` for brand + "instagram"** — finds individual post/reel URLs, influencer campaign hashtags (#izzybahamii), and content patterns. Combine with snapshot data for a complete picture.

**PITFALL**: Instagram's login wall does NOT block the accessibility tree. Do NOT tell the user "Instagram is blocking me" and stop — use browser_snapshot to read the profile, then web_search to supplement.

## Brand Pulse Report — Compact Format (AGREED)

Pulse reports should NOT be full audits. They are fast diagnostic reads. Narin explicitly agreed on this structure:

1. **Score Diagram** — 6-dimension visual (Brand Story, Product Quality, Visual Identity, Content Cadence, Community, Retail-to-Social Bridge)
2. **What's Working** — 2 strength cards (green left-border)
3. **What's Missing** — 2 gap cards (red left-border) + diagnosis callout
4. **Three Moves** — numbered action cards, one paragraph each
5. **Weekly Rhythm** — 5-day mini calendar (Mon–Fri, format + content pillar)
6. Footer

**PITFALL**: Do NOT include peer comparison tables, 90-day growth timelines, benchmarks tables, or recheck cadence sections. Those make it a full audit, not a pulse. The pulse reads in 90 seconds on mobile.

Reference: The pulse format is fully documented above. Full 15-section audits use the canonical hemalpatelphd-scorecard.html as their CSS/structure reference (see below).

## "One of One" Accounts

When an account has no direct competitors (the user says "one of one" or "nobody else does this"), do NOT manufacture fake peer accounts. Rename section 6 to "Competitive Landscape" instead of "Competitive Comparison." Benchmark against adjacent accounts in overlapping spaces (brand strategy, social media education, content marketing) at any follower tier. Add an "open lane" callout: "[Account] doesn't have a competitor — it has an open lane. The lane is empty."

## Pre-Launch Content (Stealth Mode)

When the account owner says they're not ready to post branded content yet, add a "Pre-Launch Content" section (15b) between Audit Cadence and What Comes Next. Three unbranded content lanes: Brand Observations (carousel), Hot Takes (screen-record Reel, no face), Pattern Spotting (carousel). See `references/pre-launch-content-section.md` for the full template.

## Face-to-Camera Rule

Do NOT suggest face-to-camera content unless the user explicitly says they're comfortable on camera. Default to screen-record with voiceover. If they say "no face stuff," scrub all Reel ideas of face-to-camera language immediately.

**No-face-for-90-days constraint (June 2026):** Narin's launch-phase content strategy: zero face on camera for the first 90 days. All Reels are screen-record + voiceover only. After Day 90, her face can merge in naturally — keep the forensic tone, just add face to existing Reel formats. Do NOT propose face-to-camera before Day 90. Do NOT plan a "face reveal" as an event — it should be casual, just her appearing in content she was already making.

## Circular Scoring

When the user asks for "circular" or "ring" scoring, use SVG donut rings instead of horizontal bars. **IMPORTANT: Narin reverted circular scoring on the @auditlayer report (June 2026) and explicitly said "I don't like the circles." Default to horizontal bars. Only build circular scoring if she explicitly asks for it — and be ready to swap back to bars if she changes her mind.** See `social-media-audit` → `references/circular-score-rings.md` for the full implementation (CSS, SVG formulas, layout).

**The moat**: Nobody on Instagram is doing forensic brand analysis with scores. People post tips. Narin posts autopsies.

### Content Types (weekly cadence — launch phase, no face)

| Day | Format | Content |
|---|---|---|
| Mon | Carousel | Brand Autopsy or Pattern Spotting — educational deep dive |
| Wed | Reel | Hot Take — screen-record + voiceover, 30–45s, one sharp opinion |
| Fri | Carousel | Audit Lens or Numbers Don't Lie — teach a dimension or share data |
| Daily | Stories | 3–5/week: BTS, polls, teasers, Q&A, community |

**After Day 90** (face now OK): Wednesday Reels can transition to face-to-camera. Keep the forensic tone. Add client result posts as they come in.

**Content pillars for launch-phase educational content:**
- 🔍 **Brand Autopsy** — break down one known brand's feed: what's working, what's missing, why
- 🧠 **The Audit Lens** — teach one audit dimension per post (Brand Story, Visual Identity, Content Cadence, Community, Retail-to-Social Bridge, Content Mix)
- 📐 **Pattern Spotting** — compare 2–3 brands, find the pattern across them
- 💬 **Hot Takes** — screen-record Reels, voiceover only, contrarian or sharp opinions
- 📊 **Numbers Don't Lie** — data-backed carousels with engagement benchmarks and format performance

Reference: `references/90-day-content-calendar.md` — the full 90-day calendar structure (3 phases, 12 weeks, content pillars, story strategy, Day-90 transition). Built June 2026 for AuditLayer Media IG launch. Use this as the structural template when Narin asks for content calendars, scheduling, or launch-phase content planning.

### IG Bio — Final (May 31, 2026)

Narin chose this version. No free-audit offer. "In the making" signals the build phase. "A tool" positions AuditLayer as a product, not just a personal service. Keep it tight — she rejected vaguer versions as "too vague" and wanted concrete wording.

```
Forensic brand audits. In the making.
Most founders don't need another tip.
They need a tool that spots what's missing from their feed.

👇 DM "AUDIT"
```

**PITFALL**: Do NOT add "free pulse check" or any free audit language — Narin explicitly rejected free offers. Do NOT mention CPG/DTC/wellness categories unless she asks for them — she prefers the wider net. Do NOT add founder names (Ashesh/Narin) to the bio — she had them removed. Do NOT make it too vague/abstract — she'll push back. Keep it concrete: what it is, what it does, what to do next.

### Accounts to Study
- **@tahlia.kennedy** — 72.4K, verified. Head of content at @kinso.app. Clean, confident educational content — face-to-camera Reels + carousels. Personal brand energy, never preachy. Narin's primary style reference for AuditLayer (June 2026).
- **@brock11johnson** — Instagram strategist, face-to-camera + carousels
- **@sociallystef** — Framework-heavy educational carousels
- **@hubspot** — Clean, data-driven carousel design
- **@latermedia** — Social media tips, excellent visual consistency
- **@buffer** — Data-backed strategy content

## AuditLayer Brand Identity

Color direction (agreed May 2026): **Teal (#0D9488) on dark backgrounds (#0F172A)**. This carries the report accent into IG while standing out from the warm/beige sea every other DTC brand uses. Dark carousel slides with teal accent text + white body copy read as research-grade, not influencer.

| Role | Color |
|---|---|
| Primary accent | `#0D9488` |
| Dark BG (carousels/reels) | `#0F172A` |
| Surface (light slides) | `#FAFAF9` |
| Text | `#1C1917` |
| Callout BG | `#F0FDFA` |

## Outreach & Client Acquisition

**Outreach list:** `~/projects/auditlayer/outreach-list.md` — 50 brands (30 CPG food/beverage + 20 wellness/beauty), 21 confirmed founder IGs, status tracking column. Categories: Snacks & Bars, Beverages, Pantry & Condiments, Wellness & Lifestyle, Cafes & Food, Skincare, Body & Personal Care, Hair Care, Femcare. Append new brands to the appropriate category table.

### Outreach Workflow (Warm-Up Sequence)

The warm-up sequence that outperforms cold DMs:

1. **Follow** the founder from @auditlayer IG account
2. **Engage** with 1–2 of their recent posts (genuine comments, not pitch-related)
3. **DM** something brief and specific: "*Hey [name] — I run forensic brand audits for CPG brands. Scored a few in [their category] lately. Noticed something interesting about [their brand]'s feed. No pitch. Want me to send it?*"
4. **Drop** a mini pulse report link if they reply positively

The follow + engage before DM is the difference between read and ignored. Founders get 50+ cold pitches a day.

### Finding Founder IGs

Priority order for finding a founder's personal Instagram:

1. **Check the brand's IG bio** — founders often list themselves as "Founder: @handle"
2. **Look at tagged posts** — early posts often tag the founder personally
3. **Search LinkedIn** — brand name + "founder" or "CEO"; LinkedIn profiles often list IG handles
4. **Web search** — "[Founder Name] Instagram" (only works if they have press coverage)
5. **Flag as unknown** — don't guess

For medium-to-large CPG brands with press coverage, web search is reliable. For micro-brands, steps 1-2 are the only reliable path.

### Events for Client Acquisition

Narin's target events for in-person AuditLayer prospecting:

- **Expo West** (Anaheim, March) — the CPG mothership, wall-to-wall food/beverage founders
- **Expo East** (typically Philadelphia, September) — East coast version
- **Social Media Marketing World** (Anaheim, April) — industry credibility, not client acquisition; useful for future speaking slots
- **Startup CPG community events** — smaller, intimate, founder-heavy

For Expo West: walk the floor with 3-4 mini audits ready on your phone. Show a founder their score at their own booth. Warmer than any cold DM.

### Outreach Pitfalls

- **DO NOT pre-fire.** The single biggest mistake is assuming what brands the user wants before they give you the list. Narin often says "I have a list" and then takes a moment to send it — wait for the actual list, do not launch into big CPG brands you already know about.
- **Web search fails for micro-brands.** Brands under ~10K Instagram followers rarely have indexed press, LinkedIn pages, or founder interviews. Web search will return noise or wrong matches. For these, visit their Instagram profile directly (browser tool) and check the bio for founder tags, or look at their earliest tagged posts.
- **Verify handles.** Founders of very small brands often run the brand account as their personal account. When a founder IG can't be found via search, flag it — don't fabricate or guess handles.

### Pulse Report Template

The canonical pulse report starter template is at `templates/pulse-report.html`. Copy it, fill in `BRANDHANDLE`, `BRAND_DESCRIPTION`, score values, strength/gap cards, moves, and calendar rows.

## Street Interview Rate Sheet

When Narin shares her rate with a familiar client (former employer, warm relationship), use a rate sheet — not a contract. This is a one-pager: approach first, then pricing, no legal language.

**Structure (in this exact order):**

1. **Hero** — "Street Interview" eyebrow, "Client × Narin Fazlalipour" title, brief sub
2. **The Approach** — conversational description + 10 sample questions. This comes FIRST — builds value before the price.
3. **What This Unlocks** — 4 bullets on content repurposing: authentic Reels, trust-building carousels, objection-handling clips, product positioning through curiosity. Gold left-border to distinguish from approach.
4. **Rate** — centered big-number rate box. "$1,500 per half-day session · 4 hours active interviewing." Sub-note about what the rate covers.
5. **Included / Not Included** — 2-column grid. Included: curated question design, 4 hours interviewing, real-time scientific credibility. Not included: mileage, equipment, editing, post-production.

**Do NOT include** a "Why This Works" closer section by default — Narin removed it from the mescreen page (June 2026). The page ends after Included / Not Included. The value is already established through the approach and unlock sections.

**Key rules:**
- No add-ons section by default — only add if Narin explicitly asks
- No "raw footage delivered within 48 hours" line — she removed it (June 2026)
- No "Why This Works" closer — she had it removed from the mescreen page (June 2026). The page ends after Included / Not Included. The value should already be evident from the approach and unlock sections.
- Mileage is always separate — billed at IRS rate or actual travel beyond 30 miles
- 10 sample questions minimum — drawn from the full Appendix B warm-up → energy → curiosity → reveal → ask arc
- When Narin says "what else can we add before giving the price," the answer is "What This Unlocks" — content repurposing potential

**Canonical reference:** `narinfazlalipour.com/projects/mescreen-street-interview.html` — June 2026, mescreen × Narin Fazlalipour.

Reference: `references/street-interview-rate-sheet.md` — the markdown source file at `~/projects/narin/street-interview-rate.md`.

Reference: `references/report-verification-checklist.md` — run after building ANY AuditLayer HTML report. Quick div-balance + section-count + ALM-badge check that catches the three most common structural bugs before delivery.


## Personal Brand Media Management Proposal

When Narin manages a founder's personal Instagram account and the company (not the founder) is the paying client — e.g., mescreen paying for @hemalpatelphd management. This is distinct from Pattern A/B: the account is a personal brand, the product content is handled by a separate team, and the proposal defines scope boundaries between Narin's work and the existing media team.

**Use when:** Narin says things like "the company writes the contract but I manage his personal account," "the new media team handles product content — I handle him," or "his personal brand outside of [company] content."

**Structure (6 sections, no bar chart — this is not audit-first):**

1. **Cover Letter** — OPTIONAL. Can be removed if Narin says so. When included: warm, references existing relationship duration ("since 2024"), names the scope split (product team vs. personal brand). Narin removed it from the Hemal proposal (June 2026) — don't assume it's needed.
2. **Scope of Work** — table with Narin's ACTUAL responsibilities + estimated hours. Do NOT default to "content creation & curation" framing that implies she's posting daily. Narin is the behind-the-scenes strategist. Her scope: Brand strategy & creative direction, Mitochondria-focused content (generated through existing research/papers/footage, not from scratch), Community & DMs, Broadcast channel, Stories, Analytics & reporting. Opening line must position her as "the behind‑the‑scenes brain — I don't post every day. I build the system that makes every post count." Add a horizontal hours-breakdown bar visual. **PITFALL**: Do NOT frame her as a daily poster or content creator. She is the strategist who translates the founder's existing work into content.
3. **Content Strategy** — 2×2 pillar grid. Each pillar has a name and a specific angle that distinguishes personal brand from product content (e.g., Research Storytelling, Behind the Lab, The Educator, Personal Voice & Philosophy)
4. **Broadcast Channel** — dedicated section for Instagram broadcast channel activation. What it enables: blog links, scientific concepts, paper summaries, personal notes, early access. Purple accent to distinguish from main content strategy.
5. **How I Work — Behind the Scenes** — NOT a 7-day calendar. Replace the daily posting schedule with 4 pillar cards describing how she actually works: Content Engine (pulls from existing research, not new creation), Brand Stewardship (voice, aesthetic, point of view), Community & Conversations (real DM/comment replies, not emoji), Channel & Stories (broadcast + daily Story presence). Close with a callout: "I am the person who puts it all together... I don't chase daily posting. I build the system that makes every post count." **PITFALL**: Do NOT use a Monday–Sunday calendar. It implies she's posting every day. She is not.
6. **Key Terms** — lighter than Pattern B: 90-day term, scope boundary (personal brand only, not product), approval flow (Reels/Stories no pre-approval, carousels/channel reviewed), non-exclusivity, reporting, independent contractor

**Pricing:** Use a placeholder or let Narin fill in. This format is often used for warm relationships where price is negotiated separately.

**Design:** Teal-on-dark aesthetic (same as Opportunity Analysis). No bar chart, no score diagram — the differentiation is the existing relationship and the clear scope split.

**PITFALL — Do not frame Narin as a daily poster.** She is the behind-the-scenes brain — strategy, brand direction, content curation from existing material, community voice. Use "behind the scenes," "strategist," "the brain," not "content creator" or "daily posting."

**PITFALL — Do not use a 7-day calendar.** Replace with "How I Work — Behind the Scenes" pillar cards (see section 5 above). A calendar implies daily output. Her role is strategic, not operational.

**PITFALL — Cover letter is removable.** Narin removed all three cover letter paragraphs from the Hemal proposal (June 2026). When she says "remove these paragraphs," listen — don't assume a warm intro is always needed.

**PITFALL — Do not use the Pattern B contract structure.** Pattern B opens with a pulse breakdown bar chart and includes performance targets, pricing tiers, and full legal terms. The Personal Brand proposal opens with scope definition and content strategy — it's a proposal, not a contract.

**Canonical reference:** `narinfazlalipour.com/projects/hemal-media-management.html` — June 2026, Dr. Hemal Patel media management proposal (cover letter removed, calendar replaced with "How I Work" section).

### Pattern A: Easy-Yes Proposal (First Contact)

Use this for initial outreach — a warm, single-page proposal designed to get a DM back. No legal section. No multiple pricing tiers.

**Structure (11 sections):** Hero → The Vision → Before/After → What I Do → What You Do → How We Create Together → Problem-Solution → Weekly Rhythm → Investment (single tier) → Easy-Yes Checklist → The Audit Link

**Pricing:** Single tier, no decision fatigue. Standard for Instagram-only + blog. Setup: one-time (varies per client — user settled on $1,500 for Casa Blui, June 2026).

**Design:** Pulse aesthetic — teal gradient hero, Playfair Display, card-based sections, light theme.

**Canonical reference:** `/tmp/narin-pages/projects/casablui-contract.html` (the first version, superseded by Pattern B — see git history).

### Pattern B: Full Contract (Client-Ready, AtllasAI-Style)

Use this when the client wants terms, conditions, and pricing options. Builds on the easy-yes proposal and adds formal structure.

**Structure (7 sections, in this exact order):** 
1. Cover Letter — **Full Pulse Breakdown 6-dimension bar chart FIRST** (`.score-diagram`), then What I Actually Do, then Before/After table. No callout, no "What Makes Me Different." The bar chart IS the differentiation.
2. Scope of Work — full table, How We Create Together paragraph only. **No rule callout** underneath (user removed it June 2026).
3. **Performance Targets** — KPIs with baseline → 90-day targets, green tags. **This comes BEFORE Content Mix** (user moved it above in June 2026 — anchors the proposal with measurable outcomes first).
4. Content Mix & Weekly Calendar — emotive philosophy intro (see below), pillars table, 7-day calendar.
5. Pricing — three tiers, monthly retainer paid biweekly. No `.featured` class, no "RECOMMENDED" badge.
6. Key Terms — duration, kill fee, approval, non-exclusivity, ownership, non-payment, confidentiality, governing law, liability, client responsibilities.
7. Footer

**Cover Letter rules:**
- Opens directly with Full Pulse Breakdown bar chart. No pulse summary callout ("Pulse Score: 54/100. Product Quality is elite...").
- No "What Makes Me Different" section. The bar chart shows the audit was done and the data is real.
- Hero subtitle: "Instagram media management for [category] — built on a brand pulse audit." **Strip "before a single dollar was asked" from ALL contract heros** — this phrase was removed from both the Casa Blui Cover Letter and the AtllasAI hero subtitle (June 2026). Check every contract file for it; it's a global rule, not specific to one pattern.

**Content philosophy — emotive, not formulaic:**
Use this intro paragraph on the Content Mix section (replaces the old "hero → transformation → result" formula, removed June 2026):
*"Content isn't about products — it's about the people using them. Every post should make someone feel something: the shock of cold water, the relief of recovery, the peace of presence. If it wouldn't stop a scroll, it doesn't ship."*

**Testimonial formats for luxury/privacy-conscious clients:**
When clients sell high-ticket products to privacy-minded buyers, standard on-camera testimonials don't work. Use this menu and always frame it as "ask each client their preferred format — captured authentically":
- **Anonymous client wall** — aggregated quotes, no names, no faces (always include this one)
- **Voice-note over B-roll** — client records a voice memo; lay it over ambient product/lifestyle footage
- **Text-message raves** — with permission, anonymized screenshots of DM/text reactions
- **Handwritten notes** — photograph a client's thank-you card or feedback note (no face, just handwriting)
- **Aggregate results** — compile trends into stats: "82% of clients report deeper sleep within two weeks"
- **Overheard snippets** — styled as ambient quotes: *"Overheard during a sauna install: 'I haven't slept this well in 20 years.'"*

**Stories cadence:** Use "3-5 Stories/week" as the default, not "daily." The user changed this throughout the Casa Blui contract (June 2026). "Daily" overpromises — 3-5 gives creative flexibility while keeping presence. Apply to all four locations: Before/After table, Scope of Work, Pricing features, and Performance Targets KPIs.

**Cross-platform language for upper tiers:**
- Growth tier: "Content repurposed across other platforms (YouTube Shorts, TikTok, LinkedIn)"
- Full-Stack tier: "Full cross-platform content strategy (YouTube, TikTok, LinkedIn, X)"
- Core tier: Instagram only — no cross-platform promise.

**Pricing — three tiers, monthly retainer paid biweekly:**
The user settled on a three-tier structure after testing single-retainer and various price points (June 2026). Exact prices vary per client — let the user set them. General structure:
- **Core** — strategy, 3 Reels, 1 carousel, captions, creative direction
- **Growth** — + Stories, community mgmt, blog, reporting, cross-platform repurposing
- **Full-Stack** — + more Reels, email list, testimonial pipeline, quarterly audits, competitor monitoring, full cross-platform

Setup fee: one-time (varies per client). Invoicing line: "Monthly retainer, paid biweekly · Net 15". Add a biweekly breakdown line showing the per-tier biweekly amounts. No `.featured` class, no "RECOMMENDED" badge (user removed it).

**Setup fee vs retainer — explain when asked:** Setup fee = one-time onboarding (account audit, strategy doc, content calendar buildout, brand voice guidelines, hashtag library, tool setup). Retainer = recurring fee for ongoing work (content creation, posting, community management, reporting). Setup builds the engine; retainer keeps it running. Monthly billing with biweekly payments smooths cash flow — common in agency retainers.

**Key terms (mandatory):** 90-day minimum → auto-renew monthly → 30-day written notice. Kill fee: 50% of remaining months if cancelled within first 90 days. No-approval on Reels & Stories (speed > perfection). Non-exclusivity explicit. Content ownership: yours until paid. Non-payment: immediate pause, no term extension. Confidentiality: 2-year survival. Liability cap: total fees in preceding 3 months. Independent contractor, not employee.

**Performance targets:** 7 rows: follower growth, engagement rate, Reels views, content output, reply rate, brand voice, founder content. Each: Baseline → 90-Day Target (green tag).

**Canonical references:** 
- `narinfazlalipour.com/projects/casablui-contract.html` — Casa Blui full contract (June 2026, most current)
- `narinfazlalipour.com/projects/atllasai-partnership.html` — AtllasAI contract (May 2026) which originated this structure

**PITFALL — Testimonial repetition:** Don't mention the testimonial solution in 3+ different sections. The pulse score diagram in the Cover Letter is the differentiation — it's evidence-based, not self-promotional. If testimonials need explanation, cover them once in the Scope of Work table under "Testimonial pipeline" and leave it there.

**PITFALL — Don't include a rule callout in Scope of Work.** The "How We Create Together" paragraph at the bottom of Scope is enough. The user removed a rule block (*"If it feels like a product catalog, kill it..."*) from the Casa Blui contract (June 2026). No rules box underneath the editor-in-chief paragraph.

**PITFALL — "built on a full Instagram audit before a single dollar was asked."** The user removed this line from the AtllasAI contract hero subtitle (June 2026). Do NOT include this phrase or similar "before a dollar was asked" language in any contract hero or subtitle. The audit speaks for itself.

**PITFALL — Don't assume single-tier or multi-tier.** Ask or follow the user's lead. The user tried a single retainer then switched back to three tiers in the same session. Both patterns are valid — the user decides per client.

## Naming Conventions

- **Dr. Hemal Patel** — with period and space: "Dr. Hemal"
- **Dr Joe Dispenza** — no period: "Dr Joe"  
- **mescreen™** — always with the trademark symbol (™), including in page titles and cards

## Street Interview — Two Formats

### Rate Sheet (for former employers / warm contacts)

When the client already knows her (former employer like Verséa/mescreen), use a simplified rate sheet — NOT a formal contract. Structure:

1. The Approach (with sample questions)
2. What This Unlocks (content repurposing value)
3. The Rate ($1,500/half-day, what's in / what's out)
4. No add-ons, no cancellation policy, no signatures

Reference: `projects/mescreen-street-interview.html`

### Full Contract (for cold/new clients)

Use the formal template in `references/street-interview-contract.md` with two pricing models (talent-only $1,500 / full production tiers).

## Naming Conventions

- **Dr. Hemal Patel** — with period and space: "Dr. Hemal"
- **Dr Joe Dispenza** — no period: "Dr Joe"
- **mescreen™** — always with the trademark symbol (™), including in page titles and cards

## Street Interview — Two Formats

### Rate Sheet (for former employers / warm contacts)

When the client already knows her (former employer like Verséa/mescreen), use a simplified rate sheet — NOT a formal contract. Structure:

1. The Approach (with sample questions)
2. What This Unlocks (content repurposing value)
3. The Rate ($1,500/half-day, what's in / what's out)
4. No add-ons, no cancellation policy, no signatures

Reference: `projects/mescreen-street-interview.html`

### Full Contract (for cold/new clients)

Use the formal template in `references/street-interview-contract.md` with two pricing models (talent-only $1,500 / full production tiers).

user removed this line from the What I Actually Do paragraph (June 2026). Keep the paragraph about documentary-style content without the negative framing.

**PITFALL — Patching pricing-card prices eats ul tags.** When using `patch` to change a pricing card's price value, do NOT include the `<ul>` and `<li>Everything in X</li>` in the old_string — the tool strips them and leaves `<li>` elements dangling without a parent `<ul>`. Match ONLY the `<div class="price">$OLD<span>/mo</span></div>` line. If `<ul>` gets eaten (symptoms: missing bullet indent on the first item after price), fix with a follow-up patch that inserts `<ul>\n          <li>Everything in Growth</li>` before the first list item. This happened twice on the Casa Blui contract (June 2026) when changing Full-Stack prices. Verify with `grep -A2 'class="price"'` after any price change.

## Self-Audit Framing

When auditing @auditlayer (Narin's own account), frame the competitive landscape as "one of one" — no direct competitors, an open lane. Use adjacent accounts (brand strategy, social media education) as reference points, not competitors. The callout should say: "@auditlayer doesn't have a competitor — it has an open lane. The only question is who fills it first."

For pre-launch / stealth-mode accounts, add a "Pre-Launch Content" section (#15b) with three content lanes that don't reveal the product: Brand Observations (carousels breaking down known brands), Hot Takes (screen-record Reels — voiceover only, no face), Pattern Spotting (cross-brand comparisons). Schedule: 2 carousels + 1 Reel per week.

## Collaboration Roadmap

When Narin has an existing partnership (e.g., Hemal Patel × Dr Joe Dispenza) and needs to propose content formats for the collaboration, use this format. It's a structured deck of content ideas with rationale and example topics.

**Structure:**
1. **Hero** — "Collaboration Roadmap" eyebrow, dual-name title, context paragraph
2. **Context box** — background on the existing partnership, what's already proven
3. **Proof strip** — key metrics from existing collabs (views, etc.)
4. **Format cards** — each with: format name, tagline, format badges (Reel/Carousel/Live), 3 subsections (The Format, Why It Works, First 3 Topics/Episodes)
5. **Closing callout** — the open lane or opportunity summary

**PITFALL — Naming conventions:** Follow Narin's lead on honorifics. In the Hemal × Dispenza collab (June 2026), she specified "Dr. Hemal Patel" (with period and space) but "Dr Joe Dispenza" (no period). These preferences are client-specific — don't assume a universal rule, just ask or follow what she uses.

**PITFALL — Content constraints:** Narin's collaborations often have specific constraints (pre-recorded footage only, surface-level only, published research only, no proprietary data). Read these constraints from the conversation and bake them into the format descriptions. Don't propose formats that violate known constraints.

**Canonical reference:** `narinfazlalipour.com/projects/hemal-dispenza-collabs.html` — June 2026, Hemal Patel × Dr Joe Dispenza.

## Visual Polish — Pulse Reports

When the user asks to make a pulse "prettier" or more visually appealing, use:
- **Hero gradient header** — deep teal gradient (`#0f766e → #115e59 → #0d9488`) with brand name in Playfair Display serif, stats strip with follower/post/highlight counts
- **Score card** — white surface with shadow lift (`box-shadow: 0 4px 24px rgba(0,0,0,0.06)`), gradient bar fills instead of flat colors, 16px radius
- **Cards** — 4px accent borders, 12px radius, subtle hover lift (`translateY(-1px)`)
- **Move numbers** — gradient circles with shadow, JetBrains Mono
- **Section headers** — Playfair Display serif with emoji icons
- **Calendar** — alternating row tints, mono day labels, 12px radius overflow

## Content Preferences

- **No face-to-camera content** — Narin prefers screen-record + voiceover for Reels. Use "Screen-Record" as the format label, not "Face-to-camera."
- **Score diagrams** — use horizontal bars (Hemal format), not circular/radial scoring. When the user says "make it circular," build it, but she may revert — default to bars.

**All 15-section audit reports MUST share identical CSS.** When building multiple reports (e.g., hemal + discovermescreen + sean.fetcho), copy the CSS block from the canonical reference (`hemalpatelphd-scorecard.html`) verbatim. Do NOT minify, rewrite, or "optimize" the CSS for individual reports.

**PITFALL — The shaimastrategist report IS the canonical format.** When building any new audit for AuditLayer, do not interpret the template abstractly from the skill description. The file at `/tmp/shaima_report.html` (on Supabase Storage as `4c7265e0-364c-4d4e-909b-ab031ce8ebdd.html`) is the exact reference. Clone its CSS block, ribbon, header, footer, and section structure character-for-character. Only swap brand-specific content. Sections 14 and 15 are "Audit Cadence" and "Get the Execution Plan" — NOT "Footer" and "Powered by AuditLayerMedia." The footer is an inline-styled div, not an h2 section.

**Pitfall — CSS drift causes visual inconsistency**: In this session, the Hemal report had the full un-minified CSS (~9,200 chars) but the discovermescreen and sean.fetcho reports had minified CSS (~7,300 chars) missing key rules. The result: enlarged icons from section 8 onward, inconsistent font sizing on timeline dots and idea cards. The user spotted it immediately.

**Fix**: Replace the `<style>...</style>` block in any drifted report with the canonical Hemal CSS block:
```python
with open('hemalpatelphd-scorecard.html') as f: hemal = f.read()
hemal_css = hemal[hemal.find('<style>'):hemal.find('</style>')+len('</style>')]
# Then replace in target file
```

**Verification**: After CSS replacement, check that all three reports have identical byte counts for their `<style>` blocks. The body content differs but the CSS must be byte-for-byte identical.

Every AuditLayer report must follow the 15-section framework Narin specified May 2026. This is the product — treat deviations as spec violations unless Narin explicitly requests a format variation.

**Important: distinguish portfolio legacy labels from worker/product prompt labels.** Older Narin portfolio references use section names like "Overall Score," "Raw Numbers," and "What Comes Next." When a standard AuditLayer worker/product prompt explicitly lists exact `<h2>` headings, those prompted headings override the legacy labels character-for-character. Do not rename "Executive Summary" to "Overall Score," do not rename "Footer" to "What Comes Next," and keep "Powered by AuditLayerMedia" as its own final `<h2>` section.

🚨 **THE TABLE BELOW SHOWS LEGACY PORTFOLIO NAMES — NOT THE WORKER/PRODUCT PROMPT HEADINGS.** The worker prompt's 15-section headings are: Executive Summary, Key Metrics, Strengths, Weaknesses, Root Cause Analysis, Peer Comparison, Content Format Analysis, Engagement Growth Strategy, Quick Wins — This Week, Success Benchmarks, Audience Profile, Road to [Milestone], Audit Cadence, Footer, Powered by AuditLayerMedia. When the user prompt gives you a numbered list of `<h2>` headings, use THOSE — not the legacy names in the table below. The table is kept for the section-content rules (what goes IN each section), not the heading names.

| # | Section | Key Rules |
|---|---|---|
| 1 | **Overall Score** | Must be a `<section>` with `<h2>1. Overall Score — XX/100</h2>`. **Default scoring visualization: horizontal bars** (Hemal format — `.score-diagram` with `.sd-row`/`.sd-track`/`.sd-fill`). Color-coded: green ≥65, amber 35–64, red <35. Overall /100 in JetBrains Mono. Follow with diagnosis callout (`.callout.accent`). **PITFALL**: Do NOT use circular SVG rings unless Narin explicitly asks for them. She reverted circular scoring on the @auditlayer report (June 2026) and prefers the clean horizontal bar format. |
| 2 | **Raw Numbers** | 4-card metric grid + full data table vs. 10K-tier benchmarks. Just the data — no analysis yet. |
| 3 | **Top 5 Strengths** | 5 green-left-border cards in 2-col grid (`.sw-card.strength`). Odd count: last card spans or use 3+2 layout. |
| 4 | **Top 7 Weaknesses** | 7 red-left-border cards (`.sw-card.weakness`). Odd count: use 4+3 layout. Last card can span full width. |
| 5 | **3 Immediate Actions** | Timeline items (`.timeline-item` with `.t-dot.accent`). This week only. Actionable, specific, one paragraph each. |
| 6 | **Competitive Comparison** | 3 real named peers with **verified Instagram handles only**. Every peer must be a real, verifiable account — never fabricate or guess handles. Verify with `browser_navigate` + `browser_console` to confirm the account exists before publishing. Narin will catch fake handles immediately ("there's only IG" / "that account doesn't exist"). Full data table: followers, niche, engagement rate, primary format, Reels/week, carousels/week, promo ratio, story engagement, save content. Include "why same-tier" callout. |
| 7 | **3 Content Ideas** | Ideas matching the account's specific vibe. Each: format + why it fits + first 3 examples. Use `.idea-card` with accent left-border. NOT generic suggestions — native to the account. |
| 8 | **90-Day Map** | 3 phases: Foundation → Acceleration → Compound. Timeline items + summary table with follower/engagement targets. |
| 9 | **Stories & Highlights** | Daily Story protocol table (time/format/content/purpose) + 3 highlight covers to build first. |
| 10 | **Content Schedule** | Full 7-day calendar grid (`.calendar-grid`): Day / Format / Pillar / Example. Mon–Sun. |
| 11 | **4-Hour Window & No Bots** | Explain 4-hour engagement window + why bots hurt accounts under 30K (detection, trust, ratio). Close with hands-on-keyboard rule. |
| 12 | **Presentable Feed** | Color palette (3 colors specific to THIS account's actual brand — never recycle palette advice across accounts), thumbnail consistency, grid rhythm, text-on-image rules, profile picture. Table: Element / Current / Recommended. Close with a brand-specific callout. **PITFALL**: Do NOT reuse color palette recommendations from another audit. @hemalpatelphd uses UCSD navy + teal. @discovermescreen uses deep black + white + mescore red/green (DO NOT suggest adding teal or copper). @sean.fetcho uses cream + deep navy + leather brown (warm editorial, NOT cold academic). Each account's section 12 must feel native to that brand's actual visual identity. |
| 13 | **Hashtags** | 3 tiers (Niche/Community/Reach) with examples + how to find new ones + where to put them (caption, not first comment). |
| 14 | **Audit Cadence** | Weekly (10 min) / Monthly (30 min) / Quarterly (2-3 hrs) / Post-Viral (45 min). Table: Cadence / Purpose / What to Check / Time. |
| 15 | **What Comes Next** | Teal gradient upgrade box (`.upgrade-box`): heading, 2-sentence Pro description, CTA button. Natural close — not salesy. |

### Common Elements for All Reports

1. **Diagnosis callout** after the score diagram — teal accent box (`.callout.accent`). One paragraph: what does this score mean? This is the most shareable element.

2. **AuditLayer footer badge** — centered teal badge below report footer. Template:
```html
<div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--line);text-align:center;">
  <span style="display:inline-block;background:var(--accent);color:#fff;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;padding:5px 14px;border-radius:4px;">AuditLayer Report</span>
  <p style="margin-top:8px;font-size:0.72rem;color:var(--muted);">narinfazlalipour.com · May 2026</p>
</div>
```

3. **No redundant sections.** Every section answers a distinct question. If two sections describe the same problem, merge them.

4. **Canonical reference:** `/tmp/narin-pages/projects/hemalpatelphd-scorecard.html` — the live 15-section report for @hemalpatelphd. Use its CSS patterns, section structure, and component HTML for all new reports.

## Communication Style — Casual Internal, Professional External

When talking to Narin directly (not in a client-facing artifact), be warm and conversational. She'll call out formal/"tense" consultant energy immediately ("babe why are you so tense?"). Match her tone — if she's casual, you're casual. Save the structured, section-heavy delivery for client deliverables, not DM conversation. This applies whether you're discussing creative direction, brand strategy, or any collaborative work with her.

## Brand Guide / Creative Direction

When Narin asks for personal brand direction — colours, fonts, thumbnail templates — rather than a full audit, this is a lighter creative deliverable. It's a designed PDF with visual mockups, not an HTML report with data. See `references/brand-guide-deliverable.md` for the full format spec, page structure, design patterns, and pitfalls.

| Format | Best For | Accent | Vibe |
|---|---|---|---|
| **Brand Guide** | Personal brand creative direction | Varies by subject | Designed PDF, visual mockups |

## Pitfall: fabricated peer accounts are caught immediately

**NEVER use fake or unverified Instagram handles in peer comparison tables.** Narin knows the Instagram landscape and will immediately ask "there's only IG" or check if a handle actually exists. Before publishing any peer comparison: (1) verify every handle with `browser_navigate` + `browser_console` expression `document.querySelector('meta[property="og:description"]')?.content`, (2) confirm the account returns a valid profile (not "Profile isn't available"), (3) use the real follower count from the meta tag. A fabricated handle like "@minickmedia" that returns "Profile isn't available" is a credibility killer. When you cannot find 3 real same-tier peers, use adjacent-space accounts at different follower tiers and frame the section as "Competitive Landscape" — this is always better than a fake handle.

## Pitfall: web_extract misses visual elements

`web_extract` returns text-only markdown summaries. Score diagrams, color-coded bars, and styled callouts are rendered as plain text tables or dropped entirely. **When inspecting a deployed audit, use `curl` via terminal to get the raw HTML** — not `web_extract`. The visual score diagram exists in the HTML but won't appear in extracted text.

## Pitfall: stray `</div>` in section 7 breaks layout from section 8 onward

Both discovermescreen and sean.fetcho had the same structural bug: every `<div class="idea-card">` in section 7 opens and closes on its own line, but a stray `</div>` appeared between the last idea card and `</section>`. That extra close broke the container nesting — sections 8 through 15 rendered inside the wrong parent, causing the frame to visually expand and content to scatter across the page.

**How to detect**: count `<div` opens vs `</div>` closes per section, then narrow down to the section with the imbalance.

```python
html = open('projects/report.html').read()
body = html[html.find('<body>')+len('<body>'):html.find('</body>')]
for i, sec in enumerate(body.split('<section>')):
    opens = sec.count('<div')
    closes = sec.count('</div>')
    if opens != closes:
        h2 = sec[sec.find('<h2>'):sec.find('</h2>')+5]
        print(f'Section {i}: {opens} opens, {closes} closes | {h2}')
```

**How to fix**: remove the stray `</div>` line right before `</section>` in section 7. After fixing, verify with the same balance check — all sections should have matching open/close counts.

**Verification**: a quick total-body check is also useful:
```python
opens = body.count('<div')
closes = body.count('</div>')
assert opens == closes, f'div mismatch: {opens} opens, {closes} closes'
```

## Pitfall: discovermescreen military language (Competitive Battlefield format)

The Competitive Battlefield format naturally leans into warfare metaphors. Narin agreed the original was ~30% too heavy. The section headers were reworked to standard 15-section names, but two phrases still linger in the body and should be caught in any future audit that uses this format:

- ❌ "scientific **firepower**" → ✅ "scientific **credibility**"
- ❌ "a **loaded weapon, never fired**" → ✅ "an **untapped asset — never deployed**"

When building a Competitive Battlefield report, use the military framing sparingly (sections 1–3 at most) and switch to a cleaner "Strategy & Execution" voice for the back half. The analysis underneath is excellent — the metaphor shouldn't compete with it.

## Workflow: Preview Before Insert

When proposing new sections for an audit, **show the text first** as a message — let Narin read it and say yes before inserting it into the live HTML. She wants to see the content in conversation, judge it, then have it deployed. Don't build straight into the report without preview. Once approved, insert and deploy immediately — she wants to see it "on the report" to make the final call.

## Manual Supabase Upload

When a report was generated locally and needs to appear in Narin's portal dashboard, upload it directly to Supabase Storage and create the audit record manually. See `references/supabase-manual-upload.md` for the full workflow (storage upload, audit record creation, event logging, user IDs).

## Deployment

All reports live under `/tmp/narin-pages/projects/` (macOS laptop) OR `~/projects/narinfazlalipour.github.io/projects/` (Hetzner VM) and deploy via git push to `narinfazlalipour/narinfazlalipour.github.io` (main branch). Report URLs: `narinfazlalipour.com/projects/<filename>.html`.

**🚨 DEPLOYMENT ACCOUNT**: The `narinfazlalipour/narinfazlalipour.github.io` repo requires pushing as `narinfazlalipour` (not `ashesh8500`). Before pushing, switch gh accounts: `echo | gh auth switch --hostname github.com` — select narinfazlalipour. After pushing, switch back to ashesh8500. If you get a 403, you're on the wrong account. This applies to ALL narinfazlalipour.com deploys — the site repo lives under Narin's GitHub, not Ashesh's.

**PITFALL — Files may only exist on one machine (dual-Hermes setup).** The macOS laptop and Hetzner VM have separate local clones synced via Syncthing, but git-pushed files created on one machine may not exist on the other's local clone. If a file (e.g., `casablui-contract.html`, `casablui-pulse.html`) is missing from the local `projects/` directory but the user references it: (1) check `curl -s "https://narinfazlalipour.com/projects/<file>.html" -o /dev/null -w "%{http_code}"` to confirm it's live, (2) use `web_extract` or `curl -s` to pull the live HTML to a temp file, edit there, then `cp` into the local repo before committing. Do NOT assume missing-local-file means the file doesn't exist.

**🚨 CRITICAL — NEVER deploy without explicit permission.** Do NOT push to narinfazlalipour.com or add files to /tmp/narin-pages unless Narin explicitly tells you to. This includes publishing new reports, updating existing ones, adding portfolio cards to index.html, or making any live-site change. Narin called this out directly: *"don't upload anything on my website unless I tell you please."* When in doubt, show the local file and ask.

When she DOES approve deployment:

```bash
# On Hetzner VM — push from the local clone:
cd ~/projects/narinfazlalipour.github.io
echo | gh auth switch --hostname github.com   # select narinfazlalipour
git add projects/<file>.html
git commit -m "message"
git push origin main
echo | gh auth switch --hostname github.com   # switch back to ashesh8500

# On macOS — push from the Syncthing-synced clone:
cd /tmp/narin-pages
echo | gh auth switch --hostname github.com   # select narinfazlalipour
git add projects/<file>.html
git commit -m "message"
git push origin main
echo | gh auth switch --hostname github.com   # switch back to ashesh8500
```

**Removing content from the site** (when Narin asks): git rm the file, remove its card from index.html if linked, commit, push. Verify live with curl.

**Verification**: GitHub Pages may serve a cached copy for a few seconds after push. Verify with a cache-busting query param:
```bash
curl -sL "https://narinfazlalipour.com/projects/<file>.html?v=$(date +%s)" | grep "<expected string>"
```
