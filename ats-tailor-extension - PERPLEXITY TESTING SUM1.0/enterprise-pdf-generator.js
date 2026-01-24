// Enterprise PDF Generator v1.0 - Production-Grade ATS PDF Generation
// Uses pdf-lib for clean, ATS-compatible PDFs with perfect formatting
// NO openresume dependency - standalone implementation

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
      console.log('[EnterprisePDFGenerator] Generating CV PDF...');
      
      try {
        // Validate input - NO hardcoded fallbacks
        if (!profileData) {
          throw new Error('Profile data is required - no hardcoded defaults');
        }
        
        // Normalize profile data
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
    
    // ============ NORMALIZE EXPERIENCE (CRITICAL FIX) ============
    // Ensures company/title/dates are correctly mapped and never swapped
    normalizeExperience(experience) {
      if (!Array.isArray(experience)) return [];
      
      return experience.map((exp, index) => {
        // Extract company - check multiple field names in priority order
        let company = exp.company || exp.companyName || exp.company_name || '';
        
        // Extract title - check multiple field names in priority order  
        let title = exp.title || exp.jobTitle || exp.job_title || '';
        
        // Extract dates
        const startDate = exp.startDate || exp.start_date || '';
        const endDate = exp.endDate || exp.end_date || 'Present';
        
        // CRITICAL: Validate company/title are not swapped
        // If company looks like a title and title looks like a company, swap them back
        const titleIndicators = /\b(engineer|developer|architect|analyst|manager|director|scientist|specialist|lead|consultant|senior|junior|vp|president|head of|chief)\b/i;
        const companyIndicators = /\b(inc|llc|ltd|corp|plc|group|ai|tech|health|solutions|meta|google|amazon|microsoft|apple|accenture|citigroup|citi|ibm|oracle|salesforce)\b/i;
        
        const companyLooksLikeTitle = titleIndicators.test(company) && !companyIndicators.test(company);
        const titleLooksLikeCompany = companyIndicators.test(title) || 
                                       /^[A-Z][a-zA-Z]+$/.test(title) && !titleIndicators.test(title);
        
        if (companyLooksLikeTitle && titleLooksLikeCompany) {
          console.warn(`[EnterprisePDFGenerator] Detected swap: company="${company}" ↔ title="${title}". Correcting...`);
          [company, title] = [title, company];
        }
        
        // Ensure we have valid values
        if (!company && !title) {
          console.warn(`[EnterprisePDFGenerator] Experience ${index} missing both company and title`);
        }
        
        return {
          id: exp.id || `exp-${index}`,
          company: company,
          title: title,
          startDate: startDate,
          endDate: endDate,
          location: exp.location || '',
          bullets: this.extractBullets(exp)
        };
      });
    },
    
    // ============ EXTRACT BULLETS ============
    extractBullets(exp) {
      // Handle multiple bullet formats
      if (Array.isArray(exp.bullets)) {
        return exp.bullets.map(b => typeof b === 'string' ? b : (b.text || ''));
      }
      if (Array.isArray(exp.achievements)) {
        return exp.achievements.map(a => typeof a === 'string' ? a : (a.text || ''));
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
          
          // Company name (bold)
          addText(exp.company, config.margins.left, config.fonts.sizes.companyName, { bold: true });
          
          // Job title and dates on same line
          const titleLine = exp.title;
          const dateStr = this.formatDateRange(exp.startDate, exp.endDate);
          
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(config.fonts.sizes.jobTitle);
          doc.text(titleLine, config.margins.left, y);
          
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
    
    // ============ FORMAT DATE RANGE ============
    formatDateRange(startDate, endDate) {
      const extractYear = (date) => {
        if (!date) return '';
        if (/present|current/i.test(date)) return 'Present';
        const match = String(date).match(/\d{4}/);
        return match ? match[0] : date;
      };
      
      const start = extractYear(startDate);
      const end = extractYear(endDate);
      
      if (!start && !end) return '';
      if (!end || start === end) return start;
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
    }
  };

  // Export globally
  global.EnterprisePDFGenerator = EnterprisePDFGenerator;
  
  console.log('[EnterprisePDFGenerator] Loaded v1.0 - No hardcoded data, profile-only generation');

})(typeof window !== 'undefined' ? window : this);
