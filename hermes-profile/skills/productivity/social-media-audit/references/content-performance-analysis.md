# Content Performance Analysis from Instagram Insights Screenshots

When the user shares screenshots from Instagram Professional Dashboard → Insights → Content, extract and analyze the data.

## Extraction

Use `vision_analyze` to read all visible thumbnails, view counts, titles, and overlays. Ask it to read every number carefully. Note:
- The filter pill selected (e.g., "Last 2 years")
- The sort column (e.g., "Views")
- All partially cropped thumbnails at edges

## Analysis Structure

Build a section with these components (using the report's existing CSS):

### 1. Ranked Table
```
<table class="data-table">
  Rank | Content | Format | Views | Content Theme
```
Highlight the #1 row with `class="highlight"`. Show view counts in green for standout performers.

### 2. Key Patterns (4 cards)
Use `sw-grid` with `sw-card strength` cards:
- **Pattern 1:** Top growth lever (e.g., collaboration, format, topic)
- **Pattern 2:** Format/topic outperformance (e.g., demos vs education)
- **Pattern 3:** Format that consistently performs (e.g., stage clips)
- **Pattern 4:** Format dominance (e.g., Reels-only top performers)

Each card: one sentence stating the pattern, one sentence with data evidence, one sentence of strategic implication.

### 3. Performance Tiers Table
```
<table class="data-table">
  Tier | View Range | Content Type | Strategy
```
Three tiers:
- **Viral:** The outlier(s) — what created them, how to replicate
- **High:** Reliable performers — double down
- **Baseline:** Steady content — maintain and optimize

### 4. Revenue/Conversion Implication Callout
```
<div class="callout">
```
Connect view counts to business outcomes. Viral reach ≠ conversions. Product education often converts better than viral content despite lower views. Suggest a content mix split (% reach-building vs % product education vs % community).

## Platform Identification

Instagram Insights "Content" tab and YouTube Studio "Content" tab look similar — both show video thumbnails in a grid with view counts. Check context clues:
- Instagram Insights shows Reels/Posts mixed in the grid
- YouTube Studio typically shows video duration overlays
- The user's session context (are we working on Instagram or YouTube?) is the primary signal
- When uncertain, ask — don't guess the platform
