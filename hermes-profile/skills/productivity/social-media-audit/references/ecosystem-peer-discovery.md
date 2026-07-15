# Ecosystem-Based Peer Discovery

## When to use
When web_search fails to surface same-tier peers in a niche professional category — because search engines don't index follower counts and the category is too specific for generic queries (e.g., "Indian commercial choreographer assistant 20K-35K followers"). The professional hierarchy itself IS the peer map.

## The technique

### Step 1: Map the subject's professional ecosystem
Identify the lead/principal they work under or alongside. Every subject in a professional niche operates in a hierarchy. For @dishitadhanuka, the lead is @yasshkadamm (113K, too big to be a peer). But the lead's ASSISTANTS and team members are often at the same career stage as the subject.

### Step 2: Mine the lead's team
Search for the lead's tagged collaborators, assistant credits, and team mentions. Look at:
- Reel captions listing "Assisted by:" or "Team [Lead]:"
- The lead's following list (if accessible)
- Collaborators tagged in the lead's recent posts
- Other leads in the same industry — cross-reference to find overlapping team members

### Step 3: Cross-reference between multiple leads
One lead gives you a team. Two leads in the same industry give you a validated peer pool. For the commercial choreography niche in Mumbai, @rajitdev's team (127K lead) surfaced @raveennachoudhhary (33K), @navyaagarwal (28K), @manan.s (134K — too big but confirms the ecosystem). Cross-referencing with general Mumbai dancer searches surfaced @rockingjiya (28K) from a different sub-ecosystem (@kings_united_india crew).

### Step 4: Verify every candidate
Use `browser_navigate` + `browser_console` expression `document.querySelector('meta[property="og:description"]')?.content` to extract live follower counts. Web search snippets go stale — live verification is mandatory.

## When this works best
- Professional niches with clear hierarchies (choreographers, photographers, chefs, attorneys, architects, stylists)
- Subjects who work under or alongside recognizable industry names
- Categories where search engines can't filter by follower count
- Mid-tier accounts (5K-100K) where the subject is building their name but not yet the lead

## Stop conditions
- 3 verified same-tier peers found → stop
- 8+ candidates checked and none in tier → widen the tier band by ±50% (e.g., 15K-50K instead of 20K-35K)
- Exhausted 2 lead ecosystems with no hits → the subject may be in a tier of one; use the nearest available peers with a note about the gap

## Pitfalls
- Do NOT use the lead themselves as a peer — the power dynamic makes the comparison read wrong
- Verify every peer's bio to confirm they're actually in the same profession, not just tagged in one post
- When a peer has been verified via meta tag but all other data is login-walled, mark metrics as approximate (~) and note the data limitation
