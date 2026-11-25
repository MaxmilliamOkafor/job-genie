import { graftPast } from './postingLessons.ts';
import { classifyTerm, type EvidenceSource } from './evidence.ts';

const BULLET = /^(\s*(?:[•●▪◦‣∙·*]|-)\s+)(.*)$/;
const EXP = /^(?:PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT HISTORY)\s*:?$/i;
const SECTION = /^(?:TECHNICAL SKILLS|SKILLS|EDUCATION|PROJECTS|RELEVANT PROJECTS|CERTIFICATIONS|ACHIEVEMENTS|PROFESSIONAL SUMMARY|SUMMARY)\s*:?$/i;
const PAST: Record<string, string> = { deliver: 'Delivered', hold: 'Held', lead: 'Led', build: 'Built', write: 'Wrote', run: 'Ran', drive: 'Drove', make: 'Made', take: 'Took', give: 'Gave', teach: 'Taught', author: 'Authored', resolve: 'Resolved', reduce: 'Reduced', develop: 'Developed', design: 'Designed', manage: 'Managed', maintain: 'Maintained', implement: 'Implemented', support: 'Supported', create: 'Created', automate: 'Automated', improve: 'Improved', deploy: 'Deployed', train: 'Trained', own: 'Owned', oversee: 'Oversaw' };
const PAST_WORDS = new Set([...Object.values(PAST).map((s) => s.toLowerCase()), 'cut', 'set', 'put', 'brought', 'ended', 'grew', 'kept', 'found', 'sent', 'spent', 'met', 'chose', 'rebuilt', 'rewrote']);
export const canonicalToolNames = (text: string): string => text.replace(/\bpower\s*bi\b/gi, 'Power BI').replace(/\bpowershell\b/gi, 'PowerShell').replace(/\bgithub\b/gi, 'GitHub').replace(/\bpytorch\b/gi, 'PyTorch');

/** Remove only added keyword glosses, never genuine acronyms recorded in evidence. */
export function misplacedKeywordBrackets(body: string, profileText: string): string {
  return body.replace(/\s+\(([^)]+)\)(?=\s+[A-Za-z])/g, (match, term: string, offset: number) => {
    const before = body.slice(0, offset).trim();
    const after = body.slice(offset + match.length).trim();
    const opening = before.split(/\s+/).length === 1;
    const product = /\b(?:GitHub|Power|Microsoft|Amazon|Google|Azure|AWS|Visual|ServiceNow|Oracle)$/i.test(before) || /^(?:Actions|BI|Studio|Cloud|SQL|Server)\b/.test(after);
    if (opening || product) return '';
    return match;
  });
}

/** Exact achievement copies only: no semantic guesses can collapse distinct work. */
export interface SavedQualityRole { company: string; title: string; bullets: string[]; endDate?: string; startDate?: string }
const achievementKey = (body: string) => body.toLowerCase().replace(/\b(?:reducing|lowering|cutting)\b/g, 'reduced').replace(/[^a-z0-9+#]+/g, ' ').trim();
const similar = (a: string, b: string) => {
  const x = new Set(achievementKey(a).split(' ')), y = new Set(achievementKey(b).split(' '));
  return [...x].filter((w) => y.has(w)).length / Math.max(x.size, y.size, 1);
};
export function finalExperienceQuality(cv: string, profileText: string, savedRoles: SavedQualityRole[] = []): { cv: string; notes: string[] } {
  const lines = cv.split('\n'), roles: number[][] = [];
  let inExperience = false, current: number[] = [], endedBullets = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (EXP.test(t)) { inExperience = true; continue; }
    if (SECTION.test(t)) { inExperience = false; continue; }
    if (!inExperience) continue;
    if (BULLET.test(lines[i])) {
      if (endedBullets && current.length) { roles.push(current); current = []; }
      current.push(i); endedBullets = false;
    } else if (t && current.length) endedBullets = true;
  }
  if (current.length) roles.push(current);
  const notes: string[] = [], seen = new Set<string>(), drop = new Set<number>();
  const roleRecords = roles.map((bullets, index) => {
    const from = index ? (roles[index - 1].at(-1) ?? 0) + 1 : 0;
    const heading = lines.slice(from, bullets[0]).join(' ').toLowerCase();
    const saved = savedRoles.find((r) => heading.includes(r.company.toLowerCase()) && heading.includes(r.title.toLowerCase()));
    const date = saved?.endDate || '';
    return { bullets, saved, index, date: /present|current/i.test(date) || (saved && !date) ? '9999' : date };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.index - b.index);
  for (const { bullets: role, saved } of roleRecords) {
    let remaining = role.length;
    const pastCount = role.filter((i) => {
      const first = BULLET.exec(lines[i])?.[2].split(/\s+/)[0].toLowerCase() || '';
      return PAST_WORDS.has(first) || /ed$/.test(first);
    }).length;
    for (const i of role) {
      const m = BULLET.exec(lines[i]);
      if (!m) continue;
      let body = canonicalToolNames(misplacedKeywordBrackets(m[2], profileText));
      if (saved && saved.bullets.length) {
        const ownFit = Math.max(...saved.bullets.map((b) => similar(body, b)));
        const foreignFit = Math.max(0, ...savedRoles.filter((r) => r !== saved).flatMap((r) => r.bullets.map((b) => similar(body, b))));
        if (foreignFit > 0.85 && ownFit < 0.55) {
          const replacement = saved.bullets.find((b) => !seen.has(achievementKey(b)));
          if (replacement) { body = canonicalToolNames(misplacedKeywordBrackets(replacement, profileText)); notes.push('achievement restored to its saved role'); }
        }
      }
      if (pastCount > role.length / 2) body = body.replace(/^([A-Za-z]+)\b/, (word) => PAST[word.toLowerCase()] || (/ing$/i.test(word) ? graftPast(word) : word));
      let key = achievementKey(body);
      if (seen.has(key) && remaining > 1) { drop.add(i); remaining--; notes.push('duplicate achievement removed from earlier role'); continue; }
      if (seen.has(key) && remaining === 1) {
        const replacement = saved?.bullets.find((b) => !seen.has(achievementKey(b)));
        if (replacement) { body = canonicalToolNames(misplacedKeywordBrackets(replacement, profileText)); key = achievementKey(body); notes.push('last bullet restored from its own saved role'); }
        else notes.push('no distinct saved achievement available for this role; evidence retained rather than invented');
      }
      seen.add(key);
      if (body !== m[2]) notes.push('experience bracket placement or tense corrected');
      lines[i] = m[1] + body;
    }
  }
  return { cv: lines.filter((_, i) => !drop.has(i)).join('\n'), notes };
}

/** The same candidate evidence gate covers every skills label, not only Tools. */
export function evidencedSkillsOnly(cv: string, sources: EvidenceSource[]): { cv: string; notes: string[] } {
  let inSkills = false;
  const notes: string[] = [];
  const lines = cv.split('\n').flatMap((line) => {
    const t = line.trim();
    if (/^(?:TECHNICAL SKILLS|SKILLS|CORE COMPETENCIES)\s*:?$/i.test(t)) { inSkills = true; return [line]; }
    if (SECTION.test(t) || EXP.test(t)) { inSkills = false; return [line]; }
    if (!inSkills || !t || /^Languages?\s*:/i.test(t)) return [line];
    const match = /^(\s*[^:]{2,40}:\s*)(.+)$/.exec(line);
    const body = match ? match[2] : line;
    const kept = body.split(/\s*[,;]\s*/).filter((item) => {
      const term = item.trim().replace(/\s*\([^)]*\)$/, '');
      const backed = classifyTerm(term, sources).tier !== 'unsupported';
      if (!backed) notes.push(`removed ${term}, not backed by candidate evidence`);
      return backed;
    });
    return kept.length ? [(match?.[1] || '') + kept.map(canonicalToolNames).join(', ')] : [];
  });
  return { cv: lines.join('\n'), notes };
}