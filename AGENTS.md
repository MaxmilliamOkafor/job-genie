# Project architecture rules

- Tailoring coverage, required-work-history reporting and revision-gap ordering use shared pure coverage helpers so tests exercise deployed logic.
- CV plain-wording clean-up uses a pure helper in tailoring guards before letter generation and after review edits so tests exercise the exported wording.
- Document exports share text sanitisation and candidate-only property helpers under generate-pdf so PDF and Word output follow the same integrity rules.
- Monetary exclusion uses one shared pure helper at the final tailoring gate and before every export input path so restored evidence and older drafts cannot bypass it.
- Skills placement classifies terms only; the existing profile evidence gate decides whether a term may be added.
- Cover letter export style is read with the caller's authenticated profile access and validated by pure style helpers; this prevents cross-account signatures and keeps dimension rules testable.
- Tailoring always reads saved profile evidence through loadSavedProfile scoped to the authenticated user; client snapshots cannot override it, and read failures stop generation rather than reuse stale data.
- Existing document refresh reads the caller's saved job and replaces both documents atomically only after both finish; exports remain unavailable during refresh to prevent stale downloads.
- Final document checks share pure helpers and run after review, followed by monetary exclusion; source restoration cannot reintroduce financial claims.
- Capability stem matching is separate from literal ATS coverage; only the explicit Go phrase disambiguation changes whole-term coverage.
- Filter every extracted keyword category and strategy term before prompts or scores; final bullet-tool checks consume candidate evidence only, never posting strategy metadata.
- Summary ranking counts posting responsibilities separately from the fixed ATS denominator, then uses held-role fit, recency and figures as tie-breakers.
- Final keyword placement (MUST tools in backed bullets, three-mention cap, project order) uses the shared pure keywordsAtWork helper after the polish pass and before monetary exclusion.
- Final CV rules (posting-graft restore, keyword-addition caps, skills tidy-up, unheld qualifications, self-referential wording) run through finalCvRules, and letter rules through finalLetterRules, after keywordsAtWork and before monetary exclusion; both are pure and idempotent because the extension re-runs its own clean-up on every preview and download.
- The "What changed" lines are computed server-side by the shared whatChanged helper with the coverage gauge's whole-term matcher and returned as plain strings; the website only renders them as text.
- LeadOcean and Flow keys live only in user_integration_keys, written by the extension under owner-only row security; the website reduces them to their last four characters on read and never adds an input, view, function response or log for them, so a full key is never exposed.
