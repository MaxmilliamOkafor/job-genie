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
  /** The posting's title - used only to pick the closest HELD title, never emitted. */
  targetTitle: string;
  /** Requirement phrases in the posting's own wording. */
  requirements: string[];
  /** Bullet lines from PROFESSIONAL EXPERIENCE (leading "- " optional). */
  experienceBullets: string[];
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

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["and", "the", "for", "of", "with"].includes(t));

/** The held title closest to the posting's title. Never the posting's own title. */
export function pickHeldTitle(heldTitles: string[], targetTitle: string): string {
  const held = heldTitles.map((t) => (t || "").trim()).filter(Boolean);
  if (!held.length) return "";
  const target = new Set(tokens(targetTitle || ""));
  let best = held[0];
  let bestScore = -1;
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
    if (!term || term.length > 40) continue;
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

/** The two strongest quantified bullets, highest rank first, no repeats. */
export function pickOutcomes(experienceBullets: string[]): string[] {
  const scored = experienceBullets
    .map((line, index) => ({ clause: outcomeClause(line), rank: rankOutcome(line), index }))
    .filter((c) => c.rank > 0 && c.clause.length > 12)
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
  const openerHasHeldTitle = held.some((t) => hasWord(opener, t));
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
  if (sentences.length > 2) problems.push("more than two sentences");

  return problems;
}

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

/** Builds the required shape from the profile and posting. Empty when no figure exists. */
export function buildSummary(ctx: SummaryContext): string {
  const title = pickHeldTitle(ctx.heldTitles, ctx.targetTitle);
  const outcomes = pickOutcomes(ctx.experienceBullets);
  if (!title || outcomes.length === 0) return "";

  const scopeTerms = evidencedRequirements(ctx.requirements, ctx.experienceBullets, 3);
  const outcomeSentence =
    outcomes.length >= 2
      ? `${outcomes[0]}; ${lowerFirst(outcomes[1])}.`
      : `${outcomes[0]}.`;

  const assemble = (terms: string[]) => {
    const lead = terms.length >= 2 ? `${title} working across ${joinScope(terms)}.` : `${title}.`;
    return `${lead} ${outcomeSentence}`.replace(/\s+/g, " ").trim();
  };

  let text = assemble(scopeTerms);
  // Trim by the rules: third scope term first, then the scope clause, never a figure.
  if (text.length > MAX_LEN && scopeTerms.length === 3) text = assemble(scopeTerms.slice(0, 2));
  if (text.length > MAX_LEN) text = assemble([]);
  return text;
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
