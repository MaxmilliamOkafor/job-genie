// "WHAT CHANGED" LINES (10 Nov).
//
// Up to five plain lines shown above the keyword list after tailoring. Before
// is the saved profile text, after is the final CV text, both measured with
// the same whole-term matcher as the coverage gauge. Plain text only.
import { measureCoverage, termAppearsIn } from "./coverage.ts";

const SKILLS_HEAD = /^(?:TECHNICAL SKILLS|SKILLS|CORE SKILLS|KEY SKILLS)$/i;
const HEAD_LINE = /^[A-Z][A-Z &/]{3,}$/;

function skillItems(cv: string): string[] {
  const lines = String(cv || "").split("\n");
  const at = lines.findIndex((l) => SKILLS_HEAD.test(l.trim()));
  if (at < 0) return [];
  const out: string[] = [];
  for (let i = at + 1; i < lines.length && !HEAD_LINE.test(lines[i].trim()); i++) {
    const m = lines[i].trim().match(/^[^:]{2,40}:\s*(.+)$/);
    if (m) out.push(...m[1].split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean));
  }
  return out;
}
const headlineOf = (cv: string) => (String(cv || "").split("\n")[1] || "").trim();

function namesOf(list: string[], max = 6): string {
  const shown = list.slice(0, max).join(", ");
  return list.length > max ? `${shown} and ${list.length - max} more` : shown;
}

export interface WhatChangedInput {
  profileText: string;
  /** The CV before the final clean-up steps. */
  cvBefore: string;
  /** The final CV text. */
  cvAfter: string;
  keywords: string[];
  /** The posting, so each term is written the way the job writes it ("GDPR", never "Gdpr"). */
  posting?: string;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function asWritten(term: string, posting = ""): string {
  const m = posting ? new RegExp(`(?<![\\w])${escRe(term)}(?![\\w])`, "i").exec(posting) : null;
  return m ? m[0] : term;
}

export function whatChanged(o: WhatChangedInput): string[] {
  const lines: string[] = [];
  const names = (list: string[], max = 6) => namesOf(list.map((t) => asWritten(t, o.posting || "")), max);
  const before = measureCoverage(o.profileText || "", o.keywords || []);
  const after = measureCoverage(o.cvAfter || "", o.keywords || []);
  if (after.total) {
    lines.push(before.percent === after.percent
      ? `Keyword coverage: ${after.percent}%, the same as your own CV (${after.matched.length} of ${after.total}).`
      : `Keyword coverage: ${before.percent}% in your own CV, ${after.percent}% now (${after.matched.length} of ${after.total}).`);
  }
  const fresh = after.matched.filter((t) => !before.matched.includes(t));
  if (fresh.length) lines.push(`Now says, in the job's own words: ${names(fresh)}.`);
  const was = skillItems(o.cvBefore), now = skillItems(o.cvAfter);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const removals: string[] = [];
  const gone = was.filter((x) => !now.some((y) => same(x, y)) && !termAppearsIn(o.cvAfter, x));
  if (gone.length) removals.push(`Removed skills your CV does not show you using: ${names(gone)}.`);
  const hb = headlineOf(o.cvBefore), ha = headlineOf(o.cvAfter);
  if (hb && ha && hb !== ha && hb.toLowerCase().startsWith(ha.toLowerCase())) removals.push("Cut the headline back to the role your experience supports.");
  const added = now.filter((x) => !was.some((y) => same(x, y)));
  if (added.length) removals.push(`Added tools named in your bullets to the Skills section: ${names(added)}.`);
  const notAdded = after.missing.length ? `Not added, because your CV does not show them: ${names(after.missing)}. Add them yourself only if they are true.` : "";
  lines.push(...removals.slice(0, Math.max(0, 5 - lines.length - (notAdded ? 1 : 0))));
  if (notAdded) lines.push(notAdded);
  return lines.slice(0, 5);
}
