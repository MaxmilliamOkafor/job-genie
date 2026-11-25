// EXTENSION v3.10.83 PARITY (25 Nov brief).
//
// Pure, idempotent final checks on the tailored CV and letter:
//  A. every saved bullet survives, under its own role, in its original place;
//  B. a rewrite that loses a named tool or a posting term the saved bullet
//     already had literally falls back to the saved wording;
//  C. skills list only terms the profile shows, no vague single words, no
//     perks, capitalised, no empty categories;
//  D. contact details on at most two lines, tidy links, phones untouched
//     except the Irish layout;
//  E. letter: no keyword brackets, every achievement names its own employer,
//     each said once, long paragraphs split per employer, plain opening.
import { isFurniture } from "./evidence.ts";
import { formatContactPhone } from "./contactPhone.ts";

export interface SourceRole { company?: string; title?: string; bullets?: string[] }

const STOP = new Set(["the","and","for","with","from","into","that","this","their","than","then","each","every","across","over","under","which","while","were","was","had","has","have","its","our","per","all","but","not","out","off","via","who","one","two","led","own"]);

export function significantWords(text: string): string[] {
  return [...new Set((text.toLowerCase().replace(/\([^)]*\)/g, " ").match(/[a-z0-9+#]+/g) || []).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

/** Share of the source bullet's significant words found in the candidate. */
export function bulletOverlap(source: string, candidate: string): number {
  const s = significantWords(source);
  if (!s.length) return 0;
  const c = new Set(significantWords(candidate));
  return s.filter((w) => c.has(w)).length / s.length;
}

const MATCH = 0.5;
const WEAK = 0.25;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasTerm = (text: string, term: string) =>
  new RegExp(`(^|[^A-Za-z0-9+#])${escapeRe(term)}($|[^A-Za-z0-9+#])`, "i").test(text);

/** Named tools and products in a bullet: CamelCase or capitalised acronyms, plus listed skills. */
export function namedTools(text: string, skills: string[] = []): string[] {
  const plain = text.replace(/\([^)]*\)/g, " ");
  const found = new Set<string>();
  for (const m of plain.match(/\b[A-Za-z][A-Za-z0-9+#.]*\b/g) || []) {
    const w = m.replace(/\.$/, "");
    if (/^(UK|US|USA|EU|CTO|CTOs|CEO|I)$/.test(w)) continue;
    if (/^[A-Z0-9+#]{2,}$/.test(w) || /[a-z][A-Z]/.test(w) || /^[A-Z][a-z]+[A-Z]/.test(w)) found.add(w);
  }
  for (const s of skills) if (s && s.length > 1 && hasTerm(plain, s)) found.add(s);
  return [...found];
}

/* ------------------------------------------------------------ CV parsing --*/

const HEADING = /^[A-Z][A-Z &/]+$/;
const BULLET = /^\s*[-•]\s+/;

interface RoleBlock { start: number; end: number; company: string; title: string; bulletIdx: number[] }

function experienceRange(lines: string[]): [number, number] | null {
  const s = lines.findIndex((l) => /^(PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE)$/i.test(l.trim()));
  if (s < 0) return null;
  let e = lines.findIndex((l, i) => i > s && HEADING.test(l.trim()) && l.trim().length > 3);
  if (e < 0) e = lines.length;
  return [s, e];
}

function roleBlocks(lines: string[], range: [number, number]): RoleBlock[] {
  const blocks: RoleBlock[] = [];
  let cur: RoleBlock | null = null;
  for (let i = range[0] + 1; i < range[1]; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (BULLET.test(l)) { cur?.bulletIdx.push(i); continue; }
    const prev = i - 1 > range[0] ? lines[i - 1] : "";
    if (!cur || !prev.trim() || BULLET.test(prev)) {
      if (cur) cur.end = i;
      cur = { start: i, end: range[1], company: l.split("\t")[0].trim(), title: "", bulletIdx: [] };
      blocks.push(cur);
    } else if (!cur.title) cur.title = l.trim();
  }
  if (cur) cur.end = range[1];
  return blocks;
}

function pairRoles(blocks: RoleBlock[], roles: SourceRole[]): Array<SourceRole | null> {
  const used = new Set<number>();
  return blocks.map((b) => {
    const pick = (ok: (r: SourceRole) => boolean) => roles.findIndex((r, i) => !used.has(i) && ok(r));
    let i = pick((r) => norm(r.company || "") === norm(b.company) && norm(r.title || "") === norm(b.title));
    if (i < 0) i = pick((r) => norm(r.company || "") === norm(b.company));
    if (i < 0) return null;
    used.add(i);
    return roles[i];
  });
}

/* ---------------------------------------------------------- A and B -------*/

export interface BulletParityResult { cv: string; restored: number; reverted: number; replaced: number; counts: Array<{ role: string; source: number; output: number }> }

export function enforceBulletParity(cv: string, roles: SourceRole[], opts: { postingTerms?: string[]; skills?: string[] } = {}): BulletParityResult {
  const lines = cv.split("\n");
  const range = experienceRange(lines);
  const empty = { cv, restored: 0, reverted: 0, replaced: 0, counts: [] };
  if (!range) return empty;
  const blocks = roleBlocks(lines, range);
  const paired = pairRoles(blocks, roles);
  const terms = (opts.postingTerms || []).filter((t) => t && t.length > 1);
  let restored = 0, reverted = 0, replaced = 0;
  const counts: BulletParityResult["counts"] = [];
  const allSources = paired.map((r) => (r?.bullets || []).map((b) => String(b).trim()).filter(Boolean));
  const newBullets: string[][] = [];

  blocks.forEach((b, bi) => {
    const src = allSources[bi];
    const out = b.bulletIdx.map((i) => lines[i].replace(BULLET, "").trim());
    if (!paired[bi] || !src.length) { newBullets.push(out); return; }
    const usedSrc = new Map<number, string>();
    const extras: string[] = [];
    for (const o of out) {
      let best = -1, score = 0;
      src.forEach((s, si) => { if (!usedSrc.has(si)) { const v = bulletOverlap(s, o); if (v > score) { score = v; best = si; } } });
      if (best >= 0 && score >= MATCH) {
        const s = src[best];
        const lostTool = namedTools(s, opts.skills).some((t) => !hasTerm(o, t));
        const lostTerm = terms.some((t) => hasTerm(s, t) && !hasTerm(o, t));
        if (lostTool || lostTerm) reverted++;
        usedSrc.set(best, lostTool || lostTerm ? s : o);
        continue;
      }
      // Belongs to another role, or is a second copy: replace, never delete.
      const elsewhere = allSources.some((other, oi) => oi !== bi && other.some((s) => bulletOverlap(s, o) >= MATCH));
      const dupe = src.some((s) => bulletOverlap(s, o) >= MATCH);
      if (elsewhere || dupe) {
        const free = src.findIndex((_, si) => !usedSrc.has(si));
        if (free >= 0) { usedSrc.set(free, src[free]); replaced++; }
        continue;
      }
      extras.push(o);
    }
    // Shortened rewrites: a weaker match takes a still-free source slot; a
    // second shortened copy of a bullet already present is not a new bullet.
    const leftover: string[] = [];
    for (const o of extras) {
      let best = -1, score = 0;
      src.forEach((s, si) => { const v = bulletOverlap(s, o); if (v > score) { score = v; best = si; } });
      if (best >= 0 && score >= WEAK) {
        if (!usedSrc.has(best)) {
          const s = src[best];
          const lost = namedTools(s, opts.skills).some((t) => !hasTerm(o, t)) || terms.some((t) => hasTerm(s, t) && !hasTerm(o, t));
          if (lost) reverted++;
          usedSrc.set(best, lost ? s : o);
        }
        continue;
      }
      leftover.push(o);
    }
    extras.length = 0;
    extras.push(...leftover);
    const final: string[] = [];
    src.forEach((s, si) => {
      if (usedSrc.has(si)) final.push(usedSrc.get(si)!);
      else { final.push(s); restored++; }
    });
    final.push(...extras);
    newBullets.push(final);
    counts.push({ role: `${b.company} ${b.title}`.trim(), source: src.length, output: final.length - extras.length });
  });

  const rebuilt: string[] = lines.slice(0, range[0] + 1);
  blocks.forEach((b, bi) => {
    const head = lines.slice(b.start, b.end).filter((l) => !BULLET.test(l));
    while (head.length && !head[head.length - 1].trim()) head.pop();
    if (bi > 0 || (rebuilt[rebuilt.length - 1] ?? "").trim()) { /* keep spacing */ }
    rebuilt.push(...head, ...newBullets[bi].map((t) => `- ${t}`), "");
  });
  rebuilt.push(...lines.slice(range[1]));
  return { cv: rebuilt.join("\n").replace(/\n{3,}/g, "\n\n"), restored, reverted, replaced, counts };
}

/* ----------------------------------------------------------------- C ------*/

export const VAGUE_SKILLS = new Set(["security","architecture","policy","policies","tradeoffs","trade-offs","automation","ai","strategy","scalability","systems","data","design","engineering","development","technology","innovation","quality","performance","reliability","operations","communication","leadership","management","analysis","analytics","research","integration","infrastructure","testing","support","delivery","cloud","software","platform","platforms","tools","solutions"]);

export function tidySkills(cv: string, profileText: string): { cv: string; dropped: string[] } {
  const lines = cv.split("\n");
  const s = lines.findIndex((l) => /^(TECHNICAL SKILLS|SKILLS|CORE SKILLS)$/i.test(l.trim()));
  if (s < 0) return { cv, dropped: [] };
  let e = lines.findIndex((l, i) => i > s && HEADING.test(l.trim()) && l.trim().length > 3);
  if (e < 0) e = lines.length;
  const dropped: string[] = [];
  const shown = (item: string) => {
    const parts = [item, ...(item.match(/\(([^)]+)\)/g) || []).map((p) => p.slice(1, -1)), item.replace(/\s*\([^)]*\)/g, "")];
    return parts.some((p) => p.trim() && hasTerm(profileText, p.trim()));
  };
  const out: string[] = [];
  for (let i = s + 1; i < e; i++) {
    const l = lines[i];
    const m = l.match(/^([^:]+):\s*(.*)$/);
    if (!m) { out.push(l); continue; }
    if (/^languages?$/i.test(m[1].trim())) { out.push(l); continue; }
    const kept = m[2].split(",").map((x) => x.trim()).filter(Boolean).filter((item) => {
      const bad = VAGUE_SKILLS.has(item.toLowerCase()) || isFurniture(item) || /\bdiscount\b|\bperk|\bbenefit/i.test(item) || !shown(item);
      if (bad) dropped.push(item);
      return !bad;
    }).map((item) => item.charAt(0).toUpperCase() + item.slice(1));
    if (kept.length) out.push(`${m[1].trim()}: ${[...new Set(kept)].join(", ")}`);
  }
  return { cv: [...lines.slice(0, s + 1), ...out, ...lines.slice(e)].join("\n"), dropped };
}

/* ----------------------------------------------------------------- D ------*/

export function tidyLink(part: string): string {
  return part.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

const isLink = (p: string) => /^(https?:\/\/|www\.)|\.(com|io|app|dev|net|org|ie|co)(\/|$)|linkedin|github/i.test(p.trim()) && !/@/.test(p);

/** Contact block under the name/title: at most two " | " lines, links tidied. */
export function tidyHeader(doc: string): string {
  const lines = doc.split("\n");
  const first = lines.findIndex((l, i) => i > 0 && (!l.trim() || HEADING.test(l.trim())));
  const stop = first < 0 ? Math.min(lines.length, 5) : first;
  const contactIdx: number[] = [];
  for (let i = 1; i < stop; i++) if (/\|/.test(lines[i]) || /@|\+\d|https?:|www\./.test(lines[i])) contactIdx.push(i);
  if (!contactIdx.length) return doc;
  const parts = contactIdx.flatMap((i) => lines[i].split("|").map((p) => p.trim()).filter(Boolean));
  const details = parts.filter((p) => !isLink(p)).map((p) => /^\+353/.test(p.replace(/\s/g, "")) ? formatContactPhone(p) : p);
  const links = parts.filter(isLink).map(tidyLink);
  const block = [details.join(" | "), links.join(" | ")].filter(Boolean);
  const rest = lines.filter((_, i) => !contactIdx.includes(i));
  rest.splice(contactIdx[0], 0, ...block);
  return rest.join("\n");
}

/* ----------------------------------------------------------------- E ------*/

const sentencesOf = (p: string) => p.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];

export interface LetterParityOptions { roles: SourceRole[]; jobTitle: string; company: string; postingTerms?: string[] }

export function letterParity(letter: string, opts: LetterParityOptions): { letter: string; notes: string[] } {
  const notes: string[] = [];
  let text = letter;
  // Bracket glosses and shorthand lists.
  const before = text;
  text = text.replace(/\)\s*\([^)]*\)/g, ")").replace(/\s*\((?:[^()]*[,/][^()]*)\)/g, "").replace(/\s*\((?:MLOps|[a-z][a-z -]{2,40})\)(?=[\s.,;])/g, "");
  if (text !== before) notes.push("keyword brackets removed");

  const owners: Array<{ company: string; title: string; bullet: string }> = [];
  for (const r of opts.roles) for (const b of r.bullets || []) owners.push({ company: String(r.company || ""), title: String(r.title || ""), bullet: String(b) });
  const companies = [...new Set(owners.map((o) => o.company).filter(Boolean))];
  const ownerOf = (s: string) => {
    let best: typeof owners[number] | null = null, score = 0;
    for (const o of owners) { const v = bulletOverlap(o.bullet, s); if (v > score) { score = v; best = o; } }
    return score >= MATCH ? best : null;
  };
  const titleWords = new Set(significantWords(opts.jobTitle));
  const relevance = (company: string) => Math.max(0, ...owners.filter((o) => o.company === company).map((o) => significantWords(o.title).filter((w) => titleWords.has(w)).length));

  const paras = text.split(/\n\s*\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  let openingDone = false;
  for (const para of paras) {
    let p = para.trim();
    if (!openingDone && /^The .+ role at .+ asks for /i.test(p)) {
      openingDone = true;
      const esc = escapeRe(opts.company);
      p = p.replace(new RegExp(`^(The .+? role at ${esc}),[^.]*?\\s+asks for\\s+(.+?),?\\s+and I have done it\\.?`, "i"), "$1 asks for $2, and I have done it.")
        .replace(/^(The .+? role at .+? asks for .+?)\s+and I have done it\./i, (m, a) => /,$/.test(a) ? m : `${a}, and I have done it.`)
        .replace(/,?\s+(?:using|drawing on|leveraging) my (?:expertise|experience)[^.]*\./i, ".");
      out.push(p);
      continue;
    }
    if (/^(Dear|Kind regards|Sincerely|Yours)/i.test(p) || !/[.!?]/.test(p) || p.split("\n").length > 1 && !/[.!?]\s*$/.test(p.split("\n")[0])) { out.push(p); continue; }
    const groups = new Map<string, string[]>();
    const order: string[] = [];
    let current = "";
    for (let s of sentencesOf(p)) {
      const owner = ownerOf(s);
      if (owner) {
        const key = norm(owner.bullet);
        if (seen.has(key)) { notes.push("repeated achievement removed"); continue; }
        seen.add(key);
        const named = companies.filter((c) => hasTerm(s, c));
        if (!named.includes(owner.company)) {
          const wrong = named.find((c) => c !== owner.company);
          if (wrong && new RegExp(`^At ${escapeRe(wrong)},\\s*`).test(s)) s = s.replace(new RegExp(`^At ${escapeRe(wrong)},\\s*`), `At ${owner.company}, `);
          else s = `At ${owner.company}, ${s.charAt(0) === "I" && s.charAt(1) === " " ? s : s.charAt(0).toLowerCase() + s.slice(1)}`;
          notes.push(`employer named for ${owner.company}`);
        }
        current = owner.company;
      }
      if (!groups.has(current)) { groups.set(current, []); order.push(current); }
      groups.get(current)!.push(s);
    }
    const joined = order.map((k) => groups.get(k)!.join(" "));
    const words = joined.join(" ").split(/\s+/).length;
    if (words > 90 && order.filter(Boolean).length > 1) {
      const sorted = [...order].sort((a, b) => (a && b ? relevance(b) - relevance(a) : 0));
      out.push(...sorted.map((k) => groups.get(k)!.join(" ")));
      notes.push("long paragraph split per employer");
    } else out.push(joined.join(" "));
  }
  return { letter: out.filter(Boolean).join("\n\n"), notes };
}
