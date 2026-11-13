# Job Genie alignment roadmap

## Done
- [x] Live feed brief (13 Nov): 342 sources (starter list, Job search companies, CV employers); whole boards, SmartRecruiters offsets; 6 at a time, 60 per run; places by country/city/remote region; title-first phrase keywords; widenings with counts; New since last visit; tests. Pending the user's go-ahead: deploy ingest-jobs and move its schedule from every 5 to every 15 minutes.
- [x] Rechecked the five reuploaded changes; added missing plain-wording safeguards and single-retry dropping, 391 tests passed, tailor-application deployed and signed-in generation verified.
- [x] 1. Four views (Apply / Documents / Follow-up / Settings) with navy + violet nav + teal actions, 15px body, 44px controls, legacy route redirects.
- [x] 4a. Screening-answer editor storing exact question text, answer, scope and confirmation timestamp; exposed as an `application_answers` question-to-answer map. Never infers work authorisation.

## Open
- [x] Website brief (13 Nov, F-K): tidy job titles/companies/places on save and display; one Documents and Generation History entry per job; Overview Applied from reported submissions, Top Matches scored from the profile with "Not scored", certifications "Hidden from CV"; Live feed keyword/place/remote checks, counts after filtering, all saved skills, apostrophes kept; Quick Start wording; Profile skills and excluded-company tidy-ups; tests.
- [ ] Deploy ingest-jobs so new imports keep apostrophes (waiting for the user's go-ahead; not deployed).
- [x] Extension sync brief (13 Nov, c90da15): no function changes on the branch; section I (careerFocus leads the summary, never "Background in" with a focus, focus title only when held; education graduation year only; two-page bullet limits) and section E (Profile shows graduation year, Start date / Graduation date fields keep both stored dates); tests; deploy.
- [x] Extension sync brief (12 Nov, 3fc7434): no function changes on the branch; section H Stripe Dublin lessons (no ability grafts, brackets at phrase ends, bare cities, no home relocation or US authorisation abroad, page-title wrapper, one entry per language, word-named tools, skill phrases, needs from the ad, no repeated "At" opener, language line); tests; deploy.
- [x] Extension sync brief (11 Nov, e486e9d): no function changes since 500786a; user_integration_keys table for LeadOcean and Flow keys; Settings Connections card (ends in XXXX, Remove); privacy tests.
- [x] Extension sync brief (10 Nov): sync functions from codex/professional-ui-ats-autofill 500786a; prompt rules A-G (self-talk ban, keywords at work, human skills lines, whole headline, requirement exclusions, letter rules, stable output); "What changed" box; LeadOcean contact label; Settings keys note; UKG/Phenom/Eightfold/ClearCompany job sites; regression tests; deploy tailor-application and generate-pdf.
- [x] Finish and audit all twenty final CV and letter rules; all keyword categories and strategy terms filtered, 409 existing tests and 31 Deno tests passed, tailor-application redeployed without error logs, signed-in refresh verified Accenture client work leads the consulting summary.
- [x] Use the latest authenticated saved Settings profile for generation and provide regeneration of existing saved documents; deployed and verified signed-in regeneration of both documents and saved read-back.
- [x] Exclude monetary amounts from generated CVs and letters and older-draft exports; 381 application tests passed, both functions deployed, signed-in CV and letter Word downloads verified.
- [x] Apply the five uploaded changes only: verify existing changes 1-4, add candidate plain-wording rules and safeguards, test and deploy.
- [x] Apply the four uploaded changes: prompt figures, saved cover letter layout/signature, latest documents, and checked letter wording; test and deploy.
- [x] 15. Apply uploaded required-qualification, Professional skills, invisible-character, document-property and letter-joining rules; test all and deploy both functions.
- [x] 9. Enforce grammatical, evidence-led summaries; ignore rank words when matching held titles, fall back to the current role, and reject bias-prone opening claims.
- [x] 10. Keep education dates in profile data; tailored CVs show the graduation year only (replaced by the 13 Nov brief); restore a missing EDUCATION section before responding.
- [x] 11. Confirm stale-tab skill merging and newest-first profile display remain intact.
- [ ] 12. Exclude screening criteria from extracted requirements while preserving canonical 12-20 requirement lists.
- [ ] 13. Enforce one labelled TECHNICAL SKILLS line per category with no more than ten entries.
- [ ] 14. Backfill the two supplied education rows without overwriting the pending Derby degree title.
- [ ] 2. Replace hardcoded match percentages with keyword coverage computed from the final CV (matched/total unique terms; whole-term matching for Java vs JavaScript, C++, C#, .NET; unmeasured state when no keywords).
- [ ] 3. Evidence mapping: job requirement -> profile evidence, truthful synonym suggestions, source shown, confirmation required; separate missing evidence / wording gaps / eligibility questions.
- [ ] 4b. Sync the answer map through the extension's existing profile sync contract (inspect extension sync code first).
- [ ] 5. Autofill selects/radios/comboboxes from confirmed answers only, with per-field reporting and cancellation (extension side).
- [ ] 6. Documents: DOCX/PDF export from the same reviewed text, staleness invalidation, text-preservation validation.
- [ ] 7. Recruiter-contact provenance and confidence, inbox filtering, server-side secrets.
- [ ] 8. Regression tests (coverage cases, eligibility gaps, stale files, phone/Unicode preservation, narrow/wide widths, keyboard).

## Screening-answer memory (done)
- Store: exact question, answer labels, field type, scope, confirmed date, review flag (profiles.learned_preferences)
- Reuse: exact-in-scope auto, reworded = suggestion, opposite polarity never reused
- Fresh confirmation: consent/declarations always, time-sensitive answers age out, "Ask me again"
- Extension sync: application_answers + screening_answers + always_confirm_questions; pending_screening_answers inbox
- Tests: tests/screeningAnswers.test.ts (bun test) 13 pass
- Open: extension side must write pending_screening_answers and verify committed selections via selectionCommitted()
