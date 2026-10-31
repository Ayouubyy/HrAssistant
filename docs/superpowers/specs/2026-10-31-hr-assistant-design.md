# HR Assistant — Design (hackathon MVP)

Date: 2026-10-31 · Time left at writing: ~10 hours · Builders: one developer (the team lead) + Claude; four non-technical teammates own the pitch and demo data.

## Intent

HR teams in banking, insurance, telecom, IT and similar industries drown in repetitive work. HR Assistant is a secure desktop app with a Claude-style chat interface that takes that work off their hands.

**The pitch line, which every design decision must respect:** *we don't replace HR managers, we give them an intelligent assistant that saves time, reduces errors, and lets them focus on people.* The AI proposes; HR decides and can always overrule.

The MVP solves two problems from the brief (cahier des charges):

1. **CV screening** (brief A.1 + A.2): many CVs, slow preselection.
2. **HR inbox** (brief C): categorize emails, detect urgency, summarize threads, draft replies, spot applications with missing documents, extract attachments.

They are one story: **a CV that arrives by email flows straight into screening.** That handoff is the demo's high point.

## The pitch (context for the builder)

15 minutes including Q&A. Plan: ~6 min story, ~4 min live demo, ~5 min Q&A. Juries reward a demo that works over a long feature list, so **reliability of the demo path beats breadth.**

## Goals

- Windows desktop app, all data stored locally on the machine.
- Lock screen on open (passkey / Windows Hello, see Security).
- Simple, clean UI (decided by the team lead): a regular app layout, **not** chat-first. Left sidebar navigation: **Job filters** (list + "New job filter"), **Inbox**, **Connected accounts**, **Settings**. The AI assistant chat lives in a **side panel** on the right, like a support/assistant panel on a website, and knows the context of the page it's opened on (the current job filter's candidates, or the current email).
- **Job filter** = one screening job. HR creates a new job filter, browses existing ones, and inside a filter: enters the job description, picks the preset, reviews requirements, uploads CVs, and clicks to let the agent work. Results appear on the same page.
- CV Screening workspace (details below), handling up to ~200 PDF/DOCX CVs in French, English and Arabic.
- HR Inbox connected to one real Gmail account (details below).
- Settings: the user can enter their own AI API key and choose the model. The app ships with no key in source.
- "Connected accounts" screen: Gmail works; Outlook, LinkedIn, Google Drive shown as "coming soon".

## Non-goals (for this MVP)

- Mobile app.
- Website (ignored for now, by the team lead's decision).
- Encryption of stored candidate data (on the roadmap; mention in pitch).
- OCR for scanned PDFs.
- Employee-management features of brief section B (shown on a roadmap slide only).
- Multi-user / server / cloud sync.

## Anti-goals (would make it a failure even if it "works")

- The AI sends an email without HR clicking Send.
- A candidate is rejected with no visible reason, or HR cannot overrule a rejection.
- Personal identity data (name, photo, age, gender, address, nationality, marital status) influences the score.
- The live demo depends on something untested at the venue with no fallback.

## How it gets made (decided)

- **Stack:** Electron + React + TypeScript (one language everywhere so the team lead can learn one thing). Builder's call: scaffold (electron-vite suggested), styling library (Tailwind suggested).
- **AI provider: Google Gemini API** via the official `@google/genai` SDK. Default model id `gemini-flash-latest` (verified 2026-10-31: resolves to `gemini-3.8-flash`, answers in French and Arabic; `gemini-2.5-flash` is no longer available to new keys). Model id is editable in Settings.
- Keep the AI behind a small provider interface so Claude (Anthropic API) can be added later; only Gemini is implemented now.
- **API key handling:** entered in Settings, stored with Electron `safeStorage` (Windows DPAPI). For development, a gitignored `.env.local` may supply it. The key is never committed and never shown in full in the UI.
- **Storage:** local files in the app's user-data folder (JSON is fine). Builder's call on format; avoid native modules that need rebuilding for Electron unless they work first try.
- **Document parsing:** PDF text extraction and DOCX text extraction in the main process (e.g. `pdf-parse`/`pdfjs-dist`, `mammoth`). Builder's call on libraries.

## CV Screening

### Inputs

- **Job description** (the reference), pasted or loaded from a file.
- **Industry preset:** Generic, Banking, Insurance, IT, Telecom. A preset adds guidance to the AI about what matters in that industry (e.g. Banking: compliance, confidentiality, financial knowledge; Insurance: risk assessment, regulation; IT: programming languages and frameworks; Telecom: network/engineering skills). Keep presets as editable data so more can be added later.
- **Requirements list:** the AI extracts requirements from the job description; HR reviews them and marks some as **must-have**.
- **CVs:** drag-and-drop of many PDF/DOCX files, plus CVs arriving from the Inbox.

### The agent pipeline (per CV)

1. **Extract text** from the file.
2. **Structure + anonymize:** AI returns a structured profile (skills, years of experience, roles, education, languages, certifications) with identity fields (name, contact, photo mention, age, gender, address, nationality) separated out. Identity is kept for HR's display only.
3. **Score** the *anonymized* profile against the job description and preset. The AI returns, as JSON:
   - sub-scores 0–100 for **skills, experience, education, languages**;
   - for each requirement: met / not met / unclear, with a short evidence quote from the CV;
   - matched skills, missing skills, red flags (e.g. unexplained gaps, inconsistencies);
   - a one-line verdict, written in the job description's language.
4. **Final score** (0–100) is computed **locally** as a weighted average of sub-scores, so HR's weight sliders re-sort instantly without new AI calls.
5. **Double-check (optional, builder may drop if short on time):** candidates within ±5 points of the threshold get a second scoring pass; the scores are averaged.

### Decision rules (all configurable by HR)

- **Threshold:** a score cutoff (default 60).
- **Toggle — auto-reject if a must-have is missing** (default on).
- **Toggle — auto-reject if below threshold** (default on).
- With a toggle off, those candidates are flagged instead of rejected.
- Rejected candidates are hidden from the main list but always viewable in a "Rejected" tab **with the reason**, and HR can move anyone back with one click.
- HR's final buttons per candidate: **Shortlist / Maybe / Reject.**

### Results panel

Ranked list: score, verdict, status, matched / missing skills chips. Clicking a candidate opens detail: sub-scores, requirement-by-requirement evidence, red flags, original CV. Weight sliders and threshold at the top. Progress indicator while a batch runs. Export of the shortlist (CSV is enough).

### Assistant side panel over results

The side-panel chat, opened on a job filter, lets HR ask questions about that filter's candidates ("why is #3 above #5?", "only people with Python and 3+ years", "summarize the top 5"). The model receives the job, requirements and the candidates' anonymized profiles + scores. It may answer in text and/or return a filter the UI applies. Builder's call on the exact mechanism.

### Scale and limits

Process CVs with limited concurrency and retry with backoff on rate-limit errors (the key may be on a free tier). The demo batch is ~30–50 CVs; must work end-to-end on that size reliably.

## HR Inbox

- **Connection:** one Gmail account via IMAP (read) and SMTP (send) using a Gmail **app password** (account needs 2-step verification). Credentials entered on the Connected accounts screen, stored with `safeStorage`. The team creates a dedicated demo Gmail account and fills it with realistic emails.
- **Fallback (mandatory):** a "Load demo inbox" option that reads a local folder of `.eml` files, so the demo survives venue network/Gmail problems.
- **Per email, the agent:**
  - categorizes it: Job application, Leave / holidays, Payroll / salary, Contract, Working hours, Policy question, Document request, Other;
  - flags urgency (urgent / normal) with a one-line reason;
  - summarizes long threads in 2–3 lines;
  - for job applications: lists attachments, extracts CVs, and **detects missing documents** against a configurable checklist (default: CV, cover letter, diploma); offers "Send to screening" for a chosen job;
  - drafts a reply for common employee questions. HR edits and clicks **Send**; nothing is sent automatically.
- **Inbox view:** list with category badges, urgent first, filters by category; email detail with summary, draft reply, attachments.
- **Policy answers:** for drafting replies to policy questions (holidays, hours…), HR can paste or load a short company policy text in Settings that the AI uses as its source. Without it, drafts stay generic and say what to check.

## Security

- **Lock screen** on app open. Attempt Windows Hello / passkey via WebAuthn in Electron (timebox ~30 min). If it doesn't work reliably, fall back to a local PIN set at first launch. Either is acceptable for the demo; Windows Hello is preferred.
- API key and Gmail app password stored with `safeStorage`.
- All candidate and email data stays on the machine; only text needed for a task is sent to the AI provider. (Pitch point. Full at-rest encryption is roadmap.)

## UI language

App UI in English (builder's call; French can follow). AI-written text (verdicts, summaries, drafts) follows the language of its source: the job description for screening, the email for inbox.

## Demo path (what must work flawlessly)

1. Unlock the app.
2. Open Inbox: emails are sorted and urgent ones are on top; open a long thread and see its summary; open a policy question and see the drafted reply.
3. Open a job application with a missing diploma: it's flagged; send its CV to screening.
4. In Screening: job description (e.g. a Banking role) + preset; drop ~30 CVs in three languages; watch progress; see ranking, rejected tab with reasons, move a slider and watch it re-sort, ask the chat a question, overrule a rejection, export shortlist.

## Team split (suggested)

- **Team lead + Claude:** the app.
- **Teammates:** pitch deck and story; ~30–50 realistic fake CVs (PDF + DOCX, FR/EN/AR, mixed quality, some missing must-haves) and 2 job descriptions; the demo Gmail account and ~20 realistic HR emails (with CV attachments, one missing a diploma, one urgent, one long thread); the `.eml` fallback copy; a short policy text; rehearsal.

## Calls made after review (Claude's calls, open to the team lead's correction)

- **AI result cache from day one:** every AI result is cached locally, keyed by file/email content hash + prompt version + model. Re-running a batch is instant and free, and a rehearsed demo can replay entirely from cache if the venue network fails.
- **Assume the Gemini key is free tier:** structuring + scoring is **one** AI call per CV (not two); the double-check pass is off by default (a setting); concurrency is low with backoff on 429. The inbox is processed once when emails arrive, not on every view.
- **Build order:** CV Screening core → `.eml` inbox → live Gmail (IMAP/SMTP) → lock screen → Connected accounts screen.
- **Test data:** the builder generates its own small set of test CVs (incl. Arabic DOCX→PDF) early and doesn't wait for the team's demo set; the team's set replaces it for rehearsal.
- **Live Gmail is part of the demo:** the demo reads the real demo inbox and Send really delivers (to a teammate's address); the `.eml` inbox stays as the backup.
- **Lock screen:** try Windows Hello first (timeboxed); if the demo laptop has no Hello set up or it misbehaves, use the app PIN.
- **Demo runs from dev mode** (`npm run dev`) on the team lead's laptop; a packaged `.exe` is a stretch goal only.

## Left to the builder

Scaffold, component library, file layout, storage format, prompts, JSON schemas, concurrency numbers, chat-filter mechanism, exact visual design within "simple, Claude-like".
