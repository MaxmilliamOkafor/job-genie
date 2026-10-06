// Cover letter built from checked slots. The model returns short JSON slots;
// code checks each one against the saved profile, the tailored CV and the job
// description, then assembles the letter. A failed slot gets one retry, then
// it is dropped. Nothing is padded.

import { LETTER_BANNED, containsTerm, copiesBullet, rightToWorkStatement, wordCount } from "./guards.ts";

export type SlotName = "opening" | "result1" | "result2" | "result3" | "companyFact" | "why";
export type Slots = Partial<Record<SlotName, string>>;

export const SLOT_BANNED = [
  ...LETTER_BANNED,
  "aligns well with", "aligns with", "resonates with", "particularly motivating", "professional values", "innovative",
  "successfully", "solutions that directly impact", "through effective communication", "showcasing my ability",
];

export interface SlotContext {
  experience: any[];
  cvText: string;
  description: string;
  tools: string[];
  profileText: string;
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

const numbersIn = (s: string) => (String(s || "").match(/\d+(?:[.,]\d+)*/g) || []);
const flat = (s: string) => String(s || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();

/** Titles the candidate held; "As a X" is only allowed for one of these. */
function heldTitle(x: string, experience: any[]): boolean {
  const t = flat(x);
  return roleList(experience).some((r) => r.title && (flat(r.title) === t || flat(r.title).includes(t)));
}

/** Claims of a title or field the profile does not show. */
export function unsupportedClaims(text: string, experience: any[], profileText: string): string[] {
  const out: string[] = [];
  const s = String(text || "");
  for (const m of s.matchAll(/\bas an? ([A-Z][^,.;]*?)(?=\s+(?:at|with|for|in|on|who|I)\b|[,.;]|$)/g)) {
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
  return SLOT_BANNED.filter((b) => {
    const p = flat(b);
    return p.endsWith(",") ? new RegExp(`(^|[.!?]\\s+)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t) : new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t);
  });
}

/** Problems with one slot; empty means it can be used. */
export function checkSlot(name: SlotName, text: string, ctx: SlotContext): string[] {
  const s = String(text || "").trim();
  if (!s) return ["empty"];
  const fails: string[] = [];
  const roles = roleList(ctx.experience);
  const cvLines = String(ctx.cvText || "").split("\n").map((l) => l.replace(/^\s*[•*\-▪·]\s+/, "").trim()).filter(Boolean);

  if (name === "companyFact") {
    if (!flat(ctx.description).includes(flat(s).replace(/[.]$/, ""))) fails.push("is not copied word for word from the job description");
  } else {
    const named = roles.filter((r) => containsTerm(s, r.company));
    if (/^result/.test(name) && !named.length) fails.push("names no employer from the profile");
    const source = named.length ? named.map((r) => r.text).join("\n") : roles.map((r) => r.text).join("\n");
    const srcFlat = flat(source);
    for (const n of numbersIn(s)) if (!srcFlat.includes(n.toLowerCase())) fails.push(`uses the number ${n}, which is not in ${named.length ? "that employer's" : "the"} profile entry`);
    for (const tool of ctx.tools) if (containsTerm(s, tool) && !containsTerm(source, tool)) fails.push(`names ${tool}, which is not in ${named.length ? "that employer's" : "the"} profile entry`);
    if (copiesBullet(s, cvLines)) fails.push("repeats 8 or more words in a row from the CV");
    fails.push(...unsupportedClaims(s, ctx.experience, ctx.profileText));
  }
  for (const b of bannedIn(s)) fails.push(`uses the banned phrase "${b}"`);
  if (/[\u2013\u2014]/.test(s)) fails.push("uses a dash");
  return fails;
}

export function checkSlots(slots: Slots, ctx: SlotContext, story: string): Partial<Record<SlotName, string[]>> {
  const out: Partial<Record<SlotName, string[]>> = {};
  const names: SlotName[] = ["result1", "result2", "result3", "companyFact", "why"];
  if (!story) names.unshift("opening");
  for (const n of names) {
    if (n === "result3" && !slots.result3) continue;
    const f = checkSlot(n, slots[n] || "", ctx);
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
    return out;
  } catch {
    return {};
  }
}

export function slotPrompt(o: { role: string; company: string; requirements: string[]; experience: any[]; description: string; story: string }): string {
  const roles = roleList(o.experience).map((r) => `--- ${r.company} (${r.title})\n${r.text}`).join("\n\n");
  return `Write parts of a cover letter for the ${o.role} role at ${o.company}. Return one JSON object and nothing else.

Slots:
${o.story ? "" : `- "opening": one sentence naming the ${o.role} role and the candidate's strongest result that matches the job's top requirement.\n`}- "result1": one sentence, first person. Name one employer from the profile and a result from that employer's entry that matches this requirement: ${o.requirements[0] || "the main requirement"}.
- "result2": one sentence, first person. Name an employer from the profile and a result from that employer's entry that matches: ${o.requirements[1] || o.requirements[0] || "the second requirement"}.
- "result3": optional, one sentence, a third result with its employer.
- "companyFact": a phrase copied word for word from the job description about what the company does.
- "why": one sentence linking companyFact to result1 or result2.

Rules:
- Use only numbers and tools that appear in that employer's entry below. Never invent a fact.
- Tell each result in different words from the profile; never copy 8 or more words in a row.
- Never claim a job title the candidate has not held, and never write "background in" a field the profile does not show.
- Never use: ${SLOT_BANNED.map((b) => `"${b}"`).join(", ")}.
- No dashes as pauses. At most 35 words per sentence.

Job's top requirements: ${o.requirements.join("; ")}

PROFILE EXPERIENCE:
${roles}

JOB DESCRIPTION:
${String(o.description || "").slice(0, 6000)}`;
}

export function slotRetryPrompt(base: string, slots: Slots, failed: Partial<Record<SlotName, string[]>>): string {
  const lines = Object.entries(failed).map(([k, f]) => `- "${k}": "${slots[k as SlotName] || ""}" failed because it ${(f || []).join("; ")}`);
  return `${base}\n\nThese slots failed the checks. Rewrite only these and return a JSON object with only these keys:\n${lines.join("\n")}`;
}

const sentence = (s: string) => { const t = String(s || "").trim(); return t && !/[.!?]$/.test(t) ? `${t}.` : t; };
const article = (s: string) => (/^[aeiou]/i.test(s) && !/^eu\b/i.test(s) ? "an" : /^eu\b/i.test(s) ? "an" : "a");

export function rightToWorkSentence(citizenship: string, countries: string[], location: string): string {
  const st = rightToWorkStatement(citizenship, countries, location);
  return st ? `I am ${article(st)} ${st}.` : "";
}

/** Builds the letter from the checked slots. Missing slots are left out, never padded. */
export function assembleLetter(o: {
  name: string; contact: string; greeting: string; story: string; role: string; company: string;
  slots: Slots; rightToWork: string; notice: string; signOff: string;
}): string {
  const s = o.slots;
  const p1 = o.story ? `${o.story.trim()} That is what drew me to the ${o.role} role at ${o.company}.` : sentence(s.opening || "");
  const results = [s.result1, s.result2].filter(Boolean).map((x) => sentence(x!));
  const p3 = s.companyFact ? [`The posting describes ${o.company} as "${s.companyFact.replace(/[.]$/, "")}".`, s.why ? sentence(s.why) : ""].filter(Boolean).join(" ") : "";
  const notice = o.notice ? `My notice period is ${o.notice.trim().replace(/[.]$/, "")}.` : "";
  const p4 = [o.rightToWork, notice, "I am available for a call whenever suits you."].filter(Boolean).join(" ");
  const build = (res: string[]) => [p1, res.join(" "), p3, p4].filter(Boolean);
  let body = build(results);
  if (s.result3 && wordCount(body.join(" ")) < 200) body = build([...results, sentence(s.result3)]);
  return [o.name, o.contact, "", o.greeting, "", body.join("\n\n"), "", o.signOff || "Kind regards,", o.name].join("\n");
}
