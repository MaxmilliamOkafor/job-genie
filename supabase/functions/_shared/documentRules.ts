// FINAL CV RULES FROM THE EXTENSION BRIEF (10 Nov).
//
// Pure helpers the tailoring function runs on the finished CV, after the
// keyword step and before monetary exclusion. Each one only removes, moves or
// renames what the CV already says; nothing is added that the saved profile
// does not show. Every helper returns the same text when run a second time.
import { termAppearsIn } from "./coverage.ts";
import { categoriseSkill } from "./skillsPlacement.ts";

const BULLET = /^(\s*(?:[•●▪◦‣∙·*]|-)\s+)(.*)$/;
const HEAD_LINE = /^[A-Z][A-Z &/]{3,}$/;
const EXP_HEAD = /^(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT(?: HISTORY)?)$/i;
const SKILLS_HEAD = /^(?:TECHNICAL SKILLS|SKILLS|CORE SKILLS|KEY SKILLS|TECHNICAL PROFICIENCIES)$/i;
const SUMMARY_HEAD = /^(?:PROFESSIONAL SUMMARY|SUMMARY|PROFILE|CAREER SUMMARY)$/i;
const EXTRA_SKILLS_HEAD = /^(?:CORE COMPETENCIES|KEY COMPETENCIES|COMPETENCIES|ADDITIONAL SKILLS|OTHER SKILLS)$/i;
const EXTRA_SKILLS_LABEL = /^(?:core competencies|key competencies|competencies|additional skills|other skills|other|miscellaneous|misc)$/i;
const LONE_OK_LABEL = /^(?:languages?|spoken languages?|soft skills)$/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const splitSentences = (s: string) => String(s || "").split(/(?<=[.!?])\s+(?=[A-Z(])/).filter((x) => x.trim());
const bag = (s: string) => new Set((String(s || "").toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g) || []));
function overlap(a: string, b: string): number {
  const x = bag(a), y = bag(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}
function bestSource(text: string, sources: string[]): { line: string; score: number } {
  let best = { line: "", score: 0 };
  for (const line of sources || []) {
    const score = overlap(text, line);
    if (score > best.score) best = { line, score };
  }
  return best;
}

type Kind = "header" | "head" | "exp" | "skills" | "summary" | "extra" | "other";
function sectionsOf(lines: string[]): Kind[] {
  const kinds: Kind[] = [];
  let cur: Kind = "header";
  for (const l of lines) {
    const t = l.trim();
    if (EXP_HEAD.test(t)) { cur = "exp"; kinds.push("head"); continue; }
    if (SKILLS_HEAD.test(t)) { cur = "skills"; kinds.push("head"); continue; }
    if (SUMMARY_HEAD.test(t)) { cur = "summary"; kinds.push("head"); continue; }
    if (EXTRA_SKILLS_HEAD.test(t)) { cur = "extra"; kinds.push("head"); continue; }
    if (HEAD_LINE.test(t)) { cur = "other"; kinds.push("head"); continue; }
    kinds.push(cur);
  }
  return kinds;
}

// ============================================================
// A. THE DOCUMENT NEVER TALKS ABOUT ITSELF.
// ============================================================

const SELF_TALK_PATTERNS: RegExp[] = [
  /\bATS\b/,
  /\bapplicant[- ]tracking(?:\s+systems?)?\b/i,
  /\bkey ?words?\b/i,
  /\bresume content\b/i,
  /\bCV content\b/i,
  /\bjob description requirements\b/i,
  /\boptimi[sz]ed for (?:ATS|applicant|key ?words?|the (?:role|job|posting|position)|recruiters?|screening|search)\b/i,
  /\b(?:tailored|matched|aligned) (?:to|for|with) (?:this|the) (?:job description|posting|job advert|vacancy)\b/i,
];

/** The self-referential phrases a CV or letter contains. */
export function selfTalkIn(text: string): string[] {
  const found: string[] = [];
  for (const re of SELF_TALK_PATTERNS) {
    const m = re.exec(String(text || ""));
    if (m) found.push(m[0]);
  }
  return found;
}
export const hasSelfTalk = (text: string) => selfTalkIn(text).length > 0;

/**
 * Removes every self-referential sentence from the CV. A bullet that talks
 * about itself is regenerated from the saved profile line that tells the same
 * story; a summary sentence or skills item that does is taken out. Returns
 * whether the summary lost a sentence, so the caller can rebuild it.
 */
export function removeSelfTalkFromCv(cv: string, profileBullets: string[] = []): { cv: string; removed: string[]; summaryChanged: boolean } {
  const lines = String(cv || "").split("\n");
  const kinds = sectionsOf(lines);
  const removed: string[] = [];
  let summaryChanged = false;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (kinds[i] === "header" || kinds[i] === "head" || !hasSelfTalk(line)) { out.push(line); continue; }
    if (kinds[i] === "skills" || kinds[i] === "extra") {
      const m = /^(\s*[^:]{1,40}:\s*)(.*)$/.exec(line);
      if (m) {
        const items = m[2].split(/\s*,\s*/).filter((x) => x.trim());
        const kept = items.filter((x) => !hasSelfTalk(x));
        removed.push(...items.filter((x) => hasSelfTalk(x)));
        if (kept.length) out.push(m[1] + kept.join(", "));
        continue;
      }
    }
    const b = BULLET.exec(line);
    if (b) {
      const clean = (profileBullets || []).filter((p) => !hasSelfTalk(p));
      const src = bestSource(b[2], clean);
      removed.push(b[2]);
      if (src.score >= 0.5) { out.push(b[1] + src.line.trim()); continue; }
      const kept = splitSentences(b[2]).filter((s) => !hasSelfTalk(s));
      if (kept.length) out.push(b[1] + kept.join(" "));
      continue;
    }
    const sents = splitSentences(line);
    const kept = sents.filter((s) => !hasSelfTalk(s));
    removed.push(...sents.filter((s) => hasSelfTalk(s)));
    if (kinds[i] === "summary") summaryChanged = true;
    if (kept.length) out.push(kept.join(" "));
  }
  return { cv: removed.length ? out.join("\n") : cv, removed, summaryChanged };
}

// ============================================================
// B. KEYWORDS GO IN THE BULLET THAT SHOWS THE WORK.
// ============================================================

/** The same work under another name: the candidate's wording, then the posting's. */
const SAME_WORK: { variants: RegExp; term: string }[] = [
  { variants: /\bmonth(?:ly| end)\s+close\b/gi, term: "month-end close" },
  { variants: /\byear end close\b/gi, term: "year-end close" },
  { variants: /\bk8s\b/gi, term: "Kubernetes" },
  { variants: /\bPostgres\b(?!QL)/g, term: "PostgreSQL" },
  { variants: /\bGitHub CI\b/g, term: "GitHub Actions" },
];

/** Rule B.1: a bullet that names the same work another way uses the posting's name. */
export function renameToPostingWords(cv: string, keywords: string[]): { cv: string; renamed: string[] } {
  const asked = (keywords || []).map((k) => String(k || "").trim().toLowerCase());
  const lines = String(cv || "").split("\n");
  const kinds = sectionsOf(lines);
  const renamed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i] !== "exp" || !BULLET.test(lines[i])) continue;
    for (const { variants, term } of SAME_WORK) {
      if (!asked.includes(term.toLowerCase())) continue;
      variants.lastIndex = 0;
      if (!variants.test(lines[i])) continue;
      variants.lastIndex = 0;
      lines[i] = lines[i].replace(variants, (m) => {
        const lower = term === term.toLowerCase();
        return lower && /^[A-Z]/.test(m) ? term.charAt(0).toUpperCase() + term.slice(1) : term;
      });
      renamed.push(term);
    }
  }
  return { cv: renamed.length ? lines.join("\n") : cv, renamed: [...new Set(renamed)] };
}

/**
 * Rule B.2 limits: a bracketed term the saved profile line does not have is
 * an added keyword. One per bullet, six per CV; extras come out of the
 * brackets. A bullet with no recognisable profile line is left alone.
 */
export function capKeywordAdditions(cv: string, profileBullets: string[], perCv = 6): { cv: string; cut: string[] } {
  const lines = String(cv || "").split("\n");
  const kinds = sectionsOf(lines);
  const cut: string[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i] !== "exp") continue;
    const m = BULLET.exec(lines[i]);
    if (!m) continue;
    const src = bestSource(m[2].replace(/\([^()]*\)/g, " "), profileBullets);
    if (src.score < 0.4) continue;
    let inBullet = 0;
    const body = m[2].replace(/\s*\(([^()]{1,120})\)/g, (whole, inside: string) => {
      const items = inside.split(/\s*,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
      const kept = items.filter((item) => {
        if (termAppearsIn(src.line, item)) return true;
        if (inBullet < 1 && total < perCv) { inBullet++; total++; return true; }
        cut.push(item);
        return false;
      });
      if (kept.length === items.length) return whole;
      if (!kept.length) return "";
      return ` (${kept.join(", ")})`;
    }).replace(/\s+([.,;])/g, "$1");
    lines[i] = m[1] + body;
  }
  return { cv: cut.length ? lines.join("\n") : cv, cut };
}

// ============================================================
// C. THE SKILLS SECTION READS LIKE A PERSON WROTE IT.
// ============================================================

const QUALIFICATION = /\b(?:ACA|ACCA|CPA|CIMA|AAT|CGMA|CMA|CIA|CFA|CISSP|CISM|CKA|CKAD|PMP|PRINCE2)\b/;
const QUALIFICATION_WORD = /\b(?:certified|certification|chartered|licen[cs]ed)\b/i;
const COMPOUND_TAIL = /^(?:Actions|DevOps|Cloud|Functions|Pipelines|Analytics|BI|Copilot|Studio|Workspace|Data Factory)$/;

interface Entry { index: number; label: string; items: string[] }

function skillsEntries(lines: string[], kinds: Kind[]): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i] !== "skills") continue;
    const m = lines[i].trim().match(/^([^:]{2,40}):\s*(.+)$/);
    if (m) entries.push({ index: i, label: m[1].trim(), items: m[2].split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean) });
  }
  return entries;
}

const kindOf = (item: string) => categoriseSkill(item);
function majorityKind(e: Entry): string {
  const n = new Map<string, number>();
  for (const it of e.items) n.set(kindOf(it), (n.get(kindOf(it)) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A qualification is held only when the saved profile names it. */
export function isUnheldQualification(item: string, profileText: string): boolean {
  const t = String(item || "").trim();
  const acr = QUALIFICATION.exec(t);
  if (acr) return !termAppearsIn(profileText, acr[0]);
  if (QUALIFICATION_WORD.test(t)) return !termAppearsIn(profileText, t);
  return false;
}

/**
 * Skills tidy-up: competency and "additional" lines fold into the lines where
 * their peers are, "Tools" and "Tools & Platforms" are one line, a lone item
 * joins the line most of whose items are its kind (Languages and Soft Skills
 * excepted), a tool a bullet names keeps its full name, and a qualification
 * the profile does not hold is never listed.
 */
export function tidySkillsSection(cv: string, profileText: string): { cv: string; notes: string[] } {
  let lines = String(cv || "").split("\n");
  const notes: string[] = [];
  let kinds = sectionsOf(lines);
  // Separate competency sections fold into the skills section.
  const loose: string[] = [];
  if (kinds.includes("skills")) {
    const keep: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (kinds[i] === "head" && EXTRA_SKILLS_HEAD.test(t)) { notes.push(`folded ${t} into skills`); continue; }
      if (kinds[i] === "extra") {
        if (t) loose.push(...t.replace(/^[^:]{2,40}:\s*/, "").replace(/^[•\-*]\s*/, "").split(/\s*[,;|•]\s*/).map((x) => x.trim()).filter(Boolean));
        continue;
      }
      keep.push(lines[i]);
    }
    lines = keep;
    kinds = sectionsOf(lines);
  }
  let entries = skillsEntries(lines, kinds);
  if (!entries.length) return { cv, notes: [] };

  // "Additional Skills", "Core Competencies" and "Other" lines are not lines.
  for (const e of entries) if (EXTRA_SKILLS_LABEL.test(e.label)) { loose.push(...e.items); lines[e.index] = "\u0000"; notes.push(`folded ${e.label} into its peers`); }
  entries = entries.filter((e) => lines[e.index] !== "\u0000");
  // "Tools" and "Tools & Platforms" are one line.
  const toolLines = entries.filter((e) => /^tools?(?:\s*(?:&|and)\s*platforms?)?$/i.test(e.label));
  for (const e of toolLines.slice(1)) {
    for (const it of e.items) if (!toolLines[0].items.some((x) => same(x, it))) toolLines[0].items.push(it);
    lines[e.index] = "\u0000";
    notes.push(`merged ${e.label} into ${toolLines[0].label}`);
  }
  entries = entries.filter((e) => lines[e.index] !== "\u0000");
  // Loose items go to the line where their peers are.
  const homeFor = (item: string, except?: Entry): Entry | undefined => {
    const homes = entries.filter((e) => e !== except && !LONE_OK_LABEL.test(e.label) && lines[e.index] !== "\u0000");
    if (!homes.length) return undefined;
    const k = kindOf(item);
    return homes.filter((e) => majorityKind(e) === k).sort((a, b) => b.items.length - a.items.length)[0]
      || homes.find((e) => /^tools?\b/i.test(e.label))
      || homes.slice().sort((a, b) => b.items.length - a.items.length)[0];
  };
  for (const item of loose) {
    if (entries.some((e) => e.items.some((x) => same(x, item)))) continue;
    const home = homeFor(item);
    if (home) home.items.push(item);
  }
  // A lone item joins the line most of whose items are its kind.
  for (const e of entries) {
    if (e.items.length !== 1 || LONE_OK_LABEL.test(e.label) || lines[e.index] === "\u0000") continue;
    const home = homeFor(e.items[0], e);
    if (!home) continue;
    if (!home.items.some((x) => same(x, e.items[0]))) home.items.push(e.items[0]);
    lines[e.index] = "\u0000";
    notes.push(`moved lone ${e.label} item ${e.items[0]} to ${home.label}`);
  }
  entries = entries.filter((e) => lines[e.index] !== "\u0000");
  // A tool named in a bullet keeps its full name in Skills.
  const outside = lines.filter((l, i) => kinds[i] !== "skills" && l !== "\u0000").join("\n");
  for (const e of entries) {
    e.items = e.items.map((it) => {
      if (/\s/.test(it) && it.split(/\s+/).length > 2) return it;
      const re = new RegExp(`(?<![\\w])${esc(it)}(?![\\w])(\\s+[A-Z][\\w]*(?:\\s+Factory)?)?`, "g");
      const tails = [...outside.matchAll(re)].map((m) => (m[1] || "").trim());
      if (!tails.length || !tails[0] || !COMPOUND_TAIL.test(tails[0]) || tails.some((t) => t !== tails[0])) return it;
      const full = `${it} ${tails[0]}`;
      if (entries.some((x) => x.items.some((y) => same(y, full)))) return it;
      notes.push(`${it} written as ${full}`);
      return full;
    });
    e.items = e.items.filter((it, n, all) => all.findIndex((x) => same(x, it)) === n);
  }
  // Never a qualification the profile does not hold.
  for (const e of entries) {
    const kept = e.items.filter((it) => !isUnheldQualification(it, profileText));
    if (kept.length !== e.items.length) notes.push(`removed unheld qualification ${e.items.filter((x) => !kept.includes(x)).join(", ")}`);
    e.items = kept;
  }
  for (const e of entries) lines[e.index] = e.items.length ? `${e.label}: ${e.items.join(", ")}` : "\u0000";
  const next = lines.filter((l) => l !== "\u0000").join("\n");
  return { cv: next === cv ? cv : next, notes };
}

/**
 * A qualification the profile does not hold is left out of the whole CV: the
 * summary sentence that claims it goes, and it comes out of bracketed tool
 * lists and certification lines.
 */
export function dropUnheldQualifications(cv: string, profileText: string): { cv: string; removed: string[] } {
  const lines = String(cv || "").split("\n");
  const kinds = sectionsOf(lines);
  const removed: string[] = [];
  const out: string[] = [];
  const unheld = (s: string) => {
    for (const m of s.matchAll(new RegExp(QUALIFICATION.source, "g"))) if (!termAppearsIn(profileText, m[0])) return m[0];
    return "";
  };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (kinds[i] === "header" || kinds[i] === "head" || kinds[i] === "skills") { out.push(line); continue; }
    const hit = unheld(line);
    if (!hit) { out.push(line); continue; }
    line = line.replace(/\s*\(([^()]*)\)/g, (whole, inside: string) => {
      const items = inside.split(/\s*,\s*|\s+and\s+/);
      const kept = items.filter((x) => !unheld(x));
      if (kept.length === items.length) return whole;
      removed.push(...items.filter((x) => unheld(x)));
      return kept.length ? ` (${kept.join(", ")})` : "";
    });
    if (unheld(line)) {
      const b = BULLET.exec(line);
      const body = b ? b[2] : line;
      const sents = splitSentences(body);
      const kept = sents.filter((s) => !unheld(s));
      removed.push(...sents.filter((s) => unheld(s)));
      line = kept.length ? (b ? b[1] : "") + kept.join(" ") : "";
      if (!line) continue;
    }
    out.push(line);
  }
  return { cv: removed.length ? out.join("\n") : cv, removed };
}

// ============================================================
// NEVER A KEYWORD IN A BULLET WHOSE WORK DOES NOT SHOW IT.
// A bullet that copies five or more words in a row from the posting that the
// saved profile never says ("Shipped features to production every week by
// owning the product roadmap", 10 Nov live run) is the posting's duty grafted
// onto the candidate's work. The saved profile line is restored.
// ============================================================

const wordsOf = (s: string) => (String(s || "").toLowerCase().match(/[a-z0-9+#]+/g) || []);
function runs(words: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export function restorePostingGrafts(cv: string, profileBullets: string[], posting: string, profileText = "", run = 5): { cv: string; restored: string[] } {
  if (!posting || !(profileBullets || []).length) return { cv, restored: [] };
  const postingRuns = runs(wordsOf(posting), run);
  const profileRuns = runs(wordsOf(`${profileText}\n${profileBullets.join("\n")}`), run);
  const lines = String(cv || "").split("\n");
  const kinds = sectionsOf(lines);
  const restored: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i] !== "exp") continue;
    const m = BULLET.exec(lines[i]);
    if (!m) continue;
    const grafted = [...runs(wordsOf(m[2]), run)].some((r) => postingRuns.has(r) && !profileRuns.has(r));
    if (!grafted) continue;
    const src = bestSource(m[2], profileBullets);
    if (src.score < 0.4 || src.line.trim() === m[2].trim()) continue;
    restored.push(m[2]);
    lines[i] = m[1] + src.line.trim();
  }
  return { cv: restored.length ? lines.join("\n") : cv, restored };
}
