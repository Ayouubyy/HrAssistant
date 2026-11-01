# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(An Electron desktop app for Windows; the UI is a React web renderer at a fixed desktop window, opened maximized, minimum 1100 × 680.)

## Users

The first audience is a hackathon jury watching a live 15-minute demo (pitch plus Q&A) on 2026-10-31. Everything shown must read instantly on a projector or shared screen. The intended day-to-day user behind that demo is an HR manager at a bank, insurer, telecom or IT company (the demo company is Atlas Bank, Morocco) on a Windows laptop, screening CVs and sorting the HR mailbox in French, English and Arabic.

## Product Purpose

HR Assistant takes repetitive HR work off the manager's hands without replacing them: it scores and ranks CVs against a job description, and triages the HR inbox (category, urgency, summary, draft reply, missing documents). Success in the demo: the jury sees CVs ranked with reasons in seconds, a CV attached to an email flowing into screening, and attacks (hidden instructions in a CV, a spoofed email) caught and shown, with HR making every final call.

## Positioning

"We don't replace HR managers. We give them an intelligent assistant that saves time, reduces errors, and lets them focus on people." The AI proposes; HR decides and can always overrule. Everything runs on the HR laptop with no server; only redacted text reaches the AI, and security checks are visible on every candidate and email instead of hidden.

## Operating Context

A desktop window with a left sidebar, the main page, and an assistant chat panel on the right that knows the current page. Workflows: create a job filter from a job description, drop CVs, review the ranking and rejections, shortlist; load emails from Gmail or a folder, read triage, send a CV to screening, review and send a reply. Lock screen with PIN or Windows Hello on open.

## Capabilities and Constraints

- Shipped: CV screening (job filters), HR inbox triage, assistant chat panel, lock screen, Settings, Connected accounts (Gmail), security flags with "Needs review".
- Upcoming features appear in the UI like ready ones (rail items, a "Check credibility" button on shortlisted CVs) and open a coming-soon page that explains them: interview scheduling and question prep; employee Q&A bot; performance, training and skills-gap tracking; workforce planning; the credibility check (an AI agent comparing a CV's claims with its evidence). Also planned, shown only where they belong: Outlook, LinkedIn and Google Drive connectors (Connected accounts), the local AI injection detector (Settings), at-rest encryption, more industry presets, website and mobile app.
- The screening and inbox flows must keep working exactly as they do; the redesign changes presentation, not behavior.
- Content in French, English and Arabic (RTL) must render correctly.

## Brand Commitments

- Name: HR Assistant.
- The assistant gets a small, friendly drawn helper character (in the spirit of a small astronaut), used in the assistant panel and greetings. It must stay serious enough for a bank: friendly, never a toy.
- Must not look like a generic admin template, and the security story (flags, sender checks, "HR decides") must stay visible.

## Evidence on Hand

Synthetic demo data only: 12 CVs (`test-data/cvs`), 2 job descriptions (`test-data/jobs`), 10 demo emails (`test-data/inbox`), attack fixtures (`test-data/attacks`). No real customers, metrics, testimonials or user counts exist; the UI must not invent any.

## Product Principles

1. HR decides: every AI output is a proposal with a visible reason and an override.
2. Show the work: scores carry evidence, checks carry their reason.
3. Security is part of the job, shown where the decision is made, not on a separate screen.
4. Local and private by default; say plainly what leaves the laptop.
5. Demo-legible: the most important state on a screen is readable from across a room.
