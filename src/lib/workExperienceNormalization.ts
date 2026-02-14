// Shared work experience normalisation helpers used by Profile page + hooks

export type WorkExperienceLike = {
  id?: string;
  company?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  start_date?: string;
  end_date?: string;
  dates?: string;
  description?: string | string[];
  bullets?: string[];
  [key: string]: any;
};

const cleanText = (value: unknown) => {
  const t = String(value ?? '').trim();
  // common parser artifacts (markdown headings etc.)
  return t.replace(/^#+\s*/, '').replace(/^[-•▪*]+\s*/, '').trim();
};

// Heuristics to prevent "company ↔ role" swaps when CV parsing (and some users manual entry)
const isLikelyJobTitle = (text: string) => {
  const t = cleanText(text);
  if (!t) return false;
  return (
    /\b(engineer|developer|architect|analyst|manager|director|scientist|specialist|lead|consultant|designer|administrator|coordinator|officer|executive|vp|president|founder|cto|ceo|cfo|coo)\b/i.test(t) ||
    /\b(senior|junior|principal|staff|associate|assistant|intern|head of|chief)\b/i.test(t) ||
    /\b(product|project|program|data|software|cloud|ai|ml|llm|genai|machine learning|devops|sre|qa|security)\b/i.test(t)
  );
};

// Known company names for detection (normalised lowercase)
const KNOWN_COMPANIES = new Set([
  'google', 'meta', 'facebook', 'amazon', 'apple', 'microsoft', 'netflix',
  'ibm', 'oracle', 'salesforce', 'adobe', 'intel', 'nvidia', 'cisco', 'dell', 'hp',
  'accenture', 'deloitte', 'pwc', 'kpmg', 'ey', 'mckinsey', 'bain', 'bcg',
  'citi', 'citigroup', 'citibank', 'jpmorgan', 'jp morgan', 'goldman', 'goldman sachs',
  'morgan stanley', 'barclays', 'hsbc', 'solimhealth', 'stripe', 'uber', 'airbnb',
  'linkedin', 'twitter', 'x', 'snap', 'snapchat', 'pinterest', 'spotify', 'discord',
  'shopify', 'twilio', 'datadog', 'snowflake', 'databricks', 'mongodb', 'elastic',
  'palantir', 'crowdstrike', 'okta', 'splunk', 'atlassian', 'gitlab', 'hubspot',
  'zendesk', 'docusign', 'workday', 'servicenow', 'vmware', 'sap', 'twosigma',
  'two sigma', 'citadel', 'jane street', 'janestreet', 'de shaw', 'deshaw',
  'renaissance', 'millennium', 'blackrock', 'fidelity', 'capital one', 'capitalone',
  'revolut', 'robinhood', 'coinbase', 'plaid', 'block', 'square', 'paypal', 'visa', 'mastercard'
]);

// Clean company name: remove parentheticals like "(formerly Facebook Inc)"
const cleanCompanyName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ')  // Remove parenthetical expressions
    .replace(/\s+/g, ' ')               // Collapse whitespace
    .trim();
};

const isLikelyCompany = (text: string) => {
  const t = cleanText(text);
  if (!t) return false;
  
  // Normalise for matching
  const normalised = t.toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  
  // Check known companies first (handles variations like "Citi" vs "Citigroup")
  const containsKnownCompany = Array.from(KNOWN_COMPANIES).some(c => normalised.includes(c));
  if (containsKnownCompany) return true;
  
  return (
    /\b(inc|llc|ltd|corp|corporation|company|co\.|plc|group|holdings|partners|ventures|labs|technologies|solutions|consulting|services|startup)\b/i.test(t) ||
    /\bformerly\b/i.test(t)
  );
};

const splitCompanyAndTitle = (value: string) => {
  const raw = cleanText(value);
  if (!raw) return null;

  const splitters: RegExp[] = [
    // "Company – Title" or "Company — Title"
    /\s*[–—]\s*/,
    // "Company - Title" (avoid dates like 2020-2023 by requiring spaces)
    /\s+-\s+/,
    // "Company | Title"
    /\s*\|\s*/,
    // "Company → Title" / "Company -> Title" (common in user input)
    /\s*(?:→|->|⇒|›)\s*/,
  ];

  for (const re of splitters) {
    const parts = raw.split(re).map(s => cleanText(s)).filter(Boolean);
    if (parts.length >= 2) {
      return { company: parts[0], title: parts[1] };
    }
  }

  // Special case: "X is for → Y"
  const m = raw.match(/^(.*?)\s+is\s+for\s+(?:→|->|⇒|›)\s*(.*)$/i);
  if (m?.[1] && m?.[2]) {
    return { company: cleanText(m[1]), title: cleanText(m[2]) };
  }

  return null;
};

/**
 * Extract dates from a merged title field like "Senior Engineer - 2023 - Present"
 * Returns { title: string, startDate: string, endDate: string }
 */
export const extractDatesFromTitle = (title: string): { cleanTitle: string; startDate: string; endDate: string } => {
  if (!title) return { cleanTitle: '', startDate: '', endDate: '' };

  // Pattern: "Title - YYYY - YYYY/Present" or "Title - YYYY-YYYY"
  const datePatterns = [
    // "Senior Engineer - 2023 - Present" or "Senior Engineer - 2023 - 2024"
    /^(.+?)\s*[-–—]\s*((?:19|20)\d{2})\s*[-–—]\s*(Present|(?:19|20)\d{2})$/i,
    // "Senior Engineer (2023 - Present)"
    /^(.+?)\s*\(\s*((?:19|20)\d{2})\s*[-–—]\s*(Present|(?:19|20)\d{2})\s*\)$/i,
    // "Senior Engineer, 2023 - Present"
    /^(.+?)\s*,\s*((?:19|20)\d{2})\s*[-–—]\s*(Present|(?:19|20)\d{2})$/i,
    // "Senior Engineer | 2023 - Present"
    /^(.+?)\s*\|\s*((?:19|20)\d{2})\s*[-–—]\s*(Present|(?:19|20)\d{2})$/i,
  ];

  for (const pattern of datePatterns) {
    const match = title.match(pattern);
    if (match) {
      return {
        cleanTitle: cleanText(match[1]),
        startDate: match[2],
        endDate: match[3],
      };
    }
  }

  // Fallback: Extract any year range from end of title
  const fallbackMatch = title.match(/^(.+?)\s*[-–—,|]\s*((?:19|20)\d{2})(?:\s*[-–—]\s*(Present|(?:19|20)\d{2}))?$/i);
  if (fallbackMatch) {
    return {
      cleanTitle: cleanText(fallbackMatch[1]),
      startDate: fallbackMatch[2],
      endDate: fallbackMatch[3] || 'Present',
    };
  }

  return { cleanTitle: title, startDate: '', endDate: '' };
};

/**
 * Format extracted dates into a clean "MM/YYYY – MM/YYYY" or "MM/YYYY – Present" string.
 * ATS-preferred format: MM/YYYY (e.g. 01/2023 – Present).
 */
export const formatDateRange = (startDate?: string, endDate?: string, title?: string): string => {
  // First try to extract from title if no explicit dates
  if ((!startDate || !endDate) && title) {
    const extracted = extractDatesFromTitle(title);
    if (extracted.startDate) {
      startDate = startDate || extracted.startDate;
      endDate = endDate || extracted.endDate;
    }
  }

  const normalise = (raw?: string) => {
    if (!raw) return '';
    const seg = raw.split('|').map(s => s.trim()).filter(Boolean).pop() ?? '';
    return seg;
  };

  /**
   * Convert a raw date string to MM/YYYY format.
   * Handles: "2023-01", "01/2023", "Jan 2023", "January 2023", "2023", "Present".
   */
  const toMMYYYY = (raw?: string): string => {
    const date = normalise(raw);
    if (!date) return '';
    if (/present|current/i.test(date)) return 'Present';

    // Already MM/YYYY
    const mmyyyyMatch = date.match(/^(\d{1,2})\/(\d{4})$/);
    if (mmyyyyMatch) {
      return `${mmyyyyMatch[1].padStart(2, '0')}/${mmyyyyMatch[2]}`;
    }

    // YYYY-MM
    const yymm = date.match(/^((?:19|20)\d{2})[-\/](\d{1,2})$/);
    if (yymm) return `${yymm[2].padStart(2, '0')}/${yymm[1]}`;

    // Month name YYYY  (e.g. "Jan 2023" or "January 2023")
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const monthName = date.match(/^([A-Za-z]+)\s*(\d{4})$/);
    if (monthName) {
      const m = months[monthName[1].slice(0, 3).toLowerCase()];
      if (m) return `${m}/${monthName[2]}`;
    }

    // Bare year – fall back to just the year
    const yearOnly = date.match(/\b(19|20)\d{2}\b/);
    return yearOnly ? yearOnly[0] : date;
  };

  const start = toMMYYYY(startDate);
  const end = toMMYYYY(endDate);

  if (!start && !end) return '';
  if (!end || start === end) return start;
  return `${start} – ${end}`;
};

export const normalizeWorkExperience = (exps: WorkExperienceLike[] | undefined) => {
  if (!Array.isArray(exps)) return [];

  return exps.map((exp) => {
    const next: WorkExperienceLike = { ...exp };

    // Ensure id exists (CV parse often returns no id)
    if (!next.id) next.id = crypto.randomUUID();

    next.company = cleanCompanyName(cleanText(next.company));
    next.title = cleanText(next.title);

    // Extract dates from merged title field (e.g., "Senior Engineer - 2023 - Present")
    if (next.title && (!next.startDate || !next.endDate)) {
      const extracted = extractDatesFromTitle(next.title);
      if (extracted.startDate) {
        next.startDate = next.startDate || extracted.startDate;
        next.endDate = next.endDate || extracted.endDate;
        // Keep the full title with dates for display consistency
      }
    }

    // If either field contains "Company – Title" style, split it.
    if ((!next.title || !next.company) && typeof next.company === 'string') {
      const split = splitCompanyAndTitle(next.company);
      if (split) {
        next.company = split.company;
        next.title = next.title || split.title;
      }
    }
    if ((!next.title || !next.company) && typeof next.title === 'string') {
      const split = splitCompanyAndTitle(next.title);
      if (split) {
        next.company = next.company || split.company;
        next.title = split.title;
      }
    }

    // If swapped, swap back.
    if (next.company && next.title) {
      const companyLooksLikeTitle = isLikelyJobTitle(next.company) && !isLikelyCompany(next.company);
      const titleLooksLikeCompany = isLikelyCompany(next.title) && !isLikelyJobTitle(next.title);
      if (companyLooksLikeTitle && titleLooksLikeCompany) {
        const tmp = next.company;
        next.company = next.title;
        next.title = tmp;
      }
    }

    // Ensure bullets array exists (tailoring expects structured bullets)
    if (!Array.isArray(next.bullets)) {
      if (typeof next.description === 'string' && next.description.trim()) {
        const lines = next.description
          .split(/\r?\n/)
          .map((l) => cleanText(l))
          .filter(Boolean);
        next.bullets = lines.length ? lines : [];
      } else if (Array.isArray(next.description)) {
        next.bullets = next.description.map((l) => cleanText(l)).filter(Boolean);
      } else {
        next.bullets = [];
      }
    }

    return next;
  });
};