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
  fileName?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: ResumeData = await req.json();
    console.log('Generating PDF for:', data.type, data.personalInfo?.name);

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

    // Helper function to wrap text
    const wrapText = (text: string, maxWidth: number, font: typeof helvetica, fontSize: number): string[] => {
      const words = text.split(' ');
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

    if (data.type === 'resume') {
      // === RESUME GENERATION ===
      
      // Header - Name
      page.drawText(data.personalInfo.name, {
        x: margin,
        y: yPosition,
        size: 24,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 28;

      // Contact info line
      const contactParts = [
        data.personalInfo.phone,
        data.personalInfo.email,
        data.personalInfo.location,
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
        data.personalInfo.linkedin ? `LinkedIn: ${data.personalInfo.linkedin}` : null,
        data.personalInfo.github ? `GitHub: ${data.personalInfo.github}` : null,
        data.personalInfo.portfolio ? `Portfolio: ${data.personalInfo.portfolio}` : null,
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
      if (data.summary) {
        addSectionHeader('Professional Summary');
        addWrappedText(data.summary, margin, 10, helvetica, colors.darkGray);
        yPosition -= sectionGap / 2;
      }

      // Experience
      if (data.experience && data.experience.length > 0) {
        addSectionHeader('Work Experience');
        
        for (const exp of data.experience) {
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
            page.drawText('•', {
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
      if (data.education && data.education.length > 0) {
        addSectionHeader('Education');
        
        for (const edu of data.education) {
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
      if (data.skills) {
        addSectionHeader('Skills');
        
        if (data.skills.primary && data.skills.primary.length > 0) {
          page.drawText('Primary:', {
            x: margin,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.darkGray,
          });
          addWrappedText(data.skills.primary.join(', '), margin + 50, 10, helvetica, colors.darkGray);
        }
        
        if (data.skills.secondary && data.skills.secondary.length > 0) {
          page.drawText('Additional:', {
            x: margin,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: colors.darkGray,
          });
          addWrappedText(data.skills.secondary.join(', '), margin + 60, 10, helvetica, colors.darkGray);
        }
      }

      // Certifications
      if (data.certifications && data.certifications.length > 0) {
        addSectionHeader('Certifications');
        addWrappedText(data.certifications.join(' • '), margin, 10, helvetica, colors.darkGray);
      }

      // Achievements
      if (data.achievements && data.achievements.length > 0) {
        addSectionHeader('Achievements');
        
        for (const achievement of data.achievements) {
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

    } else if (data.type === 'cover_letter' && data.coverLetter) {
      // === COVER LETTER GENERATION ===
      
      // Header - Name
      page.drawText(data.personalInfo.name, {
        x: margin,
        y: yPosition,
        size: 20,
        font: helveticaBold,
        color: colors.black,
      });
      yPosition -= 24;

      // Contact info
      const contactLine = [data.personalInfo.phone, data.personalInfo.email].filter(Boolean).join(' | ');
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
      
      page.drawText(data.coverLetter.recipientCompany, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: colors.darkGray,
      });
      yPosition -= lineHeight * 2;

      // Subject line
      let subject = `Re: ${data.coverLetter.jobTitle}`;
      if (data.coverLetter.jobId) {
        subject += ` - Job ID: ${data.coverLetter.jobId}`;
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
      for (const paragraph of data.coverLetter.paragraphs) {
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

      page.drawText(data.personalInfo.name, {
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

    const fileName = data.fileName || 
      (data.type === 'resume' 
        ? `${data.personalInfo.name.replace(/\s+/g, '')}_CV.pdf`
        : `${data.personalInfo.name.replace(/\s+/g, '')}_CoverLetter.pdf`);

    console.log('PDF generated successfully:', fileName, 'Size:', pdfBytes.length);

    return new Response(
      JSON.stringify({ 
        success: true,
        pdf: base64Pdf,
        fileName,
        size: pdfBytes.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('PDF generation error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
