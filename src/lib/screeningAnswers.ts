/**
 * Reusable screening-answer memory.
 *
 * One store, shared by the website and the extension. It keeps the employer's
 * exact question, the answer labels the candidate actually selected, the field
 * type it came from, the country/employer the answer applies to, and the moment
 * the candidate confirmed it.
 *
 * Nothing here infers an answer. An unmatched question stays unanswered, a
 * differently worded question is only ever suggested, and consent, declarations
 * and legal attestations always require fresh confirmation.
 */

export type ScreeningFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'custom-select'
  | 'radio'
  | 'checkbox'
  | 'multi-checkbox';

export interface ScreeningAnswer {
  /** Exact question text as the employer writes it. */
  question: string;
  /** Human-readable answer. For choices this is the selected option label(s). */
  answer: string;
  /** Selected option labels, for dropdowns, radios and checkboxes. */
  optionLabels?: string[];
  /**
   * Every option the employer offered for this question. Kept so the
   * extension can tell whether a saved answer is still one of the choices on
   * a form, rather than typing it into a list that no longer contains it.
   */
  availableOptions?: string[];
  fieldType?: ScreeningFieldType;
  /** Country or employer this answer applies to. Empty means every application. */
  scope?: string;
  /** ISO timestamp of the candidate's confirmation. */
  confirmed_at?: string;
  /** Set when the candidate wants to be asked again (changed circumstances). */
  review_after?: string;
  /** How many times autofill reused it. */
  used_count?: number;
  source?: 'website' | 'extension';
}

/** A question the extension saw the candidate answer by hand. */
export interface PendingScreeningAnswer extends ScreeningAnswer {
  seen_at?: string;
  employer?: string;
  url?: string;
}

export const GLOBAL_SCOPE = 'Any employer';

/* ------------------------------------------------------------------ text ---*/

const PUNCTUATION = /[\u2018\u2019\u201c\u201d"'`()[\]{}.,;:!?*_/\\]+/g;

/** Lowercase, strip punctuation and collapse whitespace. Keeps + and #. */
export function normaliseQuestion(raw: string): string {
  return (raw ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(PUNCTUATION, ' ')
    .replace(/\s*-\s*/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\*+\s*/, '')
    .replace(/\s*\brequired\b$/, '')
    .trim();
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'do', 'does', 'did', 'you', 'your', 'are', 'is', 'was', 'be',
  'been', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'to', 'of', 'in',
  'on', 'at', 'for', 'and', 'or', 'this', 'that', 'we', 'us', 'please', 'select',
  'any', 'if', 'it', 'as', 'with', 'from', 'currently', 'now',
]);

function tokens(question: string): string[] {
  return normaliseQuestion(question)
    .split(' ')
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

/* -------------------------------------------------------------- polarity ---*/

/**
 * Phrases that flip the meaning of an otherwise identical question.
 * "Do you need sponsorship?" and "Can you work without sponsorship?" ask the
 * same topic with opposite polarity, so one answer must never fill the other.
 */
const NEGATIVE_MARKERS = [
  'without',
  'not require',
  'not need',
  "don't require",
  "don't need",
  'do not require',
  'do not need',
  'no need',
  'unable',
  'never',
  'no longer',
  'other than',
  'free from',
  'independent of',
];

const POSITIVE_MARKERS = ['require', 'need', 'request', 'sponsorship required'];

export type Polarity = 'affirmative' | 'negative';

export function questionPolarity(question: string): Polarity {
  const n = normaliseQuestion(question);
  const negatives = NEGATIVE_MARKERS.filter((m) => n.includes(normaliseQuestion(m))).length;
  return negatives % 2 === 1 ? 'negative' : 'affirmative';
}

/** Two questions on the same topic asked with opposite polarity. */
export function areOpposites(a: string, b: string): boolean {
  if (questionPolarity(a) === questionPolarity(b)) return false;
  return topicOverlap(a, b) >= 0.5;
}

function topicOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a).filter((t) => !isPolarityToken(t)));
  const tb = new Set(tokens(b).filter((t) => !isPolarityToken(t)));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared += 1;
  });
  return shared / Math.min(ta.size, tb.size);
}

const POLARITY_TOKENS = new Set(['without', 'require', 'need', 'requires', 'needs', 'no', 'not']);
function isPolarityToken(t: string): boolean {
  return POLARITY_TOKENS.has(t);
}

/* --------------------------------------------------------------- matching --*/

export type MatchKind = 'exact' | 'suggestion' | 'none';

export interface MatchResult {
  kind: MatchKind;
  answer?: ScreeningAnswer;
  /** 0-1 similarity for suggestions. */
  confidence: number;
  /** Why the candidate must confirm before this is used. */
  needsConfirmation: boolean;
  reason?: string;
}

export function scopeApplies(answer: ScreeningAnswer, scope?: string): boolean {
  const stored = (answer.scope ?? '').trim().toLowerCase();
  if (!stored || stored === GLOBAL_SCOPE.toLowerCase()) return true;
  const asked = (scope ?? '').trim().toLowerCase();
  if (!asked) return false;
  return asked.includes(stored) || stored.includes(asked);
}

/** Jaccard similarity over meaningful tokens. */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared += 1;
  });
  const union = new Set([...ta, ...tb]).size;
  return shared / union;
}

export const SUGGESTION_THRESHOLD = 0.6;

/**
 * Resolve one asked question against the memory.
 * Exact (normalised) text inside scope reuses the answer automatically, unless
 * it is sensitive or stale. Anything else is at most a suggestion.
 */
export function matchAnswer(
  question: string,
  answers: ScreeningAnswer[],
  opts: { scope?: string; now?: Date } = {}
): MatchResult {
  const now = opts.now ?? new Date();
  const askedKey = normaliseQuestion(question);
  const inScope = answers.filter((a) => scopeApplies(a, opts.scope));

  const exact = inScope.find((a) => normaliseQuestion(a.question) === askedKey);
  if (exact) {
    const gate = confirmationGate(exact, now);
    return {
      kind: 'exact',
      answer: exact,
      confidence: 1,
      needsConfirmation: gate !== null,
      reason: gate ?? undefined,
    };
  }

  let best: ScreeningAnswer | undefined;
  let bestScore = 0;
  for (const a of inScope) {
    if (areOpposites(a.question, question)) continue;
    const score = similarity(a.question, question);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }

  if (best && bestScore >= SUGGESTION_THRESHOLD) {
    return {
      kind: 'suggestion',
      answer: best,
      confidence: Number(bestScore.toFixed(2)),
      needsConfirmation: true,
      reason: confirmationGate(best, now) ?? 'Worded differently to the saved question',
    };
  }

  return { kind: 'none', confidence: 0, needsConfirmation: true, reason: 'No saved answer' };
}

/* ------------------------------------------------- sensitive / stale rules --*/

const SENSITIVE_PATTERNS = [
  /\bconsent\b/,
  /\bi (certify|declare|confirm|acknowledge|agree)\b/,
  /\bdeclaration\b/,
  /\battest/,
  /\bunder penalty\b/,
  /\bterms and conditions\b/,
  /\bprivacy (policy|notice)\b/,
  /\bbackground check\b/,
  /\bdrug (test|screen)/,
  /\b(authorise|authorize)\b.*\b(check|verify)\b/,
  /\b(truthful|accurate and complete)\b/,
  /\bsignature\b/,
  /\bgdpr\b/,
];

/** Consent, declarations and legal attestations are never reused silently. */
export function isSensitive(question: string): boolean {
  const n = normaliseQuestion(question);
  return SENSITIVE_PATTERNS.some((p) => p.test(n));
}

/** Answers that go out of date on their own, with how long they stay good. */
const TIME_SENSITIVE: Array<{ test: RegExp; days: number; label: string }> = [
  { test: /notice period/, days: 120, label: 'Notice period' },
  { test: /(current|expected|desired) (salary|compensation)|salary expectation/, days: 180, label: 'Salary' },
  { test: /(start date|available to start|availability|when can you start)/, days: 60, label: 'Availability' },
  { test: /(visa|permit|right to work|work authorisation|work authorization|sponsorship)/, days: 365, label: 'Right to work' },
  { test: /(currently employed|current employer|current role|notice)/, days: 180, label: 'Employment status' },
  { test: /(years of experience|how many years)/, days: 365, label: 'Years of experience' },
];

export function timeSensitivity(question: string): { days: number; label: string } | null {
  const n = normaliseQuestion(question);
  const hit = TIME_SENSITIVE.find((t) => t.test.test(n));
  return hit ? { days: hit.days, label: hit.label } : null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Returns a reason string when the candidate must confirm again, or null when
 * the answer can be reused as-is.
 */
export function confirmationGate(answer: ScreeningAnswer, now: Date = new Date()): string | null {
  if (isSensitive(answer.question)) {
    return 'Consent or legal declaration - confirm on every application';
  }
  if (answer.review_after && new Date(answer.review_after) <= now) {
    return 'You asked to review this answer';
  }
  const ts = timeSensitivity(answer.question);
  if (ts && answer.confirmed_at) {
    const age = daysBetween(now, new Date(answer.confirmed_at));
    if (age >= ts.days) return `${ts.label} confirmed ${age} days ago - check it still holds`;
  }
  if (!answer.confirmed_at) return 'Not confirmed yet';
  return null;
}

export function isStale(answer: ScreeningAnswer, now: Date = new Date()): boolean {
  return confirmationGate(answer, now) !== null;
}

/* --------------------------------------------------------- sync contract ---*/

export interface ScreeningMemoryPayload {
  /** Extension contract: exact question -> answer string. Reusable answers only. */
  application_answers: Record<string, string>;
  /** Full records, so the extension can honour scope, type and confirmation. */
  screening_answers: ScreeningAnswer[];
  /** Questions the extension must always re-ask. */
  always_confirm_questions: string[];
}

export function buildMemoryPayload(
  answers: ScreeningAnswer[],
  now: Date = new Date()
): ScreeningMemoryPayload {
  const usable = answers.filter((a) => a.question.trim() && a.answer.trim());
  return {
    application_answers: Object.fromEntries(
      usable.filter((a) => !isStale(a, now)).map((a) => [a.question, a.answer])
    ),
    screening_answers: usable,
    always_confirm_questions: usable
      .filter((a) => isStale(a, now))
      .map((a) => a.question),
  };
}

/** Merge without ever losing an existing entry; newer confirmation wins. */
export function mergeAnswers(
  existing: ScreeningAnswer[],
  incoming: ScreeningAnswer[]
): ScreeningAnswer[] {
  const out = [...existing];
  for (const next of incoming) {
    const key = `${normaliseQuestion(next.question)}::${(next.scope ?? '').toLowerCase()}`;
    const i = out.findIndex(
      (a) => `${normaliseQuestion(a.question)}::${(a.scope ?? '').toLowerCase()}` === key
    );
    if (i === -1) {
      out.push(next);
      continue;
    }
    const older = out[i];
    const newer =
      !older.confirmed_at ||
      (next.confirmed_at && new Date(next.confirmed_at) > new Date(older.confirmed_at));
    out[i] = newer ? { ...older, ...next } : { ...next, ...older };
  }
  return out;
}

/** Answer text shown for a choice field, from the selected option labels. */
export function answerFromOptions(labels: string[]): string {
  return labels.map((l) => l.trim()).filter(Boolean).join(', ');
}

/**
 * Verify a committed selection: what the form reports after the interaction
 * must equal what we intended, otherwise the fill did not stick.
 */
export function selectionCommitted(intended: string[], committed: string[]): boolean {
  const norm = (v: string[]) => v.map((s) => s.trim().toLowerCase()).sort().join('|');
  return intended.length > 0 && norm(intended) === norm(committed);
}

export const FIELD_TYPE_LABELS: Record<ScreeningFieldType, string> = {
  text: 'Text box',
  textarea: 'Long answer',
  select: 'Dropdown',
  'custom-select': 'Custom dropdown',
  radio: 'Radio buttons',
  checkbox: 'Checkbox',
  'multi-checkbox': 'Multiple checkboxes',
};
