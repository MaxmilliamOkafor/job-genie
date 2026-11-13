/**
 * Employer text, decoded without losing punctuation.
 *
 * Career boards send descriptions as HTML, often escaped twice
 * ("&amp;lt;p&amp;gt;We&amp;#8217;re"). The old clean-up turned every numeric
 * entity into a space, so "We’re looking" was stored as "We re looking".
 * Entities are decoded here, typographic apostrophes and quotes (U+2018,
 * U+2019, U+201C, U+201D) are kept, and tags are removed only after decoding so
 * escaped markup never survives as text. Pure: shared by the job import and the
 * website.
 */

const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201D", ldquo: "\u201C",
  sbquo: "\u201A", bdquo: "\u201E", prime: "\u2032",
  ndash: "-", mdash: "-", minus: "-", hellip: "...", bull: "\u2022", middot: "\u00B7",
  copy: "\u00A9", reg: "\u00AE", trade: "\u2122", deg: "\u00B0", euro: "\u20AC", pound: "\u00A3",
  eacute: "\u00E9", egrave: "\u00E8", aacute: "\u00E1", agrave: "\u00E0", iacute: "\u00ED",
  oacute: "\u00F3", uacute: "\u00FA", ntilde: "\u00F1", ouml: "\u00F6", uuml: "\u00FC",
  auml: "\u00E4", ccedil: "\u00E7", szlig: "\u00DF", zwj: "", zwnj: "", shy: "",
};

/** Decode HTML entities, including double-escaped ones, keeping curly quotes. */
export function decodeEntities(value: string): string {
  let text = String(value ?? "");
  for (let pass = 0; pass < 3; pass++) {
    const next = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
        if (code === 0x2013 || code === 0x2014) return "-";
        if (code === 0xa0) return " ";
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      const named = NAMED[body.toLowerCase()];
      return named === undefined ? whole : named;
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

/** One line of plain text from employer HTML, as the job import stores it. */
export function employerPlainText(html: unknown, max = 4000): string | null {
  if (typeof html !== "string" || !html) return null;
  const text = decodeEntities(decodeEntities(html).replace(/<[^>]*>/g, " "))
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

/**
 * Readable text with paragraph and list breaks, for showing a description.
 * Markup is never injected; only the employer's words are kept.
 */
export function employerReadableText(raw: string): string {
  return repairDroppedApostrophes(
    decodeEntities(decodeEntities(String(raw ?? ""))
      .replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?\s*>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, ""))
      .replace(/[\u2013\u2014]/g, "-"),
  )
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Descriptions stored before the import fix lost their apostrophes
 * ("We re looking"). Only unambiguous contractions are restored; possessives
 * ("world s") are left alone because the missing letter cannot be known.
 */
export function repairDroppedApostrophes(text: string): string {
  return String(text ?? "")
    .replace(/\b(we|you|they)\s(re|ve|ll)\b(?!-)/gi, (_m, who: string, tail: string) => `${who}'${tail}`)
    .replace(/\bI\s(m|ve|ll)\b(?!-)/g, (_m, tail: string) => `I'${tail}`)
    .replace(
      /\b(don|doesn|didn|can|won|isn|aren|wasn|weren|couldn|wouldn|shouldn|haven|hasn|hadn)\st\b/gi,
      (_m, head: string) => `${head}'t`,
    );
}
