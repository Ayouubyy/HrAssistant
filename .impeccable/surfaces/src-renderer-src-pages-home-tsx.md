---
version: 1
slug: "src-renderer-src-pages-home-tsx"
primary_target: "src/renderer/src/pages/Home.tsx"
related_targets: ["src/renderer/src/App.tsx"]
---

## Scope

App shell and home dashboard of HR Assistant (Operate mode), plus coming-soon pages and the assistant helper. Audience: hackathon jury watching a live demo; behind it, a bank HR manager. Task: see what needs HR now, act on it in one click. Constraint: screening and inbox behavior unchanged.

## Direction contract

THESIS: HR's day set like a bank's annual report: strict grid, key figures, one red ink reserved for what only HR can decide. Refuses the stat-card SaaS dashboard with icon tiles and gradient hero.

OWN-WORLD: Cool off-white ground, ink black, petrol-blue navigation rail, red only on items awaiting HR, ochre only for work in progress. Hairline rules instead of cards; tabular figures; one grotesk family; severity as filled, half and outline squares.

STORY: The jury sees the helper greet them, reads four figures, and understands the AI did the sorting while HR holds every decision; flagged items sit on top with their reason.

FIRST VIEWPORT: Rail left (brand, Home, Job filters with jobs, Inbox, Coming soon, Settings, Lock). Main: helper with name plate and one-line status; a ruled row of four key figures at 56px; below, the work queue as a ruled table with reference numbers and one action per row. Assistant panel right with the helper's face.

FORM: Annual Report Grid, position 4 of 7, seed key 964afa36. Raises: scale-contrast hierarchy; red reserved for HR; states as printed marks; destructive actions isolated; helper name plate; stable reference numbers.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
