# Brand Guide / Creative Direction Deliverable

When Narin asks for personal brand direction — colours, fonts, thumbnail templates, feed organisation — rather than a full scored audit, this is a lighter creative deliverable. It's a designed **PDF** with visual mockups, not an HTML report with data tables.

## When to use

Narin says things like:
- "make his account more organized looking"
- "what color and fonts should we use"
- "how would the thumbnails be"
- "let me have it in pdf please"

## Deliverable format

**Output: a multi-page PDF** — not HTML. Build the HTML first, convert via chromium headless:

```bash
chromium-browser --headless --disable-gpu \
  --print-to-pdf=/home/asheshkaji/brand-guide.pdf \
  --no-pdf-header-footer \
  file:///home/asheshkaji/brand-guide.html
```

**PITFALL — Snap chromium sandbox**: chromium on this VM is a snap. Use `file:///home/asheshkaji/...` paths (NOT `/tmp/...`) — the snap sandbox can't read from /tmp. The PDF output path can be anywhere in the home directory.

**Page structure** (typically 6-8 pages):
1. Cover — dark background, subject name, credentials
2. Colours — palette by content bucket, swatches with hex codes and usage notes
3. Fonts — primary + secondary with specimens and weight range
4. Thumbnail Templates — visual mockups of each template in its colour bucket
5. Face Frequency / Cadence — table showing when face appears vs. not
6. Hard Rules — numbered non-negotiables
7. Back cover

## Design approach

### It's a conversation, not a presentation

Narin will iterate on the direction. She has strong creative instincts and will course-correct specifics:
- Colour choices ("for meditation stuff, I also like to use warm colors")
- Content-type segmentation ("mescreen collabs should use mescreen's colors")
- Face frequency ("we have 3-4 reels and one static per week, how many should have face?")
- Text placement rules ("the text placement doesn't have to be locked")

**Don't lock everything down in v1.** Give her a thoughtful first pass, then let her reshape it. The second version is always better.

### Key design patterns Narin approved

- **Three-bucket colour system**: segment by content type (solo research, co-branded/collab, meditation/mind-body) rather than one palette for everything
- **Fonts stay consistent across buckets** — the type system is the spine
- **Face frequency is realistic**: based on actual weekly posting cadence (e.g., 2-3 face posts out of 4-5 total), not an arbitrary percentage
- **Co-branded content uses the partner's brand colours** — don't force the primary palette onto collaboration posts
- **Text placement breathes** — no rigid locking. The colour bucket + template + font system is enough to hold coherence

### Visual style of the guide itself

- Clean, minimal, designed — this IS a design artifact
- Dark navy cover with gold accent for authority
- Light cream pages with white cards for readability
- Inter + JetBrains Mono throughout (same font system the guide recommends)
- Real colour swatches, font specimens at display size, thumbnail mockups with sample content

## Comparison to other Narin deliverables

| Deliverable | Format | When | Contains |
|---|---|---|---|
| Full Audit (15-section) | HTML report | Client paid audit | Scores, data, peers, 90-day map |
| Brand Pulse | HTML report | Cold outreach, 90-sec read | Score diagram, 2 strengths, 2 gaps, 3 moves, calendar |
| Opportunity Analysis | HTML page | Pre-pitch, warm intro | Gaps, diagnosis, where-she-fits, no pricing |
| **Brand Guide** | **PDF** | **Creative direction for a personal brand** | **Colours, fonts, thumbnails, rules** |
| Contract (Pattern A/B) | HTML page | Formal engagement | Scope, pricing, terms, calendar |

## Pitfalls

- **Don't use formal consultant tone** when talking to Narin about creative direction. She'll call it out ("babe why are you so tense?"). Match her energy — casual, warm, conversational.
- **Don't deliver as HTML.** These are designed PDFs — the visual mockups and swatches need to be seen as a polished artifact.
- **Don't over-lock the rules in v1.** Narin will reshape specifics. Give her a solid framework she can react to.
- **Template cards must fit on one page.** If they break across pages, shrink preview heights and padding until they all fit.
- **Verify PDF pages after generation.** Convert to PNG with ImageMagick (`convert -density 150 file.pdf[N] check.png`) and vision-check all content pages before sending.
