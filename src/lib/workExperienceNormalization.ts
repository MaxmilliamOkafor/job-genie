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

const isLikelyCompany = (text: string) => {
  const t = cleanText(text);
  if (!t) return false;
  return (
    /\b(inc|llc|ltd|corp|corporation|company|co\.|plc|group|holdings|partners|ventures|labs|technologies|solutions|consulting|services|startup)\b/i.test(t) ||
    /\bformerly\b/i.test(t) ||
    /\b(meta|facebook|accenture|citi|citigroup|google|amazon|microsoft|apple)\b/i.test(t)
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

export const normalizeWorkExperience = (exps: WorkExperienceLike[] | undefined) => {
  if (!Array.isArray(exps)) return [];

  return exps.map((exp) => {
    const next: WorkExperienceLike = { ...exp };

    // Ensure id exists (CV parse often returns no id)
    if (!next.id) next.id = crypto.randomUUID();

    next.company = cleanText(next.company);
    next.title = cleanText(next.title);

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
