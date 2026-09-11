# Enforce CV output contracts

## Changes
- Strengthen summary construction so title matching ignores generic rank words, falls back to the current role, and only emits grammatical role-led, evidence-backed sentences.
- Keep education dates in profile data but remove all education years and date ranges from tailored CV text and generated CV documents.
- Add a final education safeguard: when saved education exists but the generated CV omits it, log the failure and restore an `EDUCATION` section from the profile.
- Preserve the existing safe skill-array workflow: merge extension additions before profile saves and display skills newest first with removal controls.
- Exclude benefits, logistics, boilerplate, years-of-experience criteria, and generic degree requirements from extracted keywords; retain genuine technical and management requirements and collapse duplicates to 12–20 canonical terms.
- Normalise `TECHNICAL SKILLS` into unique labelled groups, capped at ten entries per line, without flattening the section.
- Backfill the supplied Imperial and Derby study dates, preserving the current Derby degree field until its title is supplied.

## Validation
- Add focused tests for title matching, grammatical summary clauses, education restoration/date removal, screening-criteria filtering, and grouped-skill caps.
- Run the relevant automated checks, deploy the changed functions, and verify the stored education rows.

## Technical details
- No schema changes.
- `professionalSummary` remains a separate response field and `summaryShape` continues to report the emitted summary and rebuild decision.
- Employment dates remain unchanged.
