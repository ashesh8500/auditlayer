# Enterprise Homepage Showcase

## Objective

Replace the compact Enterprise pricing strip with a dedicated premium section that carries the same visual authority and conversion weight as the Blueprint section.

## Product truth

Enterprise is a custom engagement for companies and marketing agencies. It is not a fixed-price fourth subscription tier and must not imply predetermined audit counts, seats, API access, white-labeling, or a standard deliverable bundle.

Approved copy remains authoritative:

- Label: `Enterprise`
- Headline: `Customized to what you need.`
- Body: `Enterprise audits are tailored to your company or marketing agency. Tell us what you need, and we’ll customize the audit, scope, and deliverables around your goals and priorities.`
- Pricing: `Pricing is provided based on your specific needs.`
- CTA: `Talk to Us`

## Visual direction

Enterprise receives a full-width deep-forest section immediately after the main pricing plans and before Blueprint.

It should feel:

- Bespoke rather than packaged
- Executive and editorial rather than generic SaaS
- High-value without ornamental excess
- Distinct from Blueprint's light editorial introduction and dark pricing footer

## Composition

1. **Editorial introduction**
   - Enterprise kicker
   - Large approved headline
   - Approved explanatory copy
   - Audience qualifier: companies and marketing agencies

2. **Three-part engagement process**
   - Define the brief
   - Shape the scope
   - Deliver for action

   These describe the custom-engagement process, not guaranteed fixed deliverables.

3. **Tailored-scope panel**
   - Four adjustable engagement dimensions:
     - Goals and priorities
     - Accounts and markets
     - Research depth
     - Deliverable format
   - Custom-engagement pricing statement
   - `Talk to Us` CTA linking to `/support?topic=enterprise`

## Responsive behavior

- Desktop: two-column introduction, three-column process, split tailored-scope panel.
- Mobile at 390px: all content stacks, no horizontal overflow, CTA fills available width, all body text remains at least 12px.

## Acceptance criteria

- Existing compact Enterprise strip is removed.
- Enterprise has equivalent visual weight to Blueprint.
- Approved wording and CTA destination are preserved.
- No fixed-price or rigid-package claims are introduced.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- Desktop and 390px mobile visual QA show no clipping, overflow, or hierarchy issues.
