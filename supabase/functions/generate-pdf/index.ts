import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

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
  // Custom file naming
  customFileName?: string;
  candidateName?: string; // e.g., "MaxmilliamOkafor"
}

// Helper: Sanitize text for WinAnsi encoding (removes unsupported characters)
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return String(text)
    // Replace newlines and carriage returns with spaces
    .replace(/[\n\r\t]/g, ' ')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove or replace other problematic characters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    // Replace smart quotes with regular quotes
    .replace(/[\u2018\u2019\u201A\u2039\u203A]/g, "'")
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    // Replace em/en dashes with regular hyphen
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    // Replace ellipsis with dots
    .replace(/\u2026/g, '...')
    // Replace ALL bullet points and symbols (including \u25aa which caused the error)
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25A0\u25A1\u25CF\u25CB\u25D8\u25D9\u2B24\u2B58\u29BF\u25C6\u25C7\u2666\u2756\u2605\u2606\u2713\u2714\u2717\u2718\u2794\u27A4\u25B6\u25B8\u25BA\u25BC\u25BE\u25C0\u25C2\u25C4]/g, '-')
    // Replace arrows
    .replace(/[\u2190-\u21FF]/g, '->')
    // Replace check marks and crosses
    .replace(/[\u2713\u2714\u2715\u2716\u2717\u2718]/g, '*')
    // Replace copyright and trademark
    .replace(/\u00A9/g, '(c)')
    .replace(/\u00AE/g, '(R)')
    .replace(/\u2122/g, '(TM)')
    // Replace currency symbols
    .replace(/\u20AC/g, 'EUR')
    .replace(/\u00A3/g, 'GBP')
    .replace(/\u00A5/g, 'JPY')
    // Replace degree and other math symbols
    .replace(/\u00B0/g, ' deg')
    .replace(/\u00B1/g, '+/-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    // Replace any remaining non-WinAnsi characters with space
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
    const data: ResumeData = await req.json();
    console.log('Generating PDF for:', data.type, data.personalInfo?.name);

    // Deep sanitize all string fields in data
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

    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();
    
    const margin = 50;
    let yPosition = height - margin;
    const lineHeight = 14;
    const sectionGap = 20;
    const bulletIndent = 15;

    const colors = {
      black: rgb(0, 0, 0),
      darkGray: rgb(0.2, 0.2, 0.2),
      mediumGray: rgb(0.4, 0.4, 0.4),
      accent: rgb(0.1, 0.3, 0.6),
    };

    // Helper function to wrap text (use sanitizedData throughout)
    const wrapText = (text: string, maxWidth: number, font: typeof helvetica, fontSize: number): string[] => {
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

    // Helper to add text with wrapping
    const addWrappedText = (text: string, x: number, fontSize: number, font: typeof helvetica, color = colors.darkGray, maxWidth?: number) => {
      const effectiveMaxWidth = maxWidth || (width - margin - x);
      const lines = wrapText(text, effectiveMaxWidth, font, fontSize);
      
      for (const line of lines) {
        if (yPosition < margin + 20) {
          // Add new page if needed
          const newPage = pdfDoc.addPage([612, 792]);
          yPosition = height - margin;
          newPage.drawText(line, { x, y: yPosition, size: fontSize, font, color });
        } else {
          page.drawText(line, { x, y: yPosition, size: fontSize, font, color });
        }
        yPosition -= lineHeight;
      }
    };

    // Helper to add section header
    const addSectionHeader = (title: string) => {
      yPosition -= sectionGap / 2;
      page.drawText(title.toUpperCase(), {
        x: margin,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: colors.accent,
      });
      yPosition -= 3;
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: width - margin, y: yPosition },
        thickness: 1,
        color: colors.accent,
      });
      yPosition -= lineHeight + 5;
    };

    if (sanitizedData.type === 'resume') {
      // === RESUME GENERATION ===
      
      // Header - Name
      page.drawText(sanitizedData.personalInfo.name, {
        x: margin,
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
      
      page.drawText(contactParts.join(' | '), {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.mediumGray,
      });
      yPosition -= lineHeight;

      // Links line
      const linkParts = [
        sanitizedData.personalInfo.linkedin ? `LinkedIn: ${sanitizedData.personalInfo.linkedin}` : null,
        sanitizedData.personalInfo.github ? `GitHub: ${sanitizedData.personalInfo.github}` : null,
        sanitizedData.personalInfo.portfolio ? `Portfolio: ${sanitizedData.personalInfo.portfolio}` : null,
      ].filter(Boolean);
      
      if (linkParts.length > 0) {
        page.drawText(linkParts.join(' | '), {
          x: margin,
          y: yPosition,
          size: 9,
          font: helvetica,
          color: colors.accent,
        });
        yPosition -= lineHeight;
      }

      yPosition -= sectionGap;

      // Summary
      if (sanitizedData.summary) {
        addSectionHeader('Professional Summary');
        addWrappedText(sanitizedData.summary, margin, 10, helvetica, colors.darkGray);
        yPosition -= sectionGap / 2;
      }

      // Experience
      if (sanitizedData.experience && sanitizedData.experience.length > 0) {
        addSectionHeader('Work Experience');
        
        for (const exp of sanitizedData.experience) {
          // Company and Title
          page.drawText(exp.company, {
            x: margin,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          
          page.drawText(exp.dates, {
            x: width - margin - helvetica.widthOfTextAtSize(exp.dates, 10),
            y: yPosition,
            size: 10,
            font: helvetica,
            color: colors.mediumGray,
          });
          yPosition -= lineHeight;

          page.drawText(exp.title, {
            x: margin,
            y: yPosition,
            size: 10,
            font: helveticaOblique,
            color: colors.darkGray,
          });
          yPosition -= lineHeight + 3;

          // Bullets
          for (const bullet of exp.bullets) {
            page.drawText('-', {
              x: margin,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: colors.darkGray,
            });
            addWrappedText(bullet, margin + bulletIndent, 10, helvetica, colors.darkGray, width - margin * 2 - bulletIndent);
          }
          yPosition -= 8;
        }
      }

      // Education
      if (sanitizedData.education && sanitizedData.education.length > 0) {
        addSectionHeader('Education');
        
        for (const edu of sanitizedData.education) {
          page.drawText(edu.degree, {
            x: margin,
            y: yPosition,
            size: 11,
            font: helveticaBold,
            color: colors.black,
          });
          
          page.drawText(edu.dates, {
            x: width - margin - helvetica.widthOfTextAtSize(edu.dates, 10),
            y: yPosition,
            size: 10,
            font: helvetica,
            color: colors.mediumGray,
          });
          yPosition -= lineHeight;

          const schoolLine = edu.gpa ? `${edu.school} | GPA: ${edu.gpa}` : edu.school;
          page.drawText(schoolLine, {
            x: margin,
            y: yPosition,
            size: 10,
            font: helvetica,
            color: colors.darkGray,
          });
          yPosition -= lineHeight + 8;
        }
      }

      // Skills
      if (sanitizedData.skills) {
        addSectionHeader('Skills');
        
        if (sanitizedData.skills.primary && sanitizedData.skills.primary.length > 0) {
          page.drawText('Primary:', {
            x: margin,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.darkGray,
          });
          addWrappedText(sanitizedData.skills.primary.join(', '), margin + 50, 10, helvetica, colors.darkGray);
        }
        
        if (sanitizedData.skills.secondary && sanitizedData.skills.secondary.length > 0) {
          page.drawText('Additional:', {
            x: margin,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.darkGray,
          });
          addWrappedText(sanitizedData.skills.secondary.join(', '), margin + 60, 10, helvetica, colors.darkGray);
        }
      }

      // Certifications
      if (sanitizedData.certifications && sanitizedData.certifications.length > 0) {
        addSectionHeader('Certifications');
        addWrappedText(sanitizedData.certifications.join(' - '), margin, 10, helvetica, colors.darkGray);
      }

      // Achievements
      if (sanitizedData.achievements && sanitizedData.achievements.length > 0) {
        addSectionHeader('Achievements');
        
        for (const achievement of sanitizedData.achievements) {
          page.drawText(`${achievement.title} (${achievement.date})`, {
            x: margin,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.black,
          });
          yPosition -= lineHeight;
          addWrappedText(achievement.description, margin + bulletIndent, 10, helvetica, colors.darkGray);
          yPosition -= 5;
        }
      }

    } else if (sanitizedData.type === 'cover_letter' && sanitizedData.coverLetter) {
      // === COVER LETTER GENERATION ===
      
      // Header - Name
      page.drawText(sanitizedData.personalInfo.name, {
        x: margin,
        y: yPosition,
        size: 20,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 24;

      // Contact info
      const contactLine = [sanitizedData.personalInfo.phone, sanitizedData.personalInfo.email].filter(Boolean).join(' | ');
      page.drawText(contactLine, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.mediumGray,
      });
      yPosition -= lineHeight * 2;

      // Date
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      page.drawText(today, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPosition -= lineHeight * 2;

      // Recipient
      page.drawText('Hiring Team', {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPosition -= lineHeight;
      
      page.drawText(sanitizedData.coverLetter.recipientCompany, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPosition -= lineHeight * 2;

      // Subject line
      let subject = `Re: ${sanitizedData.coverLetter.jobTitle}`;
      if (sanitizedData.coverLetter.jobId) {
        subject += ` - Job ID: ${sanitizedData.coverLetter.jobId}`;
      }
      page.drawText(subject, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= lineHeight * 2;

      // Salutation
      page.drawText('Dear Hiring Team,', {
        x: margin,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: colors.black,
      });
      yPosition -= lineHeight * 1.5;

      // Body paragraphs
      for (const paragraph of sanitizedData.coverLetter.paragraphs) {
        addWrappedText(paragraph, margin, 11, helvetica, colors.darkGray);
        yPosition -= lineHeight;
      }

      yPosition -= lineHeight;

      // Closing
      page.drawText('Sincerely,', {
        x: margin,
        y: yPosition,
        size: 11,
        font: helvetica,
        color: colors.black,
      });
      yPosition -= lineHeight * 2;

      page.drawText(sanitizedData.personalInfo.name, {
        x: margin,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: colors.black,
      });
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

    // Use custom candidate name if provided, otherwise extract from personalInfo
    const candidateName = sanitizedData.candidateName || 
      sanitizedData.personalInfo.name.replace(/\s+/g, '');
    
    // Generate standardized file name: CandidateName_CV.pdf or CandidateName_CoverLetter.pdf
    const fileName = sanitizedData.customFileName || 
      (sanitizedData.type === 'resume' 
        ? `${candidateName}_CV.pdf`
        : `${candidateName}_CoverLetter.pdf`);

    console.log('PDF generated successfully:', fileName, 'Size:', pdfBytes.length);

    // Validate PDF was generated properly
    if (pdfBytes.length < 1000) {
      console.error('PDF seems too small, possible generation issue');
      throw new Error('PDF generation produced invalid output');
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        pdf: base64Pdf,
        fileName,
        size: pdfBytes.length,
        type: sanitizedData.type,
        generatedAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('PDF generation error:', errorMessage, error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        type: 'pdf_generation_failed'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
