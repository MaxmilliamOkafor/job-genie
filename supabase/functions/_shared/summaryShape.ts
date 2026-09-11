/**
 * THE SUMMARY IS THE LINE THAT DECIDES WHETHER THE REST IS READ.
 *
 * A live run opened a CV with "Manager of Payroll Operations with a strong
 * background in ... operational excellence" above an employment block reading
 * Software Engineer, AI Product Manager, Solutions Architect, Data Analyst.
 * Two faults: a title never held (a parser reads the opener as a claim about
 * the person) and nothing checkable (no scope, no figure, no outcome).
 *
 * This module holds one shape and enforces it:
 *
 *   <held job title> working across <2-3 posting requirements the EXPERIENCE
 *   section evidences>. <strongest outcome with its figure>; <second outcome
 *   with its figure>.
 *
 * It decides nothing about facts: titles come from the employment history,
 * scope terms from the posting's own wording where an experience bullet
 * evidences them, figures verbatim from the bullets. Never a title not held,
 * never an employer, place name, total years, self-describing adjective,
 * self-rating or first person.
 */

export interface SummaryContext {
  /** Titles the employment history actually contains, most relevant first is not required. */
  heldTitles: string[];
  /** Current role title, used when the posting shares no distinctive title words. */
  currentTitle?: string;
  /** The posting's title - used only to pick the closest HELD title, never emitted. */
  targetTitle: string;
  /** Requirement phrases in the posting's own wording. */
  requirements: string[];
  /** Bullet lines from PROFESSIONAL EXPERIENCE (leading "- " optional). */
  experienceBullets: string[];
  /** Original profile bullets, preferred for outcome prose and verbatim figures. */
  outcomeBullets?: string[];
  /** Employer names, so they can never appear. */
  employers?: string[];
  /** Place names (city, country, role locations), so they can never appear. */
  places?: string[];
}

export const MIN_LEN = 150;
export const MAX_LEN = 220;

/** Adjectives describing the person, self-ratings and stock filler. */
const BANNED_PHRASES = [
  "accomplished",
  "seasoned",
  "passionate",
  "dynamic",
  "results-driven",
  "results driven",
  "highly motivated",
  "proven track record",
  "track record",
  "strong background",
  "solid background",
  "extensive background",
  "operational excellence",
  "detail-oriented",
  "detail oriented",
  "self-starter",
  "team player",
  "hard-working",
  "hardworking",
  "meticulous",
  "expert",
  "world-class",
  "world class",
  "exceptional",
  "best-in-class",
  "highly skilled",
  "strong communicator",
  "strong experience",
  "excellent",
  "seeking",
  "looking for",
  "open to opportunities",
];

const FIRST_PERSON = /\b(i|i'm|i've|my|me|mine|we|our|us)\b/i;
const YEARS_OF_EXPERIENCE =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\+?\s*(\+)?\s*years?\b(?![^.]*\bfrom\b)/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (haystack: string, needle: string) =>
  new RegExp(`(^|[^a-z0-9+#./])${escapeRe(needle.toLowerCase())}([^a-z0-9+#./]|$)`, "i").test(haystack.toLowerCase());

const stripBullet = (line: string) => line.replace(/^\s*[-•*]\s*/, "").trim();

/* ------------------------------------------------------------------ *
 * Held title selection
 * ------------------------------------------------------------------ */

const RANK_WORDS = new Set([
  "manager", "senior", "sr", "lead", "principal", "director", "officer",
  "analyst", "engineer", "coordinator", "junior", "jr", "staff", "head", "chief",
]);

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["and", "the", "for", "of", "with"].includes(t) && !RANK_WORDS.has(t));

/** The held title closest to the posting's title. Never the posting's own title. */
export function pickHeldTitle(heldTitles: string[], targetTitle: string, currentTitle?: string): string {
  const held = heldTitles.map((t) => (t || "").trim()).filter(Boolean);
  if (!held.length) return "";
  const current = (currentTitle || "").trim();
  const target = new Set(tokens(targetTitle || ""));
  let best = current && held.some((title) => title.toLowerCase() === current.toLowerCase()) ? current : held[0];
  let bestScore = 0;
  for (const title of held) {
    const overlap = tokens(title).filter((t) => target.has(t)).length;
    // Ties resolve to the earliest listed title (most recent role first in profile).
    if (overlap > bestScore) {
      bestScore = overlap;
      best = title;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Scope clause
 * ------------------------------------------------------------------ */

/**
 * Requirements the EXPERIENCE bullets evidence, in the posting's wording.
 * A term that lives only in the skills section is a word on a page, so only
 * bullet text counts here.
 */
export function evidencedRequirements(requirements: string[], experienceBullets: string[], limit = 3): string[] {
  const body = experienceBullets.map(stripBullet).join("\n").toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of requirements) {
    const term = (raw || "").trim();
    // Under three letters a "term" is a verb or abbreviation (go, do), not a scope.
    if (!term || term.length < 3 || term.length > 40) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    if (!hasWord(body, term)) continue;
    seen.add(key);
    out.push(term.length > 3 && term === term.toUpperCase() ? term : term.toLowerCase());
    if (out.length >= limit) break;
  }
  return out;
}

const joinScope = (terms: string[]) =>
  terms.length <= 1 ? terms.join("") : `${terms.slice(0, -1).join(", ")} and ${terms[terms.length - 1]}`;

/* ------------------------------------------------------------------ *
 * Outcomes
 * ------------------------------------------------------------------ */

const BEFORE_AFTER = /\bfrom\s+[^,;.]*?\d[^,;.]*?\bto\b[^,;.]*/i;
const BEFORE_AFTER_WORDS =
  /\bfrom\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty)\b[^,;.]*?\bto\b[^,;.]*/i;
const MAGNITUDE = /(?:[$£€]\s?\d|\b(?:GBP|EUR|USD)\s?\d|\d+(?:\.\d+)?\s?(?:bn|billion|m\b|million|k\b|thousand|tb|pb))/i;
const PERCENT = /\d+(?:\.\d+)?\s?%|\bper\s?cent\b/i;
const COUNT = /\b\d[\d,]*\b/;

export type OutcomeRank = 0 | 1 | 2 | 3 | 4;

/** 4 = before/after, 3 = magnitude, 2 = percentage, 1 = plain count, 0 = no figure. */
export function rankOutcome(line: string): OutcomeRank {
  const s = stripBullet(line);
  if (BEFORE_AFTER.test(s) || BEFORE_AFTER_WORDS.test(s)) return 4;
  if (MAGNITUDE.test(s)) return 3;
  if (PERCENT.test(s)) return 2;
  if (COUNT.test(s)) return 1;
  return 0;
}

/** Shortest clause of the bullet that still carries its figure, words unchanged. */
export function outcomeClause(line: string): string {
  const s = stripBullet(line).replace(/[.;]+\s*$/, "");
  const figure = (t: string) => rankOutcome(t) > 0;
  // Prefer the sentence/segment holding the figure, never splitting a decimal.
  const segments = s.split(/(?<!\d)[.;](?!\d)\s+/).map((seg) => seg.trim()).filter(Boolean);
  const withFigure = segments.find(figure) || s;
  let clause = withFigure;
  if (clause.length > 110) {
    const commaParts = clause.split(/,\s+/);
    for (let i = commaParts.length; i > 0; i--) {
      const candidate = commaParts.slice(0, i).join(", ");
      if (figure(candidate) && candidate.length <= 110) {
        clause = candidate;
        break;
      }
    }
  }
  return clause.trim();
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string) => (/^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s);

const ACTION_OPENING = /^(?:achieved|automated|built|created|cut|delivered|designed|developed|directed|drove|enabled|established|generated|implemented|improved|increased|launched|led|managed|migrated|optimised|reduced|replaced|resolved|scaled|streamlined|transformed|saved|supported|owned|rebuilt|re-engineered|processed|maintained|deployed|introduced)\b/i;
const FRAGMENT_OPENING = /^[^,.;]{2,50},\s+(?:cutting|reducing|increasing|improving|replacing|saving|delivering|supporting|processing)\b/i;

/** Outcome prose must open with a finite action verb, never a noun-plus-participle fragment. */
export function isGrammaticalOutcome(clause: string): boolean {
  const text = stripBullet(clause);
  return ACTION_OPENING.test(text) && !FRAGMENT_OPENING.test(text);
}

/** Trims a clause at its own comma boundaries, never dropping the figure. */
export function shortenClause(clause: string, maxLen: number): string {
  let text = clause.trim();
  if (text.length <= maxLen) return text;
  // An explanatory tail states why the change mattered; the figure states what
  // changed. When the clause is over budget the tail goes first, and only if the
  // figure survives without it.
  const tail = text.search(/\s+(so that|so the|so it|rather than|which meant|in order to|allowing|enabling|meaning)\s+/i);
  if (tail > 20) {
    const trimmed = text.slice(0, tail).replace(/[,;:\-]+$/, "").trim();
    if (rankOutcome(trimmed) > 0) text = trimmed;
  }
  if (text.length <= maxLen) return text;
  const parts = text.split(/,\s+/);
  // Prefer the longest leading run that keeps the figure.
  for (let i = parts.length - 1; i > 0; i--) {
    const candidate = parts.slice(0, i).join(", ");
    if (rankOutcome(candidate) > 0 && candidate.length <= maxLen) return candidate;
  }
  // The figure may sit after a long lead-in ("Rebuilt the ... pipeline ...,
  // reducing the run from six hours to under one"), so no prefix fits. Fall
  // back to the longest comma-window, at any position, that carries it.
  for (let len = parts.length; len > 0; len--) {
    for (let start = 0; start + len <= parts.length; start++) {
      const candidate = parts.slice(start, start + len).join(", ");
      if (rankOutcome(candidate) > 0 && candidate.length <= maxLen) {
        // Budget left over and the window starts mid-clause: reclaim the tail
        // of the lead-in, word by word, so context is not needlessly dropped.
        let best = candidate;
        if (start > 0) {
          const leadWords = parts[start - 1].split(/\s+/);
          for (let k = 1; k <= leadWords.length; k++) {
            const wider = `${leadWords.slice(-k).join(" ")}, ${candidate}`;
            if (wider.length <= maxLen) best = wider;
            else break;
          }
          // A fragment opening on a conjunction or preposition reads as an editing error.
          best = best.replace(/^(and|the|a|an|of|to|for|behind|across|through|with|over|under|before|after|into|on|in|at|by)\s+/i, "");
        }
        return best;
      }
    }
  }
  // No comma boundary fits. Trim trailing words AFTER the figure, so every
  // figure survives verbatim and only the explanatory tail goes. A trim that
  // would leave a dangling conjunction or preposition ("Power BI and") is
  // rejected rather than shipped.
  const DANGLING = /\s+(and|or|with|to|the|a|an|of|for|in|on|at|by|from|so|that|than|into|as|before|after|using|across|through)$/i;
  const words = text.split(/\s+/);
  for (let end = words.length - 1; end > 3; end--) {
    let candidate = words.slice(0, end).join(" ").replace(/[,;:\-]+$/, "");
    while (DANGLING.test(candidate)) candidate = candidate.replace(DANGLING, "");
    if (candidate.length > maxLen) continue;
    if (rankOutcome(candidate) > 0 && candidate.length > 12) return candidate;
  }

  // The figure sits behind a long lead-in with no comma to cut at. Start the
  // clause at the verb that carries the change ("cutting the overnight run from
  // six hours to under one") - readable, and every figure intact.
  // Nearest participle to the figure first: an earlier one is usually a noun
  // ("impression reporting reducing...") and reads as an editing error.
  for (let start = words.length - 3; start >= 1; start--) {
    const first = words[start].toLowerCase().replace(/[^a-z]/g, "");
    if (!/(ing|ed)$/.test(first) || first.length < 4) continue;
    for (let end = words.length; end > start + 2; end--) {
      let candidate = words.slice(start, end).join(" ").replace(/[,;:\-]+$/, "");
      while (DANGLING.test(candidate)) candidate = candidate.replace(DANGLING, "");
      if (candidate.length > maxLen) continue;
      if (rankOutcome(candidate) > 0 && candidate.length > 12) return candidate;
    }
  }

  // Nothing legible fits: keep the figure and the full clause. A figure is never
  // dropped or cut to make a sentence shorter.
  return text;
}


/** The two strongest quantified bullets, highest rank first, no repeats. */
export function pickOutcomes(experienceBullets: string[]): string[] {
  const scored = experienceBullets
    .map((line, index) => ({ clause: outcomeClause(line), rank: rankOutcome(line), index }))
    .filter((c) => c.rank > 0 && c.clause.length > 12 && isGrammaticalOutcome(c.clause))
    .sort((a, b) => (b.rank - a.rank) || (a.index - b.index));
  const out: string[] = [];
  for (const candidate of scored) {
    if (out.some((o) => o.toLowerCase() === candidate.clause.toLowerCase())) continue;
    out.push(candidate.clause);
    if (out.length === 2) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export function findViolations(summary: string, ctx: SummaryContext): string[] {
  const text = (summary || "").trim();
  const problems: string[] = [];
  if (!text) return ["empty"];

  if (text.length > MAX_LEN) problems.push(`over ${MAX_LEN} characters`);
  if (text.length < MIN_LEN) problems.push(`under ${MIN_LEN} characters`);
  if (FIRST_PERSON.test(text)) problems.push("first person");
  if (YEARS_OF_EXPERIENCE.test(text)) problems.push("total years of experience");

  for (const phrase of BANNED_PHRASES) {
    if (hasWord(text, phrase)) problems.push(`banned phrase: ${phrase}`);
  }
  for (const employer of ctx.employers || []) {
    if (employer && employer.length > 2 && hasWord(text, employer)) problems.push(`employer name: ${employer}`);
  }
  for (const place of ctx.places || []) {
    if (place && place.length > 2 && hasWord(text, place)) problems.push(`place name: ${place}`);
  }

  // The opener must be a title the history contains, never the posting's title.
  const opener = text.split(/[.,;]/)[0] || "";
  const held = ctx.heldTitles.filter(Boolean);
  const openerHasHeldTitle = held.some((t) => new RegExp(`^\\s*${escapeRe(t)}(?:\\b|$)`, "i").test(opener));
  if (!openerHasHeldTitle) problems.push("opener is not a held job title");
  if (
    ctx.targetTitle &&
    !held.some((t) => t.toLowerCase() === ctx.targetTitle.trim().toLowerCase()) &&
    hasWord(opener, ctx.targetTitle)
  ) {
    problems.push("opener claims the posting's title");
  }

  // Two outcomes joined with a semicolon, both carrying a figure.
  const sentences = text.split(/(?<!\d)\.(?!\d)/).map((s) => s.trim()).filter(Boolean);
  const outcomeSentence = sentences[sentences.length - 1] || "";
  if (!outcomeSentence.includes(";")) problems.push("outcomes not joined with a semicolon");
  const halves = outcomeSentence.split(";").map((h) => h.trim()).filter(Boolean);
  if (halves.length < 2 || halves.some((h) => rankOutcome(h) === 0)) problems.push("fewer than two figures");
  if (halves.some((h) => !isGrammaticalOutcome(h))) problems.push("ungrammatical outcome clause");
  if (sentences.length > 2) problems.push("more than two sentences");

  return problems;
}

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

/** Builds the required shape from the profile and posting. Empty when no figure exists. */
export function buildSummary(ctx: SummaryContext): string {
  const title = pickHeldTitle(ctx.heldTitles, ctx.targetTitle, ctx.currentTitle);
  const outcomes = pickOutcomes(ctx.outcomeBullets?.length ? ctx.outcomeBullets : ctx.experienceBullets);
  if (!title || outcomes.length === 0) return "";

  const scopeTerms = evidencedRequirements(ctx.requirements, ctx.experienceBullets, 3);

  const assemble = (terms: string[], clauseBudget: number) => {
    const shortened = outcomes.map((c) => shortenClause(c, clauseBudget));
    const outcomeSentence =
      shortened.length >= 2 ? `${upperFirst(shortened[0])}; ${lowerFirst(shortened[1])}.` : `${upperFirst(shortened[0])}.`;
    const lead = terms.length >= 2 ? `${title} working across ${joinScope(terms)}.` : `${title}.`;
    return `${lead} ${outcomeSentence}`.replace(/\s+/g, " ").trim();
  };

  // Trim in this order and never touch a figure: the third scope term, then the
  // outcome clauses at their own comma boundaries, then the scope clause.
  const attempts: string[] = [
    assemble(scopeTerms, 110),
    assemble(scopeTerms.slice(0, 2), 110),
    assemble(scopeTerms.slice(0, 2), 85),
    assemble(scopeTerms.slice(0, 2), 65),
    assemble([], 110),
    assemble([], 85),
    assemble([], 65),
  ];
  const fits = attempts.find((t) => t.length >= MIN_LEN && t.length <= MAX_LEN);
  if (fits) return fits;
  const underMax = attempts.filter((t) => t.length <= MAX_LEN);
  if (underMax.length) return underMax.sort((a, b) => b.length - a.length)[0];
  return attempts[attempts.length - 1];
}


/**
 * Returns the summary to use: the model's own when it satisfies the shape,
 * otherwise the deterministic rebuild. Falls back to the model's text only
 * when no rebuild is possible (no held title or no figure on the page).
 */
export function enforceSummaryShape(
  summary: string,
  ctx: SummaryContext,
): { summary: string; rebuilt: boolean; violations: string[] } {
  const violations = findViolations(summary, ctx);
  if (violations.length === 0) return { summary: (summary || "").trim(), rebuilt: false, violations };
  const rebuilt = buildSummary(ctx);
  if (!rebuilt) return { summary: (summary || "").trim(), rebuilt: false, violations };
  return { summary: rebuilt, rebuilt: true, violations };
}
