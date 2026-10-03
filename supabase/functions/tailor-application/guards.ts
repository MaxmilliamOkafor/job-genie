/**
 * Guards around the tailoring call: refuse non-job pages, protect ATS
 * keywords the candidate already has, check the cover letter answers the
 * job, and strip wording that reads as machine-written.
 */

const NOT_A_JOB =
  /^(?:thanks?\b|thank you\b|application (?:submitted|received|complete|completed|sent|successful)\b|(?:your |the )?application (?:has been|was|is) (?:submitted|received|sent|complete)\b|you(?:'ve| have)? (?:successfully )?(?:applied|submitted)\b|successfully (?:submitted|applied)\b|we(?:'ve| have) (?:received|got) your application\b|(?:job )?application(?: form)?$|apply(?: now| here| for this (?:job|role|position))?$|sign ?in$|log ?in$|page not found$|404\b)/i;

export function isNotAJobTitle(title: string): boolean {
  const t = String(title || "").trim().replace(/[.!]+$/, "").trim();
  return NOT_A_JOB.test(t);
}

export const BANNED_PHRASES = [
  "spearheaded", "leveraged", "utilised", "utilized", "orchestrated", "championed",
  "results-driven", "highly motivated", "proven track record", "seasoned", "dynamic",
  "passionate about", "cutting-edge", "seamless", "synergy", "pivotal", "instrumental in",
  "in today's fast-paced", "ever-evolving", "I am writing to express my interest",
  "I am excited to apply", "I believe I would be a great fit", "aligns with your goals",
  "I look forward to discussing how my skills", "Furthermore", "Moreover", "Additionally",
];

export function humanWordingBlock(jobKeywords: string[]): string {
  const kw = new Set(jobKeywords.map((k) => k.toLowerCase()));
  const banned = BANNED_PHRASES.filter((p) => !kw.has(p.toLowerCase()));
  return `=== WORDING THAT READS AS WRITTEN BY A PERSON (CV AND COVER LETTER) ===
- Do not use these words or phrases: ${banned.map((b) => `"${b}"`).join(", ")}.
- Use plain verbs such as led, used, built, ran, cut, improved.
- No em dashes or en dashes used as pauses; a hyphen in a date range is fine.
- A word above is never removed if it is one of the job's keywords.`;
}

/** Em/en dashes: date ranges become a hyphen, pauses become a comma. */
export function stripDashes(text: string): string {
  if (!text) return text;
  return text
    .replace(/(\d|present|current)\s*[\u2013\u2014]\s*(?=\d|present|current|[A-Z][a-z]{2})/gi, "$1 - ")
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/,\s*,/g, ",");
}

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string): string {
  return word.replace(/(?:ies)$/, "y").replace(/(?:es|s)$/, "");
}

function stemPhrase(s: string): string {
  return norm(s).split(" ").map(stem).join(" ");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when the phrase appears in text, case-insensitive, allowing simple word forms. */
export function containsTerm(text: string, term: string): boolean {
  const t = stemPhrase(term);
  if (!t) return false;
  const hay = " " + norm(text).split(/[^a-z0-9+#.]+/).map(stem).join(" ") + " ";
  return new RegExp(`(?:^|\\s)${escapeRe(t).replace(/ /g, "\\s")}(?=\\s)`).test(hay);
}

export interface OriginalRole {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}

export function originalRoles(experience: any[]): OriginalRole[] {
  return (Array.isArray(experience) ? experience : []).map((e: any) => {
    const raw = Array.isArray(e?.bullets) && e.bullets.length
      ? e.bullets
      : Array.isArray(e?.description)
        ? e.description
        : typeof e?.description === "string"
          ? e.description.split("\n")
          : [];
    return {
      title: String(e?.title || e?.role || e?.position || "").trim(),
      company: String(e?.company || e?.employer || "").trim(),
      dates: [e?.startDate || e?.start_date || "", e?.endDate || e?.end_date || ""].filter(Boolean).join(" - "),
      bullets: raw.map((b: any) => String(b || "").replace(/^[\s\u2022*-]+/, "").trim()).filter(Boolean),
    };
  });
}

function skillStrings(skills: any[]): string[] {
  return (Array.isArray(skills) ? skills : [])
    .map((s: any) => (typeof s === "string" ? s : s?.name || s?.skill || ""))
    .map((s: string) => String(s).trim())
    .filter(Boolean);
}

export function originalCvText(profile: { professionalExperience: any[]; skills: any[]; education: any[]; certifications: any[] }): string {
  const roles = originalRoles(profile.professionalExperience)
    .map((r) => [r.title, r.company, ...r.bullets].join("\n"))
    .join("\n");
  const edu = (profile.education || []).map((e: any) => `${e?.degree || ""} ${e?.field || ""} ${e?.school || ""}`).join("\n");
  return [roles, skillStrings(profile.skills).join(", "), edu, (profile.certifications || []).join("\n")].join("\n");
}

export function protectedKeywords(jobKeywords: string[], originalText: string): string[] {
  return Array.from(new Set(jobKeywords.filter((k) => k && containsTerm(originalText, k))));
}

export function protectionBlock(jobKeywords: string[], protectedList: string[]): string {
  return `=== CV CONTENT: KEEP EVERY ATS KEYWORD, LEAVE OUT WHAT THE JOB DOES NOT NEED ===
JOB KEYWORDS (posting's own words): ${JSON.stringify(jobKeywords)}
PROTECTED KEYWORDS (already in the candidate's original CV): ${JSON.stringify(protectedList)}
- Keep every protected keyword in the CV, word for word as the posting writes it. This rule overrides every rule below.
- Keep every job, employer, job title and date, and the education and certifications sections. Never remove a role.
- In each role, keep the bullets that mention a job keyword or show a measurable result. Remove bullets that have nothing to do with this job. Keep at least 3 bullets for the most recent role and at least 2 for each other role.
- In the skills section, keep every skill that is a job keyword. Remove skills that have nothing to do with this job, unless they are protected keywords.
- Never add a skill, tool, certification or claim that is not in the original CV.
- Keep the CV to at most 2 pages. No em dashes.`;
}

function sectionRange(lines: string[], heading: RegExp): [number, number] | null {
  const start = lines.findIndex((l) => heading.test(l.trim()));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.length > 3 && t === t.toUpperCase() && /^[A-Z][A-Z &/]+$/.test(t)) { end = i; break; }
  }
  return [start, end];
}

/**
 * Puts back what the model dropped, once, without calling the model:
 * missing roles from the original CV, and the original bullet or skill
 * line for every missing protected keyword.
 */
export function restoreProtected(
  resume: string,
  protectedList: string[],
  roles: OriginalRole[],
  skills: any[],
): { text: string; restoredKeywords: string[]; restoredRoles: string[] } {
  if (!resume) return { text: resume, restoredKeywords: [], restoredRoles: [] };
  let lines = resume.split("\n");
  const restoredRoles: string[] = [];
  const restoredKeywords: string[] = [];
  const has = (s: string) => !s || lines.join("\n").toLowerCase().includes(s.toLowerCase());

  for (const role of roles) {
    if (!role.company || has(role.company)) continue;
    const range = sectionRange(lines, /^(PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EXPERIENCE)$/i);
    const block = ["", `${role.title} | ${role.company}${role.dates ? ` | ${role.dates}` : ""}`, ...role.bullets.map((b) => `• ${b}`)];
    const at = range ? range[1] : lines.length;
    lines.splice(at, 0, ...block);
    restoredRoles.push(`${role.title} at ${role.company}`);
  }

  const skillList = skillStrings(skills);
  for (const kw of protectedList) {
    if (containsTerm(lines.join("\n"), kw)) continue;
    const role = roles.find((r) => r.bullets.some((b) => containsTerm(b, kw)));
    if (role) {
      const bullet = role.bullets.find((b) => containsTerm(b, kw))!;
      const anchor = lines.findIndex((l) => role.company && l.toLowerCase().includes(role.company.toLowerCase()));
      if (anchor >= 0) {
        let i = anchor + 1;
        while (i < lines.length && lines[i].trim() && !/^[A-Z][A-Z &/]+$/.test(lines[i].trim())) i++;
        lines.splice(i, 0, `• ${bullet}`);
        restoredKeywords.push(kw);
        continue;
      }
    }
    const skill = skillList.find((s) => containsTerm(s, kw)) || kw;
    const range = sectionRange(lines, /^(TECHNICAL SKILLS|SKILLS|CORE SKILLS|KEY SKILLS)$/i);
    if (range) {
      let target = -1;
      for (let i = range[1] - 1; i > range[0]; i--) if (lines[i].trim()) { target = i; break; }
      if (target > 0) lines[target] = `${lines[target].replace(/[.,\s]+$/, "")}, ${skill}`;
      else lines.splice(range[0] + 1, 0, skill);
    } else {
      lines.push("", "TECHNICAL SKILLS", skill);
    }
    restoredKeywords.push(kw);
  }
  return { text: lines.join("\n"), restoredKeywords, restoredRoles };
}

export function coverLetterBlock(employer: string, top3: string[]): string {
  return `=== COVER LETTER: ANSWER THIS JOB ===
EMPLOYER: ${employer}
TOP 3 REQUIREMENTS (posting's own words): ${JSON.stringify(top3)}
- Paragraph 2 names at least 2 of those 3 requirements and, for each, gives one specific piece of evidence from the CV (employer, project, tool or number). Never claim anything the CV does not show.
- Name the employer at least once outside the greeting, with one concrete reason for applying taken from the posting (its product, customers or team), not a general compliment.
- Years of experience are calculated from the CV dates, never a round number that is not in the CV.`;
}

export function checkCoverLetter(letter: string, employer: string, top3: string[]): string[] {
  const failed: string[] = [];
  const body = String(letter || "")
    .split("\n")
    .filter((l) => !/^\s*(dear|hello|hi|to)\b/i.test(l))
    .join("\n");
  const emp = String(employer || "").trim();
  if (emp && !/^not specified$/i.test(emp) && !body.toLowerCase().includes(emp.toLowerCase())) {
    failed.push(`The employer's name "${emp}" does not appear outside the greeting.`);
  }
  if (top3.length >= 2) {
    const hit = top3.filter((r) => containsTerm(body, r));
    const need = Math.min(2, top3.length);
    if (hit.length < need) {
      failed.push(`At least ${need} of these requirements must be named: ${top3.join("; ")}. Named: ${hit.join("; ") || "none"}.`);
    }
  }
  return failed;
}
