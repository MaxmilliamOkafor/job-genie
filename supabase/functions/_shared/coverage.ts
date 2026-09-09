/**
 * Keyword coverage and revision guards, shared by the tailoring function and
 * its tests, so the tested behaviour is literally the deployed behaviour.
 */

// ============================================================
// WHOLE-TERM KEYWORD MATCHING
//
// Substring matching inflates coverage and lies about skills: "java"
// matches "javascript", "react" matches "reactive". Matching on term
// boundaries fixes that while preserving C++, C#, .NET, CI/CD and Node.js.
// ============================================================
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildTermPattern(term: string): RegExp | null {
  const t = term.trim();
  if (!t) return null;
  // Internal spaces, hyphens and slashes are interchangeable separators.
  const core = escapeRegex(t)
    .replace(/\\?\s+/g, "[\\s\\-]+")
    .replace(/\//g, "[\\/\\-]");
  const startsAlnum = /^[A-Za-z0-9]/.test(t);
  const endsAlnum = /[A-Za-z0-9]$/.test(t);
  // Trailing +, # and . are part of the term (C++, C#, .NET) and must not
  // be followed by more word characters.
  const prefix = startsAlnum ? "(?<![A-Za-z0-9+#])" : "";
  const suffix = endsAlnum ? "(?![A-Za-z0-9+#])" : "(?![A-Za-z0-9])";
  try {
    return new RegExp(prefix + core + suffix, "i");
  } catch {
    return null;
  }
}

export function termAppearsIn(text: string, term: string): boolean {
  const pattern = buildTermPattern(term);
  if (!pattern) return false;
  return pattern.test(text);
}

export interface CoverageResult {
  matched: string[];
  missing: string[];
  percent: number;
}

/** Coverage counted off real document text: matched unique terms / total unique terms. */
export function measureCoverage(text: string, terms: string[]): CoverageResult {
  // Case-insensitive de-duplication. "dbt" and "Dbt" are one requirement, and
  // counting them twice made the reported denominator disagree with the number
  // of terms actually listed as matched and missing.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of terms) {
    const t = (raw || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  const matched: string[] = [];
  const missing: string[] = [];
  for (const term of unique) {
    if (termAppearsIn(text, term)) matched.push(term);
    else missing.push(term);
  }
  return {
    matched,
    missing,
    total: unique.length,
    percent: unique.length === 0 ? 0 : Math.round((matched.length / unique.length) * 100),
  };
}


// ============================================================
// PROJECTS SECTION, REBUILT FROM THE PROFILE
//
// Names, tech stacks and URLs are copied verbatim from the saved profile
// and re-applied after every revision pass, so no rewrite can reword a
// project, drop a link or invent one.
// ============================================================
export function buildProjectsSection(projects: unknown): string {
  if (!Array.isArray(projects) || projects.length === 0) return "";
  const lines: string[] = ["PROJECTS", ""];
  for (const p of projects as any[]) {
    if (!p || typeof p !== "object") continue;
    const name = (p.name || "").toString().trim();
    if (!name) continue;
    lines.push(name);
    const techStack = Array.isArray(p.techStack)
      ? p.techStack.filter(Boolean).join(", ")
      : (p.techStack || "").toString().trim();
    if (techStack) lines.push(techStack);
    const bullets =
      Array.isArray(p.bullets) && p.bullets.filter(Boolean).length > 0
        ? p.bullets
        : [(p.description || "").toString()];
    for (const b of bullets) {
      const t = (b || "").toString().trim();
      if (t) lines.push(`• ${t}`);
    }
    const live = (p.liveUrl || "").toString().trim();
    const code = (p.codeUrl || "").toString().trim();
    if (live || code) {
      const parts: string[] = [];
      if (live) parts.push(`Live demo: ${live}`);
      if (code) parts.push(`Code: ${code}`);
      lines.push(parts.join(" | "));
    }
    lines.push("");
  }
  const out = lines.join("\n").trimEnd();
  return out === "PROJECTS" ? "" : out;
}

/** Replaces any existing projects section with the canonical block, before EDUCATION. */
export function applyProjectsSection(resumeText: string, projectsBlock: string): string {
  if (!resumeText || !projectsBlock) return resumeText;

  // Scanned line by line rather than with one regex: a case-insensitive
  // regex also made the "next heading" test case-insensitive, so removal
  // stopped at the first project name and orphaned the whole block.
  const PROJECT_HEADINGS = ["selected projects", "relevant projects", "key projects", "projects"];
  const isProjectHeading = (line: string) => PROJECT_HEADINGS.includes(line.trim().toLowerCase());
  const isSectionHeading = (line: string) => /^[A-Z][A-Z0-9 &\/\-]{2,}$/.test(line.trim());

  const kept: string[] = [];
  const lines = resumeText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!isProjectHeading(lines[i])) {
      kept.push(lines[i]);
      continue;
    }
    i++; // skip the heading, then skip its body up to the next section heading
    while (i < lines.length && !(isSectionHeading(lines[i]) && !isProjectHeading(lines[i]))) i++;
    i--;
  }

  let resume = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  const eduRegex = /^EDUCATION\b/m;
  if (eduRegex.test(resume)) {
    return resume.replace(eduRegex, projectsBlock + "\n\nEDUCATION");
  }

  return resume.trimEnd() + "\n\n" + projectsBlock + "\n";
}

// ============================================================
// REVISION FIDELITY GUARDS
//
// A revision pass exists to work an evidenced keyword into a bullet that
// is already true. It may not add an employer, move a date, invent a
// figure or quietly delete a section to make room. Every accepted
// revision is checked against the draft it came from; a revision that
// fails any check is discarded and the previous draft stands.
// ============================================================
const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

export function extractSectionHeadings(text: string): string[] {
  return (text.match(/^[A-Z][A-Z0-9 &\/\-]{3,}$/gm) || []).map((h) => h.trim());
}

export function extractDates(text: string): string[] {
  const re = new RegExp(`(?:${MONTHS})\\s+\\d{4}|\\b(?:19|20)\\d{2}\\b`, "g");
  return Array.from(new Set(text.match(re) || []));
}

/** Every number in the text, so a revision cannot introduce a new figure. */
export function extractFigures(text: string): string[] {
  const stripped = text.replace(new RegExp(`(?:${MONTHS})\\s+\\d{4}`, "g"), " ").replace(/\b(?:19|20)\d{2}\b/g, " ");
  return Array.from(new Set((stripped.match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[.,]$/, ""))));
}

export interface FidelityFailure {
  reason: string;
  detail: string;
}

/** null when the revision is faithful, otherwise the reason it was rejected. */
export function checkRevisionFidelity(before: string, after: string): FidelityFailure | null {
  if (!after || after.trim().length < 100) {
    return { reason: "too short", detail: `revision was ${after.trim().length} characters` };
  }
  if (after.trim().length < before.trim().length * 0.85) {
    return {
      reason: "content removed",
      detail: `revision lost ${before.trim().length - after.trim().length} characters`,
    };
  }

  const beforeHeadings = extractSectionHeadings(before);
  const afterHeadings = new Set(extractSectionHeadings(after));
  const missingHeadings = beforeHeadings.filter((h) => !afterHeadings.has(h));
  if (missingHeadings.length > 0) {
    return { reason: "section dropped", detail: missingHeadings.join(", ") };
  }

  const afterDates = new Set(extractDates(after));
  const beforeDates = extractDates(before);
  const lostDates = beforeDates.filter((d) => !afterDates.has(d));
  const newDates = Array.from(afterDates).filter((d) => !beforeDates.includes(d));
  if (lostDates.length > 0 || newDates.length > 0) {
    return {
      reason: "dates changed",
      detail: [lostDates.length ? `lost ${lostDates.join(", ")}` : "", newDates.length ? `added ${newDates.join(", ")}` : ""]
        .filter(Boolean)
        .join("; "),
    };
  }

  const beforeFigures = new Set(extractFigures(before));
  const inventedFigures = extractFigures(after).filter((n) => !beforeFigures.has(n));
  if (inventedFigures.length > 0) {
    return { reason: "figures invented", detail: inventedFigures.join(", ") };
  }

  return null;
}

/** The bullets that actually changed, for the report shown to the candidate. */
export function diffBullets(before: string, after: string): Array<{ before: string; after: string }> {
  const bulletsOf = (t: string) =>
    t
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[•\-\u2022]\s?/.test(l))
      .map((l) => l.replace(/^[•\-\u2022]\s?/, "").trim());
  const b = bulletsOf(before);
  const a = bulletsOf(after);
  const beforeSet = new Set(b);
  const afterSet = new Set(a);
  const changedAfter = a.filter((x) => !beforeSet.has(x));
  const changedBefore = b.filter((x) => !afterSet.has(x));
  return changedAfter.map((text, i) => ({ before: changedBefore[i] ?? "", after: text }));
}

export interface RevisionRecord {
  pass: number;
  coverageBefore: number;
  coverageAfter: number;
  targetedTerms: string[];
  accepted: boolean;
  rejectedBecause?: string;
  changedBullets: Array<{ before: string; after: string }>;
}

/**
 * The accept/reject rule for one revision pass, kept here so the tests
 * exercise exactly what the tailoring function runs.
 *
 * A revision is accepted only when it raises measured coverage AND keeps the
 * document faithful: same sections, same dates, no invented figures, nothing
 * deleted to make room. Anything else and the previous draft stands, because a
 * higher coverage number is worth nothing if the CV stopped being true.
 */
export function evaluateRevision(opts: {
  draft: string;
  revised: string;
  coverLetterDraft?: string;
  coverLetterRevised?: string;
  terms: string[];
}): { accept: boolean; reason?: string; coverageBefore: number; coverageAfter: number; changedBullets: Array<{ before: string; after: string }> } {
  const before = measureCoverage(`${opts.draft}\n${opts.coverLetterDraft ?? ""}`, opts.terms);
  const after = measureCoverage(`${opts.revised}\n${opts.coverLetterRevised ?? opts.coverLetterDraft ?? ""}`, opts.terms);

  if (!opts.revised.trim()) {
    return { accept: false, reason: "no usable text returned", coverageBefore: before.percent, coverageAfter: before.percent, changedBullets: [] };
  }

  const fidelity = checkRevisionFidelity(opts.draft, opts.revised);
  if (fidelity) {
    return {
      accept: false,
      reason: `${fidelity.reason}: ${fidelity.detail}`,
      coverageBefore: before.percent,
      coverageAfter: before.percent,
      changedBullets: [],
    };
  }

  if (after.percent <= before.percent) {
    return {
      accept: false,
      reason: "coverage did not improve",
      coverageBefore: before.percent,
      coverageAfter: before.percent,
      changedBullets: [],
    };
  }

  return {
    accept: true,
    coverageBefore: before.percent,
    coverageAfter: after.percent,
    changedBullets: diffBullets(opts.draft, opts.revised),
  };
}
