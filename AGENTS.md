# Project architecture rules

- Tailoring coverage, required-work-history reporting and revision-gap ordering use shared pure coverage helpers so tests exercise deployed logic.
- Document exports share text sanitisation and candidate-only property helpers under generate-pdf so PDF and Word output follow the same integrity rules.
- Skills placement classifies terms only; the existing profile evidence gate decides whether a term may be added.
- Cover letter export style is read with the caller's authenticated profile access and validated by pure style helpers; this prevents cross-account signatures and keeps dimension rules testable.