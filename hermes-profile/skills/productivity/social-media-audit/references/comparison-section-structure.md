# Peer Comparison Section Structure

When adding a competitor or peer comparison to an existing HTML Instagram audit report, use this anatomy. Each comparison section is inserted before the `<!-- TARGETS -->` section and follows the report's existing CSS.

## Core Principles

1. **Numbers over narrative.** Every claim must be anchored to a specific metric from the peer. Don't say "Peer A posts more Reels" — say "Peer A posts 4 Reels/week at 3.2% engagement vs. client's 1 Reel/week at 1.4%."
2. **Learning extraction.** Every peer compared must produce at least one actionable lesson the client can apply — tied to a specific number from that peer's performance.
3. **Color freely.** Use `var(--red)`, `var(--amber)`, `var(--green)` to make gaps and strengths instantly scannable. Color-code every metric row — no neutral black text for comparison cells.

## Section Anatomy

```
<!-- [SUBJECT] COMPARISON -->
<section>
  <h2>Competitive Comparison — Three Accounts at the Same Tier</h2>
  <p>Intro paragraph — who these peers are, their credentials, why they're the right tier to benchmark against.</p>

  <h3>Metric Comparison</h3>
  <table class="data-table"> — FULL metrics table. Minimum 12 rows. Every cell color-coded.
    Rows: Followers | Engagement Rate | Avg Likes/Post | Avg Comments/Post | Saves-Driven Content |
    Reels/Week | Carousels/Week | Story Cadence | Collab Frequency | Promo Ratio |
    Posting Cadence | 30-Day Growth Rate
  </table>

  <h3>Performance Gap Analysis</h3>
  <p>Quantify the specific gaps. For each dimension where the client trails, state:
    the client's number → the peer average → the gap → what closing it would mean.
    Example: "Client engagement: 1.4%. Peer average: 3.1%. A 1.7-point gap.
    Closing it would mean ~400 more interactions per post — the difference between
    algorithmic suppression and home-feed placement."</p>

  <h3>What You Can Learn From Each Peer</h3>
  <table class="data-table">
    <thead><tr><th>Peer</th><th>What They Do</th><th>The Number</th><th>Your Takeaway</th></tr></thead>
    <tbody>
      <tr>
        <td>Peer A</td>
        <td>[Strategy description]</td>
        <td class="num" style="color:var(--green)">[specific metric]</td>
        <td>[Actionable: what client should try, tied to the number]</td>
      </tr>
      <!-- Repeat for all 3 peers -->
    </tbody>
  </table>

  <div class="callout">
    <p>📊 <strong>Bottom line:</strong> [One-sentence synthesis with the key collective number — e.g., "Across all three peers, the pattern is clear: Reel-heavy accounts at this tier average 3× the engagement of static-heavy accounts. Closing even half that gap is the single highest-leverage move."]</p>
  </div>
</section>
```

## Key Decisions Per Comparison Type

### Competitor framing (e.g., Huberman vs. client)
- Section title: "Competitive Benchmark"
- Metric delta column: shows gaps explicitly
- Advantages section: "Structural Advantages"
- No cross-promotion playbook
- Bottom line: what the client does differently, not "catch them"

### Peer/collaborator framing (e.g., Dispenza, Hyman vs. client)
- Section title: "Peer Comparison"
- Metric delta column: "Note" not "Delta" — neutral language
- Table rows use neutral tags, not "dominates" / "decisive"
- Includes cross-promotion playbook
- Bottom line: complementary value, not competition

### Blueprint/analogue framing (e.g., Hyman — same business model)
- Intro paragraph explicitly calls out the structural parallel
- Adds a "Structural Parallel" subsection with numbered Parallel cards before Lessons
- Advantages section: "Differentiated Advantages" — what's different, not what's better

## Color Usage (mandatory)

Use colors freely throughout comparison tables — every metric cell should carry a color signal:
- `var(--red)` — below benchmark, missing, or client significantly trails
- `var(--amber)` — approaching benchmark, partial coverage
- `var(--green)` — at or above benchmark, strength
- No neutral/black text for comparison cells — color is the visual language of the audit

## Pitfalls
- Never assume competitive framing. Verify the relationship first.
- When subjects are collaborators, strip all product-brand cross-references from the section.
- Use the report's existing CSS classes only — never introduce new styles.
- Always update the report `<div class="subtitle">` to include the new benchmark handle.
- Git commit after each comparison addition with a descriptive message.
- **Do not deliver narrative-only comparisons.** Every peer must have a numbers-to-lesson mapping.
- **Minimum 12 metric rows** in the comparison table — if you have fewer, you haven't researched enough.
