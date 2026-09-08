# Job Genie alignment roadmap

## Done
- [x] 1. Four views (Apply / Documents / Follow-up / Settings) with navy + violet nav + teal actions, 15px body, 44px controls, legacy route redirects.
- [x] 4a. Screening-answer editor storing exact question text, answer, scope and confirmation timestamp; exposed as an `application_answers` question-to-answer map. Never infers work authorisation.

## Open
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
