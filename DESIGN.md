---
name: HR Assistant
description: Annual Report Grid — HR's day set like a bank's annual report, with one red ink reserved for what only HR can decide.
colors:
  paper: "#f4f5f3"
  surface: "#ffffff"
  ink: "#161918"
  rule: "#dde0dc"
  rule-strong: "#c6cbc6"
  muted: "#6a726e"
  accent: "#1f4e5f"
  accent-strong: "#163b48"
  accent-soft: "#e2ecef"
  rail: "#1f4e5f"
  rail-ink: "#eaf2f4"
  rail-muted: "#a3bec7"
  rail-line: "#2f6173"
  needs: "#c43325"
  needs-soft: "#fbe9e6"
  progress: "#a87412"
  progress-soft: "#f6ebcf"
  ochre: "#e3b23c"
typography:
  display:
    fontFamily: "Schibsted Grotesk Variable, Noto Sans Arabic, Segoe UI, sans-serif"
    fontSize: "56px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  page-title:
    fontFamily: "Schibsted Grotesk Variable, Noto Sans Arabic, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Schibsted Grotesk Variable, Noto Sans Arabic, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Schibsted Grotesk Variable, Noto Sans Arabic, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  column-label:
    fontFamily: "Schibsted Grotesk Variable, Noto Sans Arabic, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  tag: "3px"
  control: "6px"
  panel: "6px"
spacing:
  row: "10px"
  section: "36px"
  page-x: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    width: "232px"
  key-figure:
    typography: "{typography.display}"
    textColor: "{colors.ink}"
  key-figure-needs:
    textColor: "{colors.needs}"
  coming-soon-tag:
    textColor: "{colors.muted}"
    rounded: "{rounded.tag}"
    padding: "1px 6px"
---

## Overview

HR Assistant is an Operate surface: a desktop tool that an HR manager (and, first, a hackathon jury) reads at a glance. The world is the International Typographic Style of a bank's annual report: a strict grid, key figures set large, hairline rules instead of cards, and a single petrol-blue colour field for navigation. Warmth comes from Nour, a small helmeted helper drawn from simple shapes, never from decoration.

## Colors

Restrained with a committed shell. `paper` is the ground, `surface` is used for panels and the active nav item, `ink` carries text. The `rail` petrol owns the whole left navigation and the lock screen. Two inks are reserved and never decorative: `needs` red appears only on items waiting for HR's decision (flagged candidates and emails, their figure, the urgent count badge); `progress` ochre appears only on work in progress. `accent` (the same petrol) marks primary actions, links, focus and selection. The Tailwind `stone-*` scale is retinted toward the petrol so neutrals stay cool.

## Typography

One family, Schibsted Grotesk (variable), bundled with the app, with Noto Sans Arabic as the Arabic face; nothing loads from the network. Hierarchy comes from scale contrast: 56px key figures, 28–34px page titles, 18px section titles, 14px body, 11px uppercase column labels with slight tracking. Figures use tabular numerals (`.tabular`). Any user, CV or email text gets `dir="auto"`.

## Layout

Three columns at desktop size: the 232px petrol rail, the main page (40px side padding, content capped near 1080px), and the 320px assistant panel. Pages open with a title over a full-width ink rule (`PageHeader`). Data is set as ruled tables: an ink rule on top, hairline `rule` lines between rows, uppercase column labels. Key figures sit in one ruled row divided by vertical hairlines.

## Elevation & Depth

Flat. Depth is expressed with rules, not shadows. The only shadow is the lock-screen card over the petrol field.

## Shapes

Small radii: 3px for tags, 6px for controls and the few remaining panels. No pills except the round helper badge in the rail. States are drawn as printed marks (`Mark`): filled red square = needs your decision, half-filled square = worth a look, short grey bar = ready, dashed ochre square = in progress.

## Components

- **Rail navigation:** Home, Inbox (with a red urgent count), Job filters and each job, New job filter, Interviews, a "People" group (Employee Q&A, People growth, Workforce planning), then Connected accounts and Settings pinned low, Lock at the foot. Upcoming features sit in the rail like any other item, with an icon; they open their coming-soon page. Active item turns white with ink text.
- **Helper (Nour):** `Helper` with moods idle, thinking (eyes up, flat mouth) and happy (closed eyes); eyes blink unless reduced motion is on. Always paired with `HelperPlate` ("Nour · HR assistant") where it speaks.
- **Key figure:** number at display size, label in semibold, one-line note in muted text; clicking filters the queue below.
- **Charts (home):** drawn with plain elements, no library. A score strip per job (0–100 axis, shaded band below the threshold, ink threshold line, one mark per candidate: filled petrol circle = shortlisted, petrol ring = awaiting a decision, small grey dot = rejected or suggested, red square = needs review; close scores spread over up to 4 lanes; hover shows ref, score and state; click opens the candidate). Horizontal bar lists in one petrol hue with the value printed at the end (ochre only for "being sorted"). Part-to-whole bars with 2px gaps and a legend that prints every value. Every state has a shape or a printed value besides its colour. Tick labels are 10px.
- **Work queue / ruled table rows:** mark, reference number (`CV-03`, `MAIL-3F2A`), item, where, status, one text action ("Review" for flagged items, otherwise "Open").
- **Coming soon pages:** an outlined uppercase "Coming soon" tag, the feature title, a ruled "What it will do" list, optional status terms, a petrol-tinted "You stay in charge" note with the helper, and a back link when opened from inside a page (the credibility check opens from a shortlisted CV). An entry point to an upcoming feature looks like a normal control; a hover tooltip or the page it opens says it is coming soon.
- **Security flags:** `SecurityFlags` lists each flag with its evidence and a Dismiss button; `NeedsReviewChip` marks rows.

## Do's and Don'ts

- Do keep red for HR decisions only and ochre for work in progress only.
- Do use rules and scale for hierarchy; reach for a card only when a block must be lifted off the page.
- Do show reference numbers wherever an item can be named in conversation.
- Don't reintroduce the old indigo accent (#3b4fd8), gradients, glass, icon tiles or stat cards with icons.
- Don't make the helper a toy: no bounce, confetti or speech-bubble mascot moments; it greets, thinks and stays out of the way.
- Don't let an upcoming feature pretend to work: its nav item or button may look ready, but clicking it always opens the coming-soon page, never a fake result.
