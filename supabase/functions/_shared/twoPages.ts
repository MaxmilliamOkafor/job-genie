// THE CV FITS TWO PAGES (12 Nov brief).
//
// Six bullets for a five-month role and five for a job that ended five years
// ago take the page from the work a hiring manager reads first. The latest
// role keeps every bullet; other roles keep at most four; a role that ended
// more than five years ago, or lasted under a year, keeps at most three. The
// bullets least related to the posting go first (the later one on a tie), so
// a bullet naming something the posting asks for is the last to go. Nothing
// is reworded or moved. Pure and idempotent: a second run changes nothing.

const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
// "January 2023 - Present", "08-2022 - 12-2022", "2017 - 2021".
const ROLE_DATES = new RegExp(
  `(?:(${MONTH})\\s+|(\\d{1,2})[-/.])?((?:19|20)\\d{2})\\s*(?:-|\\u2013|\\u2014|to)\\s*(?:(?:(${MONTH})\\s+|(\\d{1,2})[-/.])?((?:19|20)\\d{2})|(present|current|now))`,
  "i",
);
const BULLET = /^\s*(?:[•●▪◦‣∙·*]|-)\s+\S/;
const EXPERIENCE_HEAD = /^\s*(?:PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EXPERIENCE|EMPLOYMENT HISTORY|EMPLOYMENT)\s*:?\s*$/i;
const ANY_HEAD = /^\s*[A-Z][A-Z0-9 &/-]{3,}\s*:?\s*$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const monthIndex = (word?: string, digits?: string): number => {
  if (word) return MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  if (digits) {
    const n = Number(digits);
    return n >= 1 && n <= 12 ? n - 1 : -1;
  }
  return -1;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface CondenseOptions {
  /** The posting's terms, used to keep the bullets most related to it. */
  asked?: string[];
  /** Today, for "ended more than five years ago". */
  today?: Date;
}

interface Role { at: number; start: number; end: number; bullets: number[] }

/** Limits per role: latest all, ended over five years ago or under a year long three, others four. */
export function bulletLimit(role: { start: number; end: number }, nowMonths: number, isLatest: boolean): number {
  if (isLatest) return Infinity;
  return nowMonths - role.end > 60 || role.end - role.start < 12 ? 3 : 4;
}

export function condenseEarlierRoles(cv: string, options: CondenseOptions = {}): { cv: string; dropped: string[] } {
  const text = String(cv ?? "");
  const lines = text.split("\n");
  const head = lines.findIndex((l) => EXPERIENCE_HEAD.test(l));
  if (head < 0) return { cv: text, dropped: [] };
  let stop = head + 1;
  while (stop < lines.length && !ANY_HEAD.test(lines[stop])) stop++;

  const now = options.today instanceof Date && !Number.isNaN(options.today.getTime()) ? options.today : new Date();
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const roles: Role[] = [];
  for (let i = head + 1; i < stop; i++) {
    if (BULLET.test(lines[i])) continue;
    const m = ROLE_DATES.exec(lines[i]);
    if (!m) continue;
    const sm = monthIndex(m[1], m[2]);
    const em = monthIndex(m[4], m[5]);
    const start = Number(m[3]) * 12 + (sm < 0 ? 0 : sm);
    const end = m[7] ? nowM : Number(m[6]) * 12 + (em < 0 ? 11 : em);
    roles.push({ at: i, start, end, bullets: [] });
  }
  if (roles.length < 2) return { cv: text, dropped: [] };
  for (let r = 0; r < roles.length; r++) {
    const until = r + 1 < roles.length ? roles[r + 1].at : stop;
    for (let i = roles[r].at + 1; i < until; i++) if (BULLET.test(lines[i])) roles[r].bullets.push(i);
  }

  const terms = [...new Set((options.asked || []).map((t) => String(t || "").trim()).filter((t) => t.length > 1))];
  const patterns = terms.map((t) => new RegExp(`(?:^|[^\\w])${esc(t)}(?![\\w])`, "i"));
  const score = (line: string) => patterns.reduce((n, p) => n + (p.test(line) ? 1 : 0), 0);
  const latest = roles.reduce((a, b) => (b.end > a.end || (b.end === a.end && b.start > a.start) ? b : a));

  const drop = new Set<number>();
  for (const role of roles) {
    const limit = bulletLimit(role, nowM, role === latest);
    let extra = role.bullets.length - limit;
    if (extra <= 0) continue;
    const order = role.bullets
      .map((i, k) => ({ i, k, s: score(lines[i]) }))
      .sort((a, b) => a.s - b.s || b.k - a.k);
    for (const { i } of order) {
      if (extra <= 0) break;
      drop.add(i);
      extra--;
    }
  }
  if (!drop.size) return { cv: text, dropped: [] };
  const dropped = [...drop].sort((a, b) => a - b).map((i) => lines[i].trim());
  return { cv: lines.filter((_l, i) => !drop.has(i)).join("\n"), dropped };
}
