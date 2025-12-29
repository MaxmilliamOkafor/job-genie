import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResumeData {
  type: 'resume' | 'cover_letter';
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

// Helper: Sanitize text for WinAnsi encoding
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    .replace(/[\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25A0\u25A1\u25CF\u25CB\u25D8\u25D9\u2B24\u2B58\u29BF\u25C6\u25C7\u2666\u2756\u2605\u2606\u2713\u2714\u2717\u2718\u2794\u27A4\u25B6\u25B8\u25BA\u25BC\u25BE\u25C0\u25C2\u25C4]/g, '-')
    .replace(/[\u2190-\u21FF]/g, '->')
    .replace(/[\u2713\u2714\u2715\u2716\u2717\u2718]/g, '*')
    .replace(/\u00A9/g, '(c)')
    .replace(/\u00AE/g, '(R)')
    .replace(/\u2122/g, '(TM)')
    .replace(/\u20AC/g, 'EUR')
    .replace(/\u00A3/g, 'GBP')
    .replace(/\u00A5/g, 'JPY')
    .replace(/\u00B0/g, ' deg')
    .replace(/\u00B1/g, '+/-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/[^\x00-\x7F\u00A0-\u00FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: ResumeData = await req.json();
    console.log('Generating PDF for:', data.type, data.personalInfo?.name);

    // Deep sanitize all string fields
    const sanitizeObject = (obj: unknown): unknown => {
      if (typeof obj === 'string') return sanitizeText(obj);
      if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item));
      if (obj && typeof obj === 'object') {
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
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const MARGIN = 50;
    const LINE_HEIGHT = 14;
    const SECTION_GAP = 18;
    const BULLET_INDENT = 15;

    const colors = {
      black: rgb(0, 0, 0),
      darkGray: rgb(0.2, 0.2, 0.2),
      mediumGray: rgb(0.4, 0.4, 0.4),
      accent: rgb(0.1, 0.3, 0.6),
    };

    // Page management - initialize first page immediately
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

    // Text wrapping helper
    const wrapText = (text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] => {
      const cleanText = sanitizeText(text);
      const words = cleanText.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
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

    // Draw text with automatic page breaks
    const drawText = (text: string, x: number, fontSize: number, font: PDFFont, color = colors.darkGray): void => {
      ensureSpace(fontSize + 2);
      currentPage.drawText(sanitizeText(text), { x, y: yPosition, size: fontSize, font, color });
      yPosition -= LINE_HEIGHT;
    };

    // Draw wrapped text with automatic page breaks
    const drawWrappedText = (text: string, x: number, fontSize: number, font: PDFFont, color = colors.darkGray, maxWidth?: number): void => {
      const effectiveMaxWidth = maxWidth || (PAGE_WIDTH - MARGIN - x);
      const lines = wrapText(text, effectiveMaxWidth, font, fontSize);
      
      for (const line of lines) {
        ensureSpace(fontSize + 2);
        currentPage.drawText(line, { x, y: yPosition, size: fontSize, font, color });
        yPosition -= LINE_HEIGHT;
      }
    };

    // Draw section header
    const drawSectionHeader = (title: string): void => {
      yPosition -= SECTION_GAP / 2;
      ensureSpace(25);
      
      currentPage.drawText(title.toUpperCase(), {
        x: MARGIN,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: colors.accent,
      });
      yPosition -= 3;
      
      currentPage.drawLine({
        start: { x: MARGIN, y: yPosition },
        end: { x: PAGE_WIDTH - MARGIN, y: yPosition },
        thickness: 1,
        color: colors.accent,
      });
      yPosition -= LINE_HEIGHT + 5;
    };

    // Draw text aligned to the right
    const drawRightAlignedText = (text: string, fontSize: number, font: PDFFont, color = colors.mediumGray): void => {
      const textWidth = font.widthOfTextAtSize(sanitizeText(text), fontSize);
      currentPage.drawText(sanitizeText(text), {
        x: PAGE_WIDTH - MARGIN - textWidth,
        y: yPosition,
        size: fontSize,
        font,
        color,
      });
    };

    if (sanitizedData.type === 'resume') {
      // === RESUME GENERATION ===
      
      // Header - Name (large, bold)
      currentPage.drawText(sanitizedData.personalInfo.name, {
        x: MARGIN,
        y: yPosition,
        size: 24,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 28;

      // Contact info line
      const contactParts = [
        sanitizedData.personalInfo.phone,
        sanitizedData.personalInfo.email,
        sanitizedData.personalInfo.location,
      ].filter(Boolean);
      
      if (contactParts.length > 0) {
        currentPage.drawText(contactParts.join(' | '), {
          x: MARGIN,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: colors.mediumGray,
        });
        yPosition -= LINE_HEIGHT;
      }

      // Links line
      const linkParts = [
        sanitizedData.personalInfo.linkedin ? `LinkedIn: ${sanitizedData.personalInfo.linkedin}` : null,
        sanitizedData.personalInfo.github ? `GitHub: ${sanitizedData.personalInfo.github}` : null,
        sanitizedData.personalInfo.portfolio ? `Portfolio: ${sanitizedData.personalInfo.portfolio}` : null,
      ].filter(Boolean);
      
      if (linkParts.length > 0) {
        currentPage.drawText(linkParts.join(' | '), {
          x: MARGIN,
          y: yPosition,
          size: 9,
          font: helvetica,
          color: colors.accent,
        });
        yPosition -= LINE_HEIGHT;
      }

      yPosition -= SECTION_GAP;

      // === PROFESSIONAL SUMMARY ===
      if (sanitizedData.summary) {
        drawSectionHeader('Professional Summary');
        drawWrappedText(sanitizedData.summary, MARGIN, 10, helvetica, colors.darkGray);
        yPosition -= SECTION_GAP / 2;
      }

      // === WORK EXPERIENCE ===
      if (sanitizedData.experience && sanitizedData.experience.length > 0) {
        drawSectionHeader('Work Experience');
        
        for (const exp of sanitizedData.experience) {
          ensureSpace(40); // Ensure space for company header
          
          // Company name on left, dates on right
          currentPage.drawText(exp.company, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          drawRightAlignedText(exp.dates, 10, helvetica, colors.mediumGray);
          yPosition -= LINE_HEIGHT;

          // Job title
          currentPage.drawText(exp.title, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helveticaOblique,
            color: colors.darkGray,
          });
          yPosition -= LINE_HEIGHT + 3;

          // Bullet points
          for (const bullet of exp.bullets) {
            ensureSpace(LINE_HEIGHT * 2);
            currentPage.drawText('-', {
              x: MARGIN,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: colors.darkGray,
            });
            drawWrappedText(bullet, MARGIN + BULLET_INDENT, 10, helvetica, colors.darkGray, PAGE_WIDTH - MARGIN * 2 - BULLET_INDENT);
          }
          yPosition -= 8;
        }
      }

      // === EDUCATION ===
      if (sanitizedData.education && sanitizedData.education.length > 0) {
        drawSectionHeader('Education');
        
        for (const edu of sanitizedData.education) {
          ensureSpace(30);
          
          currentPage.drawText(edu.degree, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          drawRightAlignedText(edu.dates, 10, helvetica, colors.mediumGray);
          yPosition -= LINE_HEIGHT;

          const schoolLine = edu.gpa ? `${edu.school} | GPA: ${edu.gpa}` : edu.school;
          currentPage.drawText(schoolLine, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helvetica,
            color: colors.darkGray,
          });
          yPosition -= LINE_HEIGHT + 8;
        }
      }

      // === SKILLS ===
      if (sanitizedData.skills) {
        drawSectionHeader('Skills');
        
        if (sanitizedData.skills.primary && sanitizedData.skills.primary.length > 0) {
          ensureSpace(LINE_HEIGHT * 2);
          currentPage.drawText('Primary:', {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.darkGray,
          });
          const primaryText = sanitizedData.skills.primary.join(', ');
          const primaryLines = wrapText(primaryText, PAGE_WIDTH - MARGIN * 2 - 55, helvetica, 10);
          for (let i = 0; i < primaryLines.length; i++) {
            currentPage.drawText(primaryLines[i], {
              x: MARGIN + 55,
              y: yPosition - (i * LINE_HEIGHT),
              size: 10,
              font: helvetica,
              color: colors.darkGray,
            });
          }
          yPosition -= LINE_HEIGHT * primaryLines.length;
        }
        
        if (sanitizedData.skills.secondary && sanitizedData.skills.secondary.length > 0) {
          ensureSpace(LINE_HEIGHT * 2);
          currentPage.drawText('Additional:', {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.darkGray,
          });
          const secondaryText = sanitizedData.skills.secondary.join(', ');
          const secondaryLines = wrapText(secondaryText, PAGE_WIDTH - MARGIN * 2 - 65, helvetica, 10);
          for (let i = 0; i < secondaryLines.length; i++) {
            currentPage.drawText(secondaryLines[i], {
              x: MARGIN + 65,
              y: yPosition - (i * LINE_HEIGHT),
              size: 10,
              font: helvetica,
              color: colors.darkGray,
            });
          }
          yPosition -= LINE_HEIGHT * secondaryLines.length;
        }
      }

      // === CERTIFICATIONS ===
      if (sanitizedData.certifications && sanitizedData.certifications.length > 0) {
        drawSectionHeader('Certifications');
        drawWrappedText(sanitizedData.certifications.join(' - '), MARGIN, 10, helvetica, colors.darkGray);
      }

      // === ACHIEVEMENTS ===
      if (sanitizedData.achievements && sanitizedData.achievements.length > 0) {
        drawSectionHeader('Achievements');
        
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
          drawWrappedText(achievement.description, MARGIN + BULLET_INDENT, 10, helvetica, colors.darkGray);
          yPosition -= 5;
        }
      }

    } else if (sanitizedData.type === 'cover_letter' && sanitizedData.coverLetter) {
      // === COVER LETTER GENERATION ===
      
      // Header - Name
      currentPage.drawText(sanitizedData.personalInfo.name, {
        x: MARGIN,
        y: yPosition,
        size: 20,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 24;

      // Contact info
      const contactLine = [sanitizedData.personalInfo.phone, sanitizedData.personalInfo.email].filter(Boolean).join(' | ');
      currentPage.drawText(contactLine, {
        x: MARGIN,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.mediumGray,
      });
      yPosition -= LINE_HEIGHT * 2;

      // Date
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      currentPage.drawText(today, {
        x: MARGIN,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPosition -= LINE_HEIGHT * 2;

      // Recipient
      currentPage.drawText('Dear Hiring Committee,', {
        x: MARGIN,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPosition -= LINE_HEIGHT;
      
      currentPage.drawText(sanitizedData.coverLetter.recipientCompany, {
        x: MARGIN,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPosition -= LINE_HEIGHT * 2;

      // Subject line - only job title, no URL or Job ID
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
      currentPage.drawText('Dear Hiring Committee,', {
        x: MARGIN,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: colors.black,
      });
      yPosition -= LINE_HEIGHT * 1.5;

      // Body paragraphs
      for (const paragraph of sanitizedData.coverLetter.paragraphs) {
        drawWrappedText(paragraph, MARGIN, 11, helvetica, colors.darkGray);
        yPosition -= LINE_HEIGHT;
      }

      yPosition -= LINE_HEIGHT;

      // Closing
      currentPage.drawText('Sincerely,', {
        x: MARGIN,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: colors.black,
      });
      yPosition -= LINE_HEIGHT * 2;

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
      const candidateName = sanitizedData.candidateName || 
        sanitizedData.personalInfo.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      fileName = sanitizedData.type === 'resume' 
        ? `${candidateName}_CV.pdf`
        : `${candidateName}_Cover_Letter.pdf`;
    }

    console.log(`PDF generated successfully: ${fileName} Size: ${pdfBytes.length}`);

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error('PDF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate PDF';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
