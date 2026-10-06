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
export function rankLines(bullets: ProfileBullet[], requirements: string[], description: string, story: string): ProfileBullet[] {
  const req = stemSet(requirements.join(" ")), desc = stemSet(description);
  const score = (b: ProfileBullet) => {
    const w = [...stemSet(b.text)];
    return w.filter((x) => req.has(x)).length * 3 + w.filter((x) => desc.has(x)).length + (/\d/.test(b.text) ? 2 : 0);
  };
  return bullets.filter((b) => !isStoryLine(b, story)).map((b) => ({ b, s: score(b) })).sort((a, z) => z.s - a.s).map((x) => x.b);
}

const lineList = (bullets: ProfileBullet[]) => bullets.map((b) => `${b.n}. [${b.company}] ${b.text}`).join("\n");

const CLAUSE_RULES = `Each "clause" retells ONE numbered line as what the candidate did, starting with a past-tense verb, without "I" and without the employer's name (code adds "At {Employer}, I"). 18 to 30 words.
- Keep the line's own words and facts: at least 60% of the clause's words must come from that line. Add no number, tool or claim the line does not have. Never add: ${NO_ADD_WORDS.join(", ")}, unless the line has the word.
- Never copy ${COPY_RUN} or more words in a row from the line.
- Never use: ${SLOT_BANNED.map((b) => `"${b}"`).join(", ")}, and never "I am eager/excited/thrilled/keen/delighted to apply".
- No dashes as pauses.`;

export function slotPrompt(o: { role: string; company: string; requirements: string[]; lines: ProfileBullet[]; description: string; story: string }): string {
  return `Write parts of a cover letter for the ${o.role} role at ${o.company}. Return one JSON object and nothing else:
{${o.story ? "" : `"opening": {"line": N, "clause": "..."}, `}"results": [{"line": N, "clause": "..."}, ...], "companyFact": "...", "why": "..."}

${o.story ? "" : `- "opening": the candidate's strongest line for the job's top requirement (${o.requirements[0] || "the main requirement"}).\n`}- "results": four lines ranked best first, each from a DIFFERENT employer${o.story ? "" : " and different from the opening's employer"}, matching: ${o.requirements.join("; ")}.
- "companyFact": one plain sentence starting with "${o.company}" saying what the company does, using only words from the job description, as a full grammatical sentence with its punctuation. No quotation marks.
- "why": one sentence linking companyFact to ${o.story ? "the opening story" : "a result"} by naming the same problem (for example identity, fraud, patients). Name only facts that are in the story or result itself. Never a generic link such as "connects to my experience" or "similar to".

${CLAUSE_RULES}
${o.story ? `\nOPENING STORY (already written; never retell it):\n${o.story}\n` : ""}
NUMBERED PROFILE LINES:
${lineList(o.lines)}

JOB DESCRIPTION:
${String(o.description || "").slice(0, 6000)}`;
}

export function replacementPrompt(lines: ProfileBullet[], notes: string[], wantFact: boolean, wantWhy: string, company: string): string {
  return `Retell each numbered line below for a cover letter. Return one JSON object and nothing else:
{"results": [{"line": N, "clause": "..."}]${wantFact ? `, "companyFact": "..."` : ""}${wantWhy ? `, "why": "..."` : ""}}

${CLAUSE_RULES}
${wantFact ? `\n"companyFact": one plain sentence starting with "${company}" using only words from the job description, no quotation marks.` : ""}${wantWhy ? `\n"why": ${wantWhy}` : ""}
${notes.length ? `\nEarlier attempts failed because they: ${notes.join("; ")}` : ""}

LINES:
${lineList(lines)}`;
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

export function letterBody(o: LetterParts): string[] {
  const employers = (o.employers || []).filter(Boolean);
  const p1 = o.story ? `${o.story.trim()} That is what drew me to the ${o.role} role at ${o.company}.` : [`I am applying for the ${o.role} role at ${o.company}.`, o.opening || ""].filter(Boolean).join(" ");
  const lastOfP1 = p1.split(/(?<=[.!?])\s+/).pop() || "";
  const p3 = o.companyFact ? [sentence(o.companyFact), o.why ? sentence(o.why) : ""].filter(Boolean).join(" ") : "";
  const notice = o.notice ? `My notice period is ${o.notice.trim().replace(/[.]$/, "")}.` : "";
  const p4 = [o.rightToWork, notice, "I am available for a call whenever suits you."].filter(Boolean).join(" ");
  return [p1, orderResults(o.results, lastOfP1, employers).join(" "), p3, p4].filter(Boolean);
}

/** Builds the letter from checked parts. Missing parts are left out, never padded. */
export function assembleLetter(o: LetterParts): string {
  return [o.name, o.contact, "", o.greeting, "", letterBody(o).join("\n\n"), "", o.signOff || "Kind regards,", o.name].join("\n");
}

export const bodyWords = (o: LetterParts) => wordCount(letterBody(o).join(" "));

/**
 * Asks for the slots, checks them, replaces failed results with the next best
 * line from an unused employer, and assembles the letter. Up to three results,
 * added until the body reaches LETTER_WORD_FLOOR words.
 */
export async function buildSlotLetter(
  base: Omit<LetterParts, "results" | "opening" | "companyFact" | "why">,
  ctx: SlotContext & { requirements: string[] },
  ask: (prompt: string) => Promise<string | null>,
  log: (m: string) => void = () => {},
): Promise<{ letter: string; parts: LetterParts; used: string[] } | null> {
  const lines = rankLines(ctx.bullets, ctx.requirements, ctx.description, ctx.story);
  const byN = new Map(ctx.bullets.map((b) => [b.n, b]));
  const raw = await ask(slotPrompt({ role: base.role, company: ctx.company, requirements: ctx.requirements, lines: ctx.bullets.filter((b) => !isStoryLine(b, ctx.story)), description: ctx.description, story: ctx.story }));
  if (raw == null) return null;
  const reply = parseReply(raw);
  const tried = new Set<number>();
  const notes: string[] = [];
  const usedEmployers = new Set<string>();
  const chosen: { n: number; text: string }[] = [];
  let opening: { n: number; text: string } | undefined;

  const accept = (p: Pick, label: string): { n: number; text: string } | null => {
    tried.add(p.line);
    const b = byN.get(p.line);
    if (!b) { log(`${label} line ${p.line} failed: not a profile line`); return null; }
    if (usedEmployers.has(b.company)) { log(`${label} line ${p.line} failed: ${b.company} already used`); return null; }
    const text = composeResult(p.clause, b.company);
    const f = checkResult(text, b, ctx);
    if (f.length) { log(`${label} line ${p.line} failed: ${f.join("; ")}`); notes.push(...f.slice(0, 2)); return null; }
    return { n: p.line, text };
  };

  if (!ctx.story && reply.opening) {
    const o = accept(reply.opening, "opening");
    if (o) { opening = o; usedEmployers.add(byN.get(o.n)!.company); }
  }
  for (const p of reply.results) {
    if (chosen.length >= 3) break;
    const r = accept(p, "result");
    if (r) { chosen.push(r); usedEmployers.add(byN.get(r.n)!.company); }
  }

  if (reply.companyFact) reply.companyFact = restorePunctuation(reply.companyFact, ctx.description);
  let companyFact = reply.companyFact && !checkCompanyFact(reply.companyFact, ctx).length ? reply.companyFact : "";
  if (reply.companyFact && !companyFact) log(`companyFact failed: ${checkCompanyFact(reply.companyFact, ctx).join("; ")}`);
  const evidence = () => [opening?.text, ...chosen.map((c) => c.text)].filter(Boolean) as string[];
  const whyOk = (w?: string) => !!w && !!companyFact && !checkWhy(w, companyFact, evidence(), ctx).length;
  let why = whyOk(reply.why) ? reply.why : "";
  if (reply.why && !why) log(`why failed: ${companyFact ? checkWhy(reply.why, companyFact, evidence(), ctx).join("; ") : "no company fact"}`);

  const parts = (): LetterParts => ({ ...base, opening: opening?.text, results: chosen.map((c) => c.text), companyFact: companyFact || undefined, why: why || undefined });
  const needMore = () => chosen.length < 2 || (chosen.length < 3 && bodyWords(parts()) < LETTER_WORD_FLOOR);

  // Up to two replacement rounds: next best lines from employers not yet used.
  for (let round = 0; round < 2 && (needMore() || (!ctx.story && !opening) || !companyFact || !why); round++) {
    const fresh = lines.filter((b) => !tried.has(b.n) && !usedEmployers.has(b.company));
    const want: ProfileBullet[] = [];
    for (const b of fresh) if (!want.some((w) => w.company === b.company) && want.length < 4) want.push(b);
    if (!want.length && companyFact && why) break;
    const wantWhy = companyFact && !why ? `one sentence linking "${companyFact}" to ${ctx.story ? "this story: " + ctx.story : "one of these results: " + evidence().join(" ")} by naming the same problem. Never a generic link.` : "";
    const r2 = await ask(replacementPrompt(want, [...new Set(notes)].slice(0, 6), !companyFact, wantWhy, ctx.company));
    const rep = r2 ? parseReply(r2) : { results: [] as Pick[] };
    for (const p of rep.results) {
      const b = byN.get(p.line);
      if (!b || !want.some((w) => w.n === p.line)) continue;
      if (!ctx.story && !opening) {
        const o = accept(p, "opening");
        if (o) { opening = o; usedEmployers.add(b.company); continue; }
      } else if (needMore()) {
        const r = accept(p, "result");
        if (r) { chosen.push(r); usedEmployers.add(b.company); }
      }
    }
    if (!companyFact && rep.companyFact) {
      rep.companyFact = restorePunctuation(rep.companyFact, ctx.description);
      const f = checkCompanyFact(rep.companyFact, ctx);
      if (!f.length) companyFact = rep.companyFact; else log(`companyFact retry failed: ${f.join("; ")}`);
    }
    if (companyFact && !why && rep.why) {
      if (whyOk(rep.why)) why = rep.why; else log(`why retry failed: ${checkWhy(rep.why, companyFact, evidence(), ctx).join("; ")}`);
    }
  }
  if (!companyFact) { companyFact = factFromPosting(ctx.description, ctx.company); if (companyFact) log("companyFact taken word for word from the posting"); }
  if (why && !whyOk(why)) why = "";
  const final = parts();
  const used = [
    ...(opening ? [`opening (line ${opening.n})`] : []),
    ...chosen.map((c, i) => `result${i + 1} (line ${c.n})`),
    ...(final.companyFact ? ["companyFact"] : []),
    ...(final.why ? ["why"] : []),
  ];
  return { letter: assembleLetter(final), parts: final, used };
}
