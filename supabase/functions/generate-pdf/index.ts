import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  experience?: Array<{
    company: string;
    title: string;
    dates: string;
    bullets: string[];
  }>;
  projects?: Array<{
    name: string;
    role: string;
    dates?: string;
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

// Date patterns to strip from company/title fields
const DATE_PATTERNS = [
  /\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi,
  /\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi,
];

// Strip dates from company/title fields to prevent duplication
const stripDatesFromField = (fieldValue: string): string => {
  if (!fieldValue) return "";
  let cleaned = fieldValue;
  for (const pattern of DATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  // Clean up leftover separators and whitespace
  return cleaned
    .replace(/\s*\|\s*$/g, "")
    .replace(/^\s*\|\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

// ULTRA ATS-SAFE: Sanitize text - only ASCII, no special characters
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return "";
  return (
    String(text)
      // Remove all newlines, tabs
      .replace(/[\n\r\t]/g, " ")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      // Remove control characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      // Smart quotes to straight quotes
      .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")
      .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
      // Dashes to hyphen
      .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
      // Ellipsis to dots
      .replace(/\u2026/g, "...")
      // All bullet points to hyphen
      .replace(
        /[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25A0\u25A1\u25CF\u25CB\u25D8\u25D9\u2B24\u2B58\u29BF\u25C6\u25C7\u2666\u2756\u2605\u2606\u2713\u2714\u2717\u2718\u2794\u27A4\u25B6\u25B8\u25BA\u25BC\u25BE\u25C0\u25C2\u25C4]/g,
        "-",
      )
      // Arrows to text
      .replace(/[\u2190-\u21FF]/g, "->")
      // Check marks to asterisk
      .replace(/[\u2713\u2714\u2715\u2716\u2717\u2718]/g, "*")
      // Symbols to text equivalents
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
      // Remove any remaining non-ASCII
      .replace(/[^\x00-\x7F\u00A0-\u00FF]/g, " ")
      // Clean up multiple spaces
      .replace(/\s+/g, " ")
      .trim()
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();

    // Check if this is a raw content request (from extension)
    if (requestBody.content && typeof requestBody.content === "string") {
      return handleRawContentRequest(requestBody);
    }

    // Otherwise, handle structured data request
    const data: ResumeData = requestBody;
    console.log("Generating ULTRA ATS-COMPATIBLE PDF for:", data.type, data.personalInfo?.name);

    // Deep sanitize all string fields
    const sanitizeObject = (obj: unknown): unknown => {
      if (typeof obj === "string") return sanitizeText(obj);
      if (Array.isArray(obj)) return obj.map((item) => sanitizeObject(item));
      if (obj && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = sanitizeObject(value);
        }
        return result;
      }
      return obj;
    };

    const sanitizedData = sanitizeObject(data) as ResumeData;

    const pdfDoc = await PDFDocument.create();

    // Set PDF metadata for better ATS parsing
    pdfDoc.setTitle(
      sanitizedData.type === "resume"
        ? `${sanitizedData.personalInfo.name} - Resume`
        : `${sanitizedData.personalInfo.name} - Cover Letter`,
    );
    pdfDoc.setAuthor(sanitizedData.personalInfo.name);
    pdfDoc.setSubject(sanitizedData.type === "resume" ? "Professional Resume" : "Cover Letter");
    pdfDoc.setKeywords(["resume", "cv", "professional"]);
    pdfDoc.setCreator("QuantumHire ATS Optimizer");
    pdfDoc.setProducer("QuantumHire");

    // Use only standard fonts - maximum ATS compatibility
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Standard Letter size
    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const MARGIN = 54; // 0.75 inch margins - standard
    const LINE_HEIGHT = 14;
    const SECTION_SPACING = 21; // 1.5 lines spacing

    // ULTRA ATS: Only black and dark gray - no colors
    const colors = {
      black: rgb(0, 0, 0),
      darkGray: rgb(0.2, 0.2, 0.2),
    };

    // Page management
    const pages: PDFPage[] = [];
    const firstPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(firstPage);
    let currentPage: PDFPage = firstPage;
    let yPosition: number = PAGE_HEIGHT - MARGIN;

    const addNewPage = (): PDFPage => {
      const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      yPosition = PAGE_HEIGHT - MARGIN;
      currentPage = page;
      return page;
    };

    const ensureSpace = (neededSpace: number): void => {
      if (yPosition < MARGIN + neededSpace) {
        addNewPage();
      }
    };

    // Text wrapping - simple linear flow for ATS
    const wrapText = (text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] => {
      const cleanText = sanitizeText(text);
      const words = cleanText.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        if (!word) continue;
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    // Draw wrapped text with automatic page breaks
    const drawWrappedText = (
      text: string,
      x: number,
      fontSize: number,
      font: PDFFont,
      maxWidth?: number,
      color = colors.black,
    ): void => {
      const effectiveMaxWidth = maxWidth || PAGE_WIDTH - MARGIN - x;
      const lines = wrapText(text, effectiveMaxWidth, font, fontSize);

      for (const line of lines) {
        ensureSpace(fontSize + 4);
        currentPage.drawText(line, {
          x,
          y: yPosition,
          size: fontSize,
          font,
          color,
        });
        yPosition -= LINE_HEIGHT;
      }
    };

    // PROFESSIONAL SECTION HEADER - Bold uppercase with proper spacing
    const drawSectionHeader = (title: string): void => {
      yPosition -= SECTION_SPACING; // 1.5 line spacing before
      ensureSpace(30);

      // Bold uppercase text
      currentPage.drawText(title.toUpperCase(), {
        x: MARGIN,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= SECTION_SPACING; // 1.5 line spacing after
    };

    if (sanitizedData.type === "resume") {
      // ============================================
      // ULTRA ATS-COMPATIBLE RESUME FORMAT
      // ============================================

      // NAME - 20pt, bold, UPPERCASE
      currentPage.drawText(sanitizedData.personalInfo.name.toUpperCase(), {
        x: MARGIN,
        y: yPosition,
        size: 20,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 26;

      // CONTACT LINE - Simple pipe-separated
      const contactParts: string[] = [];
      if (sanitizedData.personalInfo.phone) contactParts.push(sanitizedData.personalInfo.phone);
      if (sanitizedData.personalInfo.email) contactParts.push(sanitizedData.personalInfo.email);
      if (sanitizedData.personalInfo.location) contactParts.push(sanitizedData.personalInfo.location);
      contactParts.push("Open to relocation");

      if (contactParts.length > 0) {
        const contactLine = contactParts.join(" | ");
        drawWrappedText(contactLine, MARGIN, 10, helvetica);
      }

      // LINKS - Plain text URLs
      const linkParts: string[] = [];
      if (sanitizedData.personalInfo.linkedin) linkParts.push(sanitizedData.personalInfo.linkedin);
      if (sanitizedData.personalInfo.github) linkParts.push(sanitizedData.personalInfo.github);
      if (sanitizedData.personalInfo.portfolio) linkParts.push(sanitizedData.personalInfo.portfolio);

      if (linkParts.length > 0) {
        const linksLine = linkParts.join(" | ");
        drawWrappedText(linksLine, MARGIN, 9, helvetica, undefined, colors.darkGray);
      }

      // === PROFESSIONAL SUMMARY ===
      if (sanitizedData.summary) {
        drawSectionHeader("Professional Summary");
        // Summary in normal case, not all caps
        drawWrappedText(sanitizedData.summary, MARGIN, 10, helvetica);
      }

      // === PROFESSIONAL EXPERIENCE ===
      if (sanitizedData.experience && sanitizedData.experience.length > 0) {
        drawSectionHeader("Professional Experience");

        for (let i = 0; i < sanitizedData.experience.length; i++) {
          const exp = sanitizedData.experience[i];
          ensureSpace(50);

          // CRITICAL: Strip any embedded dates from company/title to prevent duplication
          const rawCompany = (exp.company || "").trim();
          const rawTitle = (exp.title || "").trim();

          let cleanCompany = stripDatesFromField(rawCompany);
          const cleanTitle = stripDatesFromField(rawTitle);
          const dates = exp.dates || "";

          // If stripping removed everything (e.g. company accidentally contains only dates), fall back.
          if (!cleanCompany && rawCompany) cleanCompany = rawCompany;

          // Line 1: Company name - BOLD
          currentPage.drawText(cleanCompany, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT + 2;

          // Line 2: Job title (italic) on the left + dates right-aligned on the same line
          currentPage.drawText(cleanTitle, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helveticaOblique,
            color: colors.black,
          });

          if (dates) {
            const dateWidth = helvetica.widthOfTextAtSize(dates, 10);
            currentPage.drawText(dates, {
              x: PAGE_WIDTH - MARGIN - dateWidth,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: colors.darkGray,
            });
          }

          yPosition -= LINE_HEIGHT + 4;

          // Bullet points - use standard bullet character for ATS compatibility
          for (const bullet of exp.bullets) {
            ensureSpace(LINE_HEIGHT * 2);
            const bulletText = `• ${bullet}`;
            drawWrappedText(bulletText, MARGIN, 10, helvetica, PAGE_WIDTH - MARGIN * 2);
          }

          // 1.5 line spacing between companies (except after last)
          if (i < sanitizedData.experience.length - 1) {
            yPosition -= SECTION_SPACING;
          }
        }
      }

      // === TECHNICAL PROJECTS (dates are optional) ===
      if (sanitizedData.projects && sanitizedData.projects.length > 0) {
        drawSectionHeader("Technical Projects");

        for (let i = 0; i < sanitizedData.projects.length; i++) {
          const project = sanitizedData.projects[i];
          ensureSpace(50);

          const cleanName = stripDatesFromField(project.name || "");
          const cleanRole = stripDatesFromField(project.role || "");
          const dates = project.dates || "";

          // Line 1: Project name - BOLD
          currentPage.drawText(cleanName, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT + 2;

          // Line 2: Role (italic) on the left + optional dates right-aligned on the same line
          currentPage.drawText(cleanRole, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helveticaOblique,
            color: colors.black,
          });

          if (dates) {
            const dateWidth = helvetica.widthOfTextAtSize(dates, 10);
            currentPage.drawText(dates, {
              x: PAGE_WIDTH - MARGIN - dateWidth,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: colors.darkGray,
            });
          }

          yPosition -= LINE_HEIGHT + 4;

          // Bullet points - use standard bullet character for ATS compatibility
          for (const bullet of project.bullets) {
            ensureSpace(LINE_HEIGHT * 2);
            const bulletText = `• ${bullet}`;
            drawWrappedText(bulletText, MARGIN, 10, helvetica, PAGE_WIDTH - MARGIN * 2);
          }

          // 1.5 line spacing between projects (except after last)
          if (i < sanitizedData.projects.length - 1) {
            yPosition -= SECTION_SPACING;
          }
        }
      }

      // === EDUCATION (no dates to prevent bias) ===
      if (sanitizedData.education && sanitizedData.education.length > 0) {
        drawSectionHeader("Education");

        for (const edu of sanitizedData.education) {
          ensureSpace(30);

          // Remove embedded dates (e.g. "Imperial College London 2020 - 2021") to prevent bias.
          const cleanDegree = stripDatesFromField(edu.degree);
          const cleanSchool = stripDatesFromField(edu.school);
          const cleanGpa = edu.gpa ? stripDatesFromField(edu.gpa) : "";

          // Degree only (no dates to prevent age bias)
          currentPage.drawText(cleanDegree, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT;

          // School and GPA (no dates)
          const schoolLine = cleanGpa ? `${cleanSchool} | GPA: ${cleanGpa}` : cleanSchool;
          currentPage.drawText(schoolLine, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helvetica,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT + 6;
        }
      }

      // === SKILLS ===
      if (sanitizedData.skills) {
        drawSectionHeader("Skills");

        if (sanitizedData.skills.primary && sanitizedData.skills.primary.length > 0) {
          const skillsLine = `Technical: ${sanitizedData.skills.primary.join(", ")}`;
          drawWrappedText(skillsLine, MARGIN, 10, helvetica);
        }

        if (sanitizedData.skills.secondary && sanitizedData.skills.secondary.length > 0) {
          const additionalLine = `Additional: ${sanitizedData.skills.secondary.join(", ")}`;
          drawWrappedText(additionalLine, MARGIN, 10, helvetica);
        }
      }

      // === CERTIFICATIONS ===
      if (sanitizedData.certifications && sanitizedData.certifications.length > 0) {
        drawSectionHeader("Certifications");
        // List each certification on its own line for better parsing
        for (const cert of sanitizedData.certifications) {
          ensureSpace(LINE_HEIGHT);
          currentPage.drawText(`- ${cert}`, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helvetica,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT;
        }
      }

      // === ACHIEVEMENTS ===
      if (sanitizedData.achievements && sanitizedData.achievements.length > 0) {
        drawSectionHeader("Achievements");

        for (const achievement of sanitizedData.achievements) {
          ensureSpace(30);
          currentPage.drawText(`${achievement.title} (${achievement.date})`, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT;

          if (achievement.description) {
            drawWrappedText(achievement.description, MARGIN, 10, helvetica);
          }
          yPosition -= 4;
        }
      }
    } else if (sanitizedData.type === "cover_letter" && sanitizedData.coverLetter) {
      // ============================================
      // ULTRA ATS-COMPATIBLE COVER LETTER FORMAT
      // ============================================

      // Name header
      currentPage.drawText(sanitizedData.personalInfo.name.toUpperCase(), {
        x: MARGIN,
        y: yPosition,
        size: 16,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 20;

      // Contact info
      const contactLine = [sanitizedData.personalInfo.phone, sanitizedData.personalInfo.email]
        .filter(Boolean)
        .join(" | ");

      if (contactLine) {
        currentPage.drawText(contactLine, {
          x: MARGIN,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: colors.black,
        });
        yPosition -= LINE_HEIGHT * 2;
      }

      // Date
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      currentPage.drawText(today, {
        x: MARGIN,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.black,
      });
      yPosition -= LINE_HEIGHT * 2;

      // Recipient company
      if (sanitizedData.coverLetter.recipientCompany) {
        currentPage.drawText(sanitizedData.coverLetter.recipientCompany, {
          x: MARGIN,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: colors.black,
        });
        yPosition -= LINE_HEIGHT * 2;
      }

      // Subject line - job title only
      const subject = `Re: ${sanitizedData.coverLetter.jobTitle}`;
      currentPage.drawText(subject, {
        x: MARGIN,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= LINE_HEIGHT * 2;

      // Salutation
      currentPage.drawText("Dear Hiring Manager,", {
        x: MARGIN,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: colors.black,
      });
      yPosition -= LINE_HEIGHT * 1.5;

      // Body paragraphs
      for (const paragraph of sanitizedData.coverLetter.paragraphs) {
        drawWrappedText(paragraph, MARGIN, 11, helvetica);
        yPosition -= LINE_HEIGHT * 0.5;
      }

      yPosition -= LINE_HEIGHT;

      // Closing
      currentPage.drawText("Sincerely,", {
        x: MARGIN,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: colors.black,
      });
      yPosition -= LINE_HEIGHT * 2;

      // Signature name
      currentPage.drawText(sanitizedData.personalInfo.name, {
        x: MARGIN,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: colors.black,
      });
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Generate filename
    let fileName: string;
    if (sanitizedData.customFileName) {
      fileName = sanitizedData.customFileName;
    } else {
      const candidateName =
        sanitizedData.candidateName ||
        sanitizedData.personalInfo.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      fileName = sanitizedData.type === "resume" ? `${candidateName}_CV.pdf` : `${candidateName}_Cover_Letter.pdf`;
    }

    console.log(`ULTRA ATS PDF generated: ${fileName} Size: ${pdfBytes.length} bytes, Pages: ${pages.length}`);

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error("PDF generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate PDF";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Handle raw content request from extension
 * Parses text content, applies tailoredLocation, and returns base64 PDF in JSON
 * FIXED: Proper formatting with bold name (24pt), italic job titles, 1.5 line spacing
 */
async function handleRawContentRequest(body: {
  content: string;
  type?: string;
  tailoredLocation?: string;
  jobTitle?: string;
  company?: string;
  fileName?: string;
  firstName?: string;
  lastName?: string;
}): Promise<Response> {
  const { content, type = "cv", tailoredLocation, jobTitle, company, fileName, firstName, lastName } = body;

  console.log(
    "[generate-pdf] Raw content request, tailoredLocation:",
    tailoredLocation,
    "firstName:",
    firstName,
    "lastName:",
    lastName,
  );

  try {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const MARGIN = 54;
    const LINE_HEIGHT = 14;
    const SECTION_SPACING = 21; // 1.5 line spacing

    let currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let yPosition = PAGE_HEIGHT - MARGIN;

    const addNewPage = () => {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      yPosition = PAGE_HEIGHT - MARGIN;
      return currentPage;
    };

    const ensureSpace = (needed: number) => {
      if (yPosition < MARGIN + needed) {
        addNewPage();
      }
    };

    // Text wrapping helper
    const wrapAndDraw = (text: string, font: PDFFont, fontSize: number, x: number, color = rgb(0, 0, 0)) => {
      const maxWidth = PAGE_WIDTH - MARGIN * 2;
      const words = sanitizeText(text).split(" ");
      let currentLineText = "";

      for (const word of words) {
        if (!word) continue;
        const testLine = currentLineText ? `${currentLineText} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > maxWidth && currentLineText) {
          ensureSpace(LINE_HEIGHT);
          currentPage.drawText(currentLineText, { x, y: yPosition, size: fontSize, font, color });
          yPosition -= LINE_HEIGHT;
          currentLineText = word;
        } else {
          currentLineText = testLine;
        }
      }
      if (currentLineText) {
        ensureSpace(LINE_HEIGHT);
        currentPage.drawText(currentLineText, { x, y: yPosition, size: fontSize, font, color });
        yPosition -= LINE_HEIGHT;
      }
    };

    // Parse content into structured sections
    const lines = content.split("\n");
    const sections: { type: string; content: string[] }[] = [];
    let currentSection: { type: string; content: string[] } | null = null;
    let nameExtracted = "";
    let contactLine = "";
    let linksLine = "";

    const sectionHeaders = [
      "PROFESSIONAL SUMMARY",
      "SUMMARY",
      "EXPERIENCE",
      "WORK EXPERIENCE",
      "EDUCATION",
      "SKILLS",
      "TECHNICAL SKILLS",
      "CERTIFICATIONS",
      "ACHIEVEMENTS",
      "PROJECTS",
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, "");

      // Extract name (first significant line, usually uppercase)
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

      // Extract contact line (has @ for email)
      if (!contactLine && trimmed.includes("|") && trimmed.includes("@")) {
        contactLine = trimmed;
        continue;
      }

      // Extract links line (has http)
      if (!linksLine && trimmed.includes("http")) {
        linksLine = trimmed;
        continue;
      }

      // Check for section header
      if (sectionHeaders.includes(upperTrimmed)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = { type: upperTrimmed, content: [] };
        continue;
      }

      // Add to current section
      if (currentSection) {
        currentSection.content.push(trimmed);
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    // ============ RENDER PDF ============

    // NAME - 20pt, Bold, UPPERCASE
    const displayName = firstName && lastName ? `${firstName} ${lastName}`.toUpperCase() : nameExtracted.toUpperCase();

    ensureSpace(30);
    currentPage.drawText(displayName, {
      x: MARGIN,
      y: yPosition,
      size: 20,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= 26;

    // CONTACT LINE
    if (contactLine) {
      const parts = contactLine.split("|").map((p) => p.trim());
      // Replace location with tailoredLocation if provided
      if (parts.length >= 3 && tailoredLocation) {
        // Find and replace location (typically index 2)
        for (let i = 0; i < parts.length; i++) {
          if (
            !parts[i].includes("@") &&
            !parts[i].includes("+") &&
            !/^\d/.test(parts[i]) &&
            !/relocation/i.test(parts[i])
          ) {
            parts[i] = tailoredLocation;
            break;
          }
        }
      }
      wrapAndDraw(parts.join(" | "), helvetica, 10, MARGIN);
    }

    // LINKS LINE
    if (linksLine) {
      wrapAndDraw(linksLine, helvetica, 9, MARGIN, rgb(0.2, 0.2, 0.2));
    }

    // ============ SECTIONS ============
    for (const section of sections) {
      // Section header with 1.5 line spacing before
      yPosition -= SECTION_SPACING;
      ensureSpace(30);

      // Normalize section title
      let sectionTitle = section.type;
      if (sectionTitle.includes("SUMMARY")) sectionTitle = "PROFESSIONAL SUMMARY";
      if (sectionTitle.includes("EXPERIENCE")) sectionTitle = "WORK EXPERIENCE";

      currentPage.drawText(sectionTitle, {
        x: MARGIN,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPosition -= SECTION_SPACING; // 1.5 line spacing after header

      // SUMMARY - Regular text (not all caps)
      if (section.type.includes("SUMMARY")) {
        const summaryText = section.content.join(" ");
        wrapAndDraw(summaryText, helvetica, 10, MARGIN);
        continue;
      }

      // EXPERIENCE - Parse jobs
      if (section.type.includes("EXPERIENCE")) {
        interface JobEntry {
          company: string;
          title: string;
          dates: string;
          bullets: string[];
        }
        let currentJob: JobEntry | null = null;
        const jobs: JobEntry[] = [];

        // Date patterns to detect and strip from fields
        const datePatterns = [
          /\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi,
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi,
          /\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi,
        ];

        const stripDates = (text: string): string => {
          let cleaned = text;
          for (const pattern of datePatterns) {
            cleaned = cleaned.replace(pattern, "");
          }
          return cleaned
            .replace(/\s*\|\s*$/, "")
            .replace(/^\s*\|\s*/, "")
            .replace(/\s{2,}/g, " ")
            .trim();
        };

        const extractDates = (text: string): string => {
          for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match) return match[0];
          }
          return "";
        };

        // Convert dates to year-only format (e.g., "Jan 2020 - Dec 2023" -> "2020 - 2023")
        const toYearOnly = (dateStr: string): string => {
          if (!dateStr) return "";
          // Extract all 4-digit years
          const years = dateStr.match(/\d{4}/g);
          const hasPresent = /present/i.test(dateStr);

          if (hasPresent && years && years.length >= 1) {
            return `${years[0]} - Present`;
          } else if (years && years.length >= 2) {
            return `${years[0]} - ${years[1]}`;
          } else if (years && years.length === 1) {
            return years[0];
          }
          return dateStr; // Return original if no years found
        };

        // Location patterns to filter out (cities, states, countries)
        const locationPatterns = [
          /^[A-Z][a-z]+,\s*[A-Z]{2}$/, // Dallas, TX
          /^[A-Z][a-z]+,\s*[A-Z][a-z]+$/, // Dublin, Ireland
          /^[A-Z][a-z]+,\s*[A-Za-z\s]+$/, // London, United Kingdom
          /^[A-Z][a-z]+\s+[A-Z][a-z]+,/, // New York, NY
          /\b(United Kingdom|United States|USA|UK|Ireland|Germany|France|Netherlands|Canada|Australia)\b/i,
        ];

        const isLocation = (text: string): boolean => {
          const trimmed = text.trim();
          if (trimmed.length > 50) return false;
          return locationPatterns.some((p) => p.test(trimmed));
        };

        // Job title patterns - detect if a line is likely a job title
        const isJobTitle = (text: string): boolean => {
          const titlePatterns = [
            /\b(engineer|developer|architect|analyst|manager|director|scientist|specialist|lead|consultant|administrator|coordinator|officer|executive|vp|president|founder|cto|ceo|cfo|coo)\b/i,
            /\b(senior|junior|principal|staff|associate|assistant|intern|trainee|head of|chief)\b/i,
            /\b(product|project|program|data|software|cloud|ai|ml|machine learning|devops|sre|qa|test|security|network|system|solutions)\b/i,
          ];
          return titlePatterns.some((p) => p.test(text));
        };

        // Company patterns - detect if a line is likely a company name
        const isCompanyName = (text: string): boolean => {
          const companyPatterns = [
            /\b(inc|llc|ltd|corp|corporation|company|co|plc|group|holdings|partners|ventures|labs|technologies|solutions|consulting|services|startup)\b/i,
            /\bformerly\b/i, // "Meta (formerly Facebook Inc)"
            /\b(google|meta|facebook|amazon|apple|microsoft|netflix|ibm|oracle|salesforce|adobe|intel|nvidia|cisco|dell|hp|accenture|deloitte|pwc|kpmg|ey|mckinsey|bain|bcg|citi|citigroup|jpmorgan|goldman|morgan stanley|barclays|hsbc)\b/i,
          ];
          return companyPatterns.some((p) => p.test(text));
        };

        for (const line of section.content) {
          // Skip location lines entirely - NO location to prevent recruiter bias
          if (isLocation(line)) {
            continue;
          }

          // Check for separator: pipe (|) or dash (– or -)
          const hasPipe = line.includes("|");
          const hasDash = /\s*[–—-]\s*/.test(line) && !line.startsWith("-") && !line.startsWith("•");
          const isJobHeader = (hasPipe || hasDash) && !line.startsWith("-") && !line.startsWith("•");

          // Job header pattern: Company | Title | Dates OR Company – Title OR Company - Title
          if (isJobHeader) {
            if (currentJob) jobs.push(currentJob);

            // Split by pipe first, then by dash
            let parts: string[];
            if (hasPipe) {
              parts = line
                .split("|")
                .map((p) => p.trim())
                .filter((p) => !isLocation(p));
            } else {
              // Split by various dash types, but be careful not to split dates
              parts = line
                .split(/\s*[–—]\s*/)
                .map((p) => p.trim())
                .filter((p) => !isLocation(p));
              // If that didn't split, try regular dash (but not if it's a date like 2020-2023)
              if (parts.length === 1) {
                parts = line
                  .split(/\s+-\s+/)
                  .map((p) => p.trim())
                  .filter((p) => !isLocation(p));
              }
            }

            // Format: Company | Title | Dates (location removed)
            let company = stripDates(parts[0] || "");
            let title = "";
            let dates = "";

            if (parts.length >= 3) {
              // Assume: Company | Title | Dates
              title = stripDates(parts[1] || "");
              dates = parts[2] || extractDates(line);
            } else if (parts.length === 2) {
              // Could be Company | Title, Company | Dates, or Company – Title
              const secondPart = parts[1] || "";
              const extractedDate = extractDates(secondPart);

              if (extractedDate && secondPart.replace(extractedDate, "").trim().length < 5) {
                // Second part is primarily a date
                dates = secondPart;
              } else {
                // Second part is title
                title = stripDates(secondPart);
                dates = extractDates(line);
              }
            }

            // Extract dates from the original line if not found
            if (!dates) {
              dates = extractDates(line);
            }

            // CRITICAL: Detect if company/title are swapped
            // If "company" looks like a job title and "title" looks like a company, swap them
            if (company && title) {
              const companyIsTitle = isJobTitle(company) && !isCompanyName(company);
              const titleIsCompany = isCompanyName(title) || (!isJobTitle(title) && !isCompanyName(company));

              if (companyIsTitle && titleIsCompany) {
                const temp = company;
                company = title;
                title = temp;
              }
            } else if (company && !title) {
              // Only one part - determine if it's company or title
              if (isJobTitle(company) && !isCompanyName(company)) {
                title = company;
                company = "";
              }
            }

            currentJob = {
              company,
              title,
              dates,
              bullets: [],
            };
          } else if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*")) {
            if (currentJob) {
              currentJob.bullets.push(line.replace(/^[-•*]\s*/, ""));
            }
          } else if (currentJob && line.length < 80 && !line.includes("@") && !isLocation(line)) {
            // Non-bullet line - could be title or company on separate line
            const cleanedLine = stripDates(line);
            if (!cleanedLine) continue;

            // Determine if this is a title or company based on patterns
            const lineIsTitle = isJobTitle(cleanedLine);
            const lineIsCompany = isCompanyName(cleanedLine);

            // Prioritize filling missing fields
            if (!currentJob.company && lineIsCompany) {
              currentJob.company = cleanedLine;
            } else if (!currentJob.title && lineIsTitle) {
              currentJob.title = cleanedLine;
            } else if (!currentJob.company && !lineIsTitle) {
              // If no company and this doesn't look like a title, assume company
              currentJob.company = cleanedLine;
            } else if (!currentJob.title) {
              currentJob.title = cleanedLine;
            }

            // SWAP CHECK: If after assignment, company looks like title and vice versa, swap
            if (currentJob.company && currentJob.title) {
              const companyIsTitle = isJobTitle(currentJob.company) && !isCompanyName(currentJob.company);
              const titleIsCompany = isCompanyName(currentJob.title);

              if (companyIsTitle && titleIsCompany) {
                const temp = currentJob.company;
                currentJob.company = currentJob.title;
                currentJob.title = temp;
              }
            }
          }
        }
        if (currentJob) jobs.push(currentJob);

        // Render jobs
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          if (!job) continue;

          ensureSpace(50);

          // Company - BOLD
          currentPage.drawText(job.company, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: rgb(0, 0, 0),
          });
          yPosition -= LINE_HEIGHT + 2;

          // Job Title (italic) + Dates on same line
          const yearOnlyDates = toYearOnly(job.dates);
          const titleWithDates = yearOnlyDates ? `${job.title} | ${yearOnlyDates}` : job.title;

          if (titleWithDates) {
            currentPage.drawText(titleWithDates, {
              x: MARGIN,
              y: yPosition,
              size: 10,
              font: helveticaOblique,
              color: rgb(0, 0, 0),
            });
            yPosition -= LINE_HEIGHT + 4;
          }

          // Bullets
          for (const bullet of job.bullets) {
            wrapAndDraw(`- ${bullet}`, helvetica, 10, MARGIN);
          }

          // 1.5 line spacing between companies
          if (i < jobs.length - 1) {
            yPosition -= SECTION_SPACING;
          }
        }
        continue;
      }

      // EDUCATION
      if (section.type.includes("EDUCATION")) {
        for (const line of section.content) {
          if (line.includes("|")) {
            const parts = line.split("|").map((p) => p.trim());
            // Degree/School - Bold
            ensureSpace(LINE_HEIGHT * 2);
            currentPage.drawText(parts[0], {
              x: MARGIN,
              y: yPosition,
              size: 11,
              font: helveticaBold,
              color: rgb(0, 0, 0),
            });
            yPosition -= LINE_HEIGHT;

            // Rest of info
            if (parts.length > 1) {
              wrapAndDraw(parts.slice(1).join(" | "), helvetica, 10, MARGIN);
            }
          } else {
            wrapAndDraw(line, helvetica, 10, MARGIN);
          }
        }
        continue;
      }

      // SKILLS, CERTIFICATIONS - Simple text
      for (const line of section.content) {
        if (line.startsWith("-") || line.startsWith("•")) {
          wrapAndDraw(line, helvetica, 10, MARGIN);
        } else {
          wrapAndDraw(line, helvetica, 10, MARGIN);
        }
      }
    }

    const pdfBytes = await pdfDoc.save();

    // Convert to base64
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));

    // Generate filename
    let finalFileName = fileName;
    if (!finalFileName) {
      let nameForFile = "";
      if (firstName && lastName) {
        nameForFile = `${firstName.trim()}_${lastName.trim()}`;
      } else if (nameExtracted) {
        nameForFile = nameExtracted
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join("_");
      } else {
        nameForFile = "Applicant";
      }
      nameForFile = nameForFile.replace(/[^a-zA-Z0-9_]/g, "");
      finalFileName = type === "cv" ? `${nameForFile}_CV.pdf` : `${nameForFile}_Cover_Letter.pdf`;
    }

    console.log(
      `[generate-pdf] Generated ${finalFileName}, size: ${pdfBytes.length} bytes, location: ${tailoredLocation}`,
    );

    return new Response(
      JSON.stringify({
        pdf: base64Pdf,
        fileName: finalFileName,
        location: tailoredLocation || "Open to relocation",
        pages: pdfDoc.getPageCount(),
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
