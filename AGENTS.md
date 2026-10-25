# Project architecture rules

- Tailoring coverage, required-work-history reporting and revision-gap ordering use shared pure coverage helpers so tests exercise deployed logic.
- CV plain-wording clean-up uses a pure helper in tailoring guards before letter generation and after review edits so tests exercise the exported wording.
- Document exports share text sanitisation and candidate-only property helpers under generate-pdf so PDF and Word output follow the same integrity rules.
- Monetary exclusion uses one shared pure helper at the final tailoring gate and before every export input path so restored evidence and older drafts cannot bypass it.
- Skills placement classifies terms only; the existing profile evidence gate decides whether a term may be added.
- Cover letter export style is read with the caller's authenticated profile access and validated by pure style helpers; this prevents cross-account signatures and keeps dimension rules testable.
- Tailoring always reads saved profile evidence through loadSavedProfile scoped to the authenticated user; client snapshots cannot override it, and read failures stop generation rather than reuse stale data.
- Existing document refresh reads the caller's saved job and replaces both documents atomically only after both finish; exports remain unavailable during refresh to prevent stale downloads.