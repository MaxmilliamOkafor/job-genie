import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFPage,
  PDFFont,
  PDFName,
  PDFString,
  PDFArray,
} from "https://esm.sh/pdf-lib@1.17.1";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  AlignmentType,
  TabStopType,
  BorderStyle,
} from "npm:docx@8.5.0";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// TYPES
// ============================================================

interface ResumeData {
  type: "resume" | "cover_letter";
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary?: string;
  coreCompetencies?: string[];
  experience?: Array<{
    company: string;
    title: string;
    dates: string;
    location?: string;
    bullets: string[];
  }>;
  projects?: Array<{
    name: string;
    role: string;
    dates?: string;
    technologies?: string[];
    bullets: string[];
  }>;
  education?: Array<{
    degree: string;
    school: string;
    dates: string;
    gpa?: string;
  }>;
  skills?: {
    primary: string[];
    secondary?: string[];
  };
  certifications?: string[];
  achievements?: Array<{
    title: string;
    date: string;
    description: string;
  }>;
  coverLetter?: {
    recipientCompany: string;
    jobTitle: string;
    jobId?: string;
    paragraphs: string[];
  };
  customFileName?: string;
  candidateName?: string;
}

// ============================================================
// SANITIZATION / DATE-STRIP HELPERS (preserved verbatim)
// ============================================================

const DATE_PATTERNS = [
  /\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi,
  /\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi,
];

const stripDatesFromField = (fieldValue: string): string => {
  if (!fieldValue) return "";
  let cleaned = fieldValue;
  for (const pattern of DATE_PATTERNS) cleaned = cleaned.replace(pattern, "");
  return cleaned
    .replace(/\s*\|\s*$/g, "")
    .replace(/^\s*\|\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return "";
  return (
    String(text)
      .replace(/[\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
      .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(
        /[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25A0\u25A1\u25CF\u25CB\u25D8\u25D9\u2B24\u2B58\u29BF\u25C6\u25C7\u2666\u2756\u2605\u2606\u2713\u2714\u2717\u2718\u2794\u27A4\u25B6\u25B8\u25BA\u25BC\u25BE\u25C0\u25C2\u25C4]/g,
        "-",
      )
      .replace(/[\u2190-\u21FF]/g, "->")
      .replace(/[\u2713\u2714\u2715\u2716\u2717\u2718]/g, "*")
      .replace(/\u00A9/g, "(c)")
      .replace(/\u00AE/g, "(R)")
      .replace(/\u2122/g, "(TM)")
      .replace(/\u20AC/g, "EUR")
      .replace(/\u00A3/g, "GBP")
      .replace(/\u00A5/g, "JPY")
      .replace(/\u00B0/g, " deg")
      .replace(/\u00B1/g, "+/-")
      .replace(/\u00D7/g, "x")
      .replace(/\u00F7/g, "/")
      // Preserve middot (·) used as our contact separator; strip other non-ASCII
      .replace(/[^\x00-\x7F\u00B7]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
};

// ============================================================
// PREMIUM PDF DESIGN SYSTEM (Deep Navy, ATS-safe, single column)
// ============================================================

// A4
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 45; // ~0.62 inch
const CONTENT_W = PAGE_W - MARGIN * 2;

const NAVY = rgb(0.086, 0.137, 0.247);
const BODY = rgb(0.13, 0.14, 0.16);
const MUTED = rgb(0.40, 0.43, 0.48);
const LINK = rgb(0.0, 0.40, 0.80);
const RULE = rgb(0.74, 0.78, 0.85);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

interface ContactInfo {
  location?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

interface ExperienceEntry {
  company: string;
  title: string;
  dates?: string;
  location?: string;
  bullets: string[];
}

interface ProjectEntry {
  name: string;
  role?: string;
  dates?: string;
  technologies?: string[];
  bullets: string[];
}

interface EducationEntry {
  degree: string;
  school: string;
  dates?: string;
  gpa?: string;
}

const displayUrl = (url: string): string =>
  url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

const ensureUrl = (url: string): string =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;

function makeRenderer(pdfDoc: PDFDocument, fonts: Fonts) {
  const pages: PDFPage[] = [];
  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let y = PAGE_H - MARGIN;

  const addPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - MARGIN;
  };

  const ensureSpace = (need: number) => {
    if (y - need < MARGIN) addPage();
  };

  const wrap = (text: string, font: PDFFont, size: number, maxW: number): string[] => {
    const words = sanitizeText(text).split(" ").filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const addLinkAnnot = (url: string, x: number, yBase: number, w: number, h: number) => {
    try {
      const linkAnnot = pdfDoc.context.register(
        pdfDoc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [x, yBase - 1, x + w, yBase + h],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
        }),
      );
      const existing = page.node.get(PDFName.of("Annots"));
      if (existing instanceof PDFArray) {
        existing.push(linkAnnot);
      } else {
        page.node.set(PDFName.of("Annots"), pdfDoc.context.obj([linkAnnot]));
      }
    } catch (_e) {
      // non-fatal; link decoration only
    }
  };

  const drawWrapped = (
    text: string,
    x: number,
    size: number,
    font: PDFFont,
    color = BODY,
    maxW?: number,
    lineGap = 1.35,
  ) => {
    const w = maxW ?? (PAGE_W - MARGIN - x);
    const lh = size * lineGap;
    for (const line of wrap(text, font, size, w)) {
      ensureSpace(lh);
      page.drawText(line, { x, y, size, font, color });
      y -= lh;
    }
  };

  // ---- Header block (name + hyperlinked contact line + navy hairline) ----
  const drawTopHeader = (name: string, contact: ContactInfo) => {
    ensureSpace(80);
    const nameClean = sanitizeText(name);
    page.drawText(nameClean, {
      x: MARGIN,
      y,
      size: 22,
      font: fonts.bold,
      color: NAVY,
      characterSpacing: 0.3,
    });
    y -= 22 + 8;

    type Seg = { text: string; link?: string; color: ReturnType<typeof rgb> };
    const segs: Seg[] = [];
    const loc = (contact.location || "").trim();
    if (loc) segs.push({ text: loc, color: BODY });
    if (contact.phone) segs.push({ text: contact.phone, color: BODY });
    if (contact.email)
      segs.push({ text: contact.email, link: `mailto:${contact.email}`, color: LINK });
    if (contact.linkedin)
      segs.push({
        text: displayUrl(contact.linkedin),
        link: ensureUrl(contact.linkedin),
        color: LINK,
      });
    if (contact.github)
      segs.push({
        text: displayUrl(contact.github),
        link: ensureUrl(contact.github),
        color: LINK,
      });
    if (contact.portfolio)
      segs.push({
        text: displayUrl(contact.portfolio),
        link: ensureUrl(contact.portfolio),
        color: LINK,
      });

    const size = 9.5;
    const sep = "  \u00B7  "; // space middot space
    const sepW = fonts.regular.widthOfTextAtSize(sep, size);
    const lh = size * 1.4;
    let x = MARGIN;

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const text = sanitizeText(seg.text);
      const w = fonts.regular.widthOfTextAtSize(text, size);
      if (x !== MARGIN && x + w > MARGIN + CONTENT_W) {
        y -= lh;
        x = MARGIN;
      }
      page.drawText(text, { x, y, size, font: fonts.regular, color: seg.color });
      if (seg.link) addLinkAnnot(seg.link, x, y, w, size);
      x += w;
      if (i < segs.length - 1) {
        if (x + sepW > MARGIN + CONTENT_W) {
          y -= lh;
          x = MARGIN;
        } else {
          page.drawText(sep, { x, y, size, font: fonts.regular, color: BODY });
          x += sepW;
        }
      }
    }

    y -= lh + 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_W, y },
      thickness: 0.75,
      color: NAVY,
    });
    y -= 14;
  };

  // ---- Section header ----
  const drawSectionHeader = (title: string) => {
    y -= 6;
    ensureSpace(40);
    page.drawText(title.toUpperCase(), {
      x: MARGIN,
      y,
      size: 11,
      font: fonts.bold,
      color: NAVY,
      characterSpacing: 1.2,
    });
    y -= 11 + 5;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_W, y },
      thickness: 0.5,
      color: RULE,
    });
    y -= 9;
  };

  // ---- Bullet with hanging indent ----
  const drawBullet = (text: string, size = 10.5) => {
    const bulletX = MARGIN;
    const textX = MARGIN + 12;
    const textMaxW = CONTENT_W - 12;
    const lh = size * 1.35;
    const lines = wrap(text, fonts.regular, size, textMaxW);
    if (lines.length === 0) return;
    ensureSpace(lh);
    page.drawText("\u2022", { x: bulletX, y, size, font: fonts.regular, color: NAVY });
    page.drawText(lines[0], { x: textX, y, size, font: fonts.regular, color: BODY });
    y -= lh;
    for (let i = 1; i < lines.length; i++) {
      ensureSpace(lh);
      page.drawText(lines[i], { x: textX, y, size, font: fonts.regular, color: BODY });
      y -= lh;
    }
    y -= 3;
  };

  // ---- Experience entry: Company — Title  ........  Dates ----
  const drawExperienceEntry = (entry: ExperienceEntry, isLast: boolean) => {
    ensureSpace(50);
    const company = sanitizeText(stripDatesFromField(entry.company || ""));
    const title = sanitizeText(stripDatesFromField(entry.title || ""));
    const dates = sanitizeText(entry.dates || "");
    const loc = sanitizeText(entry.location || "");
    const size = 10.5;

    let lx = MARGIN;
    if (company) {
      page.drawText(company, { x: lx, y, size, font: fonts.bold, color: NAVY });
      lx += fonts.bold.widthOfTextAtSize(company, size);
    }
    if (title) {
      const sepText = company ? "  \u2014  " : "";
      if (sepText) {
        page.drawText(sepText, { x: lx, y, size, font: fonts.bold, color: BODY });
        lx += fonts.bold.widthOfTextAtSize(sepText, size);
      }
      page.drawText(title, { x: lx, y, size, font: fonts.bold, color: BODY });
    }
    if (dates) {
      const dsize = 9.5;
      const dw = fonts.italic.widthOfTextAtSize(dates, dsize);
      page.drawText(dates, {
        x: MARGIN + CONTENT_W - dw,
        y: y + 0.5,
        size: dsize,
        font: fonts.italic,
        color: MUTED,
      });
    }
    y -= size * 1.4;

    if (loc) {
      ensureSpace(9 * 1.4);
      page.drawText(loc, { x: MARGIN, y, size: 9, font: fonts.regular, color: MUTED });
      y -= 9 * 1.4;
    }

    y -= 2;
    for (const b of entry.bullets || []) {
      if (!b || !b.trim()) continue;
      drawBullet(b);
    }
    if (!isLast) y -= 7;
  };

  const drawProjectEntry = (p: ProjectEntry, isLast: boolean) => {
    ensureSpace(50);
    const name = sanitizeText(stripDatesFromField(p.name || ""));
    const role = sanitizeText(stripDatesFromField(p.role || ""));
    const dates = sanitizeText(p.dates || "");
    const size = 10.5;

    let lx = MARGIN;
    if (name) {
      page.drawText(name, { x: lx, y, size, font: fonts.bold, color: NAVY });
      lx += fonts.bold.widthOfTextAtSize(name, size);
    }
    if (role) {
      const sepText = name ? "  \u2014  " : "";
      if (sepText) {
        page.drawText(sepText, { x: lx, y, size, font: fonts.bold, color: BODY });
        lx += fonts.bold.widthOfTextAtSize(sepText, size);
      }
      page.drawText(role, { x: lx, y, size, font: fonts.bold, color: BODY });
    }
    if (dates) {
      const dsize = 9.5;
      const dw = fonts.italic.widthOfTextAtSize(dates, dsize);
      page.drawText(dates, {
        x: MARGIN + CONTENT_W - dw,
        y: y + 0.5,
        size: dsize,
        font: fonts.italic,
        color: MUTED,
      });
    }
    y -= size * 1.4;

    if (p.technologies && p.technologies.length) {
      drawWrapped(
        `Tech: ${p.technologies.join(", ")}`,
        MARGIN,
        9.5,
        fonts.italic,
        MUTED,
        CONTENT_W,
      );
    }

    y -= 2;
    for (const b of p.bullets || []) {
      if (!b || !b.trim()) continue;
      drawBullet(b);
    }
    if (!isLast) y -= 7;
  };

  const drawEducationEntry = (edu: EducationEntry) => {
    ensureSpace(36);
    const degree = sanitizeText(stripDatesFromField(edu.degree || ""));
    const school = sanitizeText(stripDatesFromField(edu.school || ""));
    const dates = sanitizeText(edu.dates || "");
    const gpaRaw = sanitizeText(edu.gpa || "");
    // Don't append "/4.00" to UK classifications
    const isClassification =
      /distinction|merit|first class|second class|honours|honors|pass/i.test(gpaRaw);
    const gpaSuffix = gpaRaw ? (isClassification ? gpaRaw : `GPA: ${gpaRaw}`) : "";

    const size = 10.5;
    const headLine = gpaSuffix ? `${degree}  \u2014  ${gpaSuffix}` : degree;
    let lx = MARGIN;
    if (degree) {
      page.drawText(degree, { x: lx, y, size, font: fonts.bold, color: NAVY });
      lx += fonts.bold.widthOfTextAtSize(degree, size);
    }
    if (gpaSuffix) {
      const sepText = "  \u2014  ";
      page.drawText(sepText, { x: lx, y, size, font: fonts.bold, color: BODY });
      lx += fonts.bold.widthOfTextAtSize(sepText, size);
      page.drawText(gpaSuffix, { x: lx, y, size, font: fonts.bold, color: BODY });
    }
    if (dates) {
      const dsize = 9.5;
      const dw = fonts.italic.widthOfTextAtSize(dates, dsize);
      page.drawText(dates, {
        x: MARGIN + CONTENT_W - dw,
        y: y + 0.5,
        size: dsize,
        font: fonts.italic,
        color: MUTED,
      });
    }
    y -= size * 1.4;

    if (school) {
      ensureSpace(10 * 1.4);
      page.drawText(school, { x: MARGIN, y, size: 10, font: fonts.regular, color: MUTED });
      y -= 10 * 1.4;
    }
    y -= 4;
  };

  // ---- Skills as labelled lines ----
  const drawSkillsBlock = (
    groups: Array<{ label: string; items: string[] }>,
  ) => {
    const size = 10;
    for (const g of groups) {
      if (!g.items || g.items.length === 0) continue;
      const label = `${g.label}: `;
      const labelW = fonts.bold.widthOfTextAtSize(label, size);
      const items = g.items.join(", ");
      const lh = size * 1.4;
      const maxW = CONTENT_W - labelW;
      const lines = wrap(items, fonts.regular, size, maxW);
      ensureSpace(lh);
      page.drawText(label, { x: MARGIN, y, size, font: fonts.bold, color: BODY });
      if (lines.length) {
        page.drawText(lines[0], {
          x: MARGIN + labelW,
          y,
          size,
          font: fonts.regular,
          color: BODY,
        });
        y -= lh;
        for (let i = 1; i < lines.length; i++) {
          ensureSpace(lh);
          page.drawText(lines[i], {
            x: MARGIN + labelW,
            y,
            size,
            font: fonts.regular,
            color: BODY,
          });
          y -= lh;
        }
      } else {
        y -= lh;
      }
      y -= 2;
    }
  };

  const drawCertifications = (items: string[]) => {
    for (const c of items) {
      if (!c || !c.trim()) continue;
      drawBullet(c, 10);
    }
  };

  const drawSummary = (text: string) => {
    drawWrapped(text, MARGIN, 10.5, fonts.regular, BODY, CONTENT_W, 1.4);
    y -= 2;
  };

  // ---- Cover letter body ----
  const drawCoverLetterBody = (opts: {
    jobTitle: string;
    paragraphs: string[];
    signatureName: string;
  }) => {
    const dateStr = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    ensureSpace(20);
    page.drawText(dateStr, { x: MARGIN, y, size: 10, font: fonts.regular, color: MUTED });
    y -= 10 * 1.5 + 6;

    if (opts.jobTitle) {
      ensureSpace(20);
      const subj = `Re: ${sanitizeText(opts.jobTitle)}`;
      page.drawText(subj, { x: MARGIN, y, size: 11, font: fonts.bold, color: NAVY });
      y -= 11 * 1.5 + 8;
    }

    ensureSpace(20);
    page.drawText("Dear Hiring Manager,", {
      x: MARGIN,
      y,
      size: 10.5,
      font: fonts.regular,
      color: BODY,
    });
    y -= 10.5 * 1.5 + 6;

    for (const p of opts.paragraphs) {
      if (!p || !p.trim()) continue;
      drawWrapped(p, MARGIN, 10.5, fonts.regular, BODY, CONTENT_W, 1.4);
      y -= 6;
    }

    y -= 6;
    ensureSpace(40);
    page.drawText("Sincerely,", {
      x: MARGIN,
      y,
      size: 10.5,
      font: fonts.regular,
      color: BODY,
    });
    y -= 10.5 * 2.2;
    page.drawText(sanitizeText(opts.signatureName), {
      x: MARGIN,
      y,
      size: 11,
      font: fonts.bold,
      color: NAVY,
    });
  };

  return {
    get pages() {
      return pages;
    },
    drawTopHeader,
    drawSectionHeader,
    drawSummary,
    drawExperienceEntry,
    drawProjectEntry,
    drawEducationEntry,
    drawSkillsBlock,
    drawCertifications,
    drawCoverLetterBody,
    drawWrapped,
    drawBullet,
  };
}

// ============================================================
// SHARED RESUME / COVER LETTER RENDER
// ============================================================

interface NormalisedResume {
  personalInfo: {
    name: string;
    contact: ContactInfo;
  };
  summary?: string;
  coreCompetencies?: string[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  skills?: { primary?: string[]; secondary?: string[] };
  certifications: string[];
  achievements?: Array<{ title: string; date: string; description: string }>;
}

// Filter section-header-as-company entries
const HEADER_NAMES_SET = new Set([
  "professional experience",
  "work experience",
  "experience",
  "employment history",
  "career history",
  "employment",
  "work history",
  "positions held",
]);
const isHeaderName = (v: string): boolean => {
  const n = (v || "")
    .toLowerCase()
    .replace(/[#:*|]/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (HEADER_NAMES_SET.has(n)) return true;
  for (const h of HEADER_NAMES_SET) if (n === `${h} ${h}`) return true;
  return false;
};

function renderResume(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  data: NormalisedResume,
): PDFPage[] {
  const r = makeRenderer(pdfDoc, fonts);
  r.drawTopHeader(data.personalInfo.name, data.personalInfo.contact);

  if (data.summary) {
    r.drawSectionHeader("Professional Summary");
    r.drawSummary(data.summary);
  }

  const filteredExp = (data.experience || []).filter((e) => {
    if (isHeaderName(e.company)) return false;
    if (!e.company || e.company.trim().length < 2) return false;
    return true;
  });

  if (filteredExp.length > 0) {
    r.drawSectionHeader("Professional Experience");
    filteredExp.forEach((exp, i) =>
      r.drawExperienceEntry(exp, i === filteredExp.length - 1),
    );
  }

  if (data.projects && data.projects.length > 0) {
    r.drawSectionHeader("Selected Projects");
    data.projects.forEach((p, i) =>
      r.drawProjectEntry(p, i === data.projects.length - 1),
    );
  }

  if (data.education && data.education.length > 0) {
    r.drawSectionHeader("Education");
    for (const edu of data.education) r.drawEducationEntry(edu);
  }

  if (data.certifications && data.certifications.length > 0) {
    r.drawSectionHeader("Certifications");
    r.drawCertifications(data.certifications);
  }

  if (data.skills && (data.skills.primary?.length || data.skills.secondary?.length)) {
    r.drawSectionHeader("Skills");
    const groups: Array<{ label: string; items: string[] }> = [];
    if (data.skills.primary?.length)
      groups.push({ label: "Technical", items: data.skills.primary });
    if (data.skills.secondary?.length)
      groups.push({ label: "Additional", items: data.skills.secondary });
    r.drawSkillsBlock(groups);
  }

  if (data.coreCompetencies && data.coreCompetencies.length > 0) {
    r.drawSectionHeader("Core Competencies");
    r.drawSkillsBlock([{ label: "Areas", items: data.coreCompetencies }]);
  }

  if (data.achievements && data.achievements.length > 0) {
    r.drawSectionHeader("Achievements");
    for (const a of data.achievements) {
      r.drawBullet(
        a.description
          ? `${a.title}${a.date ? ` (${a.date})` : ""} — ${a.description}`
          : `${a.title}${a.date ? ` (${a.date})` : ""}`,
      );
    }
  }

  return r.pages;
}

function renderCoverLetter(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  data: {
    personalInfo: { name: string; contact: ContactInfo };
    jobTitle: string;
    paragraphs: string[];
  },
): PDFPage[] {
  const r = makeRenderer(pdfDoc, fonts);
  r.drawTopHeader(data.personalInfo.name, data.personalInfo.contact);
  r.drawCoverLetterBody({
    jobTitle: data.jobTitle,
    paragraphs: data.paragraphs,
    signatureName: data.personalInfo.name,
  });
  return r.pages;
}

// ============================================================
// ADAPTIVE LOCATION HELPERS (preserved verbatim semantics)
// ============================================================

const cleanLocation = (loc: string): string =>
  (loc || "").replace(/\s*\|?\s*open\s+to\s+relocation\s*/gi, "").trim();

function buildLocationHeaderFromStructuredCv(
  personalInfo: StructuredCvPersonalInfo,
): string {
  let locationHeader = "";
  if (personalInfo.locations && personalInfo.locations.length) {
    const primary = personalInfo.locations.find((l) => l.isPrimary);
    const secondary = personalInfo.locations.filter((l) => !l.isPrimary);
    if (primary) locationHeader = `${primary.city}, ${primary.country}`;
    if (secondary.some((l) => l.type === "remote_based"))
      locationHeader += " | Remote Available";
    if (personalInfo.workAuthorizationStatus?.length) {
      const authCountries = personalInfo.workAuthorizationStatus
        .filter((w) => w.status === "authorized")
        .map((w) => w.country)
        .join(", ");
      if (authCountries && authCountries !== personalInfo.location) {
        locationHeader += ` | Authorized: ${authCountries}`;
      }
    }
  } else if (personalInfo.location) {
    locationHeader = personalInfo.location;
  }
  return locationHeader;
}

interface StructuredCvPersonalInfo {
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  locations?: Array<{ city: string; country: string; isPrimary: boolean; type: string }>;
  workAuthorizationStatus?: Array<{ country: string; status: string }>;
  workArrangement?: string;
}

interface StructuredCvExperience {
  company: string;
  title: string;
  dates?: string;
  bullets: string[];
}

interface StructuredCvProject {
  name: string;
  role?: string;
  technologies?: string[];
  description?: string;
  impact?: string;
  bullets?: string[];
}

interface StructuredCvEducation {
  degree: string;
  school: string;
  dates?: string;
  gpa?: string;
}

interface StructuredCv {
  personalInfo: StructuredCvPersonalInfo;
  summary?: string;
  coreCompetencies?: string[];
  experience?: StructuredCvExperience[];
  projects?: StructuredCvProject[];
  relevantProjects?: StructuredCvProject[];
  education?: StructuredCvEducation[];
  skills?: { primary?: string[]; secondary?: string[] };
  certifications?: string[];
}

interface StructuredCvRequest {
  type: "resume" | "coverletter";
  fileName: string;
  structuredCv: StructuredCv;
  personalInfo?: StructuredCvPersonalInfo;
  plainText?: string;
}

// ============================================================
// PDF DOC SETUP
// ============================================================

async function setupPdf(
  title: string,
  author: string,
  subject: string,
  keywords: string[] = [],
): Promise<{ pdfDoc: PDFDocument; fonts: Fonts }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(author);
  pdfDoc.setSubject(subject);
  pdfDoc.setKeywords(["resume", "cv", "professional", ...keywords]);
  pdfDoc.setCreator("QuantumHire ATS Optimizer");
  pdfDoc.setProducer("QuantumHire");
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  return { pdfDoc, fonts: { regular, bold, italic } };
}

// ============================================================
// ENTRY POINT
// ============================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const requestBody = await req.json();

    if (requestBody.content && typeof requestBody.content === "string") {
      return handleRawContentRequest(requestBody);
    }

    if (requestBody.structuredCv && requestBody.type) {
      return handleStructuredCvRequest(requestBody);
    }

    // ResumeData (or profileData → ResumeData)
    let data: ResumeData;
    if (requestBody.profileData) {
      data = profileToResumeData(requestBody.profileData);
    } else {
      data = requestBody as ResumeData;
    }

    console.log(
      "Generating premium PDF for:",
      data.type,
      data.personalInfo?.name,
    );

    const sanitizedData = sanitizeObject(data) as ResumeData;
    const { pdfDoc, fonts } = await setupPdf(
      sanitizedData.type === "resume"
        ? `${sanitizedData.personalInfo.name} - Resume`
        : `${sanitizedData.personalInfo.name} - Cover Letter`,
      sanitizedData.personalInfo.name,
      sanitizedData.type === "resume" ? "Professional Resume" : "Cover Letter",
      sanitizedData.skills?.primary?.slice(0, 20) || [],
    );

    let docxBytes: Uint8Array;
    if (sanitizedData.type === "resume") {
      const contact: ContactInfo = {
        location: cleanLocation(sanitizedData.personalInfo.location) || "Dublin, IE",
        phone: sanitizedData.personalInfo.phone,
        email: sanitizedData.personalInfo.email,
        linkedin: sanitizedData.personalInfo.linkedin,
        github: sanitizedData.personalInfo.github,
        portfolio: sanitizedData.personalInfo.portfolio,
      };
      const norm: NormalisedResume = {
        personalInfo: { name: sanitizedData.personalInfo.name, contact },
        summary: sanitizedData.summary,
        coreCompetencies: sanitizedData.coreCompetencies,
        experience: (sanitizedData.experience || []).map((e) => ({
          company: e.company, title: e.title, dates: e.dates, location: e.location,
          bullets: e.bullets || [],
        })),
        projects: (sanitizedData.projects || []).map((p) => ({
          name: p.name, role: p.role, dates: p.dates, technologies: p.technologies,
          bullets: p.bullets || [],
        })),
        education: (sanitizedData.education || []).map((e) => ({
          degree: e.degree, school: e.school, dates: e.dates, gpa: e.gpa,
        })),
        skills: sanitizedData.skills,
        certifications: sanitizedData.certifications || [],
        achievements: sanitizedData.achievements,
      };
      docxBytes = await buildResumeDocxBytes(norm);
    } else if (sanitizedData.type === "cover_letter" && sanitizedData.coverLetter) {
      const contact: ContactInfo = {
        location: cleanLocation(sanitizedData.personalInfo.location) || "Dublin, IE",
        phone: sanitizedData.personalInfo.phone,
        email: sanitizedData.personalInfo.email,
        linkedin: sanitizedData.personalInfo.linkedin,
        github: sanitizedData.personalInfo.github,
        portfolio: sanitizedData.personalInfo.portfolio,
      };
      docxBytes = await buildCoverLetterDocxBytes({
        personalInfo: { name: sanitizedData.personalInfo.name, contact },
        jobTitle: sanitizedData.coverLetter.jobTitle,
        paragraphs: sanitizedData.coverLetter.paragraphs || [],
      });
    } else {
      docxBytes = new Uint8Array();
    }

    const fileName = computeFileName(sanitizedData);
    const base64Docx = bytesToBase64(docxBytes);
    console.log(`Premium DOCX generated: ${fileName} Size: ${docxBytes.length} bytes`);

    return new Response(
      JSON.stringify({ pdf: base64Docx, docx: base64Docx, fileName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("DOCX generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate DOCX";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});


// ---- profileData → ResumeData ----
function profileToResumeData(profile: Record<string, unknown>): ResumeData {
  const formatDateRange = (startDate?: string, endDate?: string): string => {
    const normalise = (raw?: string) => {
      if (!raw) return "";
      const seg = raw.split("|").map((s) => s.trim()).filter(Boolean).pop() ?? "";
      return seg;
    };
    const extractYear = (raw?: string) => {
      const date = normalise(raw);
      if (!date) return "";
      if (/present/i.test(date)) return "Present";
      const yearMatch = date.match(/\b(19|20)\d{2}\b/);
      return yearMatch ? yearMatch[0] : date;
    };
    const startRaw = normalise(startDate);
    const endRaw = normalise(endDate);
    const startHasPresent = /present/i.test(startRaw);
    const start = extractYear(startRaw);
    const end = endRaw ? extractYear(endRaw) : startHasPresent ? "Present" : "";
    if (!start && !end) return "";
    if (!end || start === end) return start;
    return `${start} - ${end}`;
  };

  const experience = Array.isArray(profile.professional_experience)
    ? (profile.professional_experience as Array<Record<string, unknown>>).map((exp) => ({
        company: (exp.company as string) || "",
        title: (exp.title as string) || "",
        dates: formatDateRange(exp.startDate as string, exp.endDate as string),
        bullets: Array.isArray(exp.bullets)
          ? (exp.bullets as string[])
          : exp.description
            ? (exp.description as string).split(/\r?\n/).filter(Boolean)
            : [],
      }))
    : [];

  const projects = Array.isArray(profile.relevant_projects)
    ? (profile.relevant_projects as Array<Record<string, unknown>>).map((proj) => ({
        name: (proj.name as string) || "",
        role: (proj.role as string) || "",
        dates: formatDateRange(proj.startDate as string, proj.endDate as string),
        bullets: Array.isArray(proj.bullets)
          ? (proj.bullets as string[])
          : proj.description
            ? (proj.description as string).split(/\r?\n/).filter(Boolean)
            : [],
      }))
    : [];

  const education = Array.isArray(profile.education)
    ? (profile.education as Array<Record<string, unknown>>).map((edu) => ({
        degree: (edu.degree as string) || "",
        school: (edu.institution as string) || (edu.school as string) || "",
        dates: "",
        gpa: (edu.gpa as string) || "",
      }))
    : [];

  const sk = profile.skills as Record<string, unknown> | undefined;
  const skills = sk
    ? {
        primary: Array.isArray(sk.technical) ? (sk.technical as string[]) : [],
        secondary: Array.isArray(sk.soft) ? (sk.soft as string[]) : [],
      }
    : undefined;

  return {
    type: "resume",
    personalInfo: {
      name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
      email: (profile.email as string) || "",
      phone: (profile.phone as string) || "",
      location: [profile.city, profile.country].filter(Boolean).join(", "),
      linkedin: (profile.linkedin as string) || "",
      github: (profile.github as string) || "",
      portfolio: (profile.portfolio as string) || "",
    },
    experience,
    projects,
    education,
    skills,
    certifications: Array.isArray(profile.certifications)
      ? (profile.certifications as string[])
      : [],
  };
}

const sanitizeObject = (obj: unknown): unknown => {
  if (typeof obj === "string") return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map((item) => sanitizeObject(item));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) result[key] = sanitizeObject(value);
    return result;
  }
  return obj;
};

function computeFileName(data: ResumeData): string {
  if (data.customFileName) return data.customFileName;
  const candidateName =
    data.candidateName ||
    data.personalInfo.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  return data.type === "resume"
    ? `${candidateName}_CV.pdf`
    : `${candidateName}_Cover_Letter.pdf`;
}

// ============================================================
// STRUCTURED CV REQUEST HANDLER
// ============================================================

async function handleStructuredCvRequest(body: StructuredCvRequest): Promise<Response> {
  const { type, fileName, structuredCv, personalInfo, plainText } = body;
  console.log("[generate-pdf] StructuredCv request:", {
    type,
    fileName,
    hasStructuredCv: !!structuredCv,
  });

  try {
    const pInfo = (structuredCv?.personalInfo || personalInfo) as StructuredCvPersonalInfo;
    const candidateName =
      pInfo?.name || `${pInfo?.firstName || ""} ${pInfo?.lastName || ""}`.trim();

    let docxBytes: Uint8Array = new Uint8Array();
    const baseName = (fileName || `${candidateName}_${type === "resume" ? "CV" : "Cover_Letter"}`).replace(/\.(pdf|docx)$/i, "");
    const outFileName = `${baseName}.docx`;

    if (type === "resume" && structuredCv) {
      const locationHeader = buildLocationHeaderFromStructuredCv(pInfo);
      const loc = cleanLocation(locationHeader || pInfo.location || "") || "Dublin, IE";
      const contact: ContactInfo = {
        location: loc, phone: pInfo.phone, email: pInfo.email,
        linkedin: pInfo.linkedin, github: pInfo.github, portfolio: pInfo.portfolio,
      };
      const projects = (structuredCv.projects || structuredCv.relevantProjects || []).map((p) => ({
        name: p.name, role: p.role, technologies: p.technologies,
        bullets: p.bullets && p.bullets.length
          ? p.bullets.slice(0, 6)
          : p.description ? p.description.split("\n").filter(Boolean).slice(0, 4) : [],
      }));
      const norm: NormalisedResume = {
        personalInfo: { name: candidateName, contact },
        summary: structuredCv.summary,
        coreCompetencies: structuredCv.coreCompetencies,
        experience: (structuredCv.experience || []).map((e) => ({
          company: e.company, title: e.title, dates: e.dates,
          bullets: (e.bullets || []).slice(0, 6),
        })),
        projects,
        education: (structuredCv.education || []).map((edu) => ({
          degree: edu.degree, school: edu.school, dates: edu.dates, gpa: edu.gpa,
        })),
        skills: structuredCv.skills,
        certifications: structuredCv.certifications || [],
      };
      docxBytes = await buildResumeDocxBytes(norm);
    } else if (type === "coverletter") {
      if (!pInfo || !plainText) {
        return new Response(
          JSON.stringify({ error: "Missing personalInfo or plainText for cover letter generation" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const loc = cleanLocation(pInfo.location || "") || "Dublin, IE";
      const contact: ContactInfo = {
        location: loc, phone: pInfo.phone, email: pInfo.email,
        linkedin: pInfo.linkedin, github: pInfo.github, portfolio: pInfo.portfolio,
      };
      const paragraphs = plainText.split(/\n\s*\n/).filter((p) => p.trim());
      docxBytes = await buildCoverLetterDocxBytes({
        personalInfo: { name: candidateName, contact },
        jobTitle: "",
        paragraphs,
      });
    }

    const base64Docx = bytesToBase64(docxBytes);
    console.log(`[generate-pdf] StructuredCv DOCX generated: ${outFileName}, size: ${docxBytes.length} bytes`);

    return new Response(
      JSON.stringify({ success: true, pdf: base64Docx, docx: base64Docx, fileName: outFileName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("[generate-pdf] StructuredCv processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate PDF";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// ============================================================
// RAW CONTENT REQUEST HANDLER (extension text → structured → render)
// ============================================================

async function handleRawContentRequest(body: {
  content: string;
  type?: string;
  tailoredLocation?: string;
  jobTitle?: string;
  company?: string;
  fileName?: string;
  firstName?: string;
  lastName?: string;
  summary?: string;
}): Promise<Response> {
  const {
    content,
    type = "cv",
    tailoredLocation,
    jobTitle,
    fileName,
    firstName,
    lastName,
    summary: passedSummary,
  } = body;

  console.log(
    "[generate-pdf] Raw content request, tailoredLocation:",
    tailoredLocation,
    "firstName:",
    firstName,
    "lastName:",
    lastName,
    "passedSummary:",
    passedSummary ? `${passedSummary.length} chars` : "none",
  );

  try {
    // ---- Parse content into sections ----
    const lines = content.split("\n");
    const sections: { type: string; content: string[] }[] = [];
    let currentSection: { type: string; content: string[] } | null = null;
    let nameExtracted = "";
    let contactLine = "";
    let linksLine = "";

    const sectionHeaders = [
      "PROFESSIONAL SUMMARY",
      "SUMMARY",
      "PROFILE",
      "ABOUT",
      "EXPERIENCE",
      "WORK EXPERIENCE",
      "PROFESSIONAL EXPERIENCE",
      "EMPLOYMENT",
      "EDUCATION",
      "SKILLS",
      "TECHNICAL SKILLS",
      "CERTIFICATIONS",
      "ACHIEVEMENTS",
      "PROJECTS",
      "RELEVANT PROJECTS",
      "SELECTED PROJECTS",
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, "");

      if (
        !nameExtracted &&
        !trimmed.includes("|") &&
        !trimmed.includes("@") &&
        trimmed.length < 50 &&
        trimmed === trimmed.toUpperCase() &&
        !sectionHeaders.includes(upperTrimmed)
      ) {
        nameExtracted = trimmed;
        continue;
      }

      if (!contactLine && trimmed.includes("|") && trimmed.includes("@")) {
        contactLine = trimmed;
        continue;
      }

      if (!linksLine && trimmed.includes("http")) {
        linksLine = trimmed;
        continue;
      }

      const isSectionHeader =
        sectionHeaders.includes(upperTrimmed) ||
        sectionHeaders.some((h) => upperTrimmed.startsWith(h) || upperTrimmed.endsWith(h));

      if (isSectionHeader) {
        if (currentSection) sections.push(currentSection);
        let sectionType = upperTrimmed;
        if (
          sectionType.includes("SUMMARY") ||
          sectionType.includes("PROFILE") ||
          sectionType.includes("ABOUT")
        ) {
          sectionType = "PROFESSIONAL SUMMARY";
        }
        if (sectionType.includes("EXPERIENCE") || sectionType.includes("EMPLOYMENT")) {
          sectionType = "WORK EXPERIENCE";
        }
        if (sectionType.includes("PROJECTS")) sectionType = "PROJECTS";
        currentSection = { type: sectionType, content: [] };
        continue;
      }

      if (currentSection) currentSection.content.push(trimmed);
    }
    if (currentSection) sections.push(currentSection);

    const hasSummarySection = sections.some(
      (s) => s.type === "PROFESSIONAL SUMMARY" || s.type.includes("SUMMARY"),
    );
    if (!hasSummarySection && passedSummary && passedSummary.length > 30) {
      sections.unshift({ type: "PROFESSIONAL SUMMARY", content: [passedSummary] });
    } else if (hasSummarySection && passedSummary) {
      const summarySection = sections.find(
        (s) => s.type === "PROFESSIONAL SUMMARY" || s.type.includes("SUMMARY"),
      );
      const existingSummaryLength = summarySection?.content.join(" ").length || 0;
      if (existingSummaryLength < 50 && passedSummary.length > existingSummaryLength) {
        if (summarySection) summarySection.content = [passedSummary];
      }
    }

    // ---- Parse contact line ----
    let contactLoc = "";
    let contactPhone = "";
    let contactEmail = "";
    if (contactLine) {
      const cleaned = contactLine
        .replace(/\s*\|?\s*open\s+to\s+relocation\s*/gi, "")
        .trim();
      const parts = cleaned.split("|").map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.includes("@")) contactEmail = p;
        else if (/^[+\d]/.test(p) || /\d{3}/.test(p)) {
          if (!contactPhone) contactPhone = p;
        } else if (!contactLoc) {
          contactLoc = p;
        }
      }
    }
    if (tailoredLocation) {
      const cleanTL = tailoredLocation
        .replace(/\s*\|?\s*open\s+to\s+relocation\s*/gi, "")
        .trim();
      if (cleanTL) contactLoc = cleanTL;
    }
    if (!contactLoc) contactLoc = "Dublin, IE";

    // ---- Parse links line ----
    let liUrl = "", ghUrl = "", portUrl = "";
    if (linksLine) {
      const urls = linksLine.split(/\s*\|\s*|\s+/).filter((u) => /^https?:\/\//i.test(u));
      for (const u of urls) {
        if (/linkedin\.com/i.test(u) && !liUrl) liUrl = u;
        else if (/github\.com/i.test(u) && !ghUrl) ghUrl = u;
        else if (!portUrl) portUrl = u;
      }
    }

    const displayName =
      firstName && lastName ? `${firstName} ${lastName}` : nameExtracted || "Applicant";

    // ---- Convert parsed sections into NormalisedResume ----
    const norm: NormalisedResume = {
      personalInfo: {
        name: displayName,
        contact: {
          location: contactLoc,
          phone: contactPhone,
          email: contactEmail,
          linkedin: liUrl,
          github: ghUrl,
          portfolio: portUrl,
        },
      },
      experience: [],
      projects: [],
      education: [],
      certifications: [],
    };

    // Helpers for experience parsing (preserved logic)
    const datePatterns = DATE_PATTERNS;
    const stripDates = (text: string) => stripDatesFromField(text);
    const extractDates = (text: string): string => {
      for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) return match[0];
      }
      return "";
    };
    const toYearOnly = (dateStr: string): string => {
      if (!dateStr) return "";
      const years = dateStr.match(/\d{4}/g);
      const hasPresent = /present/i.test(dateStr);
      if (hasPresent && years && years.length >= 1) return `${years[0]} - Present`;
      if (years && years.length >= 2) return `${years[0]} - ${years[1]}`;
      if (years && years.length === 1) return years[0];
      return dateStr;
    };
    const locationPatterns = [
      /^[A-Z][a-z]+,\s*[A-Z]{2}$/,
      /^[A-Z][a-z]+,\s*[A-Z][a-z]+$/,
      /^[A-Z][a-z]+,\s*[A-Za-z\s]+$/,
      /^[A-Z][a-z]+\s+[A-Z][a-z]+,/,
      /\b(United Kingdom|United States|USA|UK|Ireland|Germany|France|Netherlands|Canada|Australia)\b/i,
    ];
    const isLocation = (text: string): boolean => {
      const t = text.trim();
      if (t.length > 50) return false;
      return locationPatterns.some((p) => p.test(t));
    };
    const isJobTitle = (text: string): boolean =>
      [
        /\b(engineer|developer|architect|analyst|manager|director|scientist|specialist|lead|consultant|administrator|coordinator|officer|executive|vp|president|founder|cto|ceo|cfo|coo)\b/i,
        /\b(senior|junior|principal|staff|associate|assistant|intern|trainee|head of|chief)\b/i,
        /\b(product|project|program|data|software|cloud|ai|ml|machine learning|devops|sre|qa|test|security|network|system|solutions)\b/i,
      ].some((p) => p.test(text));
    const isCompanyName = (text: string): boolean =>
      [
        /\b(inc|llc|ltd|corp|corporation|company|co|plc|group|holdings|partners|ventures|labs|technologies|solutions|consulting|services|startup)\b/i,
        /\bformerly\b/i,
        /\b(google|meta|facebook|amazon|apple|microsoft|netflix|ibm|oracle|salesforce|adobe|intel|nvidia|cisco|dell|hp|accenture|deloitte|pwc|kpmg|ey|mckinsey|bain|bcg|citi|citigroup|jpmorgan|goldman|morgan stanley|barclays|hsbc)\b/i,
      ].some((p) => p.test(text));

    for (const section of sections) {
      if (section.type.includes("SUMMARY")) {
        norm.summary = section.content.join(" ");
        continue;
      }

      if (section.type.includes("EXPERIENCE")) {
        interface Job {
          company: string;
          title: string;
          dates: string;
          bullets: string[];
        }
        let currentJob: Job | null = null;
        const jobs: Job[] = [];

        for (const line of section.content) {
          if (isLocation(line)) continue;
          const hasPipe = line.includes("|");
          const hasDash =
            /\s*[–—-]\s*/.test(line) && !line.startsWith("-") && !line.startsWith("•");
          const isJobHeader =
            (hasPipe || hasDash) && !line.startsWith("-") && !line.startsWith("•");

          if (isJobHeader) {
            if (currentJob) jobs.push(currentJob);
            let parts: string[];
            if (hasPipe) {
              parts = line.split("|").map((p) => p.trim()).filter((p) => !isLocation(p));
            } else {
              parts = line
                .split(/\s*[–—]\s*/)
                .map((p) => p.trim())
                .filter((p) => !isLocation(p));
              if (parts.length === 1) {
                parts = line
                  .split(/\s+-\s+/)
                  .map((p) => p.trim())
                  .filter((p) => !isLocation(p));
              }
            }

            let company = stripDates(parts[0] || "");
            let title = "";
            let dates = "";
            if (parts.length >= 3) {
              title = stripDates(parts[1] || "");
              dates = parts[2] || extractDates(line);
            } else if (parts.length === 2) {
              const secondPart = parts[1] || "";
              const extractedDate = extractDates(secondPart);
              if (extractedDate && secondPart.replace(extractedDate, "").trim().length < 5) {
                dates = secondPart;
              } else {
                title = stripDates(secondPart);
                dates = extractDates(line);
              }
            }
            if (!dates) dates = extractDates(line);

            if (company && title) {
              const companyIsTitle = isJobTitle(company) && !isCompanyName(company);
              const titleIsCompany =
                isCompanyName(title) || (!isJobTitle(title) && !isCompanyName(company));
              if (companyIsTitle && titleIsCompany) {
                const tmp = company;
                company = title;
                title = tmp;
              }
            } else if (company && !title) {
              if (isJobTitle(company) && !isCompanyName(company)) {
                title = company;
                company = "";
              }
            }

            currentJob = { company, title, dates: toYearOnly(dates), bullets: [] };
          } else if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*")) {
            if (currentJob) currentJob.bullets.push(line.replace(/^[-•*]\s*/, ""));
          } else if (currentJob && line.length < 80 && !line.includes("@") && !isLocation(line)) {
            const cleanedLine = stripDates(line);
            if (!cleanedLine) continue;
            const lineIsTitle = isJobTitle(cleanedLine);
            const lineIsCompany = isCompanyName(cleanedLine);
            if (!currentJob.company && lineIsCompany) currentJob.company = cleanedLine;
            else if (!currentJob.title && lineIsTitle) currentJob.title = cleanedLine;
            else if (!currentJob.company && !lineIsTitle) currentJob.company = cleanedLine;
            else if (!currentJob.title) currentJob.title = cleanedLine;
          }
        }
        if (currentJob) jobs.push(currentJob);
        norm.experience = jobs.map((j) => ({
          company: j.company,
          title: j.title,
          dates: j.dates,
          bullets: j.bullets,
        }));
        continue;
      }

      if (section.type.includes("EDUCATION")) {
        const edus: EducationEntry[] = [];
        for (const line of section.content) {
          if (line.includes("|")) {
            const parts = line.split("|").map((p) => p.trim());
            edus.push({
              degree: parts[0] || "",
              school: parts.slice(1).join(" | "),
              dates: "",
            });
          } else {
            edus.push({ degree: line, school: "", dates: "" });
          }
        }
        norm.education = edus;
        continue;
      }

      if (section.type === "SKILLS" || section.type.includes("SKILLS")) {
        const all: string[] = [];
        for (const line of section.content) {
          const clean = line.replace(/^[-•*]\s*/, "").trim();
          if (clean) all.push(clean);
        }
        const flat = all
          .join(", ")
          .split(/,\s*/)
          .map((s) => s.trim())
          .filter(Boolean);
        norm.skills = { primary: flat };
        continue;
      }

      if (section.type.includes("CERTIFICATIONS")) {
        norm.certifications = section.content
          .map((l) => l.replace(/^[-•*]\s*/, "").trim())
          .filter(Boolean);
        continue;
      }

      if (section.type.includes("PROJECTS")) {
        const projs: ProjectEntry[] = [];
        let cur: ProjectEntry | null = null;
        for (const line of section.content) {
          if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*")) {
            if (cur) cur.bullets.push(line.replace(/^[-•*]\s*/, ""));
          } else {
            if (cur) projs.push(cur);
            cur = { name: line, bullets: [] };
          }
        }
        if (cur) projs.push(cur);
        norm.projects = projs;
        continue;
      }
    }

    // ---- Render ----
    let docxBytes: Uint8Array;
    if (type === "cv") {
      docxBytes = await buildResumeDocxBytes(norm);
    } else {
      const paragraphs = content
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      docxBytes = await buildCoverLetterDocxBytes({
        personalInfo: norm.personalInfo,
        jobTitle: jobTitle || "",
        paragraphs,
      });
    }

    const base64Docx = bytesToBase64(docxBytes);

    let finalFileName = fileName;
    if (!finalFileName) {
      let nameForFile = "";
      if (firstName && lastName) nameForFile = `${firstName.trim()}_${lastName.trim()}`;
      else if (nameExtracted)
        nameForFile = nameExtracted
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join("_");
      else nameForFile = "Applicant";
      nameForFile = nameForFile.replace(/[^a-zA-Z0-9_]/g, "");
      finalFileName =
        type === "cv" ? `${nameForFile}_CV.docx` : `${nameForFile}_Cover_Letter.docx`;
    } else {
      finalFileName = finalFileName.replace(/\.pdf$/i, ".docx");
      if (!/\.docx$/i.test(finalFileName)) finalFileName = `${finalFileName}.docx`;
    }

    console.log(
      `[generate-pdf] Generated DOCX ${finalFileName}, size: ${docxBytes.length} bytes, location: ${tailoredLocation}`,
    );

    return new Response(
      JSON.stringify({
        pdf: base64Docx,
        docx: base64Docx,
        fileName: finalFileName,
        location: tailoredLocation || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("[generate-pdf] Raw content processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate PDF";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
