// THE POSTING'S KEYWORDS AT WORK, NOT JUST LISTED (8 Nov).
//
// Pure helpers for the final document step, from Max's tailoring brief:
//   1. A MUST keyword the work shows also appears inside a work bullet:
//      the bullet that tells the same story in the saved profile gets the
//      posting's word (in its tool list in brackets). Tools
//      only, never a soft skill or a credential, never from a skills list.
//   2. No keyword more than three times. Extra mentions come out of tool
//      lists in brackets and repeated skills rows only; sentences, the
//      first bullet mention and the summary or skills mention stay.
//   3. Projects that show what the posting asks for come first.
// Nothing here adds a claim the profile does not make.

const BULLET = /^(\s*(?:[•●▪◦‣∙·]|-|\*)\s+)(.*)$/;
const HEAD_LINE = /^[A-Z][A-Z &/]{3,}$/;
const EXP_HEAD = /^(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT(?: HISTORY)?)$/i;
const PROJ_HEAD = /^(?:SELECTED PROJECTS|PROJECTS|KEY PROJECTS|TECHNICAL PROJECTS)$/i;
const SKILLS_HEAD = /^(?:TECHNICAL SKILLS|SKILLS|CORE SKILLS|KEY SKILLS|TECHNICAL PROFICIENCIES|CORE COMPETENCIES)$/i;
const SUMMARY_HEAD = /^(?:PROFESSIONAL SUMMARY|SUMMARY|PROFILE|CAREER SUMMARY)$/i;
const SOFT_SKILL_ITEM = /^(?:communication(?: skills)?|written communication|verbal communication|leadership|collaboration|cross[- ]functional collaboration|teamwork|team ?work|decision[- ]making|problem[- ]solving|critical thinking|innovation|creativity|adaptability|flexibility|time management|prioriti[sz]ation|stakeholder management|stakeholder engagement|attention to detail|mentoring|coaching|negotiation|presentation(?: skills)?|interpersonal skills|ownership|initiative|accountability|emotional intelligence|conflict resolution|relationship building|customer focus|organi[sz]ation(?:al skills)?)$/i;
const CREDENTIAL = /(?:^|[^\w])(?:CompTIA\b|Security\+|Network\+|A\+(?![\w+])|CISSP|CISM|CISA|CCSP|CEH\b|OSCP|CCNA|CCNP|CCIE|PMP\b|PRINCE2|CSM\b|CSPO|CPA\b|ACCA|CIMA\b|CFA\b|FRM\b|GIAC|ITIL\s*(?:v?\d|Foundation|Expert)|Six Sigma (?:Green|Black) Belt|\w*\s*certifi(?:ed|cations?|cates?)\b|licen[cs]ed\b|\blicen[cs]e\b|security clearance|chartered\b)/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termRe = (term: string, flags = "") => new RegExp("(?:^|[^\\w+#/.-])" + esc(term) + "(?![\\w+#-])", flags + (term.length <= 2 ? "" : "i"));
// The story words of a sentence: the lower-case ones, so two lists of the
// same tools do not read as the same piece of work.
const wordsOf = (s: string) => new Set((String(s || "").match(/(?:^|[^\w])([a-z][a-z-]{3,})/g) || []).map((w) => w.replace(/^[^a-z]+/, "")));
// A tool or technology: a capital, a digit or a symbol, three words at most.
export const toolLike = (t: string) => /[A-Z0-9+#/.]/.test(t) && t.split(/\s+/).length <= 3 && !SOFT_SKILL_ITEM.test(t) && !CREDENTIAL.test(t);

type Kind = "header" | "head" | "exp" | "proj" | "skills" | "summary" | "other";
function sectionOf(lines: string[]): Kind[] {
  const kind: Kind[] = [];
  let cur: Kind = "header";
  for (const l of lines) {
    const t = l.trim();
    if (EXP_HEAD.test(t)) { cur = "exp"; kind.push("head"); continue; }
    if (PROJ_HEAD.test(t)) { cur = "proj"; kind.push("head"); continue; }
    if (SKILLS_HEAD.test(t)) { cur = "skills"; kind.push("head"); continue; }
    if (SUMMARY_HEAD.test(t)) { cur = "summary"; kind.push("head"); continue; }
    if (HEAD_LINE.test(t)) { cur = "other"; kind.push("head"); continue; }
    kind.push(cur);
  }
  return kind;
}

/** Rule 1: an evidenced MUST tool inside the bullet that tells its story. */
export function mustAtWork(lines: string[], must: string[], profileSentences: string[]): { lines: string[]; added: string[] } {
  const terms = (must || []).map((x) => String(x || "").trim()).filter((t) => t && toolLike(t));
  if (!terms.length || !profileSentences.length) return { lines, added: [] };
  const out = lines.slice();
  const kind = sectionOf(out);
  const bullets = out.map((l, i) => (kind[i] === "exp" && BULLET.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!bullets.length) return { lines, added: [] };
  const touched = new Set<number>();
  const added: string[] = [];
  for (const term of terms) {
    if (added.length >= 6) break;
    const re = termRe(term);
    if (bullets.some((i) => re.test(out[i]))) continue;
    // A sentence about work, not a skills list: five lower-case words or more.
    const own = profileSentences.filter((x) => re.test(x) && (x.match(/(?:^|\s)[a-z][a-z-]+/g) || []).length >= 5);
    if (!own.length) continue;
    let best = -1, bestScore = 0;
    for (const i of bullets) {
      if (touched.has(i)) continue;
      const b = wordsOf(out[i]);
      for (const sent of own) {
        const w = wordsOf(sent.replace(re, " "));
        let shared = 0;
        for (const x of w) if (b.has(x)) shared++;
        const score = shared / Math.max(4, Math.min(w.size, b.size));
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
    if (best === -1 || bestScore < 0.3) continue;
    const m = BULLET.exec(out[best])!;
    let body = m[2];
    const list = /\(([^()]{2,80})\)(\.?)\s*$/.exec(body);
    const items = list ? list[1].split(/\s*,\s*|\s+and\s+/).filter(Boolean) : [];
    if (list && items.every((x) => /[A-Za-z]/.test(x) && toolLike(x.trim()))) {
      body = body.slice(0, list.index) + "(" + list[1].replace(/\s+and\s+/, ", ") + ", " + term + ")" + list[2];
    } else if (/\(|\b(?:using|with)\b/i.test(body)) {
      continue;
    } else {
      // Never a ", using X." tail: the bullet gets a tool list in
      // brackets, the way the CV lists tools.
      body = body.replace(/\s*\.?\s*$/, "") + " (" + term + ").";
    }
    out[best] = m[1] + body;
    touched.add(best);
    added.push(term);
  }
  return { lines: added.length ? out : lines, added };
}

/** Rule 2: no keyword more than three times. */
export function noMoreThanThree(lines: string[], asked: string[]): { lines: string[]; cut: number } {
  const out = lines.slice();
  const kind = sectionOf(out);
  let cut = 0;
  for (const raw of asked || []) {
    const term = String(raw || "").trim();
    if (term.length < 2) continue;
    const re = termRe(term, "g");
    const hits: { i: number }[] = [];
    for (let i = 0; i < out.length; i++) {
      if (kind[i] === "header" || kind[i] === "head") continue;
      re.lastIndex = 0;
      while (re.exec(out[i])) hits.push({ i });
    }
    if (hits.length <= 3) continue;
    const firstBullet = hits.find((h) => kind[h.i] === "exp" && BULLET.test(out[h.i]));
    const firstListed = hits.find((h) => kind[h.i] === "summary" || kind[h.i] === "skills");
    let extra = hits.length - 3;
    const one = termRe(term);
    for (const h of hits.slice().reverse()) {
      if (extra <= 0) break;
      if (h === firstBullet || h === firstListed) continue;
      const line = out[h.i];
      let next = line;
      if (kind[h.i] === "skills") {
        const m = /^(\s*[^:]{1,40}:\s*)(.*)$/.exec(line);
        if (!m) continue;
        const items = m[2].split(/\s*,\s*/);
        const k = items.findIndex((x) => x.trim().toLowerCase() === term.toLowerCase());
        const elsewhere = out.some((l, j) => j < h.i && kind[j] === "skills" && one.test(l));
        if (k === -1 || !elsewhere) continue;
        items.splice(k, 1);
        next = items.length ? m[1] + items.join(", ") : "";
      } else {
        let done = false;
        next = line.replace(/\(([^()]*)\)/g, (all, inside) => {
          if (done || !one.test(" " + inside)) return all;
          const parts = inside.split(/\s*,\s*|\s+and\s+/);
          const kept = parts.filter((x: string) => x.trim().toLowerCase() !== term.toLowerCase());
          if (kept.length === parts.length) return all;
          done = true;
          return kept.length ? "(" + kept.join(", ") + ")" : "";
        }).replace(/\s+\./g, ".").replace(/\s{2,}/g, " ");
      }
      if (next !== line) { out[h.i] = next; extra--; cut++; }
    }
  }
  return { lines: cut ? out : lines, cut };
}

/** Rule 3: the projects that show what the posting asks for come first. */
export function projectsForTheJob(lines: string[], asked: string[]): { lines: string[]; moved: boolean } {
  const at = lines.findIndex((l) => PROJ_HEAD.test(l.trim()));
  if (at === -1 || !(asked || []).length) return { lines, moved: false };
  let end = at + 1;
  while (end < lines.length && !HEAD_LINE.test(lines[end].trim())) end++;
  const body = lines.slice(at + 1, end);
  const blocks: { lines: string[]; n: number; score: number }[] = [];
  let cur: { lines: string[]; n: number; score: number } | null = null;
  let prev = "blank";
  for (const l of body) {
    const t = l.trim();
    const isBlank = !t, isBullet = BULLET.test(l), isLinks = /^(?:Live demo|Code|Demo|Repo|GitHub)\s*:/i.test(t);
    if (!isBlank && !isBullet && !isLinks && (prev === "blank" || prev === "bullet" || prev === "links")) { cur = { lines: [], n: blocks.length, score: 0 }; blocks.push(cur); }
    if (cur && !isBlank) cur.lines.push(l);
    prev = isBlank ? "blank" : isBullet ? "bullet" : isLinks ? "links" : "text";
  }
  if (blocks.length < 2) return { lines, moved: false };
  const lead = body.slice(0, body.indexOf(blocks[0].lines[0]));
  for (const b of blocks) b.score = asked.filter((t) => termRe(String(t)).test(b.lines.join(" "))).length;
  const sorted = blocks.slice().sort((a, b) => b.score - a.score || a.n - b.n);
  if (sorted.every((b, n) => b.n === n)) return { lines, moved: false };
  const blank = body.some((l) => !l.trim());
  const rebuilt = lead.concat(...sorted.map((b, n) => (blank && n ? [""] : []).concat(b.lines)));
  if (body.length && !body[body.length - 1].trim()) rebuilt.push("");
  return { lines: lines.slice(0, at + 1).concat(rebuilt, lines.slice(end)), moved: true };
}

/** The work sentences of the saved profile's experience bullets. */
export function profileSentences(bullets: string[]): string[] {
  return (bullets || []).flatMap((b) => String(b || "").split(/(?<=[.!?])\s+|\n/)).map((x) => x.trim()).filter((x) => x.length > 25);
}

/** All three rules on the finished CV. */
export function keywordsAtWork(cv: string, opts: { must: string[]; asked: string[]; profileBullets: string[] }): { cv: string; notes: string[] } {
  const notes: string[] = [];
  let lines = String(cv || "").split("\n");
  const a = mustAtWork(lines, opts.must, profileSentences(opts.profileBullets));
  lines = a.lines;
  if (a.added.length) notes.push(`must keywords placed in bullets: ${a.added.join(", ")}`);
  const b = noMoreThanThree(lines, opts.asked);
  lines = b.lines;
  if (b.cut) notes.push(`keyword repeats capped: ${b.cut}`);
  const c = projectsForTheJob(lines, opts.asked);
  lines = c.lines;
  if (c.moved) notes.push("projects ordered for the job");
  return { cv: lines.join("\n"), notes };
}
