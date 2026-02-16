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

  // MM/YYYY date token pattern (e.g., "01/2023", "12/2025")
  const mmyyyyToken = '\\d{1,2}\\/(?:19|20)\\d{2}';
  // YYYY date token pattern (e.g., "2023")
  const yyyyToken = '(?:19|20)\\d{2}';

  // --- Priority 1: MM/YYYY patterns (e.g., "Title | 01/2023 – Present") ---
  const mmyyyyPatterns = [
    // "Title - 01/2023 - Present" or "Title – 01/2023 – 07/2025"
    new RegExp(`^(.+?)\\s*[-–—]\\s*(${mmyyyyToken})\\s*[-–—]\\s*(Present|${mmyyyyToken})$`, 'i'),
    // "Title (01/2023 - Present)"
    new RegExp(`^(.+?)\\s*\\(\\s*(${mmyyyyToken})\\s*[-–—]\\s*(Present|${mmyyyyToken})\\s*\\)$`, 'i'),
    // "Title, 01/2023 - Present"
    new RegExp(`^(.+?)\\s*,\\s*(${mmyyyyToken})\\s*[-–—]\\s*(Present|${mmyyyyToken})$`, 'i'),
    // "Title | 01/2023 - Present"
    new RegExp(`^(.+?)\\s*\\|\\s*(${mmyyyyToken})\\s*[-–—]\\s*(Present|${mmyyyyToken})$`, 'i'),
  ];

  for (const pattern of mmyyyyPatterns) {
    const match = title.match(pattern);
    if (match) {
      return {
        cleanTitle: cleanText(match[1]),
        startDate: match[2],
        endDate: match[3],
      };
    }
  }

  // --- Priority 2: YYYY-only patterns (e.g., "Title - 2023 - Present") ---
  const yyyyPatterns = [
    new RegExp(`^(.+?)\\s*[-–—]\\s*(${yyyyToken})\\s*[-–—]\\s*(Present|${yyyyToken})$`, 'i'),
    new RegExp(`^(.+?)\\s*\\(\\s*(${yyyyToken})\\s*[-–—]\\s*(Present|${yyyyToken})\\s*\\)$`, 'i'),
    new RegExp(`^(.+?)\\s*,\\s*(${yyyyToken})\\s*[-–—]\\s*(Present|${yyyyToken})$`, 'i'),
    new RegExp(`^(.+?)\\s*\\|\\s*(${yyyyToken})\\s*[-–—]\\s*(Present|${yyyyToken})$`, 'i'),
  ];

  for (const pattern of yyyyPatterns) {
    const match = title.match(pattern);
    if (match) {
      return {
        cleanTitle: cleanText(match[1]),
        startDate: match[2],
        endDate: match[3],
      };
    }
  }

  // Fallback: Extract any MM/YYYY or YYYY range from end of title
  const fallbackMM = title.match(new RegExp(`^(.+?)\\s*[-–—,|]\\s*(${mmyyyyToken})(?:\\s*[-–—]\\s*(Present|${mmyyyyToken}))?$`, 'i'));
  if (fallbackMM) {
    return {
      cleanTitle: cleanText(fallbackMM[1]),
      startDate: fallbackMM[2],
      endDate: fallbackMM[3] || 'Present',
    };
  }

  const fallbackYY = title.match(new RegExp(`^(.+?)\\s*[-–—,|]\\s*(${yyyyToken})(?:\\s*[-–—]\\s*(Present|${yyyyToken}))?$`, 'i'));
  if (fallbackYY) {
    return {
      cleanTitle: cleanText(fallbackYY[1]),
      startDate: fallbackYY[2],
      endDate: fallbackYY[3] || 'Present',
    };
  }

  return { cleanTitle: title, startDate: '', endDate: '' };
};

/**
 * Format extracted dates into a clean "MM-YYYY – MM-YYYY" or "MM-YYYY – Present" string
 * ATS and recruiters prefer MM-YYYY format (e.g., 01-2023 – Present)
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

  // Extract MM-YYYY from various date formats (YYYY-MM, MM/YYYY, MM-YYYY, YYYY, etc.)
  const extractMMYYYY = (raw?: string) => {
    const date = normalise(raw);
    if (!date) return '';
    if (/present/i.test(date)) return 'Present';

    // Match YYYY-MM format (e.g., "2023-01")
    const isoMatch = date.match(/\b((?:19|20)\d{2})[-/](\d{1,2})\b/);
    if (isoMatch) {
      return `${isoMatch[2].padStart(2, '0')}-${isoMatch[1]}`;
    }

    // Match MM/YYYY or MM-YYYY format already (e.g., "01/2023" or "01-2023")
    const mmyyyyMatch = date.match(/\b(\d{1,2})[-/]((?:19|20)\d{2})\b/);
    if (mmyyyyMatch) {
      return `${mmyyyyMatch[1].padStart(2, '0')}-${mmyyyyMatch[2]}`;
    }

    // Fallback: extract just the year
    const yearMatch = date.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? yearMatch[0] : date;
  };

  const startRaw = normalise(startDate);
  const endRaw = normalise(endDate);
  const startHasPresent = /present/i.test(startRaw);

  const start = extractMMYYYY(startRaw);
  const end = endRaw ? extractMMYYYY(endRaw) : (startHasPresent ? 'Present' : '');

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