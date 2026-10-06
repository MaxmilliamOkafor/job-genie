// Cover letter built from checked slots. The model returns short JSON slots;
// code checks each one against the saved profile, the tailored CV and the job
// description, then assembles the letter. A failed slot gets one retry, then
// it is dropped. Nothing is padded.

import { BANNED_PHRASES, LETTER_BANNED, containsTerm, copiesBullet, letterRightToWorkSentence, wordCount } from "./guards.ts";

export type SlotName = "opening" | "result1" | "result2" | "result3" | "companyFact" | "why";
export type Slots = Partial<Record<SlotName, string>> & { result1Bullet?: number; result2Bullet?: number; result3Bullet?: number };

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

/** Problems with one slot; empty means it can be used. */
export function checkSlot(name: SlotName, text: string, ctx: SlotContext, slots: Slots = {}): string[] {
  const s = String(text || "").trim();
  if (!s) return ["empty"];
  const fails: string[] = [];
  const roles = roleList(ctx.experience);
  const cvLines = String(ctx.cvText || "").split("\n").map((l) => l.replace(/^\s*[•*\-▪·]\s+/, "").trim()).filter(Boolean);

  if (name === "companyFact") {
    if (!flat(s).startsWith(flat(ctx.company))) fails.push(`does not start with "${ctx.company}"`);
    const desc = stemSet(ctx.description);
    const missing = contentWords(s, [ctx.company]).filter((w) => !desc.has(stem(w)));
    if (missing.length) fails.push(`uses words not in the job description: ${[...new Set(missing)].join(", ")}`);
    if (/["\u201c\u201d]|your posting says/i.test(s)) fails.push("quotes the posting instead of a plain sentence");
  } else if (name === "why") {
    const fact = stemSet(slots.companyFact || "");
    const evidence = stemSet([ctx.story, slots.result1, slots.result2, slots.result3].filter(Boolean).join(" "));
    const problem = contentWords(s, [ctx.company]).filter((w) => w.length >= 5 && !GENERIC.has(w)).map(stem);
    if (!problem.some((w) => fact.has(w) && evidence.has(w))) fails.push("does not name the same problem as the company fact and the story or a result");
  } else {
    if (/^result/.test(name)) {
      const n = Number((slots as any)[`${name}Bullet`]);
      fails.push(...checkAgainstBullet(s, ctx.bullets.find((b) => b.n === n), ctx.tools));
      if (name === "result2" && slots.result1Bullet && slots.result2Bullet) {
        const a = ctx.bullets.find((b) => b.n === slots.result1Bullet)?.company, b2 = ctx.bullets.find((b) => b.n === slots.result2Bullet)?.company;
        if (a && a === b2 && new Set(ctx.bullets.map((b) => b.company)).size > 1) fails.push(`uses ${a} again; result1 already uses that employer`);
      }
    } else {
      const named = roles.filter((r) => has(s, r.company));
      const source = named.length ? named.map((r) => r.text).join("\n") : roles.map((r) => r.text).join("\n");
      for (const n of numbersIn(s)) if (!flat(source).includes(n.toLowerCase())) fails.push(`uses the number ${n}, which is not in the profile entry`);
      for (const tool of ctx.tools) if (has(s, tool) && !has(source, tool)) fails.push(`names ${tool}, which is not in the profile entry`);
    }
    if (copiesBullet(s, cvLines)) fails.push("repeats 8 or more words in a row from the CV");
    fails.push(...unsupportedClaims(s, ctx.experience, ctx.profileText));
  }
  if (ctx.company && new RegExp(`\\b${esc(ctx.company)}\\s*,\\s*where\\s+I\\b`, "i").test(s)) fails.push(`writes ", where I" after ${ctx.company}, as if the candidate works there`);
  for (const b of bannedIn(s)) fails.push(`uses the banned phrase "${b}"`);
  if (/[\u2013\u2014]/.test(s)) fails.push("uses a dash");
  return fails;
}

export function checkSlots(slots: Slots, ctx: SlotContext): Partial<Record<SlotName, string[]>> {
  const out: Partial<Record<SlotName, string[]>> = {};
  const names: SlotName[] = ["result1", "result2", "result3", "companyFact", "why"];
  if (!ctx.story) names.unshift("opening");
  for (const n of names) {
    if (n === "result3" && !slots.result3) continue;
    const f = checkSlot(n, slots[n] || "", ctx, slots);
    if (f.length) out[n] = f;
  }
  return out;
}

export function parseSlots(raw: string): Slots {
  const t = String(raw || "").replace(/```[a-z]*\s*/gi, "").trim();
  try {
    const o = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const out: Slots = {};
    for (const k of ["opening", "result1", "result2", "result3", "companyFact", "why"] as SlotName[]) {
      if (typeof o?.[k] === "string" && o[k].trim()) out[k] = o[k].replace(/\s+/g, " ").trim();
    }
    for (const k of ["result1Bullet", "result2Bullet", "result3Bullet"] as const) {
      const n = Number(o?.[k]);
      if (Number.isInteger(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function slotPrompt(o: { role: string; company: string; requirements: string[]; bullets: ProfileBullet[]; description: string; story: string }): string {
  const lines = o.bullets.map((b) => `${b.n}. [${b.company}] ${b.text}`).join("\n");
  return `Write parts of a cover letter for the ${o.role} role at ${o.company}. Return one JSON object and nothing else.

Slots:
${o.story ? "" : `- "opening": one sentence naming the ${o.role} role at ${o.company} and the candidate's strongest result that matches the job's top requirement. Never write ", where I" after ${o.company}.\n`}- "result1" and "result1Bullet": one first-person sentence retelling ONE numbered profile line below that matches: ${o.requirements[0] || "the main requirement"}. Name that line's employer. "result1Bullet" is the line number you used.
- "result2" and "result2Bullet": the same for: ${o.requirements[1] || o.requirements[0] || "the second requirement"}. Use a line from a different employer than result1 where possible.
- "result3" and "result3Bullet": optional third result from another line, ideally another employer.
- "companyFact": one plain sentence starting with "${o.company}" saying what the company does, using only words from the job description. No quotation marks.
- "why": one sentence linking companyFact to ${o.story ? "the opening story" : "result1 or result2"} by naming the same problem (for example identity, fraud, patients).

Rules:
- A result keeps the line's own words and facts. Add no number, tool or claim the line does not have. Never add: ${NO_ADD_WORDS.join(", ")}, unless the line has the word.
- Never copy 8 or more words in a row from the line.
- Never claim a job title the candidate has not held, and never write "background in" a field the profile does not show.
- Never use: ${SLOT_BANNED.map((b) => `"${b}"`).join(", ")}, and never "I am eager/excited/thrilled/keen/delighted to apply".
- No dashes as pauses. At most 35 words per sentence.

Job's top requirements: ${o.requirements.join("; ")}
${o.story ? `\nOPENING STORY (already written, do not repeat it):\n${o.story}\n` : ""}
PROFILE LINES:
${lines}

JOB DESCRIPTION:
${String(o.description || "").slice(0, 6000)}`;
}

export function slotRetryPrompt(base: string, slots: Slots, failed: Partial<Record<SlotName, string[]>>): string {
  const lines = Object.entries(failed).map(([k, f]) => `- "${k}": "${slots[k as SlotName] || ""}" failed because it ${(f || []).join("; ")}`);
  return `${base}\n\nThese slots failed the checks. Rewrite only these (with their line numbers for results) and return a JSON object with only those keys:\n${lines.join("\n")}`;
}

const sentence = (s: string) => { const t = String(s || "").trim(); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };

/** The cover letter's right-to-work sentence, always a full sentence, or "". */
export function rightToWorkSentence(citizenship: string, countries: string[], location: string): string {
  return letterRightToWorkSentence(citizenship, countries, location);
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
  for (let m = (1 << results.length) - 1; m > 0; m--) subsets.push(results.filter((_, i) => m & (1 << i)));
  subsets.sort((a, b) => b.length - a.length);
  for (const sub of subsets) for (const p of perms(sub)) if (ok(p)) return p;
  return [];
}

/** Builds the letter from the checked slots. Missing slots are left out, never padded. */
export function assembleLetter(o: {
  name: string; contact: string; greeting: string; story: string; role: string; company: string;
  slots: Slots; rightToWork: string; notice: string; signOff: string; employers?: string[];
}): string {
  const s = o.slots;
  const employers = (o.employers || []).filter(Boolean);
  const p1 = o.story ? `${o.story.trim()} That is what drew me to the ${o.role} role at ${o.company}.` : sentence(s.opening || "");
  const lastOfP1 = p1.split(/(?<=[.!?])\s+/).pop() || "";
  const p3 = s.companyFact ? [sentence(s.companyFact), s.why ? sentence(s.why) : ""].filter(Boolean).join(" ") : "";
  const notice = o.notice ? `My notice period is ${o.notice.trim().replace(/[.]$/, "")}.` : "";
  const p4 = [o.rightToWork, notice, "I am available for a call whenever suits you."].filter(Boolean).join(" ");
  const build = (res: string[]) => [p1, orderResults(res.map(sentence), lastOfP1, employers).join(" "), p3, p4].filter(Boolean);
  const two = [s.result1, s.result2].filter(Boolean) as string[];
  let body = build(two);
  if (s.result3 && wordCount(body.join(" ")) < LETTER_WORD_FLOOR) body = build([...two, s.result3]);
  return [o.name, o.contact, "", o.greeting, "", body.join("\n\n"), "", o.signOff || "Kind regards,", o.name].join("\n");
}
