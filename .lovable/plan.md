
Goal
- Fix “09-02-2026 - THIS IS ME” so banned phrases (including “Proven track record”, “utilising”, and any “optimising …” constructions you don’t want) never appear anywhere:
  - Generated CV text
  - Generated cover letter text
  - Generated PDFs (CV + cover letter)
  - Website UI + profile section + any hardcoded sample data
- Fix the scrambled CV formatting at the source (section parsing), not by “hoping” the AI formats perfectly.
- Add bullet sentence-variation detection (flag repetitive bullet openings like repeated first verbs).

What’s currently causing your problem (from codebase inspection)
1) Some generation paths still insert banned wording directly
- `09-02-2026 - THIS IS ME/resume-builder-improved.js` still injects with: `['leveraging','utilising', ...]`
- `09-02-2026 - THIS IS ME/tailor-universal.js` still uses `leveraging/utilising` in `injectKeywordNaturally()`
- `09-02-2026 - THIS IS ME/unique-cv-engine.js` still contains banned verbs like `Spearheaded`, `Orchestrated`, and US spelling `Optimized`
2) Sanitisation is not guaranteed at every “final output” boundary
- Even though `content-quality-engine.js` can remove “proven track record” and “utilising”, some pipelines can still output unsanitised text if they don’t run the final pass immediately before:
  - saving results
  - rendering to PDF
  - showing on the website
3) Your server-side AI prompt currently encourages banned patterns
- `supabase/functions/tailor-application/index.ts` includes:
  - an example summary containing “Proven track record…”
  - connector guidance “Resulting in… Which led to…” (you explicitly banned repetitive use)
4) Scrambled formatting is coming from section parsing not handling “inline” headers
- Your example shows: `PROFESSIONAL SUMMARY: Experienced ...` on one line.
- `ProfessionalPDFEngine.parseSections()` (and other parsers) primarily detect headers when the line equals the header, not when it’s “HEADER: content”.
- That causes content to land in the wrong section, producing scrambled output and PDF layout issues.

Implementation plan (only editing the “09-02-2026 - THIS IS ME” build + the website/backend that drives it)

A) Make ContentQualityEngine stricter and complete (single source of truth)
Files:
- `09-02-2026 - THIS IS ME/content-quality-engine.js`

Changes:
1) Expand banned coverage to include the variants you’re still seeing
- Add missing variants like:
  - “demonstrated” (past tense) and “demonstrates”
  - “proven success”, “proven history”, “proven” when used as a qualifier (optional but recommended)
  - additional “AI-ish” phrases you listed (and any that appear in your logs/tests)
2) Add rule-based replacements for the specific phrases you called out
- Ensure these are always removed/rewritten:
  - “Proven track record” → “Track record”
  - “Utilising / utilised / utilize / utilized / utilizing” → “Using / used”
  - “Optimising CI/CD processes” → rewrite to a non-generic phrasing (example: “Improved CI/CD pipelines” or “Improved CI/CD release flow”)
    - Important: UK spelling alone is not enough here; you want the phrase changed, not just spelled British.
3) Add a “hard fail” validator method used for verification
- Extend `validateContent()` to return a structured report:
  - bannedWordHits[]
  - bannedPhraseHits[]
  - usSpellingHits[]
  - emDashHits
  - repetitionFlags (from the new variation checker in section C)

Deliverable:
- A single `ContentQualityEngine.audit(text)` function that returns `{ ok: boolean, issues: string[] }` and can be called from:
  - extension generation
  - website generation (frontend)
  - backend functions

B) Guarantee sanitisation is applied at every output boundary (CV text, cover letter text, PDFs)
Files (extension build):
- `09-02-2026 - THIS IS ME/popup.js`
- `09-02-2026 - THIS IS ME/openresume-generator.js`
- `09-02-2026 - THIS IS ME/professional-pdf-engine.js`
- `09-02-2026 - THIS IS ME/cover-letter-generator.js`
- `09-02-2026 - THIS IS ME/resume-builder-improved.js`
- `09-02-2026 - THIS IS ME/tailor-universal.js`
- `09-02-2026 - THIS IS ME/unique-cv-engine.js`

Changes:
1) Remove banned injection words at the source (prevention beats cleanup)
- Replace any injection phrase arrays that include:
  - leveraging / utilise / utilising / utilized etc.
- Use safe alternatives everywhere:
  - “using”, “through”, “via”, “with”, “applying”, “incorporating”
2) Add a final sanitisation pass immediately before returning or saving generated content
- Wherever we produce:
  - `tailoredResume`
  - `tailoredCoverLetter`
  - structured resume objects that feed PDF engines
- We will run:
  - `ContentQualityEngine.sanitiseContent(...)` for blocks
  - `ContentQualityEngine.sanitiseBullets(...)` for bullet arrays
3) Enforce sanitisation inside PDF generators right before rendering
- In `professional-pdf-engine.js`:
  - sanitise summary, each bullet, and skill strings during `structureCVData()` or immediately before `render...()`.
- In `openresume-generator.js`:
  - sanitise `tailored.summary`, every experience bullet, and cover letter paragraphs before PDF rendering.
4) Add “verification mode” logging (this is how we’ll prove it’s fixed)
- After generation, run `ContentQualityEngine.validateContent()` on:
  - final CV text (the exact string you see)
  - final cover letter text
- If any banned hit is found:
  - log a red, explicit console error with the matched substring(s)
  - optionally show an on-screen warning/toast in the extension UI (“Quality check failed: found banned phrase …”)

C) Add sentence structure variation detection (flag repetitive bullet patterns)
Files:
- `09-02-2026 - THIS IS ME/content-quality-engine.js`
- `09-02-2026 - THIS IS ME/professional-pdf-engine.js` (or whichever layer has final bullets)
- `09-02-2026 - THIS IS ME/popup.js` (to surface warnings)

Changes:
1) Implement `analyzeBulletVariation(bullets: string[])`
Checks:
- repeated first word (case-insensitive) within the same role and across adjacent bullets
- repeated starters like “Led / Built / Developed …” too many times
- repeated connector patterns: “resulting in”, “leading to”, “which led to”, “thereby”, “thus enabling”, “in order to”
Output:
- a list of warnings with bullet indexes and suggested action (“Vary opening verb”, “Remove repetitive connector”)
2) Integrate it as a “flagger”, not an auto-rewriter (safer)
- You asked to “flag repetitive bullet patterns”. We will:
  - keep the original content
  - show warnings so you can decide whether to regenerate or adjust inputs
(If you later want auto-rewrites, we can add that as a follow-up feature.)

D) Fix scrambled CV formatting forever by upgrading section parsing to handle inline headers
Files:
- `09-02-2026 - THIS IS ME/professional-pdf-engine.js`
- `09-02-2026 - THIS IS ME/openresume-generator.js` (if it parses raw CV text anywhere)
- Any other parser used in the “09-02-2026” flow that reads `tailoredResume` text

Changes:
1) Update section parsing to recognise:
- `PROFESSIONAL SUMMARY:` on the same line with content
- `SKILLS:` / `EDUCATION:` / `CERTIFICATIONS:` similarly
Approach:
- If a line matches `^(SECTION_NAME)\s*:\s*(.+)$`:
  - start that section
  - push the remainder (`(.+)`) as the first line of section content
2) Make section boundaries robust
- Stop relying on “3+ uppercase letters” heuristics where it breaks on real data.
- Use an explicit header set and parse accordingly.

E) Fix the website + profile section (hardcoded and displayed content)
You asked “including hardcoded code, my website and my website profile section as well”.
Files:
- `src/data/userProfile.ts` (currently contains banned phrases like “perfect intersection of…” and pronouns)
- `supabase/functions/tailor-application/index.ts` (server-side generator that produced “Proven track record” in your pasted output)
- Optional: UI hints in `src/components/profile/CVPreviewModal.tsx` (text currently says “Job Title (Italic)” which conflicts with your “non-italic” spec; we’ll align the copy)

Changes:
1) Update hardcoded profile sample text (`src/data/userProfile.ts`)
- Remove banned phrases (“perfect intersection of”)
- Remove pronouns if this sample is used anywhere as “source of truth”
- Ensure British spelling
2) Fix the backend generator prompt and post-processing (`tailor-application`)
- Remove the “EXAMPLE OF CORRECT SUMMARY” line that contains “Proven track record…”
- Remove/replace guidance encouraging repetitive connectors (“Resulting in… Which led to…”)
- Add a backend post-process sanitisation step on:
  - `result.tailoredResume`
  - `result.tailoredCoverLetter`
  - and any structured fields used for PDF generation
This ensures even if the AI outputs banned wording, the returned content is cleaned before:
  - the website shows it
  - PDFs are generated server-side
3) Ensure PDF generation backend also uses content-quality sanitisation
- `supabase/functions/generate-pdf/index.ts` currently sanitises to ASCII for ATS but does not enforce your banned-word policy.
- We’ll apply the same “banned phrase removal + UK spelling + dash rules” before drawing text.

Verification plan (how we will prove “100% fixed”)
1) Add a deterministic audit report printed every time we generate:
- “Audit: CV OK / Cover OK”
- If not OK: list each exact banned match found (string + where)
2) End-to-end test in the website
- Generate a CV + cover letter through the website flow that produced your pasted “tailoredResume”
- Confirm the output contains none of:
  - “Proven track record”
  - “utilising / utilised / utilizing / utilized”
  - “optimising CI/CD processes” (or whichever exact phrase you want eliminated)
3) End-to-end test in the “09-02-2026 - THIS IS ME” build generation (extension path)
- Trigger generation, then:
  - inspect final text shown
  - inspect final PDFs (CV and cover letter)
  - confirm audits pass and formatting is clean (sections appear correctly)

Notes / constraints (honest)
- “100% fixed” is achievable in practice only if we enforce sanitisation at the final output boundaries (frontend + backend + PDF rendering). We will do that so even unexpected AI wording is corrected before you see it.
- Sentence variation detection will flag issues; it will not silently rewrite bullets unless you explicitly ask for auto-rewriting.

Files we expect to change (summary)
Extension build (“09-02-2026 - THIS IS ME”):
- content-quality-engine.js
- popup.js
- professional-pdf-engine.js
- openresume-generator.js
- resume-builder-improved.js
- tailor-universal.js
- unique-cv-engine.js
- (potentially) cover-letter-generator.js if any templates still contain banned phrasing

Website/backend:
- src/data/userProfile.ts
- supabase/functions/tailor-application/index.ts
- supabase/functions/generate-pdf/index.ts
- (optional copy alignment) src/components/profile/CVPreviewModal.tsx

Sequencing
1) Patch ContentQualityEngine rules + audit reporting
2) Remove banned injection phrases at the source (tailor-universal / resume-builder / unique-cv-engine)
3) Add final sanitisation at all return/save/PDF boundaries
4) Fix inline header parsing to stop scrambled formatting
5) Update backend prompts + backend post-processing
6) Update website hardcoded sample content
7) Run end-to-end verification passes and confirm audits show “OK”

