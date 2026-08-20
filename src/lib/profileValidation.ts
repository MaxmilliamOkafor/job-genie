// Profile data hygiene + validation helpers.
// Everything here is ATS-facing: field shapes match what the CV generator and
// autofill engine expect (Workday, Greenhouse, iCIMS).

export const CURRENT_YEAR = () => new Date().getFullYear();
export const MIN_YEAR = 1950;
export const maxYear = () => CURRENT_YEAR() + 8;

export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
  'Temporary',
  'Freelance',
  'Secondment',
] as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ------------------------------------------------------------------ */
/* 7. Text rules                                                       */
/* ------------------------------------------------------------------ */

/** Replace every em/en dash (and friends) with a plain ASCII hyphen. */
export const deDash = (value: string): string =>
  value
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ');

export const tidyText = (value: string): string =>
  deDash(String(value ?? ''))
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

/** "01-2023" | "2023-01" | "Jan 2023" -> "January 2023"; "" -> "" */
export const toMonthYear = (raw?: string): string => {
  const v = deDash(String(raw ?? '')).trim();
  if (!v) return '';
  if (/^present$/i.test(v)) return 'Present';

  let month = 0;
  let year = '';

  const mmYyyy = v.match(/^(\d{1,2})[-/](\d{4})$/);
  const yyyyMm = v.match(/^(\d{4})[-/](\d{1,2})$/);
  const named = v.match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);

  if (mmYyyy) {
    month = Number(mmYyyy[1]);
    year = mmYyyy[2];
  } else if (yyyyMm) {
    month = Number(yyyyMm[2]);
    year = yyyyMm[1];
  } else if (named) {
    const idx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(named[1].toLowerCase().slice(0, 3)));
    if (idx >= 0) month = idx + 1;
    year = named[2];
  } else {
    const onlyYear = v.match(/^(\d{4})$/);
    if (onlyYear) return onlyYear[1];
    return v;
  }

  if (!year) return v;
  if (month < 1 || month > 12) return year;
  return `${MONTHS[month - 1]} ${year}`;
};

/** "Month YYYY - Month YYYY" or "Month YYYY - Present" */
export const monthYearRange = (start?: string, end?: string): string => {
  const s = toMonthYear(start);
  const e = end ? toMonthYear(end) : 'Present';
  if (!s && !e) return '';
  if (!s) return e;
  return `${s} - ${e || 'Present'}`;
};

/** Store phone in international format, e.g. "+353 87 426 1508". */
export const normalisePhone = (raw?: string, defaultCountry = '353'): string => {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  let digits = v.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith('+')) {
    // National format: drop the leading trunk 0 and prepend the country code.
    digits = `+${defaultCountry}${digits.replace(/^0+/, '')}`;
  }
  const cc = digits.slice(1).replace(/\D/g, '');
  if (!cc) return '';
  // Group as +CC NN NNN NNNN (best effort, purely cosmetic).
  const country = cc.slice(0, defaultCountry.length === cc.length ? cc.length : 3).replace(/\D/g, '');
  const code = cc.startsWith(defaultCountry) ? defaultCountry : country.slice(0, 2);
  const rest = cc.slice(code.length);
  const groups: string[] = [];
  if (rest.length > 6) {
    groups.push(rest.slice(0, 2), rest.slice(2, 5), rest.slice(5));
  } else if (rest.length) {
    groups.push(rest);
  }
  return `+${code}${groups.length ? ' ' + groups.filter(Boolean).join(' ') : ''}`.trim();
};

/* ------------------------------------------------------------------ */
/* 2. Title / employment type                                          */
/* ------------------------------------------------------------------ */

const TYPE_ALIASES: Record<string, string> = {
  'full time': 'Full-time',
  'full-time': 'Full-time',
  fulltime: 'Full-time',
  'part time': 'Part-time',
  'part-time': 'Part-time',
  parttime: 'Part-time',
  contract: 'Contract',
  contractor: 'Contract',
  internship: 'Internship',
  intern: 'Internship',
  temporary: 'Temporary',
  temp: 'Temporary',
  freelance: 'Freelance',
  secondment: 'Secondment',
};

/**
 * "Senior Software Engineer (Contract, part-time)"
 *   -> { title: "Senior Software Engineer", employment_type: "Contract" }
 */
export const splitTitleAndEmploymentType = (
  rawTitle?: string,
  existingType?: string,
): { title: string; employment_type: string } => {
  let title = tidyText(rawTitle || '');
  let employment_type = tidyText(existingType || '');

  const brackets = title.match(/\(([^)]*)\)/g) || [];
  for (const group of brackets) {
    const inner = group.slice(1, -1);
    const parts = inner.split(/[,/;]| and /i).map((p) => tidyText(p).toLowerCase());
    const found = parts.map((p) => TYPE_ALIASES[p]).find(Boolean);
    if (found) {
      if (!employment_type) employment_type = found;
      title = title.replace(group, ' ');
    }
  }

  // Any remaining trailing bracket that is not a date range is noise on the title.
  title = tidyText(title.replace(/\s*\(\s*\)\s*/g, ' ')).replace(/[\s,-]+$/, '').trim();

  return { title: tidyText(title), employment_type };
};

/* ------------------------------------------------------------------ */
/* 3. Company name                                                     */
/* ------------------------------------------------------------------ */

const LEGAL_SUFFIX = /^(inc|inc\.|llc|ltd|ltd\.|limited|plc|gmbh|bv|nv|sa|ag|pty|llp|lp|co|co\.|corp|corp\.|corporation|company|group|holdings|partners)$/i;

const COUNTRY_CODES: Record<string, string> = {
  IE: 'Ireland',
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  US: 'United States',
  USA: 'United States',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  PT: 'Portugal',
  PL: 'Poland',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  IN: 'India',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  ZA: 'South Africa',
  CH: 'Switzerland',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  BE: 'Belgium',
  AT: 'Austria',
  JP: 'Japan',
  CN: 'China',
  BR: 'Brazil',
  MX: 'Mexico',
};

const KNOWN_PLACES = new Set(
  [
    'ireland', 'dublin', 'cork', 'galway', 'limerick', 'belfast',
    'united kingdom', 'england', 'scotland', 'wales', 'london', 'manchester', 'birmingham',
    'edinburgh', 'glasgow', 'leeds', 'bristol', 'cardiff',
    'united states', 'usa', 'new york', 'san francisco', 'seattle', 'austin', 'boston',
    'chicago', 'dallas', 'houston', 'atlanta', 'denver', 'los angeles', 'washington',
    'texas', 'california', 'virginia', 'florida', 'illinois', 'massachusetts',
    'germany', 'berlin', 'munich', 'frankfurt', 'hamburg',
    'france', 'paris', 'lyon', 'netherlands', 'amsterdam', 'rotterdam', 'utrecht',
    'spain', 'madrid', 'barcelona', 'portugal', 'lisbon', 'porto',
    'poland', 'warsaw', 'krakow', 'switzerland', 'zurich', 'geneva',
    'sweden', 'stockholm', 'norway', 'oslo', 'denmark', 'copenhagen', 'finland', 'helsinki',
    'belgium', 'brussels', 'austria', 'vienna', 'italy', 'milan', 'rome',
    'canada', 'toronto', 'vancouver', 'montreal', 'australia', 'sydney', 'melbourne',
    'india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai',
    'singapore', 'dubai', 'united arab emirates', 'japan', 'tokyo', 'china', 'shanghai',
    'brazil', 'sao paulo', 'mexico', 'mexico city', 'remote',
  ].map((s) => s.toLowerCase()),
);

const looksLikePlace = (segment: string): boolean => {
  const s = tidyText(segment).toLowerCase().replace(/\.$/, '');
  if (!s) return false;
  if (LEGAL_SUFFIX.test(s)) return false;
  if (COUNTRY_CODES[s.toUpperCase()]) return true;
  return KNOWN_PLACES.has(s);
};

/**
 * "Meta (formerly Facebook Inc)"      -> { company: "Meta" }
 * "Meta, Dublin, Ireland"             -> { company: "Meta", location: "Dublin, Ireland" }
 * "Booz Allen Hamilton, Inc."         -> { company: "Booz Allen Hamilton, Inc." }
 */
export const normaliseCompany = (raw?: string): { company: string; location: string } => {
  let value = tidyText(raw || '');
  if (!value) return { company: '', location: '' };

  // Strip trailing parenthetical, e.g. "(formerly Facebook Inc)".
  value = tidyText(value.replace(/\s*\([^)]*\)\s*$/, ''));

  const segments = value.split(',').map((s) => tidyText(s));
  if (segments.length < 2) return { company: value, location: '' };

  // Walk from the end, peeling off place-looking segments.
  const placeParts: string[] = [];
  let i = segments.length - 1;
  while (i > 0 && looksLikePlace(segments[i])) {
    placeParts.unshift(segments[i]);
    i -= 1;
  }

  if (!placeParts.length) return { company: value, location: '' };

  return {
    company: segments.slice(0, i + 1).join(', '),
    location: placeParts.join(', '),
  };
};

/* ------------------------------------------------------------------ */
/* 4. Role location                                                    */
/* ------------------------------------------------------------------ */

const titleCasePart = (part: string): string =>
  part
    .split(/\s+/)
    .map((w) => {
      if (!w) return w;
      const upper = w.toUpperCase();
      if (COUNTRY_CODES[upper] && w.length <= 3) return COUNTRY_CODES[upper];
      if (/^(of|the|and|de|da|du|von|van)$/i.test(w)) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');

/** Auto-correct on blur. Never throws; returns the best-effort tidy value. */
export const normaliseLocation = (raw?: string): string => {
  const value = tidyText(raw || '');
  if (!value) return '';
  const parts = value
    .split(',')
    .map((p) => tidyText(p))
    .filter(Boolean)
    .map((p) => {
      const upper = p.toUpperCase();
      if (p.length <= 3 && COUNTRY_CODES[upper]) return COUNTRY_CODES[upper];
      if (/^remote$/i.test(p)) return 'Remote';
      return titleCasePart(p);
    });
  return parts.join(', ');
};

export const validateLocation = (raw?: string): string | null => {
  const value = String(raw ?? '');
  if (!value.trim()) return null; // optional
  if (/\t/.test(value)) return 'Location cannot contain tabs.';
  if (value.length > 60) return 'Location must be 60 characters or fewer.';

  const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    if (/^remote$/i.test(parts[0])) return null;
    return 'Use "City, Country" (e.g. Dublin, Ireland) or "Remote".';
  }
  if (parts.length > 3) return 'Use "City, Country" or "City, State, Country".';
  return null;
};

/* ------------------------------------------------------------------ */
/* 5. Skills / competencies                                            */
/* ------------------------------------------------------------------ */

/** "Power BI", "power bi" and "PowerBI" all collapse to "powerbi". */
export const skillKey = (term: string): string =>
  String(term ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const COMPETENCY_CATEGORY = 'competency';

export const isSoftSkillPhrase = (term: string): boolean =>
  /\bskills?\b/i.test(String(term ?? ''));

export const wordCount = (term: string): number =>
  String(term ?? '').trim().split(/\s+/).filter(Boolean).length;

export type SkillLike = { name: string; category?: string; years?: number };

export const splitSkillLists = (skills: SkillLike[] = []) => {
  const competencies = skills.filter((s) => (s.category || '') === COMPETENCY_CATEGORY);
  const technical = skills.filter((s) => (s.category || '') !== COMPETENCY_CATEGORY);
  return { competencies, technical };
};

/** Terms appearing in both lists (normalised comparison). */
export const crossListDuplicates = (skills: SkillLike[] = []): string[] => {
  const { competencies, technical } = splitSkillLists(skills);
  const techKeys = new Set(technical.map((s) => skillKey(s.name)));
  return competencies.filter((c) => techKeys.has(skillKey(c.name))).map((c) => c.name);
};

/** Duplicate terms inside a single list. */
export const withinListDuplicates = (list: SkillLike[] = []): string[] => {
  const seen = new Set<string>();
  const dupes: string[] = [];
  list.forEach((s) => {
    const k = skillKey(s.name);
    if (!k) return;
    if (seen.has(k)) dupes.push(s.name);
    else seen.add(k);
  });
  return dupes;
};

export const validateSkills = (skills: SkillLike[] = []): string[] => {
  const errors: string[] = [];
  const { competencies } = splitSkillLists(skills);

  const cross = crossListDuplicates(skills);
  if (cross.length) {
    errors.push(`Duplicate term in both lists: ${cross.join(', ')}. Keep each term once.`);
  }

  const within = withinListDuplicates(skills);
  if (within.length) {
    errors.push(`Repeated term: ${within.join(', ')}.`);
  }

  if (competencies.length && (competencies.length < 6 || competencies.length > 9)) {
    errors.push(`Core competencies must be 6 to 9 phrases (currently ${competencies.length}).`);
  }

  const tooLong = competencies.filter((c) => wordCount(c.name) < 1 || wordCount(c.name) > 4);
  if (tooLong.length) {
    errors.push(`Each competency must be 1 to 4 words: ${tooLong.map((c) => c.name).join(', ')}.`);
  }

  const soft = competencies.filter((c) => isSoftSkillPhrase(c.name));
  if (soft.length) {
    errors.push(`Competencies cannot contain the word "skills": ${soft.map((c) => c.name).join(', ')}.`);
  }

  return errors;
};

/** Exactly how the single TECHNICAL SKILLS section will print. */
export const combinedSkillsPreview = (skills: SkillLike[] = []): string[] => {
  const { competencies, technical } = splitSkillLists(skills);
  const seen = new Set<string>();
  const out: string[] = [];
  [...competencies, ...technical].forEach((s) => {
    const name = tidyText(s.name);
    const k = skillKey(name);
    if (!name || !k || seen.has(k)) return;
    seen.add(k);
    out.push(name);
  });
  return out;
};

/* ------------------------------------------------------------------ */
/* 1. Education years                                                  */
/* ------------------------------------------------------------------ */

export const validateEducationEntry = (edu: any): string[] => {
  const errors: string[] = [];
  const max = maxYear();
  const label = edu?.degree || edu?.institution || 'Education entry';
  const s = String(edu?.start_year ?? '').trim();
  const e = String(edu?.end_year ?? '').trim();

  const badYear = (y: string) => !/^\d{4}$/.test(y) || Number(y) < MIN_YEAR || Number(y) > max;

  if (!s) errors.push(`${label}: From (year) is required.`);
  else if (badYear(s)) errors.push(`${label}: From (year) must be 4 digits between ${MIN_YEAR} and ${max}.`);

  if (!e) errors.push(`${label}: To (year) is required.`);
  else if (e !== 'Present' && badYear(e)) {
    errors.push(`${label}: To (year) must be 4 digits between ${MIN_YEAR} and ${max}.`);
  }

  if (/^\d{4}$/.test(s) && /^\d{4}$/.test(e) && Number(e) < Number(s)) {
    errors.push(`${label}: To (year) cannot be earlier than From (year).`);
  }

  return errors;
};

/* ------------------------------------------------------------------ */
/* 6. Projects                                                         */
/* ------------------------------------------------------------------ */

export const PROJECT_DESCRIPTION_MAX = 200;
export const CERTIFICATIONS_MAX = 6;
export const CERTIFICATIONS_CAP_MESSAGE =
  'Six is the most that earns its space. Move your strongest to the top.';

export const projectIssues = (project: any): string[] => {
  const issues: string[] = [];
  const name = tidyText(project?.name || '');
  if (!name) issues.push('Name is required.');
  else if (/-/.test(name)) issues.push('Name should not contain dashes.');

  const tech = tidyText(project?.techStack || '');
  if (!tech) issues.push('Tech stack is required.');
  else if (tech.length > 60) issues.push('Tech stack must be 60 characters or fewer.');

  const description = String(project?.description ?? '');
  if (description.length > PROJECT_DESCRIPTION_MAX) {
    issues.push(`Description must be ${PROJECT_DESCRIPTION_MAX} characters or fewer (currently ${description.length}).`);
  }

  const bullets = (project?.bullets || []).map((b: string) => tidyText(b)).filter(Boolean);
  if (bullets.length < 1 || bullets.length > 2) issues.push('Use 1 to 2 bullets.');
  if (bullets.some((b: string) => !/[.!?]$/.test(b))) issues.push('Each bullet must be a complete sentence ending in a full stop.');

  const url = (u?: string) => /^https:\/\/\S+$/i.test(String(u ?? '').trim());
  if (!url(project?.liveUrl)) issues.push('Live URL missing or not a full https:// link.');
  if (!url(project?.codeUrl)) issues.push('Code URL missing or not a full https:// link.');

  return issues;
};


/* ------------------------------------------------------------------ */
/* Whole-profile normalisation + validation                            */
/* ------------------------------------------------------------------ */

const deepDeDash = (value: any): any => {
  if (typeof value === 'string') return deDash(value);
  if (Array.isArray(value)) return value.map(deepDeDash);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = deepDeDash(v);
    });
    return out;
  }
  return value;
};

export const normaliseProfileForSave = <T extends Record<string, any>>(profile: T): T => {
  const next: Record<string, any> = deepDeDash({ ...profile });

  if (next.phone) next.phone = normalisePhone(next.phone);

  next.professional_experience = (next.professional_experience || []).map((exp: any) => {
    const { title, employment_type } = splitTitleAndEmploymentType(exp.title, exp.employment_type);
    const fromCompany = normaliseCompany(exp.company);
    const location = normaliseLocation(exp.location || fromCompany.location);
    return {
      ...exp,
      title,
      employment_type: employment_type || '',
      company: fromCompany.company,
      location,
      dateRange: monthYearRange(exp.startDate, exp.endDate),
    };
  });

  next.education = (next.education || []).map((edu: any) => ({
    ...edu,
    start_year: String(edu.start_year ?? '').trim(),
    end_year: String(edu.end_year ?? '').trim(),
  }));

  next.relevant_projects = (next.relevant_projects || []).map((p: any) => ({
    ...p,
    name: tidyText(p.name || ''),
    techStack: tidyText(p.techStack || '').slice(0, 60),
  }));

  return next as T;
};

export const validateProfileForSave = (profile: Record<string, any>): string[] => {
  const errors: string[] = [];

  (profile.education || []).forEach((edu: any) => {
    errors.push(...validateEducationEntry(edu));
  });

  (profile.professional_experience || []).forEach((exp: any) => {
    const err = validateLocation(exp.location);
    if (err) errors.push(`${exp.company || exp.title || 'Role'}: ${err}`);
  });

  errors.push(...validateSkills(profile.skills || []));

  (profile.relevant_projects || []).forEach((p: any) => {
    const description = String(p?.description ?? '');
    if (description.length > PROJECT_DESCRIPTION_MAX) {
      errors.push(
        `${p?.name || 'Project'}: description must be ${PROJECT_DESCRIPTION_MAX} characters or fewer (currently ${description.length}).`,
      );
    }
  });

  if ((profile.certifications || []).length > CERTIFICATIONS_MAX) {
    errors.push(`Too many certifications. ${CERTIFICATIONS_CAP_MESSAGE}`);
  }

  return errors;
};

