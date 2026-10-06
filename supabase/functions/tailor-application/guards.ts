/**
 * Guards around the tailoring call: refuse non-job pages, protect ATS
 * keywords the candidate already has, check the cover letter answers the
 * job, and strip wording that reads as machine-written.
 */

const NOT_A_JOB =
  /^(?:thanks?\b|thank you\b|application (?:submitted|received|complete|completed|sent|successful)\b|(?:your |the )?application (?:has been|was|is) (?:submitted|received|sent|complete)\b|you(?:'ve| have)? (?:successfully )?(?:applied|submitted)\b|successfully (?:submitted|applied)\b|we(?:'ve| have) (?:received|got) your application\b|(?:job )?application(?: form)?$|apply(?: now| here| for this (?:job|role|position))?$|sign ?in$|log ?in$|page not found$|404\b)/i;

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Format a stored date token (2023-01, 01/2023, 2023) as "January 2023"; passes through "Present".
export function formatMonthYear(raw?: string): string {
  const t = (raw || "").toString().trim();
  if (!t) return "";
  if (/present|current/i.test(t)) return "Present";
  let y = "", m = "";
  const iso = t.match(/^((?:19|20)\d{2})[-\/](\d{1,2})/);
  const my = t.match(/^(\d{1,2})[-\/]((?:19|20)\d{2})/);
  if (iso) { y = iso[1]; m = iso[2]; }
  else if (my) { y = my[2]; m = my[1]; }
  else return t;
  const idx = parseInt(m, 10) - 1;
  return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx]} ${y}` : y;
}
// Build an ATS-safe range: "January 2023 - Present" (full month names, plain hyphen).
export function formatDateRangeATS(start?: string, end?: string, fallbackEnd = ""): string {
  const s = formatMonthYear(start);
  const e = formatMonthYear(end) || fallbackEnd;
  if (!s && !e) return "";
  if (!e) return s;
  if (!s) return e;
  return `${s} - ${e}`;
}

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
      dates: e?.dates || formatDateRangeATS(e?.startDate || e?.start_date, e?.endDate || e?.end_date, "Present"),
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

const US_STATE_CODES = new Set(["al", "ak", "az", "ar", "ca", "co", "ct", "de", "dc", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy"]);
const US_STATE_NAMES = new Set(["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming"]);
const CA_PROVINCE_CODES = new Set(["on", "qc", "bc", "ab", "mb", "ns", "nb", "nl", "pe", "sk"]);
const CA_PROVINCE_NAMES = new Set(["ontario", "quebec", "québec", "british columbia", "alberta", "manitoba", "nova scotia", "new brunswick", "newfoundland and labrador", "prince edward island", "saskatchewan"]);

/** The job's country from its location text, or null when unknown. */
export function jobCountry(location: string): string | null {
  if (!location || !location.trim()) return null;
  const parts = String(location).split(",").map((p) => p.trim().replace(/\.+$/, "").toLowerCase());
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (US_STATE_CODES.has(last) || US_STATE_NAMES.has(last)) return "united states";
    if (CA_PROVINCE_CODES.has(last) || CA_PROVINCE_NAMES.has(last)) return "canada";
  } else {
    const whole = parts[0];
    if (US_STATE_NAMES.has(whole)) return "united states";
    if (CA_PROVINCE_NAMES.has(whole)) return "canada";
  }
  return matchCountry(location, EU_EEA) || matchCountry(location, OTHER_COUNTRIES);
}

// Saved country codes that jobCountry does not read on their own.
const COUNTRY_CODE: Record<string, string> = { gb: "united kingdom", uk: "united kingdom" };

function sameCountry(a: string, b: string): boolean {
  const ca = COUNTRY_CODE[a.toLowerCase().trim()] || jobCountry(a) || a.toLowerCase().trim();
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
- BULLET LENGTH: each experience and project bullet is either one full line of 85 to 105 characters, or two full lines of 175 to 210 characters. Never 106 to 174 characters and never over 210.
- BULLETS PER ROLE: the two most recent roles get 4 to 5 bullets, older roles 2 to 3, roles that ended more than 10 years ago 1 to 2. Keep their title, employer and dates.
- HEADLINE UNDER THE NAME: the target job title only when the candidate has held that title or one level below it; otherwise the most recent title and field, for example "Software Engineer | AI and Data Platforms". Never a VP, Director, Head or Chief title the candidate has not held.
- PROFESSIONAL SUMMARY: at most 2 lines. Start with what the candidate does (role and field), then the two strongest results with numbers from the CV that match the job's top requirements. Never write "Interested in applying this experience to"; never open with years of experience or adjectives.
- SKILLS: labelled lines, one per group, in this order and only groups with items: "Programming: ...", "Frameworks: ...", "Cloud & DevOps: ...", "Data & ML: ...", "Risk & Compliance: ...", "Professional: ...", "Languages: ...". Spoken languages only on the Languages line. Never citizenship, visa or right-to-work wording (it is in the header). Skills, tools and methods only: never job titles, groups of people (for example "Industrial Designers") or company values. Keep every job keyword the CV supports.
- SHORT CONTRACTS: when the CV shows a role was a contract, add "(Contract)" after the job title.
- Never use em dashes.
- Each of the top 3 requirements that the CV supports appears in the summary or in at least one bullet that shows it being used, not only in the skills list.
- Job titles, employers and dates are copied exactly as in the original CV.`;
}

export function greetingName(contactName: string): string {
  const parts = String(contactName || "").trim().split(/\s+/).filter((p) => !/^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(p));
  const first = parts[0] || "";
  return /^[\p{L}][\p{L}'-]*$/u.test(first) ? first : "";
}

export function coverLetterShapeBlock(contactName: string, noticePeriod: string, rightToWork: string, openingStory = "", location = ""): string {
  const first = greetingName(contactName);
  const story = String(openingStory || "").trim();
  const signOff = letterSignOff(location);
  const facts = [
    rightToWork ? `right to work: ${rightToWork}` : "",
    noticePeriod ? `notice period: ${noticePeriod}` : "",
  ].filter(Boolean);
  return `=== COVER LETTER SHAPE (replaces any earlier length or paragraph guidance) ===
- 200 to 280 words, 4 paragraphs plus greeting and sign-off.
- Greeting: "${first ? `Dear ${first},` : "Dear Hiring Team,"}"
- Paragraph 1: ${story ? `this opening story word for word, never reworded: "${story}". Then one sentence naming the role and the company.` : "the role name and the candidate's single strongest result that matches the job's top requirement, in one or two sentences."}
- Paragraph 2: two results that match the job's top two requirements, with their numbers, told in different words from the CV bullets.
- Paragraph 3: one specific fact about the company taken from the job description, and why it matters to the candidate. Never invent a company fact.
- Paragraph 4: ${facts.length ? `${facts.join("; ")}, stated only as given, ` : "no right to work or notice period (none recorded, so leave them out completely), "}then "I am available for a call whenever suits you."
- Never copy a CV bullet into the letter. No run of 8 or more words may match the tailored CV.
- Only state a right to work when given above. Never write "authorized to work in the United States" unless it is given above.
- Only name a tool at an employer when the profile's experience for that employer names it.
- Never write ${LETTER_BANNED.map((b) => `"${b}"`).join(", ")}.
- Every sentence has a subject and a verb. Never start a sentence with a fragment such as "Js, having authored...".
${signOff ? `- Sign off "${signOff}"\n` : ""}- No date line and no "Date:" label; the date is added afterwards. No em dashes.`;
}

/** "Kind regards," for the UK and Ireland, "Sincerely," for the US, otherwise none forced. */
export function letterSignOff(location: string): string {
  const c = jobCountry(location);
  if (c === "united kingdom" || c === "ireland") return "Kind regards,";
  if (c === "united states") return "Sincerely,";
  return "";
}

const SIGN_OFF_LINE = /^\s*(sincerely|kind regards|best regards|warm regards|regards|yours sincerely|yours faithfully|yours truly|best wishes|best|thank you|many thanks)\s*,?\s*$/i;

export function applySignOff(letter: string, location: string): string {
  const s = letterSignOff(location);
  if (!letter || !s) return letter;
  const lines = letter.split("\n");
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
    if (SIGN_OFF_LINE.test(lines[i])) { lines[i] = s; return lines.join("\n"); }
  }
  return letter;
}

// Only the candidate's own status counts; "I protected citizen data" is not a right-to-work sentence.
const RTW_SENTENCE = /\b(right to work|authori[sz]ed to work|eligible to work|work authori[sz]ation|visa sponsorship|work permit|my citizenship|(?:i am|i'm|as) an? (?:[\p{L}-]+ ){0,3}(?:citizen|national|passport holder))\b/iu;

/** Sentences of the protected text (the opening story); these are never changed. */
export function protectedSentences(text: string): string[] {
  return splitSentences(String(text || "").trim());
}
const isProtected = (s: string, protect: string[]) => protect.some((p) => p && (p === s || p.includes(s)));

/** Without a supported statement, every right-to-work sentence is removed. */
export function enforceLetterRightToWork(letter: string, statement: string, protect: string[] = []): { text: string; removed: string[] } {
  const removed: string[] = [];
  if (!letter) return { text: letter, removed };
  const ok = String(statement || "").trim();
  const usOk = /united states|\bus\b|\busa\b/i.test(ok);
  const lines = String(letter).split("\n").map((line) => {
    const t = line.trim();
    if (!t || isHeaderLike(t) || LETTER_STRUCTURE.test(t)) return line;
    const all = splitSentences(t);
    const kept = all.filter((s) => {
      if (isProtected(s, protect)) return true;
      const bad = ok ? (/authori[sz]ed to work in the (united states|us|usa)\b/i.test(s) && !usOk) : RTW_SENTENCE.test(s);
      if (bad) removed.push(s);
      return !bad;
    });
    return kept.length === all.length ? line : kept.join(" ");
  });
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

// Never tools, even when a job keyword or a skill.
const NOT_A_TOOL = /^(audit(s|ing)?|security|compliance|fraud|identity verification|healthcare|leadership|risk|governance|privacy|data protection|communication|stakeholder management|management|strategy|operations|finance|accounting|testing|analytics|reporting|design|research|sales|marketing|customer service|support|training|mentoring|teamwork|problem solving|ownership|onboarding|regulation|regulatory|kyc|aml|fintech|saas|banking|payments|insurance|cybersecurity|information security|incident management|root cause analysis|project management|agile|scrum|data|engineering|software|cloud|devops|machine learning|ai)$/i;
const KNOWN_TOOL = /^(go|golang|python|java|javascript|typescript|c|c\+\+|c#|\.net|ruby|rust|scala|kotlin|swift|php|r|sql|bash|perl|matlab|react|react native|angular|vue|next\.js|node\.js|node|express|django|flask|fastapi|spring|spring boot|rails|laravel|svelte|tailwind|pandas|numpy|pytorch|tensorflow|scikit-learn|spark|kafka|airflow|dbt|hadoop|snowflake|databricks|bigquery|redshift|postgresql|postgres|mysql|mongodb|redis|elasticsearch|dynamodb|cassandra|sqlite|oracle|aws|azure|gcp|google cloud|docker|kubernetes|terraform|ansible|jenkins|github actions|gitlab|git|linux|helm|prometheus|grafana|datadog|splunk|tableau|power bi|looker|excel|salesforce|hubspot|sap|servicenow|jira|confluence|figma|okta|workday|zendesk|stripe|shopify|graphql|rest|grpc)$/i;

/** True for software, languages, frameworks, platforms and products; never audit, security, fraud and the like. */
export function isToolName(term: string): boolean {
  const t = String(term || "").trim();
  if (!t || NOT_A_TOOL.test(t)) return false;
  if (KNOWN_TOOL.test(t)) return true;
  // Product-shaped names: digits, dots, # or +, or inner capitals (PostgreSQL, GitHub, ServiceNow).
  return /[0-9.#+]/.test(t) && /[A-Za-z]/.test(t) && !/\s/.test(t) || /^[A-Z]?[a-z]+[A-Z][A-Za-z]*$/.test(t);
}

/** Tools to check in the letter: the profile's skills plus job keywords that are tools. */
export function letterToolList(skills: any[], jobKeywords: string[]): string[] {
  const fromSkills = (skills || []).map((x: any) => typeof x === "string" ? x : x?.name || "").filter((x: string) => x && !NOT_A_TOOL.test(x.trim()));
  return [...new Set([...fromSkills, ...(jobKeywords || []).filter(isToolName)].map((x) => String(x).trim()).filter(Boolean))];
}

/** Every text value of an experience entry: title, description, bullets, achievements. */
function entryText(e: any): string {
  const out: string[] = [];
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(e);
  return out.join("\n");
}

/** Sentences that name an employer together with a tool that employer's experience does not name. */
export function employerToolSentences(letter: string, experience: any[], tools: string[], protect: string[] = []): string[] {
  const out: string[] = [];
  const roles = (experience || []).map((e) => ({
    company: String(e?.company || e?.employer || "").trim(),
    text: entryText(e),
  })).filter((r) => r.company);
  const list = [...new Set(tools.map((t) => String(t || "").trim()).filter((t) => t && !NOT_A_TOOL.test(t)))];
  for (const p of String(letter || "").split(/\n{2,}/)) {
    const t = p.trim();
    if (!t || isHeaderLike(t) || LETTER_STRUCTURE.test(t)) continue;
    for (const s of splitSentences(t)) {
      if (isProtected(s, protect)) continue;
      const at = roles.filter((r) => containsTerm(s, r.company));
      if (!at.length) continue;
      const bad = list.some((tool) => containsTerm(s, tool) && !at.some((r) => containsTerm(r.text, tool)));
      if (bad && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

/** Removes the given sentences, but never empties a body paragraph or touches protected ones. */
export function dropSentences(letter: string, sentences: string[], protect: string[] = []): string {
  if (!letter || !sentences.length) return letter;
  const drop = sentences.filter((s) => !isProtected(s, protect));
  return String(letter).split(/\n{2,}/).map((p) => {
    const t = p.trim();
    if (!t || isHeaderLike(t) || LETTER_STRUCTURE.test(t)) return p;
    const all = splitSentences(t);
    const kept = all.filter((s) => !drop.includes(s));
    return kept.length === all.length ? p : kept.length ? kept.join(" ") : p;
  }).join("\n\n");
}

/** Runs fn with the protected text masked, so it comes back word for word. */
export function withProtected(letter: string, protectText: string, fn: (s: string) => string): string {
  const story = String(protectText || "").trim();
  if (!letter || !story || !letter.includes(story)) return fn(letter);
  const token = "\u0002STORY\u0002";
  return fn(letter.split(story).join(token)).split(token).join(story);
}

/** A sentence that opens with a fragment ("Js, having authored ...") or a lower-case word. */
export function isFragment(sentence: string): boolean {
  const s = String(sentence || "").trim();
  if (!s) return false;
  if (/^[a-z]/.test(s)) return true;
  if (/^[A-Za-z.]{1,4},\s+(having|being|with|and)\b/i.test(s)) return true;
  if (/^(having|being)\s+\w+/i.test(s)) return true;
  return false;
}

export function findFragments(letter: string): string[] {
  const out: string[] = [];
  for (const p of String(letter || "").split(/\n{2,}/)) {
    const t = p.trim();
    if (!t || isHeaderLike(t) || LETTER_STRUCTURE.test(t)) continue;
    for (const s of splitSentences(t)) if (isFragment(s) && !out.includes(s)) out.push(s);
  }
  return out;
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
    const squash = (s: string) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const titleOk = !role.title || squash(near).includes(squash(role.title));
    const years = role.dates.match(/(?:19|20)\d{2}/g) || [];
    const hasEnd = /\b(?:present|current)\b/i.test(role.dates) || years.length >= 2;
    const datesOk = !role.dates
      || (years.every((y) => near.includes(y)) && (hasEnd || /\b(?:present|current)\b/i.test(near)));
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

// ---------------------------------------------------------------------------
// CV and cover letter layout rules, enforced after generation.

const BULLET_RE = /^(\s*)([•\-*▪·])\s+(.*)$/;

export function bulletLengthOk(len: number): boolean {
  return (len >= 60 && len <= 105) || (len >= 175 && len <= 210);
}

/** The nearer of the two allowed shapes for a bullet of this length. */
export function bulletTarget(len: number): string {
  return len <= 174 ? "one line, 85 to 105 characters" : "two lines, 175 to 210 characters";
}

export interface BadBullet { line: number; text: string; length: number; target: string }

/** Experience and project bullets outside the allowed lengths. */
export function findBadBullets(resume: string): BadBullet[] {
  const lines = String(resume || "").split("\n");
  const out: BadBullet[] = [];
  for (const heading of [/^(PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EXPERIENCE)$/i, /^(PROJECTS|RELEVANT PROJECTS|KEY PROJECTS)$/i]) {
    const range = sectionRange(lines, heading);
    if (!range) continue;
    for (let i = range[0] + 1; i < range[1]; i++) {
      const m = lines[i].match(BULLET_RE);
      if (!m) continue;
      const text = m[3].trim();
      if (!bulletLengthOk(text.length)) out.push({ line: i, text, length: text.length, target: bulletTarget(text.length) });
    }
  }
  return out;
}

function numbersIn(s: string): string[] {
  return String(s || "").match(/\d+(?:[.,]\d+)*/g) || [];
}

const STOP_WORDS = new Set("about above after again against also among and been before being below between both but by could does doing down during each from further have having here into itself more most much once only other over same should some such than that their them then there these they this those through under until very were what when where which while whom with within without would your".split(" "));

/** Lower-case words of 4+ letters that carry meaning. */
export function contentWords(s: string): string[] {
  return (String(s || "").toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !STOP_WORDS.has(w));
}

/** A rewrite is kept only when the length is right and no number, tool or keyword is lost. */
export function acceptRewrite(original: string, rewritten: string, keywords: string[]): boolean {
  const r = String(rewritten || "").replace(/^[\s•*\-▪·]+/, "").trim();
  if (!r || !bulletLengthOk(r.length)) return false;
  // A rewrite only ever shortens, and never brings in a word the bullet did not have.
  if (r.length > String(original || "").trim().length) return false;
  const have = new Set(contentWords(original));
  if (contentWords(r).some((w) => !have.has(w))) return false;
  if (!numbersIn(original).every((n) => r.includes(n))) return false;
  return keywords.filter((k) => containsTerm(original, k)).every((k) => containsTerm(r, k));
}

export function bulletRewritePrompt(bad: BadBullet[], keywords: string[]): string {
  return `Rewrite each bullet to the target length shown, keeping every number, every tool name and these job keywords: ${JSON.stringify(keywords)}. Same facts, plain words, start with the result.
Return only a JSON array of strings, one rewritten bullet per input, in the same order, with no bullet symbol.

${bad.map((b, i) => `${i + 1}. [target: ${b.target}; now ${b.length} characters] ${b.text}`).join("\n")}`;
}

export function applyBulletRewrites(resume: string, bad: BadBullet[], rewrites: string[], keywords: string[]): { text: string; accepted: number } {
  const lines = String(resume || "").split("\n");
  let accepted = 0;
  bad.forEach((b, i) => {
    const r = rewrites[i];
    if (typeof r !== "string" || !acceptRewrite(b.text, r, keywords)) return;
    const m = lines[b.line].match(BULLET_RE);
    if (!m) return;
    lines[b.line] = `${m[1]}${m[2]} ${r.replace(/^[\s•*\-▪·]+/, "").trim()}`;
    accepted++;
  });
  return { text: lines.join("\n"), accepted };
}

// Bullets per role.

function endYear(e: any): number | null {
  const end = String(e?.endDate || e?.end_date || "").trim();
  if (!end || /present|current/i.test(end)) return null;
  const y = end.match(/(?:19|20)\d{2}/);
  return y ? parseInt(y[0], 10) : null;
}

/** Allowed bullet range for each role, in profile order (most recent first). */
export function bulletLimits(experience: any[], now = new Date()): { min: number; max: number }[] {
  const list = Array.isArray(experience) ? experience : [];
  return list.map((e, i) => {
    const end = endYear(e);
    if (end !== null && now.getFullYear() - end > 10) return { min: 1, max: 2 };
    return i < 2 ? { min: 4, max: 5 } : { min: 2, max: 3 };
  });
}

/** Drops bullets beyond a role's maximum, keeping the ones with the most job keywords and numbers. */
export function enforceBulletCounts(resume: string, roles: OriginalRole[], limits: { min: number; max: number }[], keywords: string[]): { text: string; notes: string[] } {
  const lines = String(resume || "").split("\n");
  const notes: string[] = [];
  const range = sectionRange(lines, /^(PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EXPERIENCE)$/i);
  if (!range) return { text: resume, notes };
  const anchors = roles.map((r) => r.company
    ? lines.findIndex((l, i) => i > range[0] && i < range[1] && !BULLET_RE.test(l) && l.toLowerCase().includes(r.company.toLowerCase()))
    : -1);
  const drop = new Set<number>();
  roles.forEach((role, ri) => {
    const a = anchors[ri];
    if (a < 0 || !limits[ri]) return;
    const nextStarts = anchors.filter((x) => x > a);
    const stop = Math.min(range[1], ...nextStarts);
    const bullets: number[] = [];
    for (let i = a + 1; i < stop; i++) if (BULLET_RE.test(lines[i])) bullets.push(i);
    const { min, max } = limits[ri];
    if (bullets.length < min) notes.push(`${role.company}: ${bullets.length} bullets, fewer than ${min}`);
    if (bullets.length <= max) return;
    const score = (i: number) => keywords.filter((k) => containsTerm(lines[i], k)).length * 2 + numbersIn(lines[i]).length;
    const ranked = [...bullets].sort((x, y) => score(y) - score(x) || x - y);
    ranked.slice(max).forEach((i) => drop.add(i));
    notes.push(`${role.company}: ${bullets.length} bullets cut to ${max}`);
  });
  return { text: lines.filter((_, i) => !drop.has(i)).join("\n"), notes };
}

// Headline under the name.

const EXEC_TITLE = /\b(vp|vice president|svp|evp|director|head|chief|c[eotf]o|cxo|president)\b/i;
const LEVEL_WORDS = /\b(intern|trainee|graduate|junior|jr\.?|associate|mid|senior|sr\.?|lead|staff|principal|manager|head|director|vp|vice president|chief|i{1,3}|iv)\b/gi;

function titleLevel(t: string): number {
  const s = t.toLowerCase();
  if (/\b(chief|c[eotf]o|president|vp|vice president)\b/.test(s)) return 6;
  if (/\b(director|head)\b/.test(s)) return 5;
  if (/\b(principal|staff|manager)\b/.test(s)) return 4;
  if (/\b(lead)\b/.test(s)) return 3.5;
  if (/\b(senior|sr\.?)\b/.test(s)) return 3;
  if (/\b(junior|jr\.?|associate|graduate|trainee|intern)\b/.test(s)) return 1;
  return 2;
}

function titleBase(t: string): string {
  return t.toLowerCase().replace(/\(.*?\)/g, " ").replace(LEVEL_WORDS, " ").replace(/[^a-z0-9+#.& ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The target title only when it, or one level below it, has been held.
 * Otherwise the most recent held title and its field. Never an executive
 * title the candidate has not held.
 */
export function chooseHeldHeadline(target: string, heldTitles: string[], currentTitle: string, field: string): string {
  const t = String(target || "").trim();
  const held = heldTitles.map((h) => String(h || "").trim()).filter(Boolean);
  const fallbackTitle = String(currentTitle || held[0] || "").trim();
  const fallback = fallbackTitle && field ? `${fallbackTitle} | ${field}` : fallbackTitle;
  if (!t) return fallback;
  const base = titleBase(t);
  const level = titleLevel(t);
  const qualifies = held.some((h) => {
    const hb = titleBase(h);
    const sameField = !!base && !!hb && (hb === base || hb.includes(base) || base.includes(hb));
    return sameField && titleLevel(h) >= level - 1 && (!EXEC_TITLE.test(t) || EXEC_TITLE.test(h) && titleLevel(h) >= level);
  });
  return qualifies ? t : (fallback || t);
}

// Skills lines.

export const SKILL_GROUPS = ["Programming", "Frameworks", "Cloud & DevOps", "Data & ML", "Risk & Compliance", "Professional", "Languages"] as const;

const SPOKEN = /^(english|irish|gaelic|french|german|spanish|italian|portuguese|dutch|polish|czech|swedish|danish|norwegian|finnish|greek|turkish|arabic|hebrew|russian|ukrainian|romanian|hungarian|mandarin|cantonese|chinese|japanese|korean|hindi|urdu|bengali|punjabi|tamil|malay|indonesian|vietnamese|thai|tagalog|swahili|yoruba|igbo|hausa)\b/i;
const GROUP_TESTS: [typeof SKILL_GROUPS[number], RegExp][] = [
  ["Programming", /^(python|java|javascript|typescript|c\+\+|c#|c|go|golang|rust|ruby|php|scala|kotlin|swift|r|sql|bash|shell|perl|matlab|vba|html|css|dart|elixir|haskell|lua|objective-c|solidity|t-sql|pl\/sql)$/i],
  ["Frameworks", /(react|angular|vue|next\.?js|node\.?js|express|django|flask|fastapi|spring|\.net|rails|laravel|svelte|tailwind|redux|graphql|jquery|nestjs|flutter|react native)/i],
  ["Cloud & DevOps", /(aws|azure|gcp|google cloud|docker|kubernetes|terraform|ansible|jenkins|ci\/cd|github actions|gitlab|git\b|linux|helm|cloudformation|serverless|lambda|devops|infrastructure as code|prometheus|grafana|datadog|nginx|openshift)/i],
  ["Risk & Compliance", /(data governance|data protection|data privacy|privacy|information security|third party risk|operational resilience|risk|compliance|kyc|aml|gdpr|sox|iso ?27001|pci|audit|regulat|fraud|basel|mifid|sanctions|governance|controls|nist|soc ?2|dora|aml\/cft)/i],
  ["Data & ML", /(machine learning|deep learning|\bml\b|\bai\b|nlp|llm|pytorch|tensorflow|scikit|pandas|numpy|spark|hadoop|kafka|airflow|dbt|snowflake|databricks|bigquery|redshift|tableau|power bi|looker|etl|data|analytics|statistics|postgres|mysql|mongodb|redis|elasticsearch|excel|computer vision|generative ai)/i],
];
const NOT_A_SKILL = /(citizen|citizenship|visa|sponsorship|right to work|work permit|work authori[sz]ation|eligible to work|passport)/i;
const PEOPLE_GROUP = /^(?:[a-z&/ -]+ )?(designers|engineers|developers|managers|analysts|scientists|architects|specialists|consultants|recruiters|executives)$/i;
const COMPANY_VALUE = /^(integrity|respect|excellence|customer obsession|ownership mindset|bias for action|be bold|one team|inclusion|diversity|trust|humility|courage|passion|innovation mindset|think big|deliver results|earn trust)$/i;

function labelGroup(label: string): typeof SKILL_GROUPS[number] | null {
  const l = label.toLowerCase();
  if (/spoken|^languages?$/.test(l) && !/program/.test(l)) return "Languages";
  if (/program|coding|languages/.test(l)) return "Programming";
  if (/framework|librar/.test(l)) return "Frameworks";
  if (/cloud|devops|infra|platform/.test(l)) return "Cloud & DevOps";
  if (/data|ml|machine|analytic|ai\b|database/.test(l)) return "Data & ML";
  if (/risk|compliance|regulat|governance|security/.test(l)) return "Risk & Compliance";
  if (/professional|soft|method|business|management|core/.test(l)) return "Professional";
  return null;
}

/**
 * Rewrites the skills section as labelled lines in the fixed order, with
 * spoken languages only on the Languages line, and drops citizenship or visa
 * wording, job titles, groups of people and company values.
 */
export function formatSkillsSection(resume: string): { text: string; dropped: string[] } {
  const lines = String(resume || "").split("\n");
  const range = sectionRange(lines, /^(TECHNICAL SKILLS|SKILLS|CORE SKILLS|KEY SKILLS)$/i);
  if (!range) return { text: resume, dropped: [] };
  const groups = new Map<string, string[]>(SKILL_GROUPS.map((g) => [g, []]));
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (let i = range[0] + 1; i < range[1]; i++) {
    const raw = lines[i].replace(/^[\s•*\-▪·]+/, "").trim();
    if (!raw) continue;
    const m = raw.match(/^([^:]{2,40}):\s*(.*)$/);
    const label = m ? m[1] : "";
    const fromLabel = label ? labelGroup(label) : null;
    for (let item of (m ? m[2] : raw).split(/\s*[,;|]\s*/)) {
      item = item.replace(/\.$/, "").trim();
      if (!item) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      if (NOT_A_SKILL.test(item) || PEOPLE_GROUP.test(item) || COMPANY_VALUE.test(item)) { dropped.push(item); continue; }
      seen.add(key);
      const bare = item.replace(/\s*\(.*\)$/, "");
      let g: string | null = SPOKEN.test(bare) && (fromLabel === "Languages" || /\((?:fluent|native|professional|basic|conversational|intermediate|b\d|c\d|a\d)/i.test(item) || !GROUP_TESTS[0][1].test(bare)) ? "Languages" : null;
      if (!g) g = GROUP_TESTS.find(([, re]) => re.test(bare))?.[0] || null;
      if (!g || (g === "Data & ML" && fromLabel && fromLabel !== "Languages" && fromLabel !== "Professional")) g = fromLabel && fromLabel !== "Languages" ? fromLabel : g;
      groups.get(g || "Professional")!.push(item);
    }
  }
  const body = SKILL_GROUPS.filter((g) => groups.get(g)!.length).map((g) => `${g}: ${groups.get(g)!.join(", ")}`);
  const out = [...lines.slice(0, range[0] + 1), ...body, ...(range[1] < lines.length ? [""] : []), ...lines.slice(range[1])];
  return { text: out.join("\n"), dropped };
}

// Contract roles.

export function isContractRole(e: any): boolean {
  const fields = [e?.employmentType, e?.employment_type, e?.type, e?.contractType, e?.contract_type].map((v) => String(v || ""));
  if (e?.contract === true || e?.isContract === true) return true;
  if (fields.some((f) => /contract|freelance|fixed[- ]term/i.test(f))) return true;
  return /\b(contract(?:or)?|freelance)\b/i.test(String(e?.title || ""));
}

/** Adds "(Contract)" after the job title in the heading of every contract role. */
export function markContractRoles(resume: string, experience: any[]): { text: string; marked: string[] } {
  const lines = String(resume || "").split("\n");
  const marked: string[] = [];
  const used = new Set<number>();
  for (const e of Array.isArray(experience) ? experience : []) {
    const company = String(e?.company || e?.employer || "").trim();
    const title = String(e?.title || e?.role || e?.position || "").trim();
    if (!company || !title || !isContractRole(e)) continue;
    const idx = lines.findIndex((l, i) => !used.has(i) && !BULLET_RE.test(l) && l.toLowerCase().includes(company.toLowerCase()) && l.trim().length < 200);
    if (idx < 0) continue;
    used.add(idx);
    const near = [idx - 1, idx, idx + 1].filter((i) => i >= 0 && i < lines.length);
    if (near.some((i) => /\(contract\)/i.test(lines[i]))) continue;
    const ti = near.find((i) => lines[i].toLowerCase().includes(title.toLowerCase()));
    if (ti === undefined) continue;
    const at = lines[ti].toLowerCase().indexOf(title.toLowerCase()) + title.length;
    lines[ti] = `${lines[ti].slice(0, at)} (Contract)${lines[ti].slice(at)}`;
    marked.push(`${title} at ${company}`);
  }
  return { text: lines.join("\n"), marked };
}

// Summary wording.

export function stripSummaryFiller(resume: string): string {
  return String(resume || "").replace(/[^.\n]*\binterested in applying (?:this|my|these) (?:experience|skills?)[^.\n]*\.?\s*/gi, "").replace(/[ \t]+\n/g, "\n");
}

// Cover letter.

export const LETTER_BANNED = [
  "aligns with your mission", "I welcome the opportunity", "I am excited about the opportunity", "impactful", "actionable insights",
  "leverage", "utilize", "seamless", "robust", "significantly", "effectively", "showing my ability",
  "Also,", "Additionally,", "Furthermore,", "Alongside that,",
  "showing my capabilities", "showing effective", "I am excited", "passionate",
];

/** Removes the banned cover-letter phrases that a model may still write. */
export function stripLetterBanned(letter: string, protectText = ""): string {
  if (protectText) return withProtected(letter, protectText, (x) => stripLetterBanned(x));
  const cap = (_m: string, pre: string, c: string) => pre + c.toUpperCase();
  return String(letter || "")
    // Whole sentences built on a banned stock phrase go.
    .replace(/[^.!?\n]*\b(aligns? with your mission|I welcome the opportunity|I am excited about the opportunity)\b[^.!?\n]*[.!?]?\s*/gi, "")
    .replace(/,?\s*showing my (capabilities|ability)\b[^.,]*/gi, "")
    .replace(/,?\s*showing effective\b[^.,]*/gi, "")
    .replace(/\bI am excited (?:to|about|by)\b/gi, "I would like to")
    .replace(/\bleverag(?:e|ed|es|ing)\b/gi, (m) => ({ leverage: "use", leveraged: "used", leverages: "uses", leveraging: "using" } as Record<string, string>)[m.toLowerCase()] || "use")
    .replace(/\butili[sz](?:e|ed|es|ing)\b/gi, (m) => ({ e: "use", ed: "used", es: "uses", ing: "using" } as Record<string, string>)[m.toLowerCase().replace(/^utili[sz]/, "")] || "use")
    .replace(/\bactionable insights\b/gi, "insights")
    .replace(/\s*\b(impactful|seamless(?:ly)?|robust|significantly|effectively)\b/gi, "")
    .replace(/(^|[.!?\u0002]\s+|\n)(?:also|additionally|furthermore|alongside that),\s+(\p{L})/giu, cap)
    .replace(/\bpassionate about\b/gi, "focused on")
    .replace(/\bpassionate\b/gi, "committed")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:])/g, "$1");
}

export function formatLetterDate(date: Date, us: boolean): string {
  const d = date.getUTCDate(), m = MONTH_NAMES[date.getUTCMonth()], y = date.getUTCFullYear();
  return us ? `${m} ${d}, ${y}` : `${d} ${m} ${y}`;
}

const DATE_LINE = new RegExp(`^\\s*(?:date\\s*:\\s*)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_NAMES.join("|")})\\s+\\d{4}|(?:${MONTH_NAMES.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})\\s*$`, "i");

/** One date line above the greeting, in the job country's style, with no "Date:" label. */
export function applyLetterDate(letter: string, location: string, date = new Date()): string {
  if (!letter) return letter;
  const line = formatLetterDate(date, jobCountry(location) === "united states");
  const lines = letter.split("\n").filter((l, i) => !(i < 12 && (DATE_LINE.test(l) || /^\s*date\s*:/i.test(l))));
  const re = lines.findIndex((l, i) => i < 10 && /^\s*re\s*:/i.test(l));
  const g = lines.findIndex((l) => /^\s*(dear|hello|hi|to whom)\b/i.test(l));
  const at = re >= 0 ? re : g >= 0 && g < 10 ? g : 0;
  lines.splice(at, 0, line, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+/, "");
}

// ---------------------------------------------------------------------------
// Removing a claim removes its whole sentence, never only the words.

const LETTER_STRUCTURE = /^\s*(dear|hello|hi|to whom|re\s*:|date\s*:|sincerely|kind regards|best regards|regards|yours)\b/i;
const isHeaderLike = (t: string) => t.includes("@") || t.includes("|") || /https?:\/\/|www\./i.test(t);

function splitSentences(text: string): string[] {
  const M = "\u0001";
  const masked = text.replace(/(\d)\.(?=\d)/g, `$1${M}`).replace(/\b([A-Z])\.(?=[A-Z]\.)/g, `$1${M}`);
  return (masked.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || []).map((x) => x.replaceAll(M, ".").trim()).filter(Boolean);
}

/** Drops every prose sentence that names one of the terms; structure lines are left alone. */
export function dropClaimSentences(text: string, terms: string[]): { text: string; removed: string[] } {
  const removed: string[] = [];
  const list = terms.map((t) => String(t || "").trim()).filter(Boolean);
  if (!text || !list.length) return { text, removed };
  const out = String(text).split("\n").map((line) => {
    const t = line.trim();
    if (!t || isHeaderLike(t) || LETTER_STRUCTURE.test(t)) return line;
    const kept = splitSentences(t).filter((s) => {
      if (list.some((term) => containsTerm(s, term))) { removed.push(s); return false; }
      return true;
    });
    return kept.join(" ");
  });
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

// ---------------------------------------------------------------------------
// Cover letter shape: header kept, exactly three body paragraphs.

const OPENING_CONNECTIVE = /^(also|additionally|furthermore|moreover|in addition|secondly|similarly|likewise)\s*,?\s+/i;
const squash = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9%£$€]+/g, " ").trim();

/** True when the sentence repeats a CV bullet word for word (or a long run of one). */
export function copiesBullet(sentence: string, bullets: string[]): boolean {
  const s = squash(sentence);
  if (!s) return false;
  return bullets.some((b) => {
    const q = squash(b);
    if (q.split(" ").length < 6) return false;
    if (s.includes(q)) return true;
    if (s.split(" ").length >= 8 && q.includes(s)) return true;
    // No run of 8 or more words may match the CV.
    const w = s.split(" ");
    const hay = ` ${q} `;
    for (let i = 0; i + 8 <= w.length; i++) if (hay.includes(` ${w.slice(i, i + 8).join(" ")} `)) return true;
    return false;
  });
}

/** Body sentences of the letter that copy a CV bullet word for word. */
export function findCopiedSentences(letter: string, bullets: string[]): string[] {
  const out: string[] = [];
  for (const p of String(letter || "").split(/\n{2,}/)) {
    const t = p.trim();
    if (!t || isHeaderLike(t) || LETTER_STRUCTURE.test(t)) continue;
    for (const s of splitSentences(t)) if (copiesBullet(s, bullets) && !out.includes(s)) out.push(s);
  }
  return out;
}

export function letterRewordPrompt(sentences: string[]): string {
  return `Reword each sentence for a cover letter in first person, same facts, keep every number, tool name and employer, no new claims, at most 35 words. Each sentence must be grammatical, with a subject and a verb, and share no run of 8 or more words with the CV.
Return only a JSON array of strings, one per input, in the same order.

${sentences.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
}

/** A rewording keeps every number and adds no 4+ letter word the CV does not contain. */
export function acceptLetterRewording(original: string, reworded: string, cvText: string): boolean {
  const r = String(reworded || "").trim();
  if (!r || r.split(/\s+/).length > 35) return false;
  if (!numbersIn(original).every((n) => r.includes(n))) return false;
  const known = new Set([...contentWords(cvText), ...contentWords(original)]);
  return contentWords(r).every((w) => known.has(w));
}

export function shapeCoverLetter(letter: string, bullets: string[], header: { name: string; contact: string }, rewordings: Record<string, string> = {}, opts: { openingStory?: string; company?: string; role?: string } = {}): { text: string; notes: string[] } {
  const notes: string[] = [];
  if (!letter) return { text: letter, notes };
  const paras = String(letter).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const g = paras.findIndex((p) => /^(dear|hello|hi|to whom)\b/i.test(p));
  let close = paras.findIndex((p, i) => i > g && /^(sincerely|kind regards|best regards|regards|yours|best wishes|thank you,?$)/i.test(p));
  if (close < 0) close = paras.length;
  const head = g >= 0 ? paras.slice(0, g + 1) : [];
  const tail = paras.slice(close);
  let body = paras.slice(g + 1, close);
  const story = String(opts.openingStory || "").trim();
  body = body.map((p, idx) => {
    if (story && idx === 0 && p.startsWith(story)) return p;
    // A copied or ungrammatical sentence is reworded when an accepted rewording exists, never deleted.
    const kept = splitSentences(p).map((s) => {
      const copied = copiesBullet(s, bullets);
      if (!copied && !isFragment(s)) return s;
      if (rewordings[s]) { notes.push(`reworded ${copied ? "copied CV bullet" : "fragment"}: ${s}`); return rewordings[s]; }
      notes.push(`kept ${copied ? "copied CV bullet" : "fragment"} (no accepted rewording): ${s}`);
      return s;
    });
    let out = kept.join(" ");
    if (OPENING_CONNECTIVE.test(out)) {
      notes.push("removed opening connective");
      out = out.replace(OPENING_CONNECTIVE, "");
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out.trim();
  }).filter(Boolean);
  if (story && !(body[0] || "").startsWith(story)) {
    // The opening story is kept word for word, followed by one sentence naming the role and company.
    const names = [opts.company, opts.role].map((x) => String(x || "").trim()).filter((x) => x && !/^not specified$/i.test(x));
    const naming = splitSentences(body[0] || "").find((x) => !story.includes(x) && names.some((n) => containsTerm(x, n)));
    const p1 = naming ? `${story} ${naming}` : story;
    if (body.length >= 4 || !body.length) body[0] = p1; else body.unshift(p1);
    notes.push("restored opening story word for word");
  }
  if (body.length > 4) {
    notes.push(`merged ${body.length - 4} extra paragraph(s) into paragraph 2`);
    body = [body[0], [body[1], ...body.slice(2, -2)].join(" "), body[body.length - 2], body[body.length - 1]];
  }
  const out = [...head, ...body, ...tail];
  const name = String(header.name || "").trim();
  const top = out.slice(0, 3).join("\n").toLowerCase();
  if (name && !top.includes(name.toLowerCase())) {
    out.unshift([name, String(header.contact || "").trim()].filter(Boolean).join("\n"));
    notes.push("restored name and contact header");
  }
  return { text: out.join("\n\n"), notes };
}
