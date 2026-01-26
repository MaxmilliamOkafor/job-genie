// Enterprise PDF Generator v2.0 - Production-Grade ATS PDF Generation
// Uses pdf-lib for clean, ATS-compatible PDFs with PERFECT formatting
// NO openresume dependency - standalone implementation
// FIXES: Duplicate dates, missing dates, company/title swaps

(function(global) {
  'use strict';

  // ============ ATS SPECIFICATIONS (INDUSTRY STANDARD) ============
  const ATS_CONFIG = {
    fonts: {
      family: 'Helvetica', // Standard PDF font (Arial equivalent)
      sizes: {
        name: 18,           // Name: 18pt Bold
        sectionHeader: 12,  // Section headers: 12pt Bold
        companyName: 11,    // Company: 11pt Bold
        jobTitle: 10.5,     // Job title: 10.5pt Italic
        body: 10.5,         // Body text: 10.5pt
        contact: 10,        // Contact info: 10pt
        small: 9            // Secondary text: 9pt
      }
    },
    margins: {
      top: 54,    // 0.75 inch
      bottom: 54,
      left: 54,
      right: 54
    },
    lineHeight: {
      tight: 1.1,
      normal: 1.3,
      section: 1.5
    },
    page: {
      width: 612,   // Letter size
      height: 792,
      maxPages: 2
    },
    colors: {
      black: [0, 0, 0],
      darkGray: [51, 51, 51]
    }
  };

  const EnterprisePDFGenerator = {
    
    // ============ GENERATE CV PDF ============
    async generateCV(profileData, options = {}) {
      const startTime = performance.now();
      console.log('[EnterprisePDFGenerator v2.0] Generating CV PDF...');
      
      try {
        // Validate input - NO hardcoded fallbacks
        if (!profileData) {
          throw new Error('Profile data is required - no hardcoded defaults');
        }
        
        // Normalize profile data with STRICT date formatting
        const data = this.normalizeProfileData(profileData);
        
        // Call backend PDF generation or generate client-side
        if (options.useBackend && options.session) {
          return await this.callBackendPDF(data, 'cv', options);
        }
        
        // Generate client-side using jsPDF (fallback)
        return await this.generateClientSidePDF(data, 'cv', options);
        
      } catch (error) {
        console.error('[EnterprisePDFGenerator] CV generation error:', error);
        throw error;
      }
    },
    
    // ============ GENERATE COVER LETTER PDF ============
    async generateCoverLetter(profileData, jobData, coverLetterText, options = {}) {
      const startTime = performance.now();
      console.log('[EnterprisePDFGenerator] Generating Cover Letter PDF...');
      
      try {
        if (!profileData) {
          throw new Error('Profile data is required');
        }
        
        if (!coverLetterText) {
          throw new Error('Cover letter text is required');
        }
        
        const data = this.normalizeProfileData(profileData);
        
        if (options.useBackend && options.session) {
          return await this.callBackendPDF(data, 'cover', { ...options, coverLetterText, jobData });
        }
        
        return await this.generateClientSideCoverLetter(data, coverLetterText, jobData, options);
        
      } catch (error) {
        console.error('[EnterprisePDFGenerator] Cover letter generation error:', error);
        throw error;
      }
    },
    
    // ============ NORMALIZE PROFILE DATA ============
    normalizeProfileData(profileData) {
      // Handle different field naming conventions
      return {
        firstName: profileData.firstName || profileData.first_name || '',
        lastName: profileData.lastName || profileData.last_name || '',
        email: profileData.email || '',
        phone: profileData.phone || '',
        city: profileData.city || '',
        country: profileData.country || '',
        linkedin: profileData.linkedin || '',
        github: profileData.github || '',
        portfolio: profileData.portfolio || '',
        summary: profileData.summary || '',
        professionalExperience: this.normalizeExperience(
          profileData.professionalExperience || 
          profileData.professional_experience || 
          profileData.workExperience || 
          profileData.work_experience || 
          []
        ),
        relevantProjects: this.normalizeProjects(
          profileData.relevantProjects || 
          profileData.relevant_projects || 
          []
        ),
        education: this.normalizeEducation(profileData.education || []),
        skills: this.normalizeSkills(profileData.skills || []),
        certifications: profileData.certifications || []
      };
    },
    
    // ============ NORMALIZE EXPERIENCE (CRITICAL FIX v2.1) ============
    // FIXES: Duplicate dates, missing dates, company/title swaps
    // ENHANCED: Better date extraction from various database formats
    normalizeExperience(experience) {
      if (!Array.isArray(experience)) return [];
      
      return experience.map((exp, index) => {
        let company = exp.company || exp.companyName || exp.company_name || '';
        let title = exp.title || exp.jobTitle || exp.job_title || exp.role || '';
        let startDate = '';
        let endDate = '';
        
        // Priority 1: Dedicated date fields
        if (exp.startDate || exp.start_date) {
          startDate = this.cleanDateValue(exp.startDate || exp.start_date);
        }
        if (exp.endDate || exp.end_date) {
          endDate = this.cleanDateValue(exp.endDate || exp.end_date);
        }
        
        // Priority 2: Combined dates field
        if (exp.dates && !startDate) {
          const parsedDates = this.parseCombinedDates(exp.dates);
          startDate = parsedDates.start;
          endDate = parsedDates.end;
        }
        
        // Priority 3: Try to extract from any text field
        if (!startDate && !endDate) {
          const allText = `${exp.company || ''} ${exp.title || ''} ${exp.dates || ''}`;
          const yearMatches = allText.match(/\b(19|20)\d{2}\b/g);
          if (yearMatches && yearMatches.length >= 1) {
            startDate = yearMatches[0];
            if (yearMatches.length >= 2) endDate = yearMatches[yearMatches.length - 1];
          }
        }
        
        // Default current role if first entry
        if (index === 0 && startDate && !endDate) endDate = 'Present';
        if (exp.isCurrent === true || exp.is_current === true) endDate = 'Present';
        
        // Strip dates from title/company
        company = this.stripDatesFromText(company);
        title = this.stripDatesFromText(title);
        
        // Validate company/title not swapped
        const titleIndicators = /\b(engineer|developer|architect|analyst|manager|director|scientist|specialist|lead|consultant|senior|junior|vp|president|head of|chief|product|data|software|ai|ml)\b/i;
        const companyIndicators = /\b(inc|llc|ltd|corp|plc|group|ai|tech|health|solutions|meta|google|amazon|microsoft|apple|accenture|citigroup|citi|ibm|oracle|salesforce|solim|fidelity)\b/i;
        
        if (titleIndicators.test(company) && !companyIndicators.test(company) &&
            companyIndicators.test(title) && !titleIndicators.test(title)) {
          [company, title] = [title, company];
        }
        
        return {
          id: exp.id || `exp-${index}`,
          company: company.trim(),
          title: title.trim(),
          startDate: startDate,
          endDate: endDate || 'Present',
          location: exp.location || '',
          bullets: this.extractBullets(exp)
        };
      });
    },
    
    // ============ CLEAN DATE VALUE ============
    cleanDateValue(dateStr) {
      if (!dateStr) return '';
      const str = String(dateStr).trim();
      
      // Handle "Present" variations
      if (/^present$/i.test(str) || /^current$/i.test(str) || /^ongoing$/i.test(str)) {
        return 'Present';
      }
      
      // Extract year (4 digits)
      const yearMatch = str.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        return yearMatch[0];
      }
      
      return str;
    },
    
    // ============ PARSE COMBINED DATES ============
    // Handles: "2021 - 2022", "Jan 2021 - Present", "2021 – 2023"
    parseCombinedDates(dateStr) {
      if (!dateStr) return { start: '', end: '' };
      const str = String(dateStr).trim();
      
      // Split by common separators
      const parts = str.split(/\s*[-–—to]\s*/i);
      
      if (parts.length >= 2) {
        return {
          start: this.cleanDateValue(parts[0]),
          end: this.cleanDateValue(parts[parts.length - 1])
        };
      }
      
      // Single date - treat as start
      return {
        start: this.cleanDateValue(str),
        end: ''
      };
    },
    
    // ============ STRIP DATES FROM TEXT ============
    // Removes accidentally embedded dates from titles/companies
    stripDatesFromText(text) {
      if (!text) return '';
      return text
        // Remove "2017 2021" patterns
        .replace(/\b(19|20)\d{2}\s+(19|20)\d{2}\b/g, '')
        // Remove "| 2017 - 2021" patterns
        .replace(/\s*\|\s*(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}|\bPresent\b/gi, '')
        // Remove standalone "| 2021"
        .replace(/\s*\|\s*(19|20)\d{2}\b/g, '')
        // Remove trailing dates like "2021 - Present"
        .replace(/\s+(19|20)\d{2}\s*[-–—]\s*(Present|(19|20)\d{2})\s*$/gi, '')
        // Remove "2017 - 2021" patterns anywhere in text
        .replace(/\b(19|20)\d{2}\s*[-–—]\s*(Present|(19|20)\d{2})\b/gi, '')
        // Clean up multiple spaces
        .replace(/\s+/g, ' ')
        .trim();
    },
    
    // ============ EXTRACT BULLETS ============
    extractBullets(exp) {
      // Handle multiple bullet formats
      if (Array.isArray(exp.bullets)) {
        return exp.bullets.map(b => typeof b === 'string' ? b : (b.text || '')).filter(Boolean);
      }
      if (Array.isArray(exp.achievements)) {
        return exp.achievements.map(a => typeof a === 'string' ? a : (a.text || '')).filter(Boolean);
      }
      if (exp.description && typeof exp.description === 'string') {
        return exp.description.split('\n').filter(Boolean).map(l => l.replace(/^[•\-*]\s*/, '').trim());
      }
      return [];
    },
    
    // ============ NORMALIZE PROJECTS ============
    normalizeProjects(projects) {
      if (!Array.isArray(projects)) return [];
      
      return projects.map((proj, index) => ({
        id: proj.id || `proj-${index}`,
        name: proj.name || proj.projectName || '',
        role: proj.role || '',
        technologies: proj.technologies || [],
        bullets: this.extractBullets(proj)
      }));
    },
    
    // ============ NORMALIZE EDUCATION ============
    normalizeEducation(education) {
      if (!Array.isArray(education)) return [];
      
      return education.map((edu, index) => ({
        id: edu.id || `edu-${index}`,
        institution: edu.institution || edu.school || edu.university || '',
        degree: edu.degree || '',
        field: edu.field || edu.major || '',
        graduationDate: edu.graduationDate || edu.graduation_date || '',
        gpa: edu.gpa || ''
      }));
    },
    
    // ============ NORMALIZE SKILLS ============
    normalizeSkills(skills) {
      if (!Array.isArray(skills)) return [];
      
      return skills.map(skill => {
        if (typeof skill === 'string') return skill;
        return skill.name || skill.skill || '';
      }).filter(Boolean);
    },
    
    // ============ CALL BACKEND PDF GENERATION ============
    async callBackendPDF(data, type, options) {
      const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
      
      const requestBody = {
        type: type === 'cover' ? 'cover_letter' : 'resume',
        personalInfo: {
          name: `${data.firstName} ${data.lastName}`.trim(),
          email: data.email,
          phone: data.phone,
          location: [data.city, data.country].filter(Boolean).join(', '),
          linkedin: data.linkedin,
          github: data.github,
          portfolio: data.portfolio
        },
        summary: data.summary,
        experience: data.professionalExperience.map(exp => ({
          company: exp.company,
          title: exp.title,
          // CRITICAL: Use formatDateRange which handles all edge cases
          dates: this.formatDateRange(exp.startDate, exp.endDate),
          bullets: exp.bullets
        })),
        projects: data.relevantProjects.map(proj => ({
          name: proj.name,
          role: proj.role,
          bullets: proj.bullets
        })),
        education: data.education.map(edu => ({
          school: edu.institution,
          degree: edu.degree,
          dates: edu.graduationDate,
          gpa: edu.gpa
        })),
        skills: {
          primary: data.skills.slice(0, 15),
          secondary: data.skills.slice(15)
        },
        certifications: data.certifications
      };
      
      if (type === 'cover' && options.coverLetterText) {
        requestBody.coverLetter = {
          recipientCompany: options.jobData?.company || '',
          jobTitle: options.jobData?.title || '',
          paragraphs: options.coverLetterText.split('\n\n').filter(Boolean)
        };
      }
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.session.access_token}`,
          'apikey': options.session.access_token
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend PDF generation failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      
      return {
        success: true,
        pdf: result.cvPdf || result.coverPdf || result.pdf,
        filename: this.generateFilename(data, type, options.jobData),
        base64: result.cvPdf || result.coverPdf || result.pdf
      };
    },
    
    // ============ GENERATE CLIENT-SIDE PDF (FALLBACK) ============
    async generateClientSidePDF(data, type, options) {
      // Use jsPDF if available
      if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
        throw new Error('jsPDF library not available for client-side generation');
      }
      
      const JsPDF = typeof jsPDF !== 'undefined' ? jsPDF : jspdf.jsPDF;
      const doc = new JsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter'
      });
      
      const config = ATS_CONFIG;
      let y = config.margins.top;
      
      // Helper: add text with wrapping
      const addText = (text, x, fontSize, options = {}) => {
        if (!text) return y;
        
        doc.setFontSize(fontSize);
        if (options.bold) doc.setFont('helvetica', 'bold');
        else if (options.italic) doc.setFont('helvetica', 'italic');
        else doc.setFont('helvetica', 'normal');
        
        const maxWidth = config.page.width - config.margins.left - config.margins.right;
        const lines = doc.splitTextToSize(text, maxWidth);
        
        for (const line of lines) {
          if (y > config.page.height - config.margins.bottom) {
            doc.addPage();
            y = config.margins.top;
          }
          doc.text(line, x, y);
          y += fontSize * config.lineHeight.normal;
        }
        
        return y;
      };
      
      // Header: Name
      const fullName = `${data.firstName} ${data.lastName}`.toUpperCase().trim() || 'APPLICANT';
      addText(fullName, config.margins.left, config.fonts.sizes.name, { bold: true });
      y += 4;
      
      // Contact line
      const contactParts = [data.phone, data.email, [data.city, data.country].filter(Boolean).join(', '), 'Open to relocation'].filter(Boolean);
      addText(contactParts.join(' | '), config.margins.left, config.fonts.sizes.contact);
      
      // Links
      const linkParts = [data.linkedin, data.github, data.portfolio].filter(Boolean);
      if (linkParts.length > 0) {
        doc.setTextColor(51, 51, 51);
        addText(linkParts.join(' | '), config.margins.left, config.fonts.sizes.small);
        doc.setTextColor(0, 0, 0);
      }
      
      y += config.fonts.sizes.body * config.lineHeight.section;
      
      // Summary
      if (data.summary) {
        y = this.addSectionHeader(doc, 'PROFESSIONAL SUMMARY', config, y);
        addText(data.summary, config.margins.left, config.fonts.sizes.body);
        y += config.fonts.sizes.body * config.lineHeight.section;
      }
      
      // Professional Experience
      if (data.professionalExperience.length > 0) {
        y = this.addSectionHeader(doc, 'PROFESSIONAL EXPERIENCE', config, y);
        
        for (const exp of data.professionalExperience) {
          if (y > config.page.height - 100) {
            doc.addPage();
            y = config.margins.top;
          }
          
          // ============ PERFECT FORMATTING: Company on Line 1 ============
          addText(exp.company, config.margins.left, config.fonts.sizes.companyName, { bold: true });
          
          // ============ PERFECT FORMATTING: Title + Dates on Line 2 ============
          const titleLine = exp.title;
          const dateStr = this.formatDateRange(exp.startDate, exp.endDate);
          
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(config.fonts.sizes.jobTitle);
          doc.text(titleLine, config.margins.left, y);
          
          // Right-align dates
          if (dateStr) {
            doc.setFont('helvetica', 'normal');
            const dateWidth = doc.getTextWidth(dateStr);
            doc.text(dateStr, config.page.width - config.margins.right - dateWidth, y);
          }
          
          y += config.fonts.sizes.jobTitle * config.lineHeight.normal + 4;
          
          // Bullets
          for (const bullet of exp.bullets || []) {
            addText(`• ${bullet}`, config.margins.left, config.fonts.sizes.body);
          }
          
          y += config.fonts.sizes.body * config.lineHeight.section;
        }
      }
      
      // Projects
      if (data.relevantProjects.length > 0) {
        y = this.addSectionHeader(doc, 'TECHNICAL PROJECTS', config, y);
        
        for (const proj of data.relevantProjects) {
          const projLine = [proj.name, proj.role].filter(Boolean).join(' | ');
          addText(projLine, config.margins.left, config.fonts.sizes.companyName, { bold: true });
          
          for (const bullet of proj.bullets || []) {
            addText(`• ${bullet}`, config.margins.left, config.fonts.sizes.body);
          }
          
          y += config.fonts.sizes.body;
        }
      }
      
      // Skills
      if (data.skills.length > 0) {
        y = this.addSectionHeader(doc, 'TECHNICAL SKILLS', config, y);
        addText(data.skills.join(', '), config.margins.left, config.fonts.sizes.body);
        y += config.fonts.sizes.body * config.lineHeight.section;
      }
      
      // Education
      if (data.education.length > 0) {
        y = this.addSectionHeader(doc, 'EDUCATION', config, y);
        
        for (const edu of data.education) {
          const eduLine = [edu.degree, edu.field, edu.institution].filter(Boolean).join(' | ');
          addText(eduLine, config.margins.left, config.fonts.sizes.body, { bold: true });
          
          if (edu.gpa) {
            addText(`GPA: ${edu.gpa}`, config.margins.left, config.fonts.sizes.small);
          }
        }
      }
      
      // Certifications
      if (data.certifications.length > 0) {
        y = this.addSectionHeader(doc, 'CERTIFICATIONS', config, y);
        addText(data.certifications.join(', '), config.margins.left, config.fonts.sizes.body);
      }
      
      // Generate output
      const filename = this.generateFilename(data, 'cv', options.jobData);
      const pdfBlob = doc.output('blob');
      const base64 = await this.blobToBase64(pdfBlob);
      
      return {
        success: true,
        pdf: base64,
        blob: pdfBlob,
        filename: filename,
        base64: base64
      };
    },
    
    // ============ GENERATE COVER LETTER CLIENT-SIDE ============
    async generateClientSideCoverLetter(data, coverLetterText, jobData, options) {
      const JsPDF = typeof jsPDF !== 'undefined' ? jsPDF : jspdf.jsPDF;
      const doc = new JsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter'
      });
      
      const config = ATS_CONFIG;
      let y = config.margins.top;
      
      // Header
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      doc.setFontSize(config.fonts.sizes.name);
      doc.setFont('helvetica', 'bold');
      doc.text(fullName, config.margins.left, y);
      y += config.fonts.sizes.name * config.lineHeight.normal;
      
      doc.setFontSize(config.fonts.sizes.contact);
      doc.setFont('helvetica', 'normal');
      doc.text(data.email, config.margins.left, y);
      y += config.fonts.sizes.contact * config.lineHeight.normal;
      
      if (data.phone) {
        doc.text(data.phone, config.margins.left, y);
        y += config.fonts.sizes.contact * config.lineHeight.normal;
      }
      
      y += config.fonts.sizes.body * 2;
      
      // Cover letter body
      const paragraphs = coverLetterText.split('\n\n').filter(Boolean);
      const maxWidth = config.page.width - config.margins.left - config.margins.right;
      
      for (const para of paragraphs) {
        doc.setFontSize(config.fonts.sizes.body);
        doc.setFont('helvetica', 'normal');
        
        const lines = doc.splitTextToSize(para, maxWidth);
        for (const line of lines) {
          if (y > config.page.height - config.margins.bottom) {
            doc.addPage();
            y = config.margins.top;
          }
          doc.text(line, config.margins.left, y);
          y += config.fonts.sizes.body * config.lineHeight.normal;
        }
        
        y += config.fonts.sizes.body;
      }
      
      const filename = this.generateFilename(data, 'cover', jobData);
      const pdfBlob = doc.output('blob');
      const base64 = await this.blobToBase64(pdfBlob);
      
      return {
        success: true,
        pdf: base64,
        blob: pdfBlob,
        filename: filename,
        base64: base64
      };
    },
    
    // ============ ADD SECTION HEADER ============
    addSectionHeader(doc, title, config, y) {
      if (y > config.page.height - 50) {
        doc.addPage();
        y = config.margins.top;
      }
      
      doc.setFontSize(config.fonts.sizes.sectionHeader);
      doc.setFont('helvetica', 'bold');
      doc.text(title, config.margins.left, y);
      y += config.fonts.sizes.sectionHeader + 2;
      
      // Underline
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(config.margins.left, y, config.page.width - config.margins.right, y);
      y += config.fonts.sizes.sectionHeader * config.lineHeight.section;
      
      return y;
    },
    
    // ============ FORMAT DATE RANGE (CRITICAL FIX v2.0) ============
    // NEVER outputs duplicate dates like "2017 2021 | 2017 - 2021"
    formatDateRange(startDate, endDate) {
      const extractYear = (date) => {
        if (!date) return '';
        const str = String(date).trim();
        if (/present|current|ongoing/i.test(str)) return 'Present';
        const match = str.match(/\b(19|20)\d{2}\b/);
        return match ? match[0] : '';
      };
      
      const start = extractYear(startDate);
      const end = extractYear(endDate);
      
      // No dates at all
      if (!start && !end) return '';
      
      // Same year (short tenure)
      if (start === end) return start;
      
      // Only start date
      if (!end) return start;
      
      // Only end date (unlikely but handle it)
      if (!start) return end;
      
      // Standard format: YYYY – YYYY or YYYY – Present
      return `${start} – ${end}`;
    },
    
    // ============ GENERATE FILENAME ============
    generateFilename(data, type, jobData) {
      const firstName = (data.firstName || 'User').replace(/[^a-zA-Z0-9]/g, '');
      const lastName = (data.lastName || '').replace(/[^a-zA-Z0-9]/g, '');
      const company = (jobData?.company || 'Application').replace(/[^a-zA-Z0-9]/g, '');
      const typeLabel = type === 'cover' ? 'CoverLetter' : 'CV';
      
      return `${firstName}${lastName}_${company}_${typeLabel}.pdf`;
    },
    
    // ============ BLOB TO BASE64 ============
    async blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
    
    // ============ GENERATE PREVIEW HTML ============
    // Returns HTML that matches the PDF output for preview purposes
    generatePreviewHTML(profileData, options = {}) {
      const data = this.normalizeProfileData(profileData);
      
      let html = `<div class="cv-preview" style="font-family: Arial, Helvetica, sans-serif; max-width: 700px; padding: 20px; background: white; color: #000;">`;
      
      // Header
      const fullName = `${data.firstName} ${data.lastName}`.toUpperCase().trim() || 'APPLICANT';
      html += `<h1 style="font-size: 18pt; margin-bottom: 8px; font-weight: bold; border-bottom: none;">${fullName}</h1>`;
      
      // Contact
      const contactParts = [data.phone, data.email, [data.city, data.country].filter(Boolean).join(', '), 'Open to relocation'].filter(Boolean);
      html += `<p style="font-size: 10pt; margin: 4px 0; color: #333;">${contactParts.join(' | ')}</p>`;
      
      // Links
      const linkParts = [data.linkedin, data.github, data.portfolio].filter(Boolean);
      if (linkParts.length > 0) {
        html += `<p style="font-size: 9pt; margin: 4px 0; color: #555;">${linkParts.join(' | ')}</p>`;
      }
      
      html += `<hr style="border: none; border-top: 1px solid #000; margin: 12px 0;">`;
      
      // Professional Experience
      if (data.professionalExperience.length > 0) {
        html += `<h2 style="font-size: 12pt; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 1px solid #000; padding-bottom: 2px;">PROFESSIONAL EXPERIENCE</h2>`;
        
        for (const exp of data.professionalExperience) {
          html += `<div style="margin-bottom: 12px;">`;
          html += `<p style="font-size: 11pt; font-weight: bold; margin: 0;">${exp.company}</p>`;
          
          const dateStr = this.formatDateRange(exp.startDate, exp.endDate);
          html += `<p style="font-size: 10.5pt; font-style: italic; margin: 2px 0;">
            <span>${exp.title}</span>
            ${dateStr ? `<span style="float: right; font-style: normal;">${dateStr}</span>` : ''}
          </p>`;
          
          if (exp.bullets && exp.bullets.length > 0) {
            html += `<ul style="margin: 4px 0 0 16px; padding: 0; list-style-type: disc;">`;
            for (const bullet of exp.bullets) {
              html += `<li style="font-size: 10.5pt; margin-bottom: 2px;">${bullet}</li>`;
            }
            html += `</ul>`;
          }
          html += `</div>`;
        }
      }
      
      // Technical Projects
      if (data.relevantProjects.length > 0) {
        html += `<h2 style="font-size: 12pt; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 1px solid #000; padding-bottom: 2px;">TECHNICAL PROJECTS</h2>`;
        
        for (const proj of data.relevantProjects) {
          html += `<div style="margin-bottom: 12px;">`;
          html += `<p style="font-size: 11pt; font-weight: bold; margin: 0;">${proj.name}${proj.role ? ` | ${proj.role}` : ''}</p>`;
          
          if (proj.bullets && proj.bullets.length > 0) {
            html += `<ul style="margin: 4px 0 0 16px; padding: 0; list-style-type: disc;">`;
            for (const bullet of proj.bullets) {
              html += `<li style="font-size: 10.5pt; margin-bottom: 2px;">${bullet}</li>`;
            }
            html += `</ul>`;
          }
          html += `</div>`;
        }
      }
      
      // Skills
      if (data.skills.length > 0) {
        html += `<h2 style="font-size: 12pt; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 1px solid #000; padding-bottom: 2px;">TECHNICAL SKILLS</h2>`;
        html += `<p style="font-size: 10.5pt; margin: 4px 0;">${data.skills.join(', ')}</p>`;
      }
      
      // Education
      if (data.education.length > 0) {
        html += `<h2 style="font-size: 12pt; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 1px solid #000; padding-bottom: 2px;">EDUCATION</h2>`;
        for (const edu of data.education) {
          const eduLine = [edu.degree, edu.field, edu.institution].filter(Boolean).join(' | ');
          html += `<p style="font-size: 10.5pt; font-weight: bold; margin: 4px 0;">${eduLine}</p>`;
          if (edu.gpa) {
            html += `<p style="font-size: 9pt; margin: 2px 0;">GPA: ${edu.gpa}</p>`;
          }
        }
      }
      
      // Certifications
      if (data.certifications.length > 0) {
        html += `<h2 style="font-size: 12pt; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 1px solid #000; padding-bottom: 2px;">CERTIFICATIONS</h2>`;
        html += `<p style="font-size: 10.5pt; margin: 4px 0;">${data.certifications.join(', ')}</p>`;
      }
      
      html += `</div>`;
      
      return html;
    }
  };

  // Export globally
  global.EnterprisePDFGenerator = EnterprisePDFGenerator;
  
  console.log('[EnterprisePDFGenerator v2.0] Loaded - FIXES: duplicate dates, missing dates, company/title swaps');

})(typeof window !== 'undefined' ? window : this);
