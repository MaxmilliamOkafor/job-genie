// ============================================================
// THE LETTER IS THE PAGE THAT SAYS SOMETHING THE CV DOES NOT.
//
// Measured on real output, two paragraphs shared 61% and 41% of their content
// words with CV bullets. A reviewer holds both documents, so a restated bullet
// spends the only page that can add anything on repetition. This module drops
// restating sentences outright and reports what was measured, so a paragraph
// that merely re-tells an achievement cannot survive to the PDF.
//
// It also decides the line under the candidate's name. That line is a JOB
// TITLE. Real output printed the employer's name there, twice.
// ============================================================

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by", "for", "with",
  "from", "into", "over", "under", "as", "is", "are", "was", "were", "be", "been", "being", "it",
  "its", "this", "that", "these", "those", "i", "my", "me", "we", "our", "us", "you", "your",
  "they", "their", "them", "he", "she", "his", "her", "which", "who", "whom", "whose", "what",
  "when", "where", "while", "than", "then", "so", "such", "not", "no", "nor", "all", "any", "both",
  "each", "more", "most", "other", "some", "only", "own", "same", "too", "very", "can", "will",
  "would", "should", "could", "have", "has", "had", "do", "does", "did", "there", "here", "also",
  "across", "within", "after", "before", "during", "through", "about", "up", "out", "down", "off",
]);

/** Lowercase content words: punctuation stripped, stopwords and one/two letter noise dropped. */
export function contentWords(text: string): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9%£$#+./&\s-]/g, " ")
    .split(/[\s,;:()"']+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Share of `sentence`'s content words that also appear in `bullet`. 0 when either is empty. */
export function overlapRatio(sentence: string, bullet: string): number {
  const a = contentWords(sentence);
  if (!a.length) return 0;
  const b = new Set(contentWords(bullet));
  if (!b.size) return 0;
  const shared = new Set(a.filter((w) => b.has(w)));
  return shared.size / new Set(a).size;
}

const MASK = "\u0001";

function splitSentences(paragraph: string): string[] {
  const masked = paragraph
    .replace(/(\d)\.(?=\d)/g, `$1${MASK}`)
    .replace(/\b([A-Z])\.(?=[A-Z]\.)/g, `$1${MASK}`);
  const parts = masked.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!parts) return [paragraph];
  return parts.map((s) => s.replaceAll(MASK, ".").trim()).filter(Boolean);
}

/** Salutation, Re: line, signature and contact block are structure, not prose. */
export function isStructuralParagraph(paragraph: string): boolean {
  const p = paragraph.trim();
  return /^(dear|re:|sincerely|date:|kind regards|yours|best regards)/i.test(p) || /[@|]/.test(p);
}

const FIGURE = /(\d+(?:[.,]\d+)?\s*(?:%|percent|k|m|bn|months?|weeks?|days?|years?|hours?)|[£$€]\s?\d)/i;

/** A sentence that recounts something already done, rather than claiming something forward-looking. */
export function looksLikePastExample(sentence: string, bullets: string[]): boolean {
  const hasFigure = FIGURE.test(sentence);
  const echoes = bullets.some((b) => overlapRatio(sentence, b) >= 0.2);
  return echoes || (hasFigure && /\b(?:delivered|led|built|migrated|architected|reduced|cut|owned|ran|managed|shipped|rolled out|automated|scaled|launched|implemented|designed)\b/i.test(sentence));
}

export interface CoverLetterOriginality {
  text: string;
  removedSentences: string[];
  /** Highest single-sentence overlap with a CV bullet that survived, 0-1. */
  maxSentenceOverlap: number;
  /** Paragraph-level overlap with the CV, measured after removal, 0-1. */
  paragraphOverlaps: number[];
  /**
   * Paragraphs where EVERY sentence restated a bullet. The least-restating one
   * is kept so the paragraph still exists, and the paragraph is reported here as
   * one the writing model should redo: a letter reached a real employer at 85
   * words, opening "Additionally, I mentored two junior engineers" with nothing
   * in front of it, because each individual removal was correct and the hole was
   * invisible to the loop that made it.
   */
  emptiedParagraphs: string[];
}

const LEADING_CONNECTIVE = /^(additionally|furthermore|moreover|in addition|also|secondly|similarly|likewise)\b[\s,:-]*/i;

/**
 * A connective at the start of the FIRST body paragraph points back at something
 * that is not there. A connective in a later paragraph refers to the paragraph
 * above it, which is ordinary English, so it is left alone.
 */
export function stripOpeningConnective(paragraph: string): string {
  const stripped = paragraph.replace(LEADING_CONNECTIVE, "");
  if (stripped === paragraph || !stripped.trim()) return paragraph;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

const bodyWordCount = (paragraphs: string[]): number =>
  paragraphs
    .filter((p) => p.trim() && !isStructuralParagraph(p))
    .reduce((n, p) => n + p.trim().split(/\s+/).filter(Boolean).length, 0);

/**
 * Drops any sentence that restates a CV bullet, and keeps at most ONE past
 * example per paragraph. A sentence is a restatement when 45% or more of its
 * content words come from a single bullet: at that level a reviewer is reading
 * the same claim twice, whatever the wording.
 *
 * REMOVAL STOPS AT A 150-WORD BODY. Thinning paragraphs instead of deleting them
 * keeps every paragraph in place but still allowed a letter to come out as three
 * sentences. Once the surviving body would fall below 150 words there is no room
 * for an opening, a proof and a close, so the least-restating removals are put
 * back, lowest overlap first, until the body clears the floor. The paragraphs
 * that needed restoring are reported for a rewrite.
 */
export function enforceCoverLetterOriginality(
  letter: string,
  cvBullets: string[],
  options: { restatementThreshold?: number; minBodyWords?: number } = {},
): CoverLetterOriginality {
  const threshold = options.restatementThreshold ?? 0.45;
  const minBodyWords = options.minBodyWords ?? 150;
  const bullets = (cvBullets || []).map((b) => String(b || "").replace(/^\s*[-•*]\s*/, "")).filter(Boolean);
  const paragraphOverlaps: number[] = [];
  const emptied = new Set<string>();
  let maxSentenceOverlap = 0;

  interface Slot {
    sentence: string;
    overlap: number;
    kept: boolean;
    paraIndex: number;
  }

  const rawParagraphs = (letter || "").split(/\n{2,}/);
  const slots: Slot[] = [];
  const structural = new Map<number, string>();

  rawParagraphs.forEach((para, paraIndex) => {
    if (!para.trim() || isStructuralParagraph(para)) {
      structural.set(paraIndex, para);
      return;
    }
    let pastExampleKept = false;
    const paraSlots: Slot[] = [];

    for (const sentence of splitSentences(para)) {
      const best = bullets.reduce((max, b) => Math.max(max, overlapRatio(sentence, b)), 0);
      let kept = true;
      if (bullets.length && best >= threshold) {
        kept = false;
      } else if (looksLikePastExample(sentence, bullets)) {
        if (pastExampleKept) kept = false;
        else pastExampleKept = true;
      }
      paraSlots.push({ sentence, overlap: best, kept, paraIndex });
    }

    // A paragraph is thinned, never deleted. When every sentence would go, the
    // least-restating one stays so the paragraph still exists, and the paragraph
    // is reported for a rewrite. The removal itself is not weakened: a paragraph
    // holding one restatement and one original sentence still loses the restatement.
    if (paraSlots.length && !paraSlots.some((s) => s.kept)) {
      const least = paraSlots.reduce((min, s) => (s.overlap < min.overlap ? s : min), paraSlots[0]);
      least.kept = true;
      emptied.add(para.trim());
    }
    slots.push(...paraSlots);
  });

  const compose = (): string[] => {
    const out: string[] = [];
    let firstBodySeen = false;
    rawParagraphs.forEach((para, paraIndex) => {
      if (structural.has(paraIndex)) {
        out.push(structural.get(paraIndex)!);
        return;
      }
      let rebuilt = slots
        .filter((s) => s.paraIndex === paraIndex && s.kept)
        .map((s) => s.sentence)
        .join(" ")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      if (rebuilt && !firstBodySeen) {
        firstBodySeen = true;
        rebuilt = stripOpeningConnective(rebuilt);
      }
      out.push(rebuilt);
    });
    return out;
  };

  // Put the least-restating removals back, lowest overlap first, until the body
  // clears the floor. A letter that survives removal is worth more than a letter
  // with nothing left to read.
  let composed = compose();
  if (minBodyWords > 0 && bodyWordCount(composed) < minBodyWords) {
    const restorable = slots.filter((s) => !s.kept).sort((a, b) => a.overlap - b.overlap);
    for (const slot of restorable) {
      slot.kept = true;
      emptied.add(rawParagraphs[slot.paraIndex].trim());
      composed = compose();
      if (bodyWordCount(composed) >= minBodyWords) break;
    }
  }

  const removedSentences = slots.filter((s) => !s.kept).map((s) => s.sentence);
  for (const s of slots) if (s.kept) maxSentenceOverlap = Math.max(maxSentenceOverlap, s.overlap);
  for (const para of composed) {
    if (para.trim() && !isStructuralParagraph(para)) {
      paragraphOverlaps.push(bullets.reduce((max, b) => Math.max(max, overlapRatio(para, b)), 0));
    }
  }

  return {
    text: composed.filter((p) => p.trim()).join("\n\n"),
    removedSentences,
    maxSentenceOverlap,
    paragraphOverlaps,
    emptiedParagraphs: [...emptied],
  };
}

const RANK_WORDS = /\b(senior|junior|lead|principal|staff|head|chief|director|manager|officer|associate|assistant|analyst|engineer|coordinator|specialist|executive|vp|vice president)\b/gi;

const normalise = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The line under the name is a job title, never the employer. When the posting
 * title is missing, or is nothing but the company name, the candidate's most
 * relevant HELD title is used instead.
 */
export function chooseHeadline(input: {
  targetTitle?: string;
  company?: string;
  currentTitle?: string;
  heldTitles?: string[];
}): { headline: string; usedFallback: boolean; reason: string } {
  const company = normalise(input.company);
  const held = (input.heldTitles || []).map((t) => String(t || "").trim()).filter(Boolean);
  const fallback = (input.currentTitle || "").trim() || held[0] || "";

  let target = String(input.targetTitle || "").trim().replace(/\s*[|\-–—]\s*careers?\s*$/i, "").trim();

  // A title that is only the company name (or the company name plus rank noise)
  // is not a title.
  if (target && company) {
    const stripped = normalise(target).split(" ").filter((w) => !company.split(" ").includes(w)).join(" ");
    const meaningful = stripped.replace(RANK_WORDS, "").trim();
    if (!stripped || (normalise(target) === company) || (!meaningful && stripped === normalise(target).replace(/\s+/g, " ") && stripped.split(" ").length <= 1)) {
      return {
        headline: fallback,
        usedFallback: true,
        reason: fallback
          ? "Posting title was the employer name; used the candidate's held title"
          : "Posting title was the employer name and no held title was available",
      };
    }
  }

  if (!target) {
    return {
      headline: fallback,
      usedFallback: true,
      reason: fallback ? "No posting title supplied; used the candidate's held title" : "No title available",
    };
  }

  return { headline: target, usedFallback: false, reason: "Posting title used as supplied" };
}

/** True when the line is the employer's name and nothing else. */
export function isEmployerNameLine(line: string, company?: string): boolean {
  const c = normalise(company);
  if (!c) return false;
  return normalise(line) === c;
}
