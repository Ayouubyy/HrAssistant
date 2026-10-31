# HR Assistant

A Windows desktop app that takes repetitive work off HR managers' hands without replacing them: it pre-screens CVs against a job description and sorts the HR inbox. HR makes every final decision.

## Run it

```bash
npm install
npm run dev
```

The first launch asks you to choose a PIN. After that, unlock with the PIN or Windows Hello.

The AI needs a Google Gemini API key. Paste it in **Settings**, or put `GEMINI_API_KEY=...` in a `.env.local` file at the project root (it's gitignored).

## What it does

**Job filters (CV screening)**
1. *New job filter*: paste or load the job description, pick the industry, then click *Extract from description*. Review the requirements and mark the must-haves.
2. Drop CVs (PDF or Word, in French, English or Arabic) onto the page, or click *Add CVs*.
3. Each CV is scored out of 100 with sub-scores, evidence for every requirement, matched and missing skills, and a one-line verdict.
4. Weight sliders and the threshold re-rank instantly. CVs missing a must-have or scoring below the threshold go to *Rejected* with the reason. HR can *Restore* any of them.
5. Shortlist / Maybe / Reject, then *Export* to CSV.

**Inbox**
- *Load emails from folder* (try `test-data/inbox`), or connect Gmail under *Connected accounts* and click *Refresh*.
- Every email gets a category, an urgency check, a summary and a draft reply. Applications get a missing-documents check, and attached CVs can be sent straight to a job filter.
- Replies are only sent when HR clicks *Send reply*.

**Assistant panel** (right side): ask about the candidates or the email you're looking at, for example "Compare the top 2 candidates" or "Show only candidates with more than 5 years of experience".

## Privacy

- Everything is stored locally in `%APPDATA%\hr-assistant`.
- The API key and Gmail app password are encrypted with Windows (DPAPI).
- Emails and phone numbers are removed from CVs before they're sent to the AI. The AI is told to ignore name, gender, age, photo, nationality and address. The list shows "Candidate N" until HR clicks *Show name*.

## Demo prep

- Test data: `npx tsx scripts/make-test-cvs.ts`, then `powershell -File scripts/to-pdf.ps1` (needs Word), then `npx tsx scripts/make-demo-inbox.ts`.
- Rehearse once with the real data. Results are cached, so a second run of the same CVs and emails is instant and works offline.
- **Start from a clean slate:** close the app and delete `%APPDATA%\hr-assistant\data`. Keep the `cache` folder inside it if you want rehearsed results to stay instant.
- Gmail needs 2-step verification on the demo account and an *app password* (Google Account → Security → App passwords).
- Default model: `gemini-flash-lite-latest` (about 1 s per CV). `gemini-flash-latest` is smarter but can take minutes at busy times.

## Tests

```bash
npm test
```
