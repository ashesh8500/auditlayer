# Scrollable Sample Report Preview

## Objective

Make the fictional homepage report feel like a report visitors can read rather than a tab widget that swaps isolated fragments.

## Behavior

### Homepage preview

- Keep the report header and score visible above the reader.
- Display Diagnosis, Benchmark, and Action plan as one continuous document.
- Constrain the document body to a polished internal reading viewport.
- Support mouse wheel, trackpad, touch, keyboard, and scrollbar navigation.
- Keep section labels above the reader as jump controls.
- Update the selected label as the visitor scrolls through sections.
- Show a restrained `Scroll through the sample` cue below the reader.
- Allow normal page scrolling to continue at the beginning and end; do not create an overscroll trap.

### Dedicated sample page

- Render the same continuous report with natural page scrolling rather than a nested scroll viewport.
- Keep section-jump controls functional.

## Accessibility

- The homepage reader is keyboard-focusable and has an explicit accessible label.
- Section controls are buttons with `aria-current` for the active section.
- Do not rely on animation or pointer interaction alone.

## Responsive acceptance

- Desktop preview remains balanced against the homepage introduction.
- At 390px, no horizontal overflow and all score rows, peer cards, and action cards remain readable.
- The internal reader height is large enough to understand each section but short enough to communicate that more content exists below.

## Verification

- Unit tests, typecheck, lint, production build, and browser smoke tests pass.
- Desktop and 390px visual QA verify the scroll cue, section controls, content flow, and absence of clipping.
- Browser interaction QA verifies both manual scrolling and section-jump controls.
