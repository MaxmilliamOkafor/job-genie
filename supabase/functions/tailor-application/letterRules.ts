// FINAL COVER LETTER RULES FROM THE EXTENSION BRIEF (10 Nov).
//
// Pure and idempotent: run once on the finished letter, after the existing
// final checks and before monetary exclusion. Each rule only removes, moves or
// rewords what the letter already says; nothing is added that the CV does not
// show. The body never drops under the 150-word floor and no paragraph is
// emptied to satisfy a rule.
import { isToolName, wordCount } from "./guards.ts";
import { termAppearsIn } from "../_shared/coverage.ts";
import { hasSelfTalk } from "../_shared/documentRules.ts";

const FLOOR = 150;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const splitSentences = (s: string) => String(s || "").split(/(?<=[.!?])\s+(?=[A-Z"(])/).filter((x) => x.trim());
const stripLegal = (s: string) => String(s || "").replace(/\s*,?\s+\b(?:Inc|Ltd|Limited|LLC|PLC|GmbH|Corp|Corporation|Co)\.?$/i, "").trim();

/** Sentences any candidate could have written. */
export const GENERIC_LETTER_SENTENCE: RegExp[] = [
  /\bbridg(?:ed|ing|e) (?:the gap between )?technical and (?:business|non-technical) (?:stakeholders|teams)\b/i,
  /\btranslat(?:ed|ing|e) (?:business )?requirements into reliable delivery\b/i,
  /\bimprov(?:ed|ing|e) speed, quality and operational outcomes\b/i,
  /\bproven track record\b/i,
  /\bpassionate about\b/i,
  /\bfast[- ]paced environment\b/i,
  /\bresults[- ]driven\b/i,
  /\bimproved performance\b(?![^.!?]*\d)/i,
  /\ba revenue lift\b(?![^.!?]*\d)/i,
  /\bmuch faster\b(?![^.!?]*\d)/i,
];
export const isGenericSentence = (s: string) => GENERIC_LETTER_SENTENCE.some((re) => re.test(s));

export interface LetterRuleContext {
  role: string;
  company: string;
  /** The final CV text: the only source of tools the letter may name. */
  cv: string;
  /** The posting's terms, used to keep the tools it asks for. */
  postingTerms?: string[];
  standIn?: boolean;
}

function bodyRange(lines: string[]): [number, number] | null {
  const greet = lines.findIndex((l) => /^(?:Dear|Hello|Hi)\b/i.test(l.trim()));
  const close = lines.findIndex((l, i) => i > greet && /^(?:Kind regards|Sincerely|Yours|Best regards|Best wishes|Regards)\b/i.test(l.trim()));
  return greet < 0 || close < 0 ? null : [greet, close];
}

const TOOL_ITEM = "[A-Z][\\w.#+/-]*(?:\\s[A-Z][\\w.#+/-]*){0,2}";
const TOOL_LIST = new RegExp(`${TOOL_ITEM}(?:,\\s*${TOOL_ITEM}){2,}(?:,?\\s+and\\s+${TOOL_ITEM})?|${TOOL_ITEM}(?:,\\s*${TOOL_ITEM})+,?\\s+and\\s+${TOOL_ITEM}`, "g");
const joinList = (items: string[]) => items.length <= 1 ? (items[0] || "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** No more than three tools in a sentence, and never a tool the CV does not show. */
export function trimToolLists(text: string, cv: string, postingTerms: string[] = []): string {
  return text.replace(TOOL_LIST, (whole) => {
    const items = whole.split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
    if (items.length < 2 || !items.every((t) => isToolName(t))) return whole;
    const shown = items.filter((t) => termAppearsIn(cv, t));
    const asked = shown.filter((t) => postingTerms.some((p) => p.toLowerCase() === t.toLowerCase()));
    const rest = shown.filter((t) => !asked.includes(t));
    const kept = [...asked, ...rest].slice(0, 3).sort((a, b) => items.indexOf(a) - items.indexOf(b));
    if (kept.length === items.length) return whole;
    return joinList(kept);
  });
}

/**
 * All of rule F on a finished letter. Returns the same letter when nothing
 * applies, and the same letter again when run a second time.
 */
export function finalLetterRules(letter: string, ctx: LetterRuleContext): { letter: string; notes: string[] } {
  const notes: string[] = [];
  const lines = String(letter || "").split("\n");
  const range = bodyRange(lines);
  if (!range) return { letter, notes };
  const [greet, close] = range;
  const company = stripLegal(ctx.company || "");
  const standIn = ctx.standIn || !company;
  const role = String(ctx.role || "").trim();
  let paras = lines.slice(greet + 1, close).join("\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const words = () => wordCount(paras.join(" "));

  // Wording rules, sentence by sentence.
  paras = paras.map((p) => {
    let t = p;
    t = t.replace(/\bI am writing to apply for\b/g, "I am applying for").replace(/\bI am writing to apply\b/g, "I am applying");
    if (!standIn) {
      t = t.replace(/\b(to|join|joining) your team\b/g, (_m, w: string) => `${w} the ${company} team`)
        .replace(/\bjoin(ing)? your (?:company|organisation|organization)\b/g, (_m, ing?: string) => `join${ing || ""} ${company}`)
        .replace(/\byour (?:company|organisation|organization)\b/g, company);
    }
    // Bracketed shorthand from the CV never reaches the letter.
    t = t.replace(/\s*\([^()]{1,80}\)/g, "");
    t = trimToolLists(t, ctx.cv || "", ctx.postingTerms || []);
    return t.replace(/ {2,}/g, " ").replace(/\s+([.,;])/g, "$1").trim();
  });

  // Self-talk and generic sentences go, never emptying a paragraph and never under the floor.
  for (let i = 0; i < paras.length; i++) {
    const sents = splitSentences(paras[i]);
    if (sents.length < 2) continue;
    const kept = sents.filter((s) => {
      if (!hasSelfTalk(s) && !isGenericSentence(s)) return true;
      if (words() - wordCount(s) < FLOOR && !hasSelfTalk(s)) return true;
      notes.push(`removed: ${s}`);
      paras[i] = paras[i].replace(s, "").replace(/ {2,}/g, " ").trim();
      return false;
    });
    paras[i] = kept.join(" ");
  }

  // "For the X role at Y, I would bring hands-on A and B from that work." once at most,
  // and never when the paragraphs above already name A and B.
  const BRING = /For the [^.!?]{2,80}? role(?: at [^,]{1,60})?, I would bring hands-on ([^.!?]+?) from that work\./;
  let bringSeen = false;
  for (let i = 0; i < paras.length; i++) {
    const m = BRING.exec(paras[i]);
    if (!m) continue;
    const items = m[1].split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
    const above = paras.slice(0, i).join(" ") + " " + paras[i].replace(m[0], "");
    const already = items.length > 0 && items.every((x) => termAppearsIn(above, x));
    if (bringSeen || already) {
      const next = paras[i].replace(m[0], "").replace(/ {2,}/g, " ").trim();
      if (next || bringSeen) { paras[i] = next; notes.push("removed repeated what-I-would-bring line"); }
    }
    bringSeen = true;
    // A second copy inside the same paragraph.
    while (paras[i].indexOf(m[0]) !== paras[i].lastIndexOf(m[0])) paras[i] = paras[i].replace(m[0] + " ", "");
  }
  paras = paras.filter(Boolean);

  // The opening names the employer.
  if (!standIn && paras.length) {
    const opensWithCompany = paras[0].toLowerCase().startsWith(company.toLowerCase());
    if (opensWithCompany) {
      const why = new RegExp(`That is why I am applying for the ${esc(role)} role`, "i");
      if (role && !why.test(paras[0])) { paras[0] = `${paras[0]} That is why I am applying for the ${role} role.`; notes.push("kept the why-I-am-applying sentence"); }
    } else if (!termAppearsIn(paras[0], company)) {
      const roleOnly = role ? new RegExp(`\\b(applying for|drew me to) the ${esc(role)} role(?! at)`, "i") : null;
      if (roleOnly && roleOnly.test(paras[0])) paras[0] = paras[0].replace(roleOnly, (m) => `${m} at ${company}`);
      else if (role) paras[0] = `I am applying for the ${role} role at ${company}. ${paras[0]}`;
      notes.push("opening names the employer");
    }
  }

  // The proof paragraphs come before the closing thanks.
  const thanks = paras.findIndex((p) => /^Thank you for (?:considering|your time|reading)/i.test(p));
  if (thanks >= 0 && thanks < paras.length - 1) {
    const [p] = paras.splice(thanks, 1);
    paras.push(p);
    notes.push("closing moved after the proof paragraphs");
  }

  const next = [...lines.slice(0, greet + 1), "", paras.join("\n\n"), "", ...lines.slice(close)].join("\n");
  return { letter: notes.length || next !== letter ? next : letter, notes };
}
