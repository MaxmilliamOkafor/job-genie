// pdf-ats-turbo.js - 100% ATS-Parseable PDF Generator v1.2 (Professional Template)
// PERFECT FORMAT: Arial 10.5pt, 0.75" margins, 1.15 line height, UTF-8 text-only
// FIXED: Skills section formatting, no ALL CAPS skills, proper text wrapping, compact education

(function() {
  'use strict';

  const PDFATSTurbo = {
    // ============ PDF CONFIGURATION (ATS-PERFECT - RECRUITER APPROVED) ============
    CONFIG: {
      // Font: Arial 10.5pt (ATS Universal - recruiter scannable)
      font: 'helvetica', // jsPDF uses helvetica as Arial equivalent
      fontSize: {
        name: 14,
        sectionTitle: 11,
        body: 10.5,  // CRITICAL: 10.5pt as specified
        small: 9
      },
      // Margins: 0.75 inches all sides (54pt) - ATS standard
      margins: {
        top: 54,
        bottom: 54,
        left: 54,
        right: 54
      },
      // Line spacing: 1.15 - ATS optimal
      lineHeight: 1.15,
      // A4 dimensions in points
      pageWidth: 595.28,
      pageHeight: 841.89,
      // Encoding: UTF-8 text-only
      encoding: 'UTF-8'
    },

    // ============ CORE TECHNICAL SKILLS (MAX 20, NO JOB KEYWORDS) ============
    CORE_SKILLS_LIMIT: 20,

    // ============ SOFT SKILLS TO EXCLUDE FROM DISPLAY ============
    EXCLUDED_SOFT_SKILLS: new Set([
      'good learning', 'communication skills', 'love for technology', 
      'able to withstand work pressure', 'system integration', 'collaboration',
      'problem-solving', 'teamwork', 'leadership', 'initiative', 'ownership',
      'passion', 'dedication', 'motivation', 'self-starter', 'communication',
      'interpersonal', 'proactive', 'detail-oriented', 'hard-working', 'team player'
    ]),

    sanitizeGeneratedText(rawText, type = 'cv') {
      if (rawText == null) return '';
      let text = typeof rawText === 'string' ? rawText.trim() : String(rawText);
      if (!text) return '';

      const keyPriority = type === 'cover'
        ? ['tailoredCoverLetter', 'coverLetter', 'tailored_cover_letter']
        : ['tailoredResume', 'resume', 'cv', 'tailoredCV', 'tailored_resume'];

      const quotedValueRegex = '(?:\\\\.|[^"\\\\])*';
      for (const key of keyPriority) {
        const regex = new RegExp(`"${key}"\\s*:\\s*"(${quotedValueRegex})"`, 'i');
        const match = text.match(regex);
        if (match && match[1]) {
          try {
            text = JSON.parse(`"${match[1].replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
          } catch (_error) {
            text = match[1];
          }
          break;
        }
      }

      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          const value = type === 'cover'
            ? (parsed.tailoredCoverLetter || parsed.coverLetter || parsed.tailored_cover_letter)
            : (parsed.tailoredResume || parsed.resume || parsed.cv || parsed.tailoredCV || parsed.tailored_resume);
          if (typeof value === 'string' && value.trim()) {
            text = value.trim();
          }
        }
      } catch (_ignore) {
      }

      return text
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '  ')
        .replace(/–/g, '–')
        .replace(/—/g, '—')
        .replace(/•/g, '•')
        .replace(/^"+/, '')
        .replace(/"+$/, '')
        .trim();
    },

    // ============ GENERATE ATS-PERFECT CV PDF (Professional Template) ============
    async generateATSPerfectCV(candidateData, tailoredCV, jobData, workExperienceKeywords = []) {
      const startTime = performance.now();
      console.log('[PDFATSTurbo] Generating ATS-perfect CV (Professional Template)...');

      // Parse and format CV content
      const formattedContent = this.formatCVForATS(tailoredCV, candidateData, workExperienceKeywords);
      
      // Build PDF text (UTF-8 text-only binary)
      const pdfText = this.buildPDFText(formattedContent);
      
      // Generate filename: {FirstName}_{LastName}_CV.pdf (EXACT FORMAT)
      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant').replace(/\s+/g, '_').replace(/[^a-zA-Z_]/g, '');
      const lastName = (candidateData?.lastName || candidateData?.last_name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z_]/g, '');
      const fileName = lastName ? `${firstName}_${lastName}_CV.pdf` : `${firstName}_CV.pdf`;

      let pdfBase64 = null;
      let pdfBlob = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const pdfResult = await this.generateWithJsPDF(formattedContent, candidateData);
        pdfBase64 = pdfResult.base64;
        pdfBlob = pdfResult.blob;
      } else {
        // Fallback: text-based PDF
        pdfBase64 = btoa(unescape(encodeURIComponent(pdfText)));
      }

      const timing = performance.now() - startTime;
      console.log(`[PDFATSTurbo] CV PDF generated in ${timing.toFixed(0)}ms`);

      return {
        pdf: pdfBase64,
        blob: pdfBlob,
        fileName,
        text: pdfText,
        formattedContent,
        timing,
        size: pdfBase64 ? Math.round(pdfBase64.length * 0.75 / 1024) : 0
      };
    },

    // ============ FORMAT CV FOR ATS ============
    formatCVForATS(cvText, candidateData, workExperienceKeywords = []) {
      const sections = {};
      const normalizedCvText = this.sanitizeGeneratedText(cvText, 'cv');
      
      // CONTACT INFORMATION
      sections.contact = this.buildContactSection(candidateData);
      
      // Parse existing CV sections
      const parsed = this.parseCVSections(cvText);
      const parsed = this.parseCVSections(normalizedCvText);

      // PROFESSIONAL SUMMARY
      sections.summary = parsed.summary || '';

      // EXPERIENCE - Already has keywords injected from tailorCV
      sections.experience = parsed.experience || '';

      // SKILLS - FIXED: Proper formatting, no ALL CAPS, comma-separated
      sections.skills = this.formatCleanSkillsSection(parsed.skills);

      // EDUCATION - FIXED: Compact single-line format
      sections.education = this.formatEducationSection(parsed.education);

      // CERTIFICATIONS - FIXED: Comma-separated, no bullet spam
      sections.certifications = this.formatCertificationsSection(parsed.certifications);

      // REMOVED: Technical Proficiencies section (was showing soft skills spam)
      // If meaningful proficiencies exist, merge them into skills
      if (parsed.technicalProficiencies) {
        const meaningfulProfs = this.extractMeaningfulProficiencies(parsed.technicalProficiencies);
        if (meaningfulProfs && sections.skills) {
          sections.skills = sections.skills + ', ' + meaningfulProfs;
        }
      }

@@ -706,56 +755,59 @@
      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const { jsPDF } = jspdf;
        const { font, fontSize, margins, lineHeight, pageWidth, pageHeight } = this.CONFIG;
        const contentWidth = pageWidth - margins.left - margins.right - 10;
        
        const doc = new jsPDF({ format: 'a4', unit: 'pt' });
        doc.setFont(font, 'normal');
        doc.setFontSize(fontSize.body);
        
        let yPos = margins.top;
        
        // Helper with page break handling
        const addCoverText = (text, isBold = false) => {
          doc.setFont(font, isBold ? 'bold' : 'normal');
          const lines = doc.splitTextToSize(text, contentWidth);
          lines.forEach(line => {
            if (yPos > pageHeight - margins.bottom - 20) {
              doc.addPage();
              yPos = margins.top;
            }
            doc.text(line, margins.left, yPos);
            yPos += fontSize.body * lineHeight + 2;
          });
        };
        
        const normalizedCoverLetter = this.sanitizeGeneratedText(coverLetterText, 'cover');

        // Split cover letter into paragraphs
        const paragraphs = coverLetterText.split('\n\n');
        const paragraphs = normalizedCoverLetter.split('\n\n');
        paragraphs.forEach((para, idx) => {
          const trimmed = para.trim();
          if (!trimmed) return;
          
          addCoverText(trimmed);
          yPos += 8; // Paragraph spacing
        });
        
        pdfBlob = doc.output('blob');
        pdfBase64 = doc.output('datauristring').split(',')[1];
      } else {
        pdfBase64 = btoa(unescape(encodeURIComponent(coverLetterText)));
        const normalizedCoverLetter = this.sanitizeGeneratedText(coverLetterText, 'cover');
        pdfBase64 = btoa(unescape(encodeURIComponent(normalizedCoverLetter)));
      }

      const timing = performance.now() - startTime;
      console.log(`[PDFATSTurbo] Cover Letter PDF generated in ${timing.toFixed(0)}ms`);

      return { pdf: pdfBase64, blob: pdfBlob, fileName, timing };
    }
  };

  // Export globally
  if (typeof window !== 'undefined') {
    window.PDFATSTurbo = PDFATSTurbo;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PDFATSTurbo;
  }
})();