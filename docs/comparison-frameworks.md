# Comparison Frameworks

Structures and conventions for adding competitor, peer, or blueprint comparisons to audit reports. The framing choice is the single highest-stakes decision in a comparison section — it determines tone, structure, and conclusions.

---

## Comparison Types

### 1. Competitive Benchmark
Use when the subjects are market competitors.

**Characteristics:**
- Section title: "Competitive Benchmark: @competitor vs. @client"
- Intro: competitive framing — what the competitor does well, what the gap is
- Metric delta column: "Delta" — shows gaps explicitly with directional tags
- Advantages section: "Structural Advantages" — what the client does that the competitor can't replicate
- No cross-promotion playbook
- Bottom line: what the client does differently, strategy to differentiate

**Tag language:** "dominates," "decisive," "gap," "edge" — directional, competitive

### 2. Peer / Collaborator Comparison
Use when subjects are collaborators, partners, or operate in complementary spaces.

**Characteristics:**
- Section title: "Peer Comparison: @peer vs. @client"
- Intro: peer/collaborative framing — shared audience, complementary value
- Metric delta column: "Note" not "Delta" — neutral language
- Advantages section: "Where [Client] Has Differentiated Advantages"
- Includes cross-promotion playbook
- Bottom line: complementary value, not competition
- **CRITICAL:** verify the relationship before writing. Ask or search for evidence of collaboration.

**Tag language:** neutral tags only — never "dominates" or "decisive"

**Product separation rule for collaboration comparisons:** Do not suggest cross-promotion tactics that tie one party's specific product to the other party's events, audience, or brand without explicit confirmation. Stick to educational/practice-based collaboration ideas (joint Reels about mechanisms, co-hosted Lives, tagged carousels) rather than product-integration ideas. When in doubt, ask.

### 3. Blueprint / Analogue Comparison
Use when one subject represents the same business model or content strategy at a different scale.

**Characteristics:**
- Section title: "Strategic Blueprint: @analogue vs. @client" or "Growth Model Comparison"
- Intro explicitly calls out the structural parallel ("[Analogue] has already built the exact business model [Client] is pursuing — just at 100x scale.")
- Adds a "Structural Parallel" subsection with numbered Parallel cards before Lessons
- Advantages section: "Differentiated Advantages" — what's different, not what's better
- Bottom line: what the analogue proves is possible, what the client should adapt vs. ignore

---

## Standard Section Anatomy

Each comparison section follows this structure (adapted per type):

```
<!-- [SUBJECT] COMPARISON -->
<section>
  <!-- HEADER -->
  <h2>[Type]: @[subject] vs. @[client]</h2>
  <p>Intro paragraph — who, why relevant, framing.</p>

  <!-- SCALE -->
  <h3>Scale Comparison</h3>
  <div class="metric-grid"> — 4 cards: Subject IG, Client IG, Ratio, Key Delta </div>
  <p>Narrative paragraph contextualizing the numbers.</p>

  <!-- SIDE-BY-SIDE METRICS -->
  <h3>Side-by-Side Metric Comparison</h3>
  <table class="data-table">
    — 8-10 rows: Followers, ER, Posts, Likes, Comments, YouTube, TikTok, Revenue/Sponsorship
  </table>
  <div class="callout"> — One key insight that reframes the numbers </div>

  <!-- STRATEGIC COMPARISON -->
  <h3>Strategic Comparison</h3> <!-- or "Content Strategy Comparison" -->
  <table class="data-table">
    — 6-10 dimensional rows: columns = Subject, Client, Takeaway/Advantage
  </table>
  <div class="callout"> — Optional: structural insight </div>

  <!-- LEARNINGS -->
  <h3>What [Client] Can Learn From [Subject]</h3>
  <div class="sw-grid"> — 4 sw-card strength cards with Lesson 1-4 </div>

  <!-- ADVANTAGES -->
  <h3>Where [Client] Has [Structural/Differentiated] Advantages</h3>
  <div class="sw-grid"> — 4 sw-card strength cards with Advantage 1-4 </div>

  <!-- CROSS-PROMOTION (peer/collaborator only) -->
  <h3>Cross-Promotion Playbook</h3>
  <table class="data-table">
    — 5 rows: Tactic, What It Looks Like, Frequency, Expected Impact
  </table>

  <!-- BOTTOM LINE -->
  <div class="callout">
    <p>[🎯 or 🤝] <strong>Bottom line:</strong> One-paragraph synthesis.</p>
  </div>
</section>
```

---

## Comparison Table Column Conventions

### Metric Comparison Table
| Column | Description |
|---|---|
| Metric | Row label (e.g., "Instagram Followers") |
| @subject | Subject's value, right-aligned with `.num` class |
| @client | Client's value, right-aligned |
| Delta / Note | Directional tag or neutral note |

### Strategic Comparison Table
| Column | Description |
|---|---|
| Dimension | What's being compared (e.g., "Academic Credentials") |
| @subject | Subject's approach/status |
| @client | Client's approach/status |
| Advantage / Takeaway | Who has the edge and why |

---

## Metric Grid for Scale Comparison

Always use a 4-card grid at the top of each comparison:

```html
<div class="metric-grid">
  <div class="metric-card">
    <div class="value">7.4M</div>
    <div class="label">Subject IG</div>
  </div>
  <div class="metric-card">
    <div class="value">10.7K</div>
    <div class="label">Client IG</div>
  </div>
  <div class="metric-card">
    <div class="value">690×</div>
    <div class="label">Follower Ratio</div>
  </div>
  <div class="metric-card">
    <div class="value green">—</div>
    <div class="label">Key Delta</div>
  </div>
</div>
```

The 4th card should capture the single most important relational insight. Examples:
- "Different Games" (different scales, different strategies)
- "Same Tier" (comparable scale)
- "Structural Edge" (one has an advantage the other can't replicate)

---

## Tag Language Per Comparison Type

### Competitive
```html
<span class="tag strength">Hemal — structural</span>
<span class="tag weakness">Huberman dominates</span>
<span class="tag neutral">Comparable</span>
```

### Peer / Collaborator
```html
<span class="tag neutral">Different models</span>
<span class="tag neutral">Complementary</span>
<span class="tag strength">Synergy opportunity</span>
<!-- Never: "dominates", "decisive", "gap" -->
```

### Blueprint
```html
<span class="tag neutral">Same model, different scale</span>
<span class="tag strength">Differentiated advantage</span>
<span class="tag neutral">Scale-dependent (don't copy)</span>
```

---

## Cross-Promotion Playbook (Peer/Collaborator Only)

```html
<h3>Cross-Promotion Playbook</h3>
<table class="data-table">
  <thead>
    <tr><th>Tactic</th><th>What It Looks Like</th><th>Frequency</th><th>Expected Impact</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Joint Reels</strong></td>
      <td>60s explainer where each covers their domain — e.g., Subject on neuroscience, Client on measurement</td>
      <td>1×/month</td>
      <td><span class="tag strength">High</span></td>
    </tr>
    <!-- 4-5 rows total -->
  </tbody>
</table>
```

**Pitfall:** Do NOT suggest tactics that tie one party's specific product to the other party's events, audience, or brand without explicit confirmation. Some collaborations have legal constraints. Stick to educational/practice-based collaboration ideas.

---

## Report Subtitle Update

When adding a new comparison section to an existing report, always update the `.subtitle`:

```html
<!-- Before -->
<div class="subtitle">Dr. Subject — Credentials · Benchmarked against @comp1</div>

<!-- After -->
<div class="subtitle">Dr. Subject — Credentials · Benchmarked against @comp1 & @comp2</div>
```

---

## Git Conventions for Comparison Additions

```bash
# After adding a comparison section:
git add <report>.html
git commit -m "add @handle comparison to <client> audit"
git push origin master
```

Commit after each comparison addition with a descriptive message. Never batch multiple comparison additions into one commit — each comparison is independently reviewable.

---

## Pitfalls

1. **Never assume competitive framing.** Verify the relationship first. Search for evidence of collaboration, partnership, or shared projects. Writing a competitive takedown about someone's collaborator is a serious error.

2. **Default to neutral/peer framing** until the relationship is confirmed.

3. **Product separation in collaboration comparisons** — do not suggest cross-promotion of specific products without explicit confirmation.

4. **Use the report's existing CSS classes only** — never introduce new styles when adding to an existing HTML report.

5. **Always update the report subtitle** to include new benchmark handles.

6. **Separate commits for each comparison** — each is independently reviewable.

7. **Title format:** "Dr Jane Smith" not "Dr. Jane Smith" — no period after title abbreviations.
