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

// Date patterns to strip from company/title fields
const DATE_PATTERNS = [
  /\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi,
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi,
  /\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi,
];

// Strip dates from company/title fields to prevent duplication
const stripDatesFromField = (fieldValue: string): string => {
  if (!fieldValue) return '';
  let cleaned = fieldValue;
  for (const pattern of DATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Clean up leftover separators and whitespace
  return cleaned.replace(/\s*\|\s*$/g, '').replace(/^\s*\|\s*/g, '').replace(/\s{2,}/g, ' ').trim();
};

// ULTRA ATS-SAFE: Sanitize text - only ASCII, no special characters
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    // Remove all newlines, tabs
    .replace(/[\n\r\t]/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove control characters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    // Smart quotes to straight quotes
    .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    // Dashes to hyphen
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    // Ellipsis to dots
    .replace(/\u2026/g, '...')
    // All bullet points to hyphen
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25A0\u25A1\u25CF\u25CB\u25D8\u25D9\u2B24\u2B58\u29BF\u25C6\u25C7\u2666\u2756\u2605\u2606\u2713\u2714\u2717\u2718\u2794\u27A4\u25B6\u25B8\u25BA\u25BC\u25BE\u25C0\u25C2\u25C4]/g, '-')
    // Arrows to text
    .replace(/[\u2190-\u21FF]/g, '->')
    // Check marks to asterisk
    .replace(/[\u2713\u2714\u2715\u2716\u2717\u2718]/g, '*')
    // Symbols to text equivalents
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
    // Remove any remaining non-ASCII
    .replace(/[^\x00-\x7F\u00A0-\u00FF]/g, ' ')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    
    // Check if this is a raw content request (from extension)
    if (requestBody.content && typeof requestBody.content === 'string') {
      return handleRawContentRequest(requestBody);
    }
    
    // Otherwise, handle structured data request
    const data: ResumeData = requestBody;
    console.log('Generating ULTRA ATS-COMPATIBLE PDF for:', data.type, data.personalInfo?.name);

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
    
    // Set PDF metadata for better ATS parsing
    pdfDoc.setTitle(sanitizedData.type === 'resume' 
      ? `${sanitizedData.personalInfo.name} - Resume`
      : `${sanitizedData.personalInfo.name} - Cover Letter`);
    pdfDoc.setAuthor(sanitizedData.personalInfo.name);
    pdfDoc.setSubject(sanitizedData.type === 'resume' ? 'Professional Resume' : 'Cover Letter');
    pdfDoc.setKeywords(['resume', 'cv', 'professional']);
    pdfDoc.setCreator('QuantumHire ATS Optimizer');
    pdfDoc.setProducer('QuantumHire');
    
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
      const words = cleanText.split(' ');
      const lines: string[] = [];
      let currentLine = '';

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
    const drawWrappedText = (text: string, x: number, fontSize: number, font: PDFFont, maxWidth?: number, color = colors.black): void => {
      const effectiveMaxWidth = maxWidth || (PAGE_WIDTH - MARGIN - x);
      const lines = wrapText(text, effectiveMaxWidth, font, fontSize);
      
      for (const line of lines) {
        ensureSpace(fontSize + 4);
        currentPage.drawText(line, { 
          x, 
          y: yPosition, 
          size: fontSize, 
          font, 
          color 
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

    if (sanitizedData.type === 'resume') {
      // ============================================
      // ULTRA ATS-COMPATIBLE RESUME FORMAT
      // ============================================
      
      // NAME - Large (24pt), bold, stands out
      currentPage.drawText(sanitizedData.personalInfo.name, {
        x: MARGIN,
        y: yPosition,
        size: 24,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 30;

      // CONTACT LINE - Simple pipe-separated
      const contactParts: string[] = [];
      if (sanitizedData.personalInfo.phone) contactParts.push(sanitizedData.personalInfo.phone);
      if (sanitizedData.personalInfo.email) contactParts.push(sanitizedData.personalInfo.email);
      if (sanitizedData.personalInfo.location) contactParts.push(sanitizedData.personalInfo.location);
      contactParts.push('Open to relocation');
      
      if (contactParts.length > 0) {
        const contactLine = contactParts.join(' | ');
        drawWrappedText(contactLine, MARGIN, 10, helvetica);
      }

      // LINKS - Plain text URLs
      const linkParts: string[] = [];
      if (sanitizedData.personalInfo.linkedin) linkParts.push(sanitizedData.personalInfo.linkedin);
      if (sanitizedData.personalInfo.github) linkParts.push(sanitizedData.personalInfo.github);
      if (sanitizedData.personalInfo.portfolio) linkParts.push(sanitizedData.personalInfo.portfolio);
      
      if (linkParts.length > 0) {
        const linksLine = linkParts.join(' | ');
        drawWrappedText(linksLine, MARGIN, 9, helvetica, undefined, colors.darkGray);
      }

      // === PROFESSIONAL SUMMARY ===
      if (sanitizedData.summary) {
        drawSectionHeader('Professional Summary');
        // Summary in normal case, not all caps
        drawWrappedText(sanitizedData.summary, MARGIN, 10, helvetica);
      }

      // === WORK EXPERIENCE ===
      if (sanitizedData.experience && sanitizedData.experience.length > 0) {
        drawSectionHeader('Work Experience');
        
        for (let i = 0; i < sanitizedData.experience.length; i++) {
          const exp = sanitizedData.experience[i];
          ensureSpace(50);
          
          // CRITICAL: Strip any embedded dates from company/title to prevent duplication
          const cleanCompany = stripDatesFromField(exp.company);
          const cleanTitle = stripDatesFromField(exp.title);
          const dates = exp.dates || '';
          
          // Company name - BOLD (dates stripped)
          currentPage.drawText(cleanCompany, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          
          // Dates on same line, right-aligned (only if dates exist)
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
          yPosition -= LINE_HEIGHT + 2;

          // Job title - ITALIC (dates stripped)
          currentPage.drawText(cleanTitle, {
            x: MARGIN,
            y: yPosition,
            size: 10,
            font: helveticaOblique,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT + 4;

          // Bullet points
          for (const bullet of exp.bullets) {
            ensureSpace(LINE_HEIGHT * 2);
            const bulletText = `- ${bullet}`;
            drawWrappedText(bulletText, MARGIN, 10, helvetica, PAGE_WIDTH - MARGIN * 2);
          }
          
          // 1.5 line spacing between companies (except after last)
          if (i < sanitizedData.experience.length - 1) {
            yPosition -= SECTION_SPACING;
          }
        }
      }

      // === EDUCATION ===
      if (sanitizedData.education && sanitizedData.education.length > 0) {
        drawSectionHeader('Education');
        
        for (const edu of sanitizedData.education) {
          ensureSpace(30);
          
          // Degree and dates
          const degreeLine = `${edu.degree} | ${edu.dates}`;
          currentPage.drawText(degreeLine, {
            x: MARGIN,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          yPosition -= LINE_HEIGHT;

          // School and GPA
          const schoolLine = edu.gpa ? `${edu.school} | GPA: ${edu.gpa}` : edu.school;
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
        drawSectionHeader('Skills');
        
        if (sanitizedData.skills.primary && sanitizedData.skills.primary.length > 0) {
          const skillsLine = `Technical: ${sanitizedData.skills.primary.join(', ')}`;
          drawWrappedText(skillsLine, MARGIN, 10, helvetica);
        }
        
        if (sanitizedData.skills.secondary && sanitizedData.skills.secondary.length > 0) {
          const additionalLine = `Additional: ${sanitizedData.skills.secondary.join(', ')}`;
          drawWrappedText(additionalLine, MARGIN, 10, helvetica);
        }
      }

      // === CERTIFICATIONS ===
      if (sanitizedData.certifications && sanitizedData.certifications.length > 0) {
        drawSectionHeader('Certifications');
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
          
          if (achievement.description) {
            drawWrappedText(achievement.description, MARGIN, 10, helvetica);
          }
          yPosition -= 4;
        }
      }

    } else if (sanitizedData.type === 'cover_letter' && sanitizedData.coverLetter) {
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
      const contactLine = [
        sanitizedData.personalInfo.phone, 
        sanitizedData.personalInfo.email
      ].filter(Boolean).join(' | ');
      
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
        drawWrappedText(paragraph, MARGIN, 11, helvetica);
        yPosition -= LINE_HEIGHT * 0.5;
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
      const candidateName = sanitizedData.candidateName || 
        sanitizedData.personalInfo.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      fileName = sanitizedData.type === 'resume' 
        ? `${candidateName}_CV.pdf`
        : `${candidateName}_Cover_Letter.pdf`;
    }

    console.log(`ULTRA ATS PDF generated: ${fileName} Size: ${pdfBytes.length} bytes, Pages: ${pages.length}`);

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
  const { content, type = 'cv', tailoredLocation, jobTitle, company, fileName, firstName, lastName } = body;
  
  console.log('[generate-pdf] Raw content request, tailoredLocation:', tailoredLocation, 'firstName:', firstName, 'lastName:', lastName);
  
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
      const words = sanitizeText(text).split(' ');
      let currentLineText = '';
      
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
    const lines = content.split('\n');
    const sections: { type: string; content: string[] }[] = [];
    let currentSection: { type: string; content: string[] } | null = null;
    let nameExtracted = '';
    let contactLine = '';
    let linksLine = '';
    
    const sectionHeaders = ['PROFESSIONAL SUMMARY', 'SUMMARY', 'EXPERIENCE', 'WORK EXPERIENCE', 'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS', 'CERTIFICATIONS', 'ACHIEVEMENTS', 'PROJECTS'];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');
      
      // Extract name (first significant line, usually uppercase)
      if (!nameExtracted && !trimmed.includes('|') && !trimmed.includes('@') && 
          trimmed.length < 50 && trimmed === trimmed.toUpperCase() && 
          !sectionHeaders.includes(upperTrimmed)) {
        nameExtracted = trimmed;
        continue;
      }
      
      // Extract contact line (has @ for email)
      if (!contactLine && trimmed.includes('|') && trimmed.includes('@')) {
        contactLine = trimmed;
        continue;
      }
      
      // Extract links line (has http)
      if (!linksLine && trimmed.includes('http')) {
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
    
    // NAME - Large (24pt), Bold
    const displayName = firstName && lastName 
      ? `${firstName} ${lastName}` 
      : nameExtracted.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    
    ensureSpace(30);
    currentPage.drawText(displayName, {
      x: MARGIN,
      y: yPosition,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= 30;
    
    // CONTACT LINE
    if (contactLine) {
      const parts = contactLine.split('|').map(p => p.trim());
      // Replace location with tailoredLocation if provided
      if (parts.length >= 3 && tailoredLocation) {
        // Find and replace location (typically index 2)
        for (let i = 0; i < parts.length; i++) {
          if (!parts[i].includes('@') && !parts[i].includes('+') && !/^\d/.test(parts[i]) && !/relocation/i.test(parts[i])) {
            parts[i] = tailoredLocation;
            break;
          }
        }
      }
      wrapAndDraw(parts.join(' | '), helvetica, 10, MARGIN);
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
      if (sectionTitle.includes('SUMMARY')) sectionTitle = 'PROFESSIONAL SUMMARY';
      if (sectionTitle.includes('EXPERIENCE')) sectionTitle = 'WORK EXPERIENCE';
      
      currentPage.drawText(sectionTitle, {
        x: MARGIN,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPosition -= SECTION_SPACING; // 1.5 line spacing after header
      
      // SUMMARY - Regular text (not all caps)
      if (section.type.includes('SUMMARY')) {
        const summaryText = section.content.join(' ');
        wrapAndDraw(summaryText, helvetica, 10, MARGIN);
        continue;
      }
      
      // EXPERIENCE - Parse jobs
      if (section.type.includes('EXPERIENCE')) {
        interface JobEntry { company: string; title: string; dates: string; bullets: string[] }
        let currentJob: JobEntry | null = null;
        const jobs: JobEntry[] = [];
        
        for (const line of section.content) {
          // Job header pattern: Company | Dates or just Company line
          if (line.includes('|') && !line.startsWith('-') && !line.startsWith('•')) {
            if (currentJob) jobs.push(currentJob);
            const parts = line.split('|').map(p => p.trim());
            currentJob = { 
              company: parts[0] || '', 
              title: parts[1] || '', 
              dates: parts[2] || parts[1] || '',
              bullets: [] 
            };
          } else if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
            if (currentJob) {
              currentJob.bullets.push(line.replace(/^[-•*]\s*/, ''));
            }
          } else if (currentJob && !currentJob.title && line.length < 60) {
            // Might be a job title on separate line
            currentJob.title = line;
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
          
          // Dates - Right aligned
          if (job.dates) {
            const dateWidth = helvetica.widthOfTextAtSize(job.dates, 10);
            currentPage.drawText(job.dates, {
              x: PAGE_WIDTH - MARGIN - dateWidth,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(0.2, 0.2, 0.2),
            });
          }
          yPosition -= LINE_HEIGHT + 2;
          
          // Job Title - ITALIC
          if (job.title) {
            currentPage.drawText(job.title, {
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
      if (section.type.includes('EDUCATION')) {
        for (const line of section.content) {
          if (line.includes('|')) {
            const parts = line.split('|').map(p => p.trim());
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
              wrapAndDraw(parts.slice(1).join(' | '), helvetica, 10, MARGIN);
            }
          } else {
            wrapAndDraw(line, helvetica, 10, MARGIN);
          }
        }
        continue;
      }
      
      // SKILLS, CERTIFICATIONS - Simple text
      for (const line of section.content) {
        if (line.startsWith('-') || line.startsWith('•')) {
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
      let nameForFile = '';
      if (firstName && lastName) {
        nameForFile = `${firstName.trim()}_${lastName.trim()}`;
      } else if (nameExtracted) {
        nameForFile = nameExtracted.split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join('_');
      } else {
        nameForFile = 'Applicant';
      }
      nameForFile = nameForFile.replace(/[^a-zA-Z0-9_]/g, '');
      finalFileName = type === 'cv' ? `${nameForFile}_CV.pdf` : `${nameForFile}_Cover_Letter.pdf`;
    }
    
    console.log(`[generate-pdf] Generated ${finalFileName}, size: ${pdfBytes.length} bytes, location: ${tailoredLocation}`);
    
    return new Response(
      JSON.stringify({
        pdf: base64Pdf,
        fileName: finalFileName,
        location: tailoredLocation || 'Open to relocation',
        pages: pdfDoc.getPageCount()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-pdf] Raw content processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate PDF';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}
