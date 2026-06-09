---
version: alpha
name: AuditLayerMedia
description: Clinical credibility meets hyper-clean digital publishing.
colors:
  primary: "#1c1917"
  secondary: "#78716c"
  accent: "#0d9488"
  accent-muted: "#f0fdfa"
  bg: "#fafaf9"
  surface: "#ffffff"
  line: "#e7e5e4"
  green: "#059669"
  green-muted: "#ecfdf5"
  amber: "#d97706"
  amber-muted: "#fffbeb"
  red: "#dc2626"
  red-muted: "#fef2f2"
  blue: "#2563eb"
  blue-muted: "#eff6ff"
typography:
  h1:
    fontFamily: Inter
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  h2:
    fontFamily: Inter
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    lineHeight: 1.5
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
rounded:
  sm: 6px
  md: 10px
  lg: 16px
spacing:
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
components:
  button-primary:
    backgroundColor: "#0f766e"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "#0f766e"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 24px
---

## Overview

AuditLayerMedia is a social media competitive intelligence platform for health, longevity, and premium wellness creators. The visual identity bridges scientific and clinical authority (reminiscent of medical research journals or high-end laboratory reports) with the seamless interactivity of modern SaaS platforms. 

The aesthetic is characterized by a warm-white background, crisp dark-ink typography, a calming and precise teal accent color, and structural section dividers.

## Colors

The palette is strictly divided between neutral surfaces, semantic highlights, and our brand accent:

- **Primary Text (#1c1917):** A deep, warm coal/ink color for maximum readability and journalistic gravitas. Avoid pure black.
- **Secondary Text (#78716c):** A stone gray for secondary details and subtext.
- **Teal Accent (#0d9488):** Represents clinical precision, research quality, and calm authority. Used for primary CTAs and key highlights.
- **Teal Muted (#f0fdfa):** Used as a subtle background tint for brand components and highlighted boxes.
- **Background (#fafaf9):** A warm, soft stone white that reduces eye strain and reads like premium cream paper.
- **Surface (#ffffff):** Pure white used for elevated cards to stand out from the warm neutral background.
- **Line (#e7e5e4):** Crisp divider line color to structure layout segments.

## Typography

- **Headings (Inter):** High-impact sans-serif with tight letter-spacing (`-0.02em`) and heavy weights (600/700) for a confident, editorial voice.
- **Body Text (Inter):** Clean sans-serif with a comfortable line-height (`1.5`) for maximum legibility.
- **Numbers & Metrics (JetBrains Mono):** High-contrast monospaced font used for stats, score counts, and date stamps to signal scientific precision and data rigor.

## Layout & Spacing

Layouts follow a highly structured single-column persuasion flow on landing screens, capped at `max-w-3xl` (or `max-w-5xl` for headers) to keep typography within comfortable reading measures. 
Vertical rhythm relies on generous `mt-14` (40px) or `mt-16` spacing between major content blocks, separated by crisp `hr` section dividers to guide the eye smoothly.

## Elevation & Depth

We utilize flat, architectural layout sheets over deep 3D space:
- **Low Elevation:** Simple `border-border` cards on the background sheet.
- **Medium Elevation:** Subtle shadow layers (`0 4px 12px rgba(0,0,0,0.04)`) to lift interactive panels (e.g. the active audit viewer or intake wizard).
- **Depth Cues:** Scrollable panels fade elegantly using a bottom white-to-transparent gradient sheet.

## Shapes

- **Standard Rounded Corners (10px):** Balanced, approachable curve used for cards, pricing tiers, and inputs.
- **Compact Corners (6px):** Used for micro-badges, buttons, and inline metrics.
- **Deep Rounded Corners (16px):** Used for large container blocks like the Hero or Report Mockups.

## Components

- **Primary Actions:** High-contrast Teal Accent (`#0d9488`) backgrounds with white bold text. Transitions to deep teal on hover.
- **Mock Report Viewer:** Rounded elevated container, structured with a header status bar, horizontal score bar charts, and scroll-fade indicators.
- **Score Indicators:** Flex row structures showcasing a colored horizontal progression bar using semantic coloring:
  - High scores (61-100): Emerald (`#059669`)
  - Mid scores (41-60): Amber (`#d97706`)
  - Low scores (0-40): Red (`#dc2626`)

## Do's and Don'ts

- **DO** use title case for CTA buttons (e.g., "Run a Free Pulse Audit").
- **DO** use fictional, high-quality handles (e.g., `@glowstate`) for landing page previews.
- **DO** use absolute file paths for file system operations.
- **DON'T** use generic SaaS dark mode designs. The clinical, academic brand depends entirely on the clean, light-journal aesthetic.
- **DON'T** use real-world client data in public landing mockups.
