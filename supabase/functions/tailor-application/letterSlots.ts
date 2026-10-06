// Cover letter built from checked slots. The model returns short JSON slots;
// code checks each one against the saved profile, the tailored CV and the job
// description, then assembles the letter. A failed slot gets one retry, then
// it is dropped. Nothing is padded.

import { BANNED_PHRASES, LETTER_BANNED, containsTerm, letterRightToWorkSentence, wordCount } from "./guards.ts";


/** Below this many words the optional third result is added. Never padded beyond the slots. */
export const LETTER_WORD_FLOOR = 150;

export const SLOT_BANNED = [
  ...LETTER_BANNED, ...BANNED_PHRASES, "I am writing to", "excelled",
  "aligns well with", "aligns with", "resonates with", "particularly motivating", "professional values", "innovative",
  "successfully", "solutions that directly impact", "through effective communication", "showcasing my ability",
  "connects to my experience", "emphasis on",
];

/** Banned openers and filler written as patterns, so new word forms are caught too. */
export const SLOT_BANNED_PATTERNS: RegExp[] = [
  /\bI(?: am|'m)\s+(?:so\s+|very\s+|truly\s+)?(?:eager|excited|thrilled|keen|delighted)\s+to\s+apply\b/i,
  /\bconnects?\s+(?:directly\s+|well\s+|closely\s+)?(?:to|with)\s+my\s+(?:own\s+)?(?:experience|background|work)\b/i,
  /\bemphasis\s+on\b/i,
  /\bnot\s+(?:just\s+|only\s+|merely\s+)?[^,.;]{1,40}?,?\s+but\s+(?:also\s+)?\w/i,
];

/** Words a result may only use when its bullet already has them. */
export const NO_ADD_WORDS = ["transformed", "enhanced", "entire", "complete", "smooth", "engaging", "seamless", "revolutionised", "spearheaded", "ensuring"];

export interface ProfileBullet { n: number; company: string; text: string }

export interface SlotContext {
  experience: any[];
  bullets: ProfileBullet[];
  cvText: string;
  description: string;
  tools: string[];
  profileText: string;
  company: string;
  story: string;
}

function allText(v: any, out: string[] = []): string[] {
  if (v == null) return out;
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allText(x, out));
  else if (typeof v === "object") Object.values(v).forEach((x) => allText(x, out));
  return out;
}

/** Every text value of the saved profile, used for "background in X" and title checks. */
export function profileTextOf(profile: any): string {
  const p = profile || {};
  return allText([p.professionalExperience, p.skills, p.education, p.relevantProjects, p.certifications, p.achievements]).join("\n");
}

const roleList = (experience: any[]) => (experience || []).map((e) => ({
  company: String(e?.company || e?.employer || "").trim(),
  title: String(e?.title || e?.position || e?.role || "").trim(),
  text: allText(e).join("\n"),
})).filter((r) => r.company);

/** The profile's experience lines, numbered from 1, each with its employer. */
export function profileBullets(experience: any[]): ProfileBullet[] {
  const out: ProfileBullet[] = [];
  for (const e of experience || []) {
    const company = String(e?.company || e?.employer || "").trim();
    if (!company) continue;
    const lines = [e?.bullets, e?.achievements, e?.responsibilities, e?.highlights, e?.description]
      .flatMap((v) => allText(v))
      .flatMap((t) => t.split(/\n|\s*[•▪·]\s+/))
      .map((t) => t.replace(/^\s*[-*]\s+/, "").trim())
      .filter((t) => t.split(/\s+/).length >= 4);
    for (const text of [...new Set(lines)]) out.push({ n: out.length + 1, company, text });
  }
  return out;
}

/** containsTerm, with sentence-ending full stops ignored ("Terraform." still counts). */
const has = (text: string, term: string) => containsTerm(String(text || "").replace(/\.(?=\s|$)/g, " "), term);

const numbersIn = (s: string) => (String(s || "").match(/\d+(?:[.,]\d+)*/g) || []);
const flat = (s: string) => String(s || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STOP = new Set("about above after again against also among and another around because been before being below between both but came come could does doing down during each from further have having here into itself just like made make many more most much must only other over same should since some such than that their them then there these they this those through under until upon very were what when where which while will with within without would your yours mine from across".split(" "));
// Words too general to count as naming the same problem.
const GENERIC = new Set("experience work worked working role team teams company companies skills skill building build built focus approach background career platform product products service services system systems solution solutions people users customers role roles result results candidate".split(" "));
const stem = (w: string) => w.toLowerCase().replace(/(ies|ied)$/, "y").replace(/(ing|ed|es|s)$/, "").slice(0, 6);
const contentWords = (s: string, skip: string[] = []) => {
  const drop = new Set(skip.flatMap((x) => flat(x).split(/[^a-z0-9]+/)).filter(Boolean));
  return (flat(s).match(/[a-z][a-z'-]{3,}/g) || []).map((w) => w.replace(/'s$/, "")).filter((w) => !STOP.has(w) && !drop.has(w));
};
const stemSet = (s: string) => new Set(contentWords(s).map(stem));

/** Titles the candidate held; "As a X" is only allowed for one of these. */
function heldTitle(x: string, experience: any[]): boolean {
  const t = flat(x);
  return roleList(experience).some((r) => r.title && (flat(r.title) === t || flat(r.title).includes(t)));
}

/** Claims of a title or field the profile does not show. */
export function unsupportedClaims(text: string, experience: any[], profileText: string): string[] {
  const out: string[] = [];
  const s = String(text || "");
  for (const m of s.matchAll(/\b[Aa]s an? ([A-Z][^,.;]*?)(?=\s+(?:at|with|for|in|on|who|I)\b|[,.;]|$)/g)) {
    const title = m[1].trim();
    if (!/\b(citizen|national)\b/i.test(title) && !heldTitle(title, experience)) out.push(`claims the title "${title}", which the profile does not show`);
  }
  for (const m of s.matchAll(/\bbackground in ([^,.;]+)/gi)) {
    const field = m[1].replace(/^(a|an|the)\s+/i, "").trim();
    if (!flat(profileText).includes(flat(field))) out.push(`claims a background in "${field}", which the profile does not show`);
  }
  return out;
}

export function bannedIn(text: string): string[] {
  const t = flat(text);
  const words = SLOT_BANNED.filter((b) => {
    const p = flat(b);
    return p.endsWith(",") ? new RegExp(`(^|[.!?]\\s+)${esc(p)}`).test(t) : new RegExp(`\\b${esc(p)}`).test(t);
  });
  const pats = SLOT_BANNED_PATTERNS.filter((re) => re.test(String(text || ""))).map((re) => (String(text).match(re) || [""])[0]);
  return [...words, ...pats];
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000, half: 0.5, twice: 2 };

/** Every number in a text (digits or words), as [value, as written]. "all but three" gives ["3", "three"]. */
export function numberEntries(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of String(text || "").matchAll(/\d+(?:[.,]\d+)*/g)) out.push([m[0].replace(/,/g, ""), m[0]]);
  for (const m of String(text || "").toLowerCase().matchAll(/\b[a-z]+\b/g)) if (m[0] in NUMBER_WORDS) out.push([String(NUMBER_WORDS[m[0]]), m[0]]);
  return out;
}
const numberValues = (text: string) => numberEntries(text).map(([v]) => v);

/** Checks a result slot against the numbered profile line it says it used. */
export function checkAgainstBullet(text: string, bullet: ProfileBullet | undefined, tools: string[]): string[] {
  if (!bullet) return ["does not name a valid profile line number"];
  const fails: string[] = [];
  if (!has(text, bullet.company)) fails.push(`does not name ${bullet.company}, the employer of line ${bullet.n}`);
  const words = contentWords(text, [bullet.company]);
  const src = stemSet(bullet.text);
  const found = words.filter((w) => src.has(stem(w)));
  if (words.length && found.length / words.length < 0.6) fails.push(`shares only ${Math.round((found.length / words.length) * 100)}% of its words with line ${bullet.n} (needs 60%)`);
  const bFlat = flat(bullet.text);
  for (const n of numbersIn(text)) if (!bFlat.includes(n.toLowerCase())) fails.push(`adds the number ${n}, which line ${bullet.n} does not have`);
  const kept = new Set(numberValues(text));
  for (const [v, shown] of numberEntries(bullet.text)) if (!kept.has(v)) fails.push(`drops the number "${shown}" from line ${bullet.n}`);
  for (const tool of tools) if (has(text, tool) && !has(bullet.text, tool)) fails.push(`adds ${tool}, which line ${bullet.n} does not name`);
  for (const w of NO_ADD_WORDS) {
    const root = stem(w).slice(0, 5);
    const re = new RegExp(`\\b${esc(root)}\\w*`, "i");
    if (re.test(text) && !re.test(bullet.text)) fails.push(`adds "${w}", which line ${bullet.n} does not use`);
  }
  return fails;
}

/** Longest allowed run of words shared with a CV line. A result must reuse its line's words, so the limit is 12. */
export const COPY_RUN = 12;

const squash = (s: string) => flat(s).replace(/[^a-z0-9%£$€]+/g, " ").trim();

/** True when the sentence shares a run of COPY_RUN or more words with any CV line. */
export function copiesRun(sentence: string, lines: string[], run = COPY_RUN): boolean {
  const w = squash(sentence).split(" ").filter(Boolean);
  if (w.length < run) return false;
  const hays = lines.map((l) => ` ${squash(l)} `);
  for (let i = 0; i + run <= w.length; i++) {
    const seq = ` ${w.slice(i, i + run).join(" ")} `;
    if (hays.some((h) => h.includes(seq))) return true;
  }
  return false;
}

/** Share of a text's content words that also appear in the other text. */
export function overlap(text: string, other: string): number {
  const words = contentWords(text);
  if (!words.length) return 0;
  const o = stemSet(other);
  return words.filter((w) => o.has(stem(w))).length / words.length;
}

/** The line the opening story is based on: 40% or more of its words are in the story. */
export const isStoryLine = (b: ProfileBullet, story: string) => !!story && overlap(b.text, story) >= 0.4;

export interface Pick { line: number; clause: string }
export interface SlotReply { opening?: Pick; results: Pick[]; companyFact?: string; why?: string }

const toPick = (x: any): Pick | null => {
  const line = Number(x?.line ?? x?.bullet ?? x?.n);
  const clause = String(x?.clause ?? x?.text ?? "").replace(/\s+/g, " ").trim();
  return Number.isInteger(line) && line > 0 && clause ? { line, clause } : null;
};

export function parseReply(raw: string): SlotReply {
  const t = String(raw || "").replace(/```[a-z]*\s*/gi, "").trim();
  try {
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const str = (v: any) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : undefined);
    return {
      opening: toPick(o?.opening) || undefined,
      results: (Array.isArray(o?.results) ? o.results : []).map(toPick).filter(Boolean) as Pick[],
      companyFact: str(o?.companyFact),
      why: str(o?.why),
    };
  } catch {
    return { results: [] };
  }
}

/** Code writes every result as "At {Employer}, I {clause}." */
export function composeResult(clause: string, employer: string): string {
  let c = String(clause || "").trim().replace(/[.!?]+$/, "").trim();
  c = c.replace(new RegExp(`^at\\s+${esc(employer)}\\s*,?\\s*`, "i"), "");
  c = c.replace(/^I\s+/, "");
  c = c.replace(new RegExp(`,?\\s+(?:at|for|with|while at|during my time at)\\s+${esc(employer)}$`, "i"), "");
  if (/^[A-Z][a-z]/.test(c)) c = c[0].toLowerCase() + c.slice(1);
  return `At ${employer}, I ${c}.`;
}

/** Problems with a composed result sentence; empty means it can be used. */
export function checkResult(sentence: string, bullet: ProfileBullet | undefined, ctx: SlotContext): string[] {
  const fails = [...checkAgainstBullet(sentence, bullet, ctx.tools)];
  if (bullet && isStoryLine(bullet, ctx.story)) fails.push(`uses line ${bullet.n}, which the opening story is based on`);
  if (ctx.story && overlap(sentence, ctx.story) >= 0.4) fails.push("repeats the opening story");
  const cvLines = String(ctx.cvText || "").split("\n").map((l) => l.replace(/^\s*[•*\-▪·]\s+/, "").trim()).filter(Boolean);
  if (copiesRun(sentence, cvLines)) fails.push(`repeats ${COPY_RUN} or more words in a row from the CV`);
  fails.push(...unsupportedClaims(sentence, ctx.experience, ctx.profileText));
  fails.push(...commonFails(sentence, ctx));
  return fails;
}

function commonFails(s: string, ctx: SlotContext): string[] {
  const fails: string[] = [];
  if (ctx.company && new RegExp(`\\b${esc(ctx.company)}\\s*,?\\s*where\\s+I\\b`, "i").test(s)) fails.push(`writes "where I" after ${ctx.company}, as if the candidate works there`);
  for (const b of bannedIn(s)) fails.push(`uses the banned phrase "${b}"`);
  if (/[\u2013\u2014]/.test(s)) fails.push("uses a dash");
  return fails;
}

export function checkCompanyFact(s: string, ctx: SlotContext): string[] {
  const fails: string[] = [];
  if (!flat(s).startsWith(flat(ctx.company))) fails.push(`does not start with "${ctx.company}"`);
  const desc = stemSet(ctx.description);
  const missing = contentWords(s, [ctx.company]).filter((w) => !desc.has(stem(w)));
  if (missing.length) fails.push(`uses words not in the job description: ${[...new Set(missing)].join(", ")}`);
  if (/["\u201c\u201d]|your posting says/i.test(s)) fails.push("quotes the posting instead of a plain sentence");
  for (const w of NO_ADD_WORDS) if (new RegExp(`\\b${w.slice(0, 5)}\\w*`, "i").test(s)) fails.push(`uses "${w}"`);
  return [...fails, ...commonFails(s, ctx)];
}

/** When a company fact is a posting sentence with its punctuation lost, the posting's own sentence is used. */
export function restorePunctuation(fact: string, description: string): string {
  const sq = (x: string) => flat(x).replace(/[^a-z0-9]+/g, " ").trim();
  const f = sq(fact);
  const sents = String(description || "").replace(/\s+/g, " ").match(/[^.!?]+[.!?]/g) || [];
  return sents.map((x) => x.trim()).find((x) => sq(x) === f) || fact;
}

/** "why" must name the same problem as the company fact and the story or a used result. */
export function checkWhy(s: string, fact: string, evidence: string[], ctx: SlotContext): string[] {
  // Whole words (simple plural or past forms only), so "identity" never matches "identifies".
  const whole = (w: string) => w.toLowerCase().replace(/(?:'s|es|s|ed)$/, "");
  const set = (x: string) => new Set(contentWords(x).map(whole));
  const f = set(fact);
  const ev = set([ctx.story, ...evidence].filter(Boolean).join(" "));
  const problem = contentWords(s, [ctx.company]).filter((w) => w.length >= 5 && !GENERIC.has(w)).map(whole);
  const fails = problem.some((w) => f.has(w) && ev.has(w)) ? [] : ["does not name the same problem as the company fact and the story or a result"];
  if (/\bsimilar(?:ly)? to\b/i.test(s)) fails.push('uses a generic "similar to" link');
  if (copiesRun(s, [fact], 8)) fails.push("repeats the company fact");
  // Every claim in the link comes from the fact, the story or a used result.
  const known = stemSet([fact, ctx.story, ...evidence].filter(Boolean).join(" "));
  const cw = contentWords(s, [ctx.company]);
  if (cw.length && cw.filter((w) => known.has(stem(w))).length / cw.length < 0.7) fails.push("adds claims not in the company fact, the story or a result");
  for (const w of NO_ADD_WORDS) if (new RegExp(`\\b${w.slice(0, 5)}\\w*`, "i").test(s)) fails.push(`uses "${w}"`);
  return [...fails, ...commonFails(s, ctx), ...unsupportedClaims(s, ctx.experience, ctx.profileText)];
}

/** Fallback company fact: a posting sentence that starts with the company name, word for word. */
export function factFromPosting(description: string, company: string): string {
  const sents = String(description || "").replace(/\s+/g, " ").match(/[^.!?]+[.!?]/g) || [];
  const hit = sents.map((x) => x.trim()).find((x) => flat(x).startsWith(flat(company)) && x.split(/\s+/).length <= 40 && !bannedIn(x).length);
  return hit || "";
}

/** Lines ranked by how many requirement and posting words they share; the story line is never offered. */
// Words that describe the work of a role family, matched on the role title.
const ROLE_TERMS: [RegExp, string][] = [
  [/customer success|account manag|client|customer|relationship/i, "client clients account accounts stakeholder stakeholders presented presenting presentation executive executives cto ctos board adoption renewal renewals escalation escalations onboarding trust relationship regulated customer customers"],
  [/engineer|developer|programmer|architect/i, "built building build scaled scaling scale reliability reliable performance latency deployed services"],
  [/data|analyst|analytics|scientist/i, "reporting report reports model models pipeline pipelines accuracy analysis"],
  [/product|design|ux|ui\b/i, "user users research roadmap requirements shipped shipping release releases acceptance criteria design designed"],
  [/security|risk|compliance|audit/i, "audit audits controls control regulated client incident incidents security compliance"],
];
export function roleTerms(role: string): string[] {
  return ROLE_TERMS.filter(([re]) => re.test(role)).flatMap(([, w]) => w.split(" ")).concat(contentWords(role));
}

/** Fit of one line for the role: top three requirements and the role family. Shared posting words only break ties. */
export function lineScore(b: ProfileBullet, requirements: string[], description: string, role: string): number {
  const req = stemSet(requirements.slice(0, 3).join(" ")), roleSet = new Set(roleTerms(role).map(stem)), desc = stemSet(description);
  const w = [...stemSet(b.text)];
  return w.filter((x) => req.has(x)).length * 4 + w.filter((x) => roleSet.has(x)).length * 3 + w.filter((x) => desc.has(x)).length * 0.1;
}

/** Lines ranked by fit for the role. The story line is never offered. */
export function rankLines(bullets: ProfileBullet[], requirements: string[], description: string, story: string, role = ""): ProfileBullet[] {
  return bullets.filter((b) => !isStoryLine(b, story)).map((b) => ({ b, s: lineScore(b, requirements, description, role) })).sort((a, z) => z.s - a.s).map((x) => x.b);
}

/** Best line per employer, in rank order, skipping the given employers. */
export function bestByEmployer(ranked: ProfileBullet[], skip: Set<string>, exclude: Set<number> = new Set()): ProfileBullet[] {
  const out: ProfileBullet[] = [];
  for (const b of ranked) if (!skip.has(b.company) && !exclude.has(b.n) && !out.some((o) => o.company === b.company)) out.push(b);
  return out;
}

const lineList = (bullets: ProfileBullet[]) => bullets.map((b) => {
  const nums = [...new Set(numberEntries(b.text).map(([, shown]) => shown))];
  return `${b.n}. [${b.company}] ${b.text}${nums.length ? ` (keep these numbers exactly: ${nums.join(", ")})` : ""}`;
}).join("\n");

/** "AI" and "NLP", never the long forms. */
export const shortForms = (s: string) => String(s || "")
  .replace(/\bartificial intelligence\b/gi, "AI")
  .replace(/\bnatural language processing\b/gi, "NLP")
  .replace(/\bAI and NLP\b/g, "AI and NLP");

/** True when the sentence uses a list of three or more ("A, B and C"). The "At X, I" lead is ignored. */
export function hasTripleList(sentence: string): boolean {
  const t = String(sentence || "").replace(/^At [^,]{1,40},\s*/, "");
  return /(?:^|[\s(])[^,.;:]{1,40},\s+[^,.;:]{1,40},?\s+(?:and|or)\s+\w/.test(t);
}

const BOAST = [
  /\bis\s+(?:the|a)\s+(?:global|world|worldwide|industry|market)?\s*(?:leader|leading\s+\w+(?:\s+\w+)?)\s+(?:in|for|of)\b/gi,
  /\b(?:the\s+)?(?:global|world|worldwide|industry|market)\s+leader\s+(?:in|for|of)\s+/gi,
  /\bworld[- ]leading\s+/gi, /\bindustry[- ]leading\s+/gi, /\bmarket[- ]leading\s+/gi, /\bthe\s+leading\s+/gi, /\bbest[- ]in[- ]class\s+/gi,
];
export function hasBoast(s: string): boolean {
  return BOAST.some((re) => { re.lastIndex = 0; return re.test(s); });
}
/** Removes marketing boasts, keeping a plain statement of what the company does. */
export function stripBoast(s: string): string {
  let t = String(s || "");
  t = t.replace(BOAST[0], "works in");
  for (const re of BOAST.slice(1)) t = t.replace(re, "");
  return t.replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim();
}

const CLAUSE_RULES = `Each "clause" retells ONE numbered line in your own word order as what the candidate did, starting with a past-tense verb, without "I" and without the employer's name (code adds "At {Employer}, I"). 18 to 30 words.
- Keep every number from the line exactly as written ("all but three gaps", never "nearly all gaps").
- Keep the line's own words and facts: at least 60% of the clause's words must come from that line. Add no number, tool or claim the line does not have. Never add: ${NO_ADD_WORDS.join(", ")}, unless the line has the word.
- Never copy ${COPY_RUN} or more words in a row from the line: reorder it or split it after a comma.
- Write "AI" and "NLP", never "artificial intelligence" or "natural language processing".
- Avoid lists of three ("A, B and C"); at most one in the whole letter. Never write "not X but Y".
- Never use: ${SLOT_BANNED.map((b) => `"${b}"`).join(", ")}, and never "I am eager/excited/thrilled/keen/delighted to apply".
- No dashes as pauses.`;

const FACT_RULE = (company: string) => `"companyFact": one plain sentence starting with "${company}" saying what the company does, using only words from the job description, as a full grammatical sentence. No quotation marks, no list of three, and no marketing boast ("the global leader in", "world-leading", "industry-leading", "the leading").`;

export function slotPrompt(o: { role: string; company: string; requirements: string[]; openingLine?: ProfileBullet; resultLines: ProfileBullet[]; description: string; story: string }): string {
  const lines = [o.openingLine, ...o.resultLines].filter(Boolean) as ProfileBullet[];
  return `Write parts of a cover letter for the ${o.role} role at ${o.company}. Return one JSON object and nothing else:
{${o.openingLine ? `"opening": {"line": ${o.openingLine.n}, "problem": "...", "clause": "..."}, ` : ""}"results": [{"line": N, "clause": "..."}], "companyFact": "...", "why": "..."}

${o.openingLine ? `- "opening" uses line ${o.openingLine.n} as a short work story in two sentences: "problem" is one short sentence stating the problem that line ${o.openingLine.n} solved, using only the line's own words; "clause" is what the candidate did and the result, keeping every number the line has.\n` : ""}- "results": retell exactly these lines, one each: ${o.resultLines.map((b) => b.n).join(", ")}.
- ${FACT_RULE(o.company)}
- "why": one sentence linking companyFact to ${o.story ? "the opening story" : "a result"} by naming the same problem. Name only facts that are in the story or result itself. Never a generic link such as "connects to my experience" or "similar to".

${CLAUSE_RULES}
${o.story ? `\nOPENING STORY (already written; never retell it):\n${o.story}\n` : ""}
NUMBERED PROFILE LINES:
${lineList(lines)}

JOB DESCRIPTION:
${String(o.description || "").slice(0, 6000)}`;
}

export function replacementPrompt(lines: ProfileBullet[], notes: string[], wantFact: boolean, wantWhy: string, company: string, openingLine?: ProfileBullet): string {
  return `Retell each numbered line below for a cover letter. Return one JSON object and nothing else:
{${openingLine ? `"opening": {"line": ${openingLine.n}, "problem": "...", "clause": "..."}, ` : ""}"results": [{"line": N, "clause": "..."}]${wantFact ? `, "companyFact": "..."` : ""}${wantWhy ? `, "why": "..."` : ""}}

${openingLine ? `"opening" uses line ${openingLine.n} as a two-sentence work story: "problem" states the problem it solved using only its facts; "clause" is what the candidate did and the result.\n` : ""}${CLAUSE_RULES}
${wantFact ? `\n${FACT_RULE(company)}` : ""}${wantWhy ? `\n"why": ${wantWhy}` : ""}
${notes.length ? `\nEarlier attempts failed because they: ${notes.join("; ")}` : ""}

LINES:
${lineList([openingLine, ...lines].filter(Boolean) as ProfileBullet[])}`;
}

/** Employer (from the profile) each sentence names, or "" when none. */
function employerOf(s: string, employers: string[]): string {
  return employers.find((e) => has(s, e)) || "";
}

/** Orders results so no employer is named in two sentences in a row; a result that cannot fit is left out. */
export function orderResults(results: string[], before: string, employers: string[]): string[] {
  const perms = (a: string[]): string[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
  const ok = (seq: string[]) => seq.every((s, i) => {
    const prev = i === 0 ? before : seq[i - 1];
    const a = employerOf(s, employers), b = employerOf(prev, employers);
    return !a || a !== b;
  });
  const subsets: string[][] = [];
  for (let m = 1; m < (1 << results.length); m++) subsets.push(results.filter((_, i) => m & (1 << i)));
  subsets.sort((a, b) => b.length - a.length);
  for (const sub of subsets) for (const p of perms(sub)) if (ok(p)) return p;
  return [];
}

/** The cover letter's right-to-work sentence, always a full sentence, or "". */
export function rightToWorkSentence(citizenship: string, countries: string[], location: string): string {
  return letterRightToWorkSentence(citizenship, countries, location);
}

const sentence = (s: string) => { const t = String(s || "").trim(); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };

export interface LetterParts {
  name: string; contact: string; greeting: string; story: string; role: string; company: string;
  opening?: string; results: string[]; companyFact?: string; why?: string;
  rightToWork: string; notice: string; signOff: string; employers?: string[];
}

/** Closing line of the company paragraph when no checked "why" is available. */
export const reasonLine = (role: string) => `That is the work I want to be part of as your ${role}.`;

export function letterBody(o: LetterParts): string[] {
  const employers = (o.employers || []).filter(Boolean);
  const lead = o.story ? o.story.trim() : (o.opening || "");
  const p1 = lead ? `${lead} That is what drew me to the ${o.role} role at ${o.company}.` : `That is what drew me to the ${o.role} role at ${o.company}.`;
  const lastOfP1 = p1.split(/(?<=[.!?])\s+/).pop() || "";
  const p3 = o.companyFact ? [sentence(o.companyFact), o.why ? sentence(o.why) : reasonLine(o.role)].join(" ") : "";
  const notice = o.notice ? `My notice period is ${o.notice.trim().replace(/[.]$/, "")}.` : "";
  const p4 = [o.rightToWork, notice, "I am available for a call whenever suits you."].filter(Boolean).join(" ");
  return [p1, orderResults(o.results, lastOfP1, employers).join(" "), p3, p4].filter(Boolean);
}

/** Builds the letter from checked parts. Missing parts are left out, never padded. */
export function assembleLetter(o: LetterParts): string {
  return [o.name, o.contact, "", o.greeting, "", letterBody(o).join("\n\n"), "", o.signOff || "Kind regards,", o.name].join("\n");
}

export const bodyWords = (o: LetterParts) => wordCount(letterBody(o).join(" "));

interface OpeningPick { line: number; problem: string; clause: string }

const toOpening = (x: any): OpeningPick | null => {
  const line = Number(x?.line);
  const problem = String(x?.problem || "").replace(/\s+/g, " ").trim();
  const clause = String(x?.clause || "").replace(/\s+/g, " ").trim();
  return Number.isInteger(line) && line > 0 && problem && clause ? { line, problem, clause } : null;
};

/** The two-sentence opening story: the problem, then "At X, I ..." with the result. */
export function composeOpening(o: OpeningPick, employer: string): string {
  return `${sentence(shortForms(o.problem))} ${composeResult(shortForms(o.clause), employer)}`;
}

/**
 * Picks lines by fit for the role, asks for them to be retold, checks every
 * part, replaces failed results with the next best line from an unused
 * employer, and assembles the letter. Up to three results.
 */
export async function buildSlotLetter(
  base: Omit<LetterParts, "results" | "opening" | "companyFact" | "why">,
  ctx: SlotContext & { requirements: string[] },
  ask: (prompt: string) => Promise<string | null>,
  log: (m: string) => void = () => {},
): Promise<{ letter: string; parts: LetterParts; used: string[] } | null> {
  const ranked = rankLines(ctx.bullets, ctx.requirements, ctx.description, ctx.story, base.role);
  const byN = new Map(ctx.bullets.map((b) => [b.n, b]));
  const failedLines = new Set<number>();
  const attempts = new Map<number, number>();
  const notes: string[] = [];
  const chosen: { n: number; text: string }[] = [];
  let opening: { n: number; text: string } | undefined;
  let openingLine: ProfileBullet | undefined = ctx.story ? undefined : ranked[0];
  const lists = () => [ctx.story, opening?.text, ...chosen.map((c) => c.text)].filter((x) => x && hasTripleList(x)).length;

  const record = (n: number) => { attempts.set(n, (attempts.get(n) || 0) + 1); if ((attempts.get(n) || 0) >= 2) failedLines.add(n); };

  const tryResult = (p: Pick, allowed: Set<number>) => {
    if (!allowed.has(p.line) || chosen.length >= 3) return;
    const b = byN.get(p.line);
    if (!b || resultEmployers.has(b.company) || b.n === opening?.n || b.n === openingLine?.n) return;
    record(p.line);
    const text = composeResult(shortForms(p.clause), b.company);
    const f = checkResult(text, { ...b, text: shortForms(b.text) }, ctx);
    if (hasTripleList(text) && lists() >= 1) f.push("uses a list of three; the letter already has one");
    if (f.length) { log(`result line ${p.line} failed: ${f.join("; ")}`); notes.push(...f.slice(0, 2).map((x) => `line ${p.line} ${x}`)); return; }
    failedLines.add(p.line);
    chosen.push({ n: p.line, text });
    resultEmployers.add(b.company);
  };

  const tryOpening = (o: OpeningPick | null) => {
    if (!o || !openingLine || o.line !== openingLine.n || opening) return;
    record(o.line);
    const b = openingLine;
    const text = composeOpening(o, b.company);
    const f = [...checkResult(text, { ...b, text: shortForms(b.text) }, ctx)];
    // The problem sentence states only what the line says.
    if (overlap(shortForms(o.problem), shortForms(b.text)) < 0.5) f.push(`states a problem that line ${b.n} does not describe`);
    if (/\bI am applying\b/i.test(text)) f.push('opens with "I am applying"');
    if (f.length) { log(`opening line ${o.line} failed: ${f.join("; ")}`); notes.push(...f.slice(0, 2).map((x) => `line ${o.line} ${x}`)); return; }
    opening = { n: o.line, text };
    // The opening wins a list of three; a result that also uses one is replaced.
    if (hasTripleList(text) || ctx.story && hasTripleList(ctx.story)) {
      for (let i = chosen.length - 1; i >= 0; i--) if (hasTripleList(chosen[i].text)) { log(`result line ${chosen[i].n} dropped: the opening already uses a list of three`); resultEmployers.delete(byN.get(chosen[i].n)!.company); chosen.splice(i, 1); }
    }
  };

  const factFails = (x: string) => {
    const f = checkCompanyFact(x, ctx);
    if (hasBoast(x)) f.push("uses a marketing boast");
    if (hasTripleList(x) && lists() >= 1) f.push("uses a list of three; the letter already has one");
    return f;
  };

  // First request: the opening line (no story) and the three best lines from other employers.
  const resultEmployers = new Set<string>();
  let resultLines = bestByEmployer(ranked, new Set(), new Set(openingLine ? [openingLine.n] : [])).slice(0, 3);
  const raw = await ask(slotPrompt({ role: base.role, company: ctx.company, requirements: ctx.requirements, openingLine, resultLines, description: ctx.description, story: ctx.story }));
  if (raw == null) return null;
  let rawObj: any = {};
  try { const t = raw.replace(/```[a-z]*\s*/gi, ""); rawObj = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { /* parsed below */ }
  const reply = parseReply(raw);
  tryOpening(toOpening(rawObj?.opening));
  for (const p of reply.results) tryResult(p, new Set(resultLines.map((b) => b.n)));

  const clean = (x?: string) => x ? stripBoast(restorePunctuation(shortForms(x), ctx.description)) : "";
  let companyFact = "";
  const f0 = clean(reply.companyFact);
  if (f0) { const f = factFails(f0); if (!f.length) companyFact = f0; else log(`companyFact failed: ${f.join("; ")}`); }
  const evidence = () => [opening?.text, ...chosen.map((c) => c.text)].filter(Boolean) as string[];
  const whyFails = (w: string) => [...checkWhy(w, companyFact, evidence(), ctx), ...(hasTripleList(w) && lists() >= 1 ? ["uses a list of three"] : [])];
  let why = "";
  if (reply.why && companyFact) { const f = whyFails(reply.why); if (!f.length) why = reply.why; else log(`why failed: ${f.join("; ")}`); }

  // Replacement rounds: the same line once more, then the next best line from an unused employer.
  for (let round = 0; round < 5; round++) {
    if (!opening && openingLine && failedLines.has(openingLine.n)) {
      openingLine = ranked.find((b) => !failedLines.has(b.n) && !chosen.some((c) => c.n === b.n));
    }
    const needOpening = !ctx.story && !opening && !!openingLine;
    const exclude = new Set<number>([...failedLines, ...(openingLine ? [openingLine.n] : []), ...(opening ? [opening.n] : [])]);
    resultLines = chosen.length < 3 ? bestByEmployer(ranked, resultEmployers, exclude).slice(0, 3 - chosen.length + 1) : [];
    if (!needOpening && !resultLines.length && companyFact && why) break;
    if (!needOpening && chosen.length >= 3 && companyFact && why) break;
    const wantWhy = companyFact && !why ? `one sentence linking "${companyFact}" to ${ctx.story ? "this story: " + ctx.story : "one of these results: " + evidence().join(" ")} by naming the same problem. Never a generic link.` : "";
    const r2 = await ask(replacementPrompt(resultLines, [...new Set(notes)].slice(0, 6), !companyFact, wantWhy, ctx.company, needOpening ? openingLine : undefined));
    if (r2 == null) break;
    let o2: any = {};
    try { const t = r2.replace(/```[a-z]*\s*/gi, ""); o2 = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { /* ignore */ }
    const rep = parseReply(r2);
    if (needOpening) tryOpening(toOpening(o2?.opening));
    for (const p of rep.results) tryResult(p, new Set(resultLines.map((b) => b.n)));
    if (!companyFact && rep.companyFact) { const c = clean(rep.companyFact); const f = factFails(c); if (!f.length) companyFact = c; else log(`companyFact retry failed: ${f.join("; ")}`); }
    if (companyFact && !why && rep.why) { const f = whyFails(rep.why); if (!f.length) why = rep.why; else log(`why retry failed: ${f.join("; ")}`); }
  }
  if (!companyFact) {
    let fb = stripBoast(factFromPosting(ctx.description, ctx.company));
    if (fb && hasTripleList(fb) && lists() >= 1) {
      const m = fb.match(/[:,]\s/);
      fb = m && m.index && fb.slice(0, m.index).split(/\s+/).length >= 6 ? `${fb.slice(0, m.index)}.` : "";
    }
    if (fb) { companyFact = shortForms(fb); log("companyFact taken word for word from the posting"); }
  }
  if (why && whyFails(why).length) why = "";
  const final: LetterParts = { ...base, opening: opening?.text, results: chosen.map((c) => c.text), companyFact: companyFact || undefined, why: why || undefined };
  const used = [
    ...(opening ? [`opening (line ${opening.n})`] : []),
    ...chosen.map((c, i) => `result${i + 1} (line ${c.n})`),
    ...(final.companyFact ? ["companyFact"] : []),
    ...(final.why ? ["why"] : final.companyFact ? ["reason line"] : []),
  ];
  return { letter: assembleLetter(final), parts: final, used };
}
