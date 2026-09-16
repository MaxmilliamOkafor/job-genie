/**
 * BIAS AND TRUTHFULNESS IN GENERATED DOCUMENTS.
 *
 * Three faults this module removes from anything the pipeline writes:
 *
 * 1. Language proficiency written as "native", "native speaker", "mother
 *    tongue" or "first language". Native fluency names where someone is from;
 *    what an employer needs to know is whether they can work in the language,
 *    so the word is "fluent". A right-to-work statement such as "EU Citizen"
 *    stays: it is a legal status that costs an employer money to get wrong and
 *    names no nationality.
 *
 * 2. Years earned in ONE field offered as meeting a stated requirement for
 *    years in ANOTHER. A posting asking for "1+ years of front-of-house
 *    hospitality operations at a hotel" is not met by eight years of software
 *    engineering, and a sentence claiming otherwise is false on an application.
 *    A true within-field years statement is left exactly as written, including
 *    the closing line the extension's recruiter audit appends, so re-running a
 *    finished CV through here never strips it.
 *
 * 3. Equipment in a skills section. Internet, wifi, a laptop, a webcam, a
 *    headset, a workspace and transportation are conditions a job needs present
 *    in a room. They are never capabilities and never belong under skills.
 */

const NATIVE_LANGUAGE =
  /\b(?:native\s+(?:speaker|level|proficiency|fluency|language|tongue)?|mother\s+tongue|first\s+language)\b/gi;

/** Rewrites native-language wording as fluency, leaving right-to-work statements alone. */
export function sanitiseLanguageProficiency(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bnative\s+speaker\s+of\b/gi, "fluent in")
    .replace(/\b(?:mother\s+tongue|first\s+language)\b/gi, "fluent")
    .replace(NATIVE_LANGUAGE, "fluent")
    .replace(/\bfluent\s+fluent\b/gi, "fluent");
}

const WORD_NUMBER = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty";
const YEARS_SPAN = new RegExp(`\\b(?:\\d{1,2}\\s*\\+?|${WORD_NUMBER})\\s*(?:years|yrs)\\b`, "gi");

/** Wording that offers a span as satisfying something the posting asks for. */
const MEETS_REQUIREMENT =
  /\b(?:meets?|meeting|satisfies|satisfying|fulfils?|fulfills?|exceeds?|covers?|covering|as\s+required|required|requirement)\b/i;

/** Words that name no field, so they cannot make a claim cross-field. */
const GENERIC_FIELD_WORDS = new Set([
  "experience", "experiences", "relevant", "professional", "commercial", "industry",
  "work", "working", "hands", "on", "total", "combined", "overall", "the", "a", "an",
  "of", "in", "as", "at", "position", "positions", "role", "roles", "stated", "posting",
  "job", "years", "yrs", "requirement", "requirements", "and", "with", "for", "this",
  "its", "their", "that", "which", "bringing", "brings", "your", "our", "my", "meets",
  "meeting", "covers", "covering", "senior", "junior", "lead", "principal", "staff",
]);

function fieldTokens(phrase: string): Set<string> {
  return new Set(
    (phrase || "")
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w && !GENERIC_FIELD_WORDS.has(w)),
  );
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

export interface YearsContext {
  /** The field the candidate's years were actually earned in. */
  candidateField?: string;
  /** The field the posting states its years requirement in. */
  postingField?: string;
}

/** Every years span in the sentence, with the field named right after it. */
function yearsFields(text: string): Set<string>[] {
  const fields: Set<string>[] = [];
  for (const match of text.matchAll(YEARS_SPAN)) {
    const after = text.slice((match.index ?? 0) + match[0].length);
    // Only the words immediately naming the field count: reading further would
    // sweep in the other side of the comparison and hide the mismatch.
    const raw = after.match(/^\s*(?:of|in|as)?\s*([^.,;]{0,60})/i)?.[1] ?? "";
    const phrase = raw
      .split(/\b(?:that|which|meets?|meeting|satisfies|covers?|and|but|to|for)\b/i)[0]
      .split(/\s+/)
      .slice(0, 5)
      .join(" ");
    fields.push(fieldTokens(phrase));
  }
  return fields;
}

/**
 * True only when a sentence presents years earned in one field as meeting a
 * stated requirement for years in ANOTHER field. A claim inside one field --
 * "9 years of relevant experience that meets the position's stated experience
 * requirement" -- is left alone: the rule is cross-field only.
 */
export function statesYearsAsQualification(sentence: string, context: YearsContext = {}): boolean {
  const text = sentence || "";
  if (!MEETS_REQUIREMENT.test(text)) return false;
  const fields = yearsFields(text).filter((f) => f.size > 0);
  if (fields.length === 0) return false;

  // Two spans naming two different fields: one is being offered for the other.
  for (let i = 0; i < fields.length; i += 1) {
    for (let j = i + 1; j < fields.length; j += 1) {
      if (!overlaps(fields[i], fields[j])) return true;
    }
  }

  // A single span whose named field is not the candidate's own: years earned
  // elsewhere are being offered against this posting's requirement.
  const candidate = fieldTokens(context.candidateField ?? "");
  if (fields.length === 1 && candidate.size > 0 && !overlaps(fields[0], candidate)) return true;

  return false;
}

/**
 * Drops only the cross-field years claims. A true within-field sentence
 * survives untouched. A paragraph reduced to nothing is left out rather than
 * filled with anything.
 */
export function removeYearsClaims(
  text: string,
  context: YearsContext = {},
): { text: string; removed: string[] } {
  if (!text) return { text, removed: [] };
  const removed: string[] = [];
  const paragraphs = text.split(/\n/).map((line) => {
    if (!statesYearsAsQualification(line, context)) return line;
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => {
      if (statesYearsAsQualification(s, context)) {
        removed.push(s.trim());
        return false;
      }
      return true;
    });
    return kept.join(" ").trim();
  });
  return { text: paragraphs.join("\n"), removed };
}

/** Conditions a job needs present in a room, never capabilities. */
export const EQUIPMENT_TERMS = [
  "internet",
  "internet connection",
  "high-speed internet",
  "broadband",
  "wifi",
  "wi-fi",
  "laptop",
  "computer",
  "desktop",
  "webcam",
  "camera",
  "headset",
  "headphones",
  "microphone",
  "workspace",
  "work space",
  "home office",
  "quiet workspace",
  "dedicated workspace",
  "transportation",
  "transport",
  "own vehicle",
  "car",
  "driving licence",
  "smartphone",
  "mobile phone",
  "printer",
  "monitor",
  "desk",
  "chair",
];

const EQUIPMENT = new Set(EQUIPMENT_TERMS.map((t) => t.toLowerCase()));

/** True when a would-be skill is really a piece of equipment or a room. */
export function isEquipment(term: string): boolean {
  const t = (term || "").trim().toLowerCase().replace(/^(?:a|an|the)\s+/, "").replace(/[.,;]$/, "");
  if (!t) return false;
  if (EQUIPMENT.has(t)) return true;
  // "reliable high-speed internet", "own transportation", "personal laptop"
  return /^(?:reliable|stable|fast|own|personal|private|dedicated|quiet|access to(?: a)?)\s+(.+)$/.test(t)
    ? EQUIPMENT.has(t.replace(/^(?:reliable|stable|fast|own|personal|private|dedicated|quiet|access to(?: a)?)\s+/, ""))
    : false;
}

/** Removes equipment entries from a comma-separated skills line. */
export function stripEquipmentFromSkillsLine(line: string): string {
  const [label, ...rest] = line.split(":");
  if (rest.length === 0) {
    const kept = line.split(/,\s*/).filter((t) => !isEquipment(t));
    return kept.join(", ");
  }
  const kept = rest.join(":").split(/,\s*/).map((t) => t.trim()).filter((t) => t && !isEquipment(t));
  return kept.length ? `${label}: ${kept.join(", ")}` : "";
}

/** Applies every rule above to a whole document. */
export function sanitiseDocument(
  text: string,
  context: YearsContext = {},
): { text: string; removedYearsClaims: string[] } {
  if (!text) return { text, removedYearsClaims: [] };
  const withFluency = sanitiseLanguageProficiency(text);
  const lines = withFluency.split("\n").map((line) => {
    // Only a labelled skills line is filtered; prose is left as written.
    if (/^(?:[A-Z][A-Za-z &/]{2,30}):\s*\S/.test(line) && line.includes(",")) {
      return stripEquipmentFromSkillsLine(line);
    }
    return line;
  });
  const { text: withoutYears, removed } = removeYearsClaims(lines.join("\n"), context);
  return { text: withoutYears.replace(/\n{3,}/g, "\n\n"), removedYearsClaims: removed };
}
