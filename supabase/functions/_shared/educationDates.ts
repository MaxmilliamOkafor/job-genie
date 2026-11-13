// EDUCATION SHOWS THE GRADUATION YEAR (12-13 Nov brief).
//
// "University of Derby  August 2016 - July 2020" beside "Citigroup August
// 2017 - March 2021" reads as full-time study and a full-time job at once.
// The graduation year is what an ATS reads as the education date and all a
// recruiter needs: "University of Derby 2020". A course still running shows
// "2025 - Present". The stored start and end dates are never changed: the
// extension fills application forms that ask for both. Only what is shown
// changes. Pure, no imports, so the website and the functions share it.

const YEAR = /(?:19|20)\d{2}/g;
const ONGOING = /\b(?:present|current(?:ly)?|ongoing|now|in progress)\b/i;
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";

const years = (value: unknown): string[] => String(value ?? "").match(YEAR) || [];
const firstYear = (value: unknown) => years(value)[0] || "";
const lastYear = (value: unknown) => {
  const all = years(value);
  return all[all.length - 1] || "";
};
const pick = (row: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return "";
};

/**
 * The date to show for one saved education row: the graduation year
 * ("2020"), or "<start year> - Present" for a course still running. Reads
 * every spelling of the fields; a free-text dates field shows its last year.
 * Empty when the row records no year.
 */
export function educationDisplayDate(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== "object") return "";
  const start = pick(row, ["start_year", "startYear", "start_date", "startDate", "start", "from"]);
  const end = pick(row, ["end_year", "endYear", "end_date", "endDate", "graduation_date", "graduationDate", "end", "to"]);
  const grad = pick(row, ["graduation_year", "graduationYear"]);
  const free = pick(row, ["dates", "date", "dateRange", "date_range", "years"]);
  const running = ONGOING.test(end) || row.current === true || row.is_current === true || (!end && !grad && ONGOING.test(free));
  if (running) {
    const from = firstYear(start) || firstYear(free);
    return from ? `${from} - Present` : "Present";
  }
  return lastYear(end) || lastYear(grad) || lastYear(free) || "";
}

/** "Degree, Institution, 2020" for showing a saved row on the website. */
export function educationDisplayLine(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== "object") return "";
  const degree = pick(row, ["degree", "qualification"]);
  const institution = pick(row, ["institution", "school", "university"]);
  const parts = [degree, institution && institution.toLowerCase() !== degree.toLowerCase() ? institution : "", educationDisplayDate(row)];
  return parts.filter(Boolean).join(", ");
}

const RANGE = new RegExp(
  `(?:${MONTH}\\s+)?((?:19|20)\\d{2})\\s*(?:-|\\u2013|\\u2014|to)\\s*(?:${MONTH}\\s+)?((?:19|20)\\d{2})\\b`,
  "i",
);
const RUNNING = new RegExp(
  `(?:${MONTH}\\s+)?((?:19|20)\\d{2})\\s*(?:-|\\u2013|\\u2014|to)\\s*(?:present|current|ongoing|now)\\b`,
  "i",
);
const MONTH_YEAR = new RegExp(`\\b${MONTH}\\s+((?:19|20)\\d{2})\\b`, "i");

/** One line with any study range reduced to the graduation year. */
export function yearOnlyText(line: string): string {
  return String(line ?? "")
    .replace(RUNNING, (_m, a: string) => `${a} - Present`)
    .replace(RANGE, (_m, _a: string, b: string) => b)
    .replace(MONTH_YEAR, (_m, y: string) => y);
}

const EDU_HEAD = /^\s*(?:EDUCATION|EDUCATION AND QUALIFICATIONS|ACADEMIC BACKGROUND|ACADEMIC QUALIFICATIONS)\s*:?\s*$/i;
const ANY_HEAD = /^\s*[A-Z][A-Z0-9 &/-]{3,}\s*$/;

/** Inside the EDUCATION section only, every study range becomes its graduation year. Idempotent. */
export function educationYearOnly(cv: string): string {
  const lines = String(cv ?? "").split("\n");
  const at = lines.findIndex((l) => EDU_HEAD.test(l));
  if (at < 0) return cv;
  let changed = false;
  for (let i = at + 1; i < lines.length && !ANY_HEAD.test(lines[i]); i++) {
    const next = yearOnlyText(lines[i]);
    if (next !== lines[i]) {
      lines[i] = next;
      changed = true;
    }
  }
  return changed ? lines.join("\n") : cv;
}
