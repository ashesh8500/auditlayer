# Creator Audit Extensions

Templates for two sections specific to creator/personal-brand audits. Use these in addition to the standard audit framework in SKILL.md.

## 1. Peer Comparison Table (Table-Only)

For creator audits at the 10K–50K tier, a single comparison table is sufficient — skip the full multi-subsection anatomy from `comparison-section-structure.md`. The goal is to show the format/strategy pattern difference, not a deep 1:1 benchmark.

### Template

```html
<!-- PEER COMPARISON -->
<section>
  <h2>Peer Comparison — [Niche] Creators ([Tier] Tier)</h2>

  <p>Three comparable accounts in the [niche] space that have crossed the [milestone] threshold. All publish educational content anchored in research credentials. The comparison isolates what they do differently.</p>

  <table class="data-table">
    <thead>
      <tr><th></th><th>@[client]</th><th>Peer A — [credential]</th><th>Peer B — [credential]</th><th>Peer C — [credential]</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Followers</strong></td><td class="num">[N]</td><td class="num">~[N]</td><td class="num">~[N]</td><td class="num">~[N]</td></tr>
      <tr><td><strong>Engagement Rate</strong></td><td class="num" style="color:var(--red)">[N%]</td><td class="num" style="color:var(--green)">[N%]</td><td class="num" style="color:var(--green)">[N%]</td><td class="num" style="color:var(--amber)">[N%]</td></tr>
      <tr class="highlight"><td><strong>Primary Format</strong></td><td>[description]</td><td>[description]</td><td>[description]</td><td>[description]</td></tr>
      <tr><td><strong>Reels/week</strong></td><td class="num">[N]</td><td class="num">[N]</td><td class="num">[N]</td><td class="num">[N]</td></tr>
      <tr><td><strong>Carousels/week</strong></td><td class="num">[N]</td><td class="num">[N]</td><td class="num">[N]</td><td class="num">[N]</td></tr>
      <tr><td><strong>Promo ratio</strong></td><td class="num" style="color:var(--red)">~[N%]</td><td class="num" style="color:var(--green)">~[N%]</td><td class="num" style="color:var(--green)">~[N%]</td><td class="num" style="color:var(--green)">~[N%]</td></tr>
      <tr><td><strong>Story engagement</strong></td><td class="num" style="color:var(--red)">[description]</td><td class="num" style="color:var(--green)">[description]</td><td class="num" style="color:var(--green)">[description]</td><td class="num" style="color:var(--green)">[description]</td></tr>
      <tr><td><strong>Collab posts</strong></td><td class="num" style="color:var(--red)">[description]</td><td class="num">[description]</td><td class="num">[description]</td><td class="num">[description]</td></tr>
      <tr><td><strong>Saves-driven content</strong></td><td class="num" style="color:var(--red)">[description]</td><td class="num" style="color:var(--green)">[description]</td><td class="num" style="color:var(--green)">[description]</td><td class="num" style="color:var(--green)">[description]</td></tr>
    </tbody>
  </table>

  <div class="callout">
    <p>💡 <strong>The pattern:</strong> [One-sentence synthesis of what all peers do that the client doesn't.]</p>
  </div>
</section>
```

### Placement
Insert between Root Cause Analysis and Engagement Signal Diagnosis in the report flow.

### Peer naming
Use real, named accounts whenever they can be verified to exist — even if exact follower counts are approximate. Format: "@handle — Name, Credential" (e.g., "@ayuswellnessuk — Zib, PhD Candidate, MSc Molecular Medicine"). Clients find named peers more credible than generic "Peer A" labels. Add a "Niche" row to the table to contextualize why these accounts are peers. Archetypes (Peer A/B/C) are only a last-resort fallback when no verifiable accounts can be found. Mark metrics as approximate (~) when exact data is unavailable. The comparison pattern (format strategy, promo ratio, save-driven content) matters more than exact follower counts.

### Intro paragraph
Always include a 1-2 sentence rationale for why same-tier comparison matters vs. 1M+ accounts: "Comparing [client] to these accounts is more useful than benchmarking against 1M+ accounts like @hubermanlab or @foundmyfitness — those creators operate with entirely different resources, teams, and algorithmic advantages. Same-tier peers reveal what's achievable with similar constraints."

### Color coding
- `var(--red)`: below benchmark, missing, or minimal
- `var(--amber)`: approaching benchmark but not there yet
- `var(--green)`: at or above benchmark
- No color: neutral/descriptive

---

## 2. Growth Roadmap (Road to [Next Milestone])

Connects all recommendations to a concrete timeline with phased targets. Without this, the audit is a diagnosis without a destination.

### Template

```html
<!-- ROAD TO [MILESTONE] -->
<section>
  <h2>Road to [Milestone] — 90-Day Growth Timeline</h2>

  <p>The strategy outlined above maps to a three-phase timeline. Each phase builds on the last. The target is <strong>~[N] net new followers</strong> in 90 days — achievable when [key lever explanation].</p>

  <div class="timeline-item">
    <div class="t-dot accent"></div>
    <div class="t-content">
      <h4>Phase 1 — Foundation (Days 1–30)</h4>
      <p><strong>Target: [current] → [target] (+[N])</strong><br>
      • [Action 1]<br>
      • [Action 2]<br>
      • [Action 3]<br>
      • [Action 4]<br>
      • [Action 5]<br>
      <em>Success signal: [specific measurable outcome].</em></p>
    </div>
  </div>

  <div class="timeline-item">
    <div class="t-dot accent"></div>
    <div class="t-content">
      <h4>Phase 2 — Acceleration (Days 31–60)</h4>
      <p><strong>Target: [start] → [target] (+[N])</strong><br>
      • [Action 1]<br>
      • [Action 2]<br>
      • [Action 3]<br>
      • [Action 4]<br>
      • [Action 5]<br>
      <em>Success signal: [specific measurable outcome].</em></p>
    </div>
  </div>

  <div class="timeline-item">
    <div class="t-dot accent"></div>
    <div class="t-content">
      <h4>Phase 3 — Compound (Days 61–90)</h4>
      <p><strong>Target: [start] → [target] (+[N])</strong><br>
      • [Action 1]<br>
      • [Action 2]<br>
      • [Action 3]<br>
      • [Action 4]<br>
      • [Action 5]<br>
      <em>Success signal: [specific measurable outcome].</em></p>
    </div>
  </div>

  <table class="data-table" style="margin-top: 28px;">
    <thead>
      <tr><th>Phase</th><th>Timeline</th><th>New Followers</th><th>Engagement Rate</th><th>Key Lever</th></tr>
    </thead>
    <tbody>
      <tr><td>1 — Foundation</td><td class="num">Days 1–30</td><td class="num" style="color:var(--green)">+[N]</td><td class="num">[start%] → [end%]</td><td>[lever]</td></tr>
      <tr><td>2 — Acceleration</td><td class="num">Days 31–60</td><td class="num" style="color:var(--green)">+[N]</td><td class="num">[start%] → [end%]</td><td>[lever]</td></tr>
      <tr><td>3 — Compound</td><td class="num">Days 61–90</td><td class="num" style="color:var(--green)">+[N]</td><td class="num">[start%] → [end%]</td><td>[lever]</td></tr>
      <tr class="highlight"><td><strong>Total</strong></td><td class="num"><strong>90 days</strong></td><td class="num" style="color:var(--green)"><strong>+[N]</strong></td><td class="num"><strong>[start%] → [end%]</strong></td><td><strong>→ [milestone]</strong></td></tr>
    </tbody>
  </table>

  <div class="callout">
    <p>🗓 <strong>The variable isn't whether [milestone] is possible — it's whether the weekly cadence is maintained.</strong> [One sentence connecting back to the peer comparison or the core insight.]</p>
  </div>
</section>
```

### Placement
Insert after Audience Profile, before the footer. This is the final substantive section — it gives the reader a destination after the diagnosis and strategy.

### Phase naming conventions
- Phase 1: Foundation — building the base (format mix, engagement system, profile setup)
- Phase 2: Acceleration — growth levers kick in (podcast funnel, collabs, A/B testing wins)
- Phase 3: Compound — systems running, playbook in place, cross-platform amplification

### Key principles
- Each phase needs a numeric target range (not a single number) to account for variance
- Success signals must be measurable (engagement rate crossing X%, Reel hitting Y views, collab driving Z+ followers)
- The summary table gives the executive view; the timeline items give the tactical plan
- The closing callout reinforces that execution cadence, not credentials, is the variable

### Calculating the next milestone

**Never hardcode a milestone like 20K.** The next milestone is computed per account based on its current tier. A 500-follower account doesn't need "Road to 20K" — they need "Road to 2K." The playbook for 500→2K is fundamentally different from 10K→20K, and giving the wrong milestone produces bad advice.

Use this tier table to compute the next milestone:

| Current Followers | Next Milestone | Rationale |
|-------------------|---------------|-----------|
| 0–300 | 2K | First threshold where algorithm tests content with non-followers; social proof tipping point |
| 300–2K | 10K | Creator fund / link-in-bio unlock; psychological credibility flip from hobbyist to serious |
| 2K–10K | 20K | Sustained growth evidence; brand deal minimum threshold in most niches |
| 10K–50K | 100K | Six-figure social proof; brand deal rates jump 3–5×; algorithmic home-feed advantage begins |
| 50K–100K | 250K | Category leadership within niche; algorithmic compounding accelerates |
| 100K–500K | 500K | Broader category leadership; mainstream-adjacent visibility |
| 500K+ | Next rounded million | Plateau avoidance; keep the narrative forward |

When the gap between current and the tier's next milestone is very large (e.g., 300 followers → 10K = 33×), the report should frame it as a multi-phase journey where each phase has its own sub-milestone (300 → 2K → 5K → 10K). The 90-day plan targets the first sub-milestone, not the ultimate one.

The milestone should feel ambitious but credible — roughly 1.5–2× the account's current monthly growth rate extrapolated over 90 days. For stagnant or declining accounts, use the tier's minimum 90-day-achievable target (typically the first sub-milestone).
