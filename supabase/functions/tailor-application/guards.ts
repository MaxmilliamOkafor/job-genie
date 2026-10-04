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

// ---------------------------------------------------------------------------
// Right to work, stated once in the CV header, only when the profile shows it.

const EU_EEA: Record<string, string[]> = {
  austria: ["austria", "vienna", "graz", "linz", "salzburg"],
  belgium: ["belgium", "brussels", "antwerp", "ghent", "leuven"],
  bulgaria: ["bulgaria", "sofia", "plovdiv"],
  croatia: ["croatia", "zagreb", "split"],
  cyprus: ["cyprus", "nicosia", "limassol"],
  czechia: ["czechia", "czech republic", "prague", "brno"],
  denmark: ["denmark", "copenhagen", "aarhus"],
  estonia: ["estonia", "tallinn", "tartu"],
  finland: ["finland", "helsinki", "espoo", "tampere"],
  france: ["france", "paris", "lyon", "marseille", "toulouse", "nice", "lille", "bordeaux"],
  germany: ["germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart", "düsseldorf", "dusseldorf", "leipzig"],
  greece: ["greece", "athens", "thessaloniki"],
  hungary: ["hungary", "budapest"],
  ireland: ["ireland", "dublin", "cork", "galway", "limerick", "waterford"],
  italy: ["italy", "rome", "milan", "milano", "turin", "naples", "bologna", "florence"],
  latvia: ["latvia", "riga"],
  lithuania: ["lithuania", "vilnius", "kaunas"],
  luxembourg: ["luxembourg"],
  malta: ["malta", "valletta"],
  netherlands: ["netherlands", "holland", "amsterdam", "rotterdam", "the hague", "utrecht", "eindhoven"],
  poland: ["poland", "warsaw", "kraków", "krakow", "wrocław", "wroclaw", "gdańsk", "gdansk", "poznań", "poznan"],
  portugal: ["portugal", "lisbon", "porto"],
  romania: ["romania", "bucharest", "cluj"],
  slovakia: ["slovakia", "bratislava"],
  slovenia: ["slovenia", "ljubljana"],
  spain: ["spain", "madrid", "barcelona", "valencia", "seville", "malaga", "málaga", "bilbao"],
  sweden: ["sweden", "stockholm", "gothenburg", "malmö", "malmo"],
  iceland: ["iceland", "reykjavik"],
  liechtenstein: ["liechtenstein"],
  norway: ["norway", "oslo", "bergen"],
};

const OTHER_COUNTRIES: Record<string, string[]> = {
  "united kingdom": ["united kingdom", "uk", "england", "scotland", "wales", "northern ireland", "great britain", "london", "manchester", "birmingham", "edinburgh", "glasgow", "leeds", "bristol", "belfast", "cambridge", "oxford", "cardiff", "liverpool"],
  "united states": ["united states", "usa", "u.s.", "us", "new york", "san francisco", "seattle", "boston", "austin", "chicago", "los angeles"],
  canada: ["canada", "toronto", "vancouver", "montreal"],
  switzerland: ["switzerland", "zurich", "zürich", "geneva", "basel"],
  australia: ["australia", "sydney", "melbourne"],
};

const NATIONALITY: Record<string, string> = {
  irish: "ireland", british: "united kingdom", french: "france", german: "germany", spanish: "spain",
  italian: "italy", portuguese: "portugal", dutch: "netherlands", belgian: "belgium", polish: "poland",
  swedish: "sweden", danish: "denmark", finnish: "finland", austrian: "austria", greek: "greece",
  czech: "czechia", slovak: "slovakia", hungarian: "hungary", romanian: "romania", bulgarian: "bulgaria",
  croatian: "croatia", slovenian: "slovenia", estonian: "estonia", latvian: "latvia", lithuanian: "lithuania",
  luxembourgish: "luxembourg", maltese: "malta", cypriot: "cyprus", norwegian: "norway", icelandic: "iceland",
  american: "united states", canadian: "canada", swiss: "switzerland", australian: "australia",
};

function matchCountry(text: string, map: Record<string, string[]>): string | null {
  const t = ` ${String(text || "").toLowerCase().replace(/[^a-zà-ž.\s]+/g, " ")} `;
  for (const [country, names] of Object.entries(map)) {
    if (names.some((n) => new RegExp(`\\s${escapeRe(n)}\\s`).test(t))) return country;
  }
  return null;
}

/** The job's country from its location text, or null when unknown. */
export function jobCountry(location: string): string | null {
  if (!location || !location.trim()) return null;
  return matchCountry(location, EU_EEA) || matchCountry(location, OTHER_COUNTRIES);
}

function sameCountry(a: string, b: string): boolean {
  const ca = jobCountry(a) || a.toLowerCase().trim();
  const cb = jobCountry(b) || b.toLowerCase().trim();
  return ca === cb;
}

/**
 * Header statement such as "EU citizen, no visa sponsorship needed", or ""
 * when the job's country is unknown or the profile does not show the right.
 */
export function rightToWorkStatement(citizenship: string, authorizedCountries: string[], location: string): string {
  const cit = String(citizenship || "").trim();
  const country = jobCountry(location);
  if (!cit || !country) return "";
  const word = cit.toLowerCase().replace(/\bcitizen(ship)?\b/g, "").replace(/[^a-z\s]/g, " ").trim();
  const home = NATIONALITY[word] || (EU_EEA[word] || OTHER_COUNTRIES[word] ? word : null);
  const isEu = /^eu\b|\beu$|european union|^eea\b/.test(word) || (!!home && home in EU_EEA);
  const cta = country === "ireland" || country === "united kingdom";
  if (home === "ireland" && cta) return "Irish citizen, full right to work in the UK and Ireland";
  if (home === "united kingdom" && cta) return "British citizen, full right to work in the UK and Ireland";
  if (isEu && country in EU_EEA) return "EU citizen, no visa sponsorship needed";
  const authorised = (authorizedCountries || []).some((c) => c && sameCountry(c, country));
  if (authorised) {
    const label = cit.replace(/\s*citizen(ship)?\s*$/i, "").trim();
    return `${label} citizen, no visa sponsorship needed`;
  }
  return "";
}

/** Appends the statement once to the header contact line (the line with the email or phone). */
export function applyRightToWork(resume: string, statement: string, email: string, phone: string): string {
  if (!resume || !statement || resume.toLowerCase().includes(statement.toLowerCase())) return resume;
  const lines = resume.split("\n");
  const limit = Math.min(lines.length, 8);
  for (let i = 0; i < limit; i++) {
    const l = lines[i];
    if ((email && l.includes(email)) || (phone && l.includes(phone)) || /@[\w.-]+\.[a-z]{2,}/i.test(l)) {
      lines[i] = `${l.replace(/[\s|]+$/, "")} | ${statement}`;
      return lines.join("\n");
    }
  }
  return resume;
}

// ---------------------------------------------------------------------------
// CV content and cover letter shape prompts.

export function cvContentBlock(top3: string[]): string {
  return `=== CV CONTENT: RESULTS FIRST ===
TOP 3 REQUIREMENTS (posting's own words): ${JSON.stringify(top3)}
- Every bullet leads with the result, then how: "Cut vendor review time by 30% by moving assessments into ServiceNow", not "Responsible for vendor assessments". Use only numbers that are in the original CV; never invent one.
- Roles that ended more than 12 years ago get at most one bullet each. Keep their title, employer and dates.
- The professional summary is at most 2 lines: what the candidate does, in this job's field, and the job's top 2 requirements with evidence from the CV. Do not open with years of experience or adjectives.
- Each of the top 3 requirements that the CV supports appears in the summary or in at least one bullet that shows it being used, not only in the skills list.
- Job titles, employers and dates are copied exactly as in the original CV.`;
}

export function greetingName(contactName: string): string {
  const parts = String(contactName || "").trim().split(/\s+/).filter((p) => !/^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(p));
  const first = parts[0] || "";
  return /^[\p{L}][\p{L}'-]*$/u.test(first) ? first : "";
}

export function coverLetterShapeBlock(contactName: string, noticePeriod: string, rightToWork: string): string {
  const first = greetingName(contactName);
  const facts = [
    noticePeriod ? `notice period: ${noticePeriod}` : "",
    rightToWork ? `right to work: ${rightToWork}` : "",
  ].filter(Boolean);
  return `=== COVER LETTER SHAPE (replaces any earlier length or paragraph guidance) ===
- 150 to 250 words, 3 short paragraphs plus greeting and sign-off.
- Greeting: "${first ? `Dear ${first},` : "Dear Hiring Team,"}"
- Paragraph 1: the role, and one specific reason for this employer taken from the posting.
- Paragraph 2: the 2 requirements with evidence (as already required).
- Paragraph 3: one or two plain sentences with the practical facts the profile gives${facts.length ? ` (${facts.join("; ")})` : " (none recorded, so skip them)"}. Then one plain line inviting a conversation.
- Never state a notice period or right to work the profile does not give. No em dashes.`;
}

/** Forces the greeting line to the contact's first name, or "Dear Hiring Team,". */
export function fixGreeting(letter: string, contactName: string): string {
  if (!letter) return letter;
  const first = greetingName(contactName);
  const greeting = first ? `Dear ${first},` : "Dear Hiring Team,";
  const lines = letter.split("\n");
  const i = lines.findIndex((l) => /^\s*(dear|hello|hi|to whom)\b/i.test(l));
  if (i >= 0 && i < 8) lines[i] = greeting;
  return lines.join("\n");
}

export function wordCount(text: string): number {
  return String(text || "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// ---------------------------------------------------------------------------
// Titles, employers and dates are never changed.

const DATE_SEG = /(\b\d{1,2}[-/]\d{4}\b|\b(19|20)\d{2}\b|\bpresent\b|\bcurrent\b)/i;

/**
 * For every original role whose employer is in the tailored CV, puts the
 * original job title and dates back in that role's heading line when they
 * were reworded. No model call.
 */
export function restoreRoleHeadings(resume: string, roles: OriginalRole[]): { text: string; restored: string[] } {
  if (!resume) return { text: resume, restored: [] };
  const lines = resume.split("\n");
  const restored: string[] = [];
  const used = new Set<number>();
  for (const role of roles) {
    if (!role.company) continue;
    const anchor = lines.findIndex((l, i) => !used.has(i) && l.toLowerCase().includes(role.company.toLowerCase()) && l.trim().length < 200);
    if (anchor < 0) continue;
    used.add(anchor);
    const near = [lines[anchor - 1] || "", lines[anchor], lines[anchor + 1] || ""].join("\n");
    const titleOk = !role.title || near.includes(role.title);
    const datesOk = !role.dates || near.includes(role.dates);
    if (titleOk && datesOk) continue;
    const segs = lines[anchor].split(/\s+\|\s+/);
    if (segs.length < 2) continue;
    const companyIdx = segs.findIndex((s) => s.toLowerCase().includes(role.company.toLowerCase()));
    if (!titleOk) {
      const ti = segs.findIndex((s, i) => i !== companyIdx && !DATE_SEG.test(s));
      if (ti >= 0 && ti < companyIdx) {
        restored.push(`title "${segs[ti].trim()}" -> "${role.title}" at ${role.company}`);
        segs[ti] = role.title;
      }
    }
    if (!datesOk) {
      const di = segs.findIndex((s, i) => i !== companyIdx && DATE_SEG.test(s));
      if (di >= 0) {
        restored.push(`dates "${segs[di].trim()}" -> "${role.dates}" at ${role.company}`);
        segs[di] = role.dates;
      }
    }
    lines[anchor] = segs.join(" | ");
  }
  return { text: lines.join("\n"), restored };
}
