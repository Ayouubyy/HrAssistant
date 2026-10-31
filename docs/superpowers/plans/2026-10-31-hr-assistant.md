# HR Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows desktop app where HR creates job filters, drops in CVs and gets an AI-scored, anonymized, explainable ranking, plus an AI-triaged Gmail inbox that feeds CVs into screening.

**Architecture:** Electron app. The main process owns everything sensitive or heavy: file parsing, AI calls (behind a provider interface, with a content-hash cache), local JSON storage, secrets via `safeStorage`, IMAP/SMTP. The React renderer is a thin UI that talks to main over a typed IPC bridge (`window.api`). Ranking math (weights, threshold, auto-reject) is pure code in `src/shared` so sliders re-rank instantly with no AI call.

**Tech Stack:** Node 24, Electron + electron-vite, React 18, TypeScript, Tailwind CSS, Vitest, `@google/genai`, `pdf-parse`, `mammoth`, `imapflow`, `mailparser`, `nodemailer`, `p-limit`.

**Spec:** `docs/superpowers/specs/2026-10-31-hr-assistant-design.md`

## Global Constraints

- Default model id `gemini-flash-latest`; editable in Settings. Never use `gemini-2.5-flash` (unavailable to new keys).
- No API key or password in source or git. Secrets only via `safeStorage`; dev key may come from gitignored `.env.local` (`GEMINI_API_KEY`).
- One AI call per CV (structure + anonymize + score together). Double-check pass off by default.
- Every AI result cached by `sha256(content) + promptVersion + model`.
- Anonymized scoring: because it's one call per CV, the CV text reaches the model whole. Emails and phone numbers are redacted locally before sending (regex), the prompt instructs the model to ignore name, photo, age, gender, address, nationality and marital status when scoring, and the ranked list shows "Candidate N" until HR clicks to reveal the name.
- Default threshold 60; auto-reject-missing-must-have on; auto-reject-below-threshold on.
- Nothing is emailed without an HR click on Send.
- UI copy in English, sentence case. AI text follows the source language (job description or email).
- Inputs: PDF and DOCX only; FR, EN, AR.
- All data under Electron `app.getPath('userData')`.

## Review Focus

1. **A CV whose text extraction returns empty or garbage** (scanned PDF, image-only) → candidate shows status `error` with "Couldn't read text from this file", the batch continues. Test in Task 4.
2. **Rate-limit (HTTP 429) or network error mid-batch** → retried with backoff up to 4 times, then that one CV is `error` with a Retry button; other CVs are unaffected. Test in Task 5.
3. **The model returns malformed JSON or out-of-range scores** → parsed defensively, scores clamped to 0–100, missing arrays default to `[]`. Test in Task 3.
4. **All weight sliders at 0** → equal weights are used, no NaN. Test in Task 1.
5. **Same CV dropped twice into a filter** → deduplicated by file hash, not scored twice. Test in Task 5.

---

## File structure

```
hr-assistant/
  package.json, electron.vite.config.ts, tsconfig*.json, tailwind.config.js, vitest.config.ts, .gitignore (.env.local, out/, node_modules/)
  src/shared/types.ts          domain types (below)
  src/shared/scoring.ts        weightedScore, evaluateCandidate, rankCandidates
  src/shared/presets.ts        industry presets data
  src/main/index.ts            window + ipc registration
  src/main/ipc.ts              all ipcMain.handle channels
  src/main/store/db.ts         JSON-file collections
  src/main/store/secrets.ts    safeStorage get/set
  src/main/store/settings.ts   non-secret settings
  src/main/ai/provider.ts      AIProvider interface + getProvider()
  src/main/ai/gemini.ts        Gemini implementation
  src/main/ai/cache.ts         content-hash result cache
  src/main/ai/json.ts          parseModelJson + clamp helpers
  src/main/cv/extract.ts       pdf/docx → text
  src/main/cv/prompts.ts       requirement-extraction + CV-analysis prompts
  src/main/cv/pipeline.ts      queue, concurrency, retry, dedupe
  src/main/assistant/chat.ts   side-panel chat with page context
  src/main/inbox/eml.ts        load .eml folder
  src/main/inbox/gmail.ts      IMAP fetch + SMTP send
  src/main/inbox/triage.ts     per-email AI triage
  src/main/lock/pin.ts         PIN hash/verify
  src/preload/index.ts         window.api bridge
  src/renderer/src/App.tsx     shell: sidebar + routes + assistant panel
  src/renderer/src/pages/{LockScreen,JobFilters,JobFilterPage,Inbox,Accounts,Settings}.tsx
  src/renderer/src/components/{AssistantPanel,CandidateRow,CandidateDetail,WeightSliders,EmailDetail}.tsx
  tests/**                     vitest
  scripts/make-test-cvs.ts     generates FR/EN/AR test CVs (DOCX + PDF) into test-data/
  test-data/                   generated CVs, job descriptions, demo .eml files
```

### Shared types (`src/shared/types.ts`) — used by every task

```ts
export type PresetId = 'generic' | 'banking' | 'insurance' | 'it' | 'telecom'
export interface SubScores { skills: number; experience: number; education: number; languages: number }
export type Weights = SubScores
export interface Requirement { id: string; text: string; mustHave: boolean }
export interface RequirementResult { requirementId: string; status: 'met' | 'not_met' | 'unclear'; evidence: string }
export interface CandidateIdentity { name: string | null; email: string | null; phone: string | null }
export interface CandidateAnalysis {
  identity: CandidateIdentity
  yearsExperience: number | null
  languages: string[]
  subScores: SubScores
  requirements: RequirementResult[]
  matchedSkills: string[]; missingSkills: string[]; redFlags: string[]
  verdict: string
}
export type HrDecision = 'shortlist' | 'maybe' | 'reject' | null
export interface Candidate {
  id: string; jobId: string; fileName: string; filePath: string; fileHash: string
  source: 'upload' | 'email'
  status: 'pending' | 'processing' | 'done' | 'error'; error?: string
  analysis?: CandidateAnalysis
  hrDecision: HrDecision; restored: boolean; revealed: boolean
}
export interface JobFilter {
  id: string; title: string; description: string; preset: PresetId
  requirements: Requirement[]; weights: Weights; threshold: number
  autoRejectMissingMustHave: boolean; autoRejectBelowThreshold: boolean
  createdAt: string
}
export interface Evaluation { score: number; rejected: boolean; reason: string | null }
export type EmailCategory = 'application' | 'leave' | 'payroll' | 'contract' | 'hours' | 'policy' | 'documents' | 'other'
export interface EmailTriage {
  category: EmailCategory; urgent: boolean; urgencyReason: string
  summary: string; draftReply: string | null
  missingDocuments: string[]  // only for 'application'
}
export interface EmailItem {
  id: string; source: 'gmail' | 'eml'; from: string; subject: string; date: string
  text: string; threadCount: number
  attachments: { fileName: string; path: string; isCv: boolean }[]
  triage?: EmailTriage; triageError?: string
}
export interface AppSettings { model: string; policyText: string; requiredDocs: string[]; doubleCheck: boolean; concurrency: number }
```

---

### Task 1: Scaffold and ranking logic

**Files:**
- Create: project scaffold (electron-vite react-ts template), Tailwind, Vitest, `.gitignore`, `src/shared/types.ts`, `src/shared/scoring.ts`, `src/shared/presets.ts`
- Test: `tests/scoring.test.ts`

**Interfaces:**
- Produces: all types above; `weightedScore(s: SubScores, w: Weights): number`; `evaluateCandidate(c: Candidate, job: JobFilter): Evaluation`; `rankCandidates(cs: Candidate[], job: JobFilter): { ranked: (Candidate & Evaluation)[]; rejected: (Candidate & Evaluation)[]; pending: Candidate[] }`; `PRESETS: Record<PresetId, { label: string; guidance: string }>`.

- [ ] **Step 1:** `git init` in `hr-assistant`, scaffold with `npm create @quick-start/electron@latest . -- --template react-ts` (or equivalent), add Tailwind and Vitest, commit the design doc and plan with the scaffold. Run `npm run dev`; expected: an Electron window opens.
- [ ] **Step 2: Write failing tests** in `tests/scoring.test.ts`:
  - `weightedScore({skills:90,experience:80,education:70,languages:60},{skills:5,experience:3,education:1,languages:1})` → `83`
  - all-zero weights → plain average, e.g. `{80,60,40,20}` → `50` (no NaN)
  - `evaluateCandidate` with a must-have requirement `status:'not_met'` and `autoRejectMissingMustHave:true` → `rejected:true`, reason starts `"Missing must-have: "` + requirement text
  - same with `status:'unclear'` → not rejected for must-have
  - score 55, threshold 60, `autoRejectBelowThreshold:true` → `rejected:true`, reason `"Below threshold (55 < 60)"`; with toggle false → `rejected:false`
  - `restored:true` → never rejected; `hrDecision:'reject'` → rejected with reason `"Rejected by HR"`
  - `rankCandidates` sorts by score descending; `status !== 'done'` goes to `pending`
- [ ] **Step 3:** Run `npx vitest run tests/scoring.test.ts` → FAIL.
- [ ] **Step 4:** Implement `src/shared/scoring.ts` (round with `Math.round`; must-have check runs before threshold check) and `presets.ts` with guidance for: banking (compliance, AML/KYC, confidentiality, financial analysis, IFRS/Basel), insurance (risk assessment, actuarial basics, insurance regulation, claims), it (programming languages, frameworks, cloud, years per technology), telecom (networks, 4G/5G, RF, fiber, certifications like CCNA), generic (none).
- [ ] **Step 5:** Run tests → PASS. Commit `feat: scaffold app and ranking logic`.

### Task 2: Storage, secrets, settings, app shell

**Files:**
- Create: `src/main/store/{db,secrets,settings}.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/pages/Settings.tsx`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `createDb(dir: string)` returning `{ list<T>(col), get<T>(col,id), put<T extends {id:string}>(col, item), remove(col,id) }` over files `<dir>/<col>.json` (collections: `jobs`, `candidates`, `emails`); `getSecret(name: 'geminiKey'|'gmailUser'|'gmailAppPassword'|'pinHash'): string|null`, `setSecret(name, value)` (encrypt with `safeStorage`, store in `secrets.json`); `getSettings(): AppSettings` / `saveSettings(p: Partial<AppSettings>)` with defaults `{model:'gemini-flash-latest', policyText:'', requiredDocs:['CV','Cover letter','Diploma'], doubleCheck:false, concurrency:3}`.
- `window.api` (typed in preload, `contextBridge`): one method per IPC channel; later tasks add channels to `ipc.ts` and `preload/index.ts` together.
- Gemini key lookup order: `safeStorage` secret, then `process.env.GEMINI_API_KEY` from `.env.local`.

- [ ] **Step 1: Failing test** `tests/db.test.ts`: put then get returns the item; put same id twice keeps one; data survives a new `createDb` on the same temp dir; `list` of a missing collection is `[]`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `db.ts` (atomic write: temp file + rename). **Step 4:** Run → PASS.
- [ ] **Step 5:** Implement secrets/settings + IPC `settings:get`, `settings:save`, `secrets:setGeminiKey`, `secrets:hasGeminiKey` (returns boolean, never the key).
- [ ] **Step 6:** App shell: left sidebar (Job filters with list + "New filter", Inbox, Accounts, Settings, "Stored locally" footnote), main area, right assistant panel placeholder; layout as in the approved mockup. Settings page: API key field (password input, shows "Key saved" state), model id, policy text, required documents, double-check toggle.
- [ ] **Step 7:** `npm run dev`, save a key, restart, page shows "Key saved". Commit `feat: storage, secrets and app shell`.

### Task 3: AI provider, cache, JSON parsing

**Files:**
- Create: `src/main/ai/{provider,gemini,cache,json}.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Produces: `interface AIProvider { json<T>(opts: { system: string; prompt: string; schema: object }): Promise<T>; text(opts: { system: string; messages: {role:'user'|'assistant'; content: string}[] }): Promise<string> }`; `getProvider(): AIProvider` (throws `NoApiKeyError` if no key); `cached<T>(key: string, fn: () => Promise<T>): Promise<T>` storing in `<userData>/cache/<sha256(key)>.json`; `cacheKey(...parts: string[]): string`; `parseModelJson(raw: string): unknown` (strips ``` fences, extracts first `{…}`); `clamp100(n: unknown): number`.
- `GeminiProvider` uses `@google/genai` with `responseMimeType: 'application/json'` and `responseSchema` for `json()`. Errors with status 429/5xx are thrown as `RetryableError`.

- [ ] **Step 1: Failing tests:** `parseModelJson('```json\n{"a":1}\n```')` → `{a:1}`; `parseModelJson('text {"a":1} trailing')` → `{a:1}`; `clamp100(140)`→100, `clamp100(-3)`→0, `clamp100('x')`→0; `cached` calls `fn` once for the same key across two calls and twice for different keys (temp dir).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Smoke script `scripts/ai-smoke.ts` calling `json()` with a tiny schema using `.env.local` key; expected: a parsed object printed. Commit `feat: gemini provider with cache`.

### Task 4: CV text extraction and test data

**Files:**
- Create: `src/main/cv/extract.ts`, `scripts/make-test-cvs.ts`, `test-data/` (generated)
- Test: `tests/extract.test.ts`

**Interfaces:**
- Produces: `extractText(filePath: string): Promise<{ text: string; hash: string }>` — `.pdf` via `pdf-parse`, `.docx` via `mammoth.extractRawText`; throws `UnreadableFileError("Couldn't read text from this file")` when trimmed text < 200 chars; other extensions throw `UnsupportedFileError`. `hash` = sha256 of file bytes.

- [ ] **Step 1:** `scripts/make-test-cvs.ts` generates ~12 DOCX CVs (4 FR, 4 EN, 4 AR; mixed fit for a credit analyst job; two missing a must-have) using the `docx` package, plus 2 job descriptions (`credit-analyst.txt` banking, `java-developer.txt` IT) and converts 3 CVs to PDF (via Word/LibreOffice if available; otherwise the team's PDFs fill this in). Also writes `test-data/blank.pdf` (image-only/empty).
- [ ] **Step 2: Failing tests:** an EN DOCX returns text containing the candidate's job title; an AR DOCX returns text containing an Arabic word from it; a PDF returns non-empty text; `blank.pdf` throws `UnreadableFileError`; `.txt` throws `UnsupportedFileError`; same file twice → same hash.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS. Commit `feat: cv text extraction and test data`.

### Task 5: Screening pipeline

**Files:**
- Create: `src/main/cv/prompts.ts`, `src/main/cv/pipeline.ts`; Modify: `src/main/ipc.ts`, `src/preload/index.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `AIProvider`, `cached`, `extractText`, `createDb`, `PRESETS`, types.
- Produces:
  - `extractRequirements(ai, description: string, preset: PresetId): Promise<Requirement[]>` (model marks likely must-haves; HR edits after).
  - `analyzeCv(ai, job: JobFilter, cvText: string): Promise<CandidateAnalysis>` — one call; system prompt: expert HR screener for `PRESETS[preset].guidance`; extract identity separately and **ignore name, gender, age, photo, nationality, address, marital status when scoring**; sub-scores 0–100; one `RequirementResult` per job requirement id with a short evidence quote from the CV; verdict ≤ 20 words in the job description's language. Output normalized with `clamp100` and `[]` defaults. Cache key `cacheKey(cvHash, jobId, JSON.stringify(job.requirements), job.preset, 'cv-v1', model)`.
  - When `settings.doubleCheck` is on and the first score is within ±5 of the job threshold, `analyzeCv` runs a second time (cache key suffix `'check'`) and the sub-scores are averaged.
  - `createPipeline({ ai, db, concurrency, maxRetries = 4, baseDelayMs = 2000, onUpdate })` with `addFiles(jobId: string, paths: string[], source: 'upload'|'email'): Promise<Candidate[]>` (dedupe by hash within a job) and `retry(candidateId: string)`. `onUpdate(c: Candidate)` fires on every status change.
  - IPC: `jobs:list`, `jobs:save`, `jobs:delete`, `jobs:extractRequirements`, `candidates:list(jobId)`, `candidates:add(jobId, paths)`, `candidates:update(id, patch)` (decision/restored/revealed), `candidates:retry(id)`, `candidates:exportCsv(jobId)` (save dialog; columns: rank, name, score, status, verdict, missing must-haves); event `candidates:updated` pushed to renderer.
- [ ] **Step 1: Failing tests** with a fake `AIProvider`: adding 3 files ends with 3 `done` candidates; adding the same file twice yields one candidate; a fake that throws `RetryableError` twice then succeeds → `done` (use `baseDelayMs: 1`); always throwing → `status:'error'` after 4 retries and other candidates still `done`; unreadable file → `error` with "Couldn't read text from this file"; malformed model output (scores `"high"`, missing arrays) → normalized analysis with 0 scores and `[]`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (`p-limit` for concurrency; exponential backoff `baseDelayMs * 2^attempt`). **Step 4:** Run → PASS.
- [ ] **Step 5:** Real-key check: run the 12 test CVs against `credit-analyst.txt` through a script; expected: the two CVs missing a must-have come back `not_met` for it, scores spread out, Arabic verdicts in French/English per JD. Re-run is instant (cache). Commit `feat: screening pipeline`.

### Task 6: Job filter screens

**Files:**
- Create: `src/renderer/src/pages/{JobFilters,JobFilterPage}.tsx`, `src/renderer/src/components/{CandidateRow,CandidateDetail,WeightSliders}.tsx`

**Interfaces:**
- Consumes: IPC from Task 5, `rankCandidates`, `PRESETS`.

- [ ] **Step 1:** "New filter": title, job description (paste or load .txt/.docx/.pdf), preset → "Extract requirements" → editable list with must-have toggles, add/remove rows → Save.
- [ ] **Step 2:** Filter page per the approved mockup: header (title, preset, CV count, progress "18 / 42 analyzed"), must-have/nice chips, drop zone + "Add CVs" (file dialog, `.pdf,.docx`), weight sliders + threshold + both auto-reject toggles (persist on change; re-rank via `rankCandidates` locally), tabs Ranked / Rejected / Errors, rows: score, "Candidate N" (click "Show name" sets `revealed`), language, verdict or rejection reason, matched/missing chips, Shortlist / Maybe / Reject buttons, Restore on rejected rows, Retry on error rows. Export CSV button.
- [ ] **Step 3:** Candidate detail drawer: sub-scores, each requirement with status and evidence, red flags, "Open CV" (shell.openPath).
- [ ] **Step 4:** Manual check with test data: create banking filter, drop 12 CVs, watch progress; move sliders → order changes instantly; raise threshold → rows move to Rejected with reason; Restore works; restart app → everything still there. Commit `feat: job filter screens`.

### Task 7: Assistant side panel

**Files:**
- Create: `src/main/assistant/chat.ts`, `src/renderer/src/components/AssistantPanel.tsx`; Modify: `ipc.ts`, preload

**Interfaces:**
- Produces: `askAssistant(ai, ctx: { kind: 'job'; job: JobFilter; candidates: (Candidate & Evaluation)[] } | { kind: 'email'; email: EmailItem } | { kind: 'none' }, history: {role,content}[]): Promise<{ answer: string; filter?: { minYears?: number; skills?: string[]; ids?: string[] } }>` via `ai.json`. Candidates are passed as "Candidate N" with analysis only (no identity). IPC `assistant:ask`.
- [ ] **Step 1: Failing test** with fake AI: the prompt sent for a job context contains no candidate `identity.name` values; a returned `filter` is passed through.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Panel UI: message list, input, context label ("Credit analyst · 42 candidates"); when a `filter` comes back, the filter page shows a removable "Assistant filter" chip that narrows the Ranked list. Chat history per page in memory. Manual check: "why is Candidate 2 above Candidate 3?" gets a grounded answer. Commit `feat: assistant panel`.

### Task 8: Inbox from .eml files

**Files:**
- Create: `src/main/inbox/{eml,triage}.ts`, `src/renderer/src/pages/Inbox.tsx`, `src/renderer/src/components/EmailDetail.tsx`, `test-data/inbox/*.eml` (≈10 generated: applications with CV attachment, one missing a diploma, an urgent payroll issue, a leave request, a long thread, a policy question)
- Test: `tests/inbox.test.ts`

**Interfaces:**
- Produces: `parseEmail(raw: Buffer, source: 'gmail'|'eml', attachDir: string): Promise<EmailItem>` (mailparser; saves attachments; `isCv` = pdf/docx whose name or first page suggests a CV — name match on `cv|resume|curriculum|سيرة` is enough); `loadEmlFolder(dir): Promise<EmailItem[]>`; `triageEmail(ai, email, settings): Promise<EmailTriage>` (cached by email id + 'mail-v1' + model; drafts use `settings.policyText` as the only policy source and say what HR should check when it's empty; `missingDocuments` compares against `settings.requiredDocs` using attachment names and body).
- IPC: `inbox:loadDemo` (folder dialog), `inbox:list`, `inbox:triageAll`, `inbox:sendToScreening(emailId, jobId)` → `candidates:add` with `source:'email'`.
- [ ] **Step 1: Failing tests:** parsing the generated application .eml yields 1 attachment with `isCv:true`; fake-AI triage result is normalized (unknown category → `'other'`); `sendToScreening` adds a candidate with `source:'email'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Inbox UI: list (urgent first, category badge, one-line summary), category filter chips, detail with summary, missing-documents warning, attachments, editable draft reply, "Send to screening" (pick job filter), Send button (disabled message "Connect Gmail to send" when source is eml). Assistant panel gets `kind:'email'` context. Manual check with the demo folder. Commit `feat: inbox with triage`.

### Task 9: Live Gmail

**Files:**
- Create: `src/main/inbox/gmail.ts`, `src/renderer/src/pages/Accounts.tsx`

**Interfaces:**
- Produces: `testGmail(user, appPassword): Promise<void>`; `fetchInbox(user, appPassword, limit = 30): Promise<Buffer[]>` (imapflow, `imap.gmail.com:993`, INBOX latest N); `sendReply(user, appPassword, to: string, subject: string, body: string, inReplyTo?: string)` (nodemailer `smtp.gmail.com:465`). IPC `gmail:connect` (tests then stores secrets), `gmail:status`, `gmail:refresh` (fetch → `parseEmail` → db → triage), `gmail:send`.
- [ ] **Step 1:** Accounts page: Gmail card (email + app password, Connect, connected state, link text explaining app passwords), cards for Outlook, LinkedIn, Google Drive marked "Coming soon".
- [ ] **Step 2:** Manual check with the team's demo account: connect, Refresh pulls emails, triage appears, Send delivers a reply to a teammate's address; wrong password shows "Couldn't connect to Gmail. Check the app password." Commit `feat: live gmail`.

### Task 10: Lock screen

**Files:**
- Create: `src/main/lock/pin.ts`, `src/renderer/src/pages/LockScreen.tsx`
- Test: `tests/pin.test.ts`

**Interfaces:**
- Produces: `hashPin(pin: string): string` (scrypt with random salt, `salt:hash`), `verifyPin(pin, stored): boolean`. IPC `lock:status` (`'setup'|'locked'`), `lock:setPin`, `lock:unlock(pin)`, `lock:hello()`.
- [ ] **Step 1: Failing tests:** verify correct PIN → true, wrong → false, two hashes of same PIN differ.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Lock screen on launch: first run sets a 4–6 digit PIN; later runs ask for it. **Timebox 30 min:** "Unlock with Windows Hello" via WebAuthn (`navigator.credentials.create/get` with a platform authenticator, credential id in settings); if it doesn't work on the demo laptop, hide the button. Commit `feat: lock screen`.

### Task 11: Demo hardening

- [ ] **Step 1:** Run the full demo path from the spec end to end with the team's data; fix what breaks.
- [ ] **Step 2:** Turn Wi-Fi off and replay the rehearsed screening and inbox: results come from cache. Anything uncached shows a clear "You're offline" error rather than hanging.
- [ ] **Step 3:** `npx vitest run` → all PASS. Commit `chore: demo hardening`.

## Time budget (~9 h)

Tasks 1–2: 1 h · 3–4: 1 h · 5: 1 h · 6: 1.5 h · 7: 0.5 h · 8: 1.5 h · 9: 1 h · 10: 0.5 h · 11: 1 h. If behind schedule, cut in this order: Windows Hello attempt, CSV export, assistant filter chips, live Gmail (keep the .eml inbox).
