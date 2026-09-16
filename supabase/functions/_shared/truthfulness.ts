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
 * 2. A total-years claim, and worse, years in one field offered as meeting a
 *    stated requirement for years in another. A posting asking for "1+ years of
 *    front-of-house hospitality operations at a hotel" is not met by eight years
 *    of software engineering, and a sentence claiming otherwise is a false
 *    statement on an application.
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

const YEARS_SPAN =
  /\b(?:(\d{1,2})\s*\+?\s*(?:years|yrs)|over\s+(\d{1,2})\s+years|more\s+than\s+(\d{1,2})\s+years)\b/i;

/** Wording that offers the span as satisfying something the posting asks for. */
const MEETS_REQUIREMENT =
  /\b(?:meets?|meeting|satisfies|satisfying|fulfils?|fulfills?|exceeds?|as\s+required|required|requirement)\b/i;

/** Words that name no field, so they cannot make a claim cross-field. */
const GENERIC_FIELD_WORDS = new Set([
  "experience", "experiences", "relevant", "professional", "commercial", "industry",
  "work", "working", "hands", "on", "total", "combined", "overall", "the", "a", "an",
  "of", "in", "as", "at", "position", "positions", "role", "roles", "stated", "posting",
  "job", "years", "yrs", "requirement", "requirements", "and", "with", "for", "this",
  "its", "their", "that", "which", "bringing", "brings",
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

/**
 * True only when a sentence presents years earned in one field as meeting a
 * stated requirement for years in ANOTHER field. A true claim inside one field
 * — "9 years of relevant experience that meets the position's stated experience
 * requirement" — is left alone: the narrow rule is cross-field only.
 */
export function statesYearsAsQualification(sentence: string, context: YearsContext = {}): boolean {
  const text = sentence || "";
  const span = YEARS_SPAN.exec(text);
  if (!span) return false;
  if (!MEETS_REQUIREMENT.test(text)) return false;

  // What the years are claimed to be in, and what the requirement is stated in.
  const after = text.slice(span.index + span[0].length);
  const yearsField = fieldTokens(
    (after.match(/^\s*(?:of|in|as)\s+([^.,;]{0,60})/i)?.[1] ?? "") + " " + (context.candidateField ?? ""),
  );
  const requirementField = fieldTokens(
    (text.match(/\b(?:requirement|required|meets?|meeting|satisfies|fulfils?|fulfills?)\b[^.;]{0,60}/i)?.[0] ?? "")
      + " " + (context.postingField ?? ""),
  );

  // No field named on one side of the comparison: the claim is not cross-field.
  if (yearsField.size === 0 || requirementField.size === 0) return false;
  return !overlaps(yearsField, requirementField);
}

/**
 * Drops only the cross-field years claims. A true within-field sentence, such
 * as the closing line the extension's recruiter audit appends, survives
 * untouched. A paragraph reduced to nothing is left out rather than filled.
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
export function sanitiseDocument(text: string): { text: string; removedYearsClaims: string[] } {
  if (!text) return { text, removedYearsClaims: [] };
  const withFluency = sanitiseLanguageProficiency(text);
  const lines = withFluency.split("\n").map((line) => {
    // Only a labelled skills line is filtered; prose is left as written.
    if (/^(?:[A-Z][A-Za-z &/]{2,30}):\s*\S/.test(line) && line.includes(",")) {
      const stripped = stripEquipmentFromSkillsLine(line);
      return stripped;
    }
    return line;
  });
  const { text: withoutYears, removed } = removeYearsClaims(lines.join("\n"));
  return { text: withoutYears.replace(/\n{3,}/g, "\n\n"), removedYearsClaims: removed };
}
