// CV Formatter Perfect v2.0 - 100% ATS-Compatible CV Generator
// ALWAYS uses backend generate-pdf for perfect formatting
// Guarantees perfect formatting for both preview and download

(function(global) {
  'use strict';

  const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

  // ============ ATS SPECIFICATIONS (Industry Standard) ============
  const ATS_CONFIG = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: {
      name: '18pt',
      sectionTitle: '12pt',
      body: '10.5pt',
      small: '9pt'
    },
    lineHeight: {
      tight: '1.1',
      normal: '1.15',
      relaxed: '1.25'
    },
    margins: {
      top: '54pt',
      bottom: '54pt',
      left: '54pt',
      right: '54pt'
    },
    pageSize: 'A4',
    maxPages: 2,
    colors: {
      text: '#000000',
      secondary: '#333333',
      accent: '#000000'
    }
  };

  // ============ CV FORMATTER PERFECT ============
  const CVFormatterPerfect = {
    
    // ============ MAIN ENTRY POINT - USES BACKEND ============
    async generateCV(candidateData, tailoredContent, jobData = null, session = null) {
      const startTime = performance.now();
      console.log('[CVFormatterPerfect] Generating perfectly formatted CV via backend...');

      try {
        // Parse and structure the content
        const cvData = this.parseCVData(candidateData, tailoredContent, jobData);
        
        // Generate HTML preview (for display)
        const htmlContent = this.generateHTML(cvData);
        
        // Generate plain text version
        const textContent = this.generateText(cvData);
        
        // Generate PDF via BACKEND (guaranteed perfect formatting)
        let pdfResult = null;
        try {
          pdfResult = await this.generatePDFViaBackend(cvData, session);
        } catch (err) {
          console.warn('[CVFormatterPerfect] Backend PDF generation failed, using fallback:', err.message);
          pdfResult = await this.generatePDFClientFallback(cvData);
        }

        const timing = performance.now() - startTime;
        console.log(`[CVFormatterPerfect] CV generated in ${timing.toFixed(0)}ms`);

        return {
          html: htmlContent,
          text: textContent,
          pdf: pdfResult?.pdf || null,
          blob: pdfResult?.blob || null,
          filename: pdfResult?.filename || this.getFilename(cvData.contact),
          data: cvData,
          timing
        };

      } catch (error) {
        console.error('[CVFormatterPerfect] Error generating CV:', error);
        throw error;
      }
    },

    // ============ GENERATE PDF VIA BACKEND (RECOMMENDED) ============
    async generatePDFViaBackend(cvData, session = null) {
      const { contact, summary, experience, education, skills, certifications } = cvData;
      
      // Build the request payload in the format the backend expects
      const payload = {
        type: 'resume',
        personalInfo: {
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          location: contact.location ? `${contact.location} | open to relocation` : '',
          linkedin: contact.linkedin || '',
          github: contact.github || ''
        },
        summary: summary || '',
        experience: experience.map(job => ({
          company: job.company,
          title: job.title,
          dates: job.dates,
          bullets: job.bullets || []
        })),
        education: education.map(edu => ({
          degree: edu.degree,
          school: edu.institution,
          dates: edu.date,
          gpa: edu.gpa ? edu.gpa.replace('GPA: ', '') : ''
        })),
        skills: {
          primary: skills ? skills.split(', ').slice(0, 15) : [],
          secondary: skills ? skills.split(', ').slice(15, 25) : []
        },
        certifications: certifications ? certifications.split(', ') : [],
        customFileName: this.getFilename(contact).replace('.pdf', ''),
        candidateName: contact.name
      };

      const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      };
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend PDF generation failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.pdf) {
        throw new Error('No PDF data in response');
      }

      // Convert base64 to blob
      const byteCharacters = atob(result.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      return {
        pdf: result.pdf,
        blob: blob,
        filename: result.fileName || this.getFilename(contact)
      };
    },

    // ============ CLIENT-SIDE FALLBACK (only if backend fails) ============
    async generatePDFClientFallback(cvData) {
      console.log('[CVFormatterPerfect] Using client-side PDF fallback...');
      
      // Check if jsPDF is available
      if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
        console.warn('[CVFormatterPerfect] jsPDF not available for fallback');
        return null;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        format: 'a4',
        unit: 'pt',
        putOnlyUsedFonts: true
      });

      const font = 'helvetica';
      const fontSize = 10.5;
      const margins = { top: 54, bottom: 54, left: 54, right: 54 };
      const lineHeight = 1.15;
      const contentWidth = 595.28 - margins.left - margins.right;

      doc.setFont(font, 'normal');
      doc.setFontSize(fontSize);

      let y = margins.top;

      const addText = (text, isBold = false, isCentered = false, size = fontSize) => {
        doc.setFontSize(size);
        doc.setFont(font, isBold ? 'bold' : 'normal');
        
        const lines = doc.splitTextToSize(text, contentWidth);
        lines.forEach(line => {
          if (y > 841.89 - margins.bottom - 20) {
            doc.addPage();
            y = margins.top;
          }
          
          const x = isCentered ? (595.28 - doc.getTextWidth(line)) / 2 : margins.left;
          doc.text(line, x, y);
          y += size * lineHeight;
        });
      };

      const { contact, summary, experience, education, skills, certifications } = cvData;

      // Name
      addText(contact.name.toUpperCase(), true, true, 18);
      y += 4;

      // Contact - FIXED FORMAT: phone | email | location | open to relocation
      const contactParts = [contact.phone, contact.email, contact.location].filter(Boolean);
      if (contact.location) contactParts.push('open to relocation');
      const contactLine = contactParts.join(' | ');
      addText(contactLine, false, true, 10.5);
      
      // Links on separate line
      if (contact.linkedin || contact.github) {
        addText([contact.linkedin, contact.github].filter(Boolean).join(' | '), false, true, 9);
      }
      y += 12;

      // Summary
      if (summary) {
        addText('PROFESSIONAL SUMMARY', true, false, 12);
        y += 2;
        addText(summary, false, false, 10.5);
        y += 8;
      }

      // Experience
      if (experience.length > 0) {
        addText('WORK EXPERIENCE', true, false, 12);
        y += 4;

        experience.forEach(job => {
          // Company - Location
          const companyLine = job.location ? `${job.company} - ${job.location}` : job.company;
          addText(companyLine, true, false, 10.5);
          // Title | Dates
          addText([job.title, job.dates].filter(Boolean).join(' | '), false, false, 9);
          y += 2;

          job.bullets.forEach(bullet => {
            addText(`- ${bullet}`, false, false, 10.5);
          });
          y += 4;
        });
      }

      // Education
      if (education.length > 0) {
        addText('EDUCATION', true, false, 12);
        y += 4;

        education.forEach(edu => {
          // Institution - Location
          const instLine = edu.location ? `${edu.institution} - ${edu.location}` : edu.institution;
          addText(instLine, true, false, 10.5);
          // Degree | Date | GPA
          const degreeLineArr = [edu.degree, edu.date, edu.gpa].filter(Boolean);
          addText(degreeLineArr.join(' | '), false, false, 9);
        });
        y += 8;
      }

      // Skills
      if (skills) {
        addText('SKILLS', true, false, 12);
        y += 4;
        addText(skills, false, false, 10.5);
        y += 8;
      }

      // Certifications
      if (certifications) {
        addText('CERTIFICATIONS', true, false, 12);
        y += 4;
        addText(certifications, false, false, 10.5);
      }

      const blob = doc.output('blob');
      const base64 = doc.output('datauristring').split(',')[1];

      return {
        pdf: base64,
        blob,
        filename: this.getFilename(contact)
      };
    },

    // ============ PARSE AND STRUCTURE CV DATA ============
    parseCVData(candidateData, tailoredContent, jobData) {
      const data = {
        contact: {},
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: ''
      };

      data.contact = this.buildContactSection(candidateData);
      
      const parsed = this.parseSections(tailoredContent);
      data.summary = parsed.summary || '';
      data.experience = parsed.experience || [];
      data.education = parsed.education || [];
      data.skills = this.formatSkillsSection(parsed.skills || '');
      data.certifications = this.formatCertificationsSection(parsed.certifications || '');

      return data;
    },

    // ============ BUILD CONTACT SECTION ============
    buildContactSection(candidateData) {
      const firstName = candidateData?.firstName || candidateData?.first_name || '';
      const lastName = candidateData?.lastName || candidateData?.last_name || '';
      const name = `${firstName} ${lastName}`.trim();
      
      const phone = this.formatPhone(candidateData?.phone || '+353 0874261508');
      const email = candidateData?.email || 'maxokafordev@gmail.com';
      
      let location = candidateData?.city || candidateData?.location || 'Dublin, IE';
      location = this.cleanLocation(location);
      
      const linkedin = candidateData?.linkedin || 'LinkedIn';
      const github = candidateData?.github || 'GitHub';

      return {
        name: name || 'Maxmilliam Okafor',
        phone,
        email,
        location,
        linkedin,
        github
      };
    },

    // ============ FORMAT PHONE ============
    formatPhone(phone) {
      if (!phone) return '';
      let cleaned = phone.replace(/[^\d+]/g, '');
      if (cleaned.startsWith('+')) {
        const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
        if (match) {
          return `+${match[1]} ${match[2]}`;
        }
      }
      return phone;
    },

    // ============ CLEAN LOCATION ============
    cleanLocation(location) {
      if (!location) return '';
      return location
        .replace(/\b(remote|work from home|wfh|virtual|fully remote)\b/gi, '')
        .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
        .replace(/\s*(\||,|\/|–|-)\s*(\||,|\/|–|-)\s*/g, ' | ')
        .replace(/\s*(\||,|\/|–|-)\s*$/g, '')
        .replace(/^\s*(\||,|\/|–|-)\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    },

    // ============ PARSE CV SECTIONS ============
    parseSections(content) {
      const sections = {
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: ''
      };

      if (!content) return sections;

      const lines = content.split('\n');
      let currentSection = '';
      let currentContent = [];

      const sectionHeaders = {
        'PROFESSIONAL SUMMARY': 'summary',
        'SUMMARY': 'summary',
        'PROFILE': 'summary',
        'WORK EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience',
        'EMPLOYMENT': 'experience',
        'PROFESSIONAL EXPERIENCE': 'experience',
        'EDUCATION': 'education',
        'ACADEMIC': 'education',
        'SKILLS': 'skills',
        'TECHNICAL SKILLS': 'skills',
        'CORE SKILLS': 'skills',
        'CERTIFICATIONS': 'certifications',
        'LICENSES': 'certifications'
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');

        if (sectionHeaders[upperTrimmed]) {
          this.saveParsedSection(sections, currentSection, currentContent);
          currentSection = sectionHeaders[upperTrimmed];
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      this.saveParsedSection(sections, currentSection, currentContent);
      return sections;
    },

    saveParsedSection(sections, section, content) {
      if (!section || content.length === 0) return;

      const text = content.join('\n').trim();

      switch (section) {
        case 'summary':
          sections.summary = text;
          break;
        case 'experience':
          sections.experience = this.parseExperience(text);
          break;
        case 'education':
          sections.education = this.parseEducation(text);
          break;
        case 'skills':
          sections.skills = text;
          break;
        case 'certifications':
          sections.certifications = text;
          break;
      }
    },

    // ============ PARSE EXPERIENCE ============
    parseExperience(text) {
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if this is a job header (company | title | dates | location)
        // Or format: Company - Location / Title | Dates
        if ((trimmed.includes('|') || trimmed.includes(' - ')) && !trimmed.startsWith('•') && !trimmed.startsWith('-')) {
          if (currentJob) {
            jobs.push(currentJob);
          }
          
          // Try pipe-separated format first
          if (trimmed.includes('|')) {
            const parts = trimmed.split('|').map(p => p.trim());
            currentJob = {
              company: parts[0] || '',
              title: parts[1] || '',
              dates: parts[2] || '',
              location: parts[3] || '',
              bullets: []
            };
          } else {
            // Try dash-separated company - location format
            const parts = trimmed.split(' - ').map(p => p.trim());
            currentJob = {
              company: parts[0] || '',
              title: '',
              dates: '',
              location: parts[1] || '',
              bullets: []
            };
          }
        } else if (currentJob && (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*'))) {
          const bullet = trimmed.replace(/^[•\-*]\s*/, '').trim();
          if (bullet) {
            currentJob.bullets.push(bullet);
          }
        } else if (currentJob && !currentJob.title && trimmed.includes('|')) {
          // This might be Title | Dates line
          const parts = trimmed.split('|').map(p => p.trim());
          currentJob.title = parts[0] || '';
          currentJob.dates = parts[1] || '';
        }
      }

      if (currentJob) {
        jobs.push(currentJob);
      }

      return jobs;
    },

    // ============ PARSE EDUCATION ============
    parseEducation(text) {
      const education = [];
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;

        // Institution - Location format
        if (trimmed.includes(' - ') && !trimmed.includes('|')) {
          const parts = trimmed.split(' - ').map(p => p.trim());
          const nextLine = lines[i + 1]?.trim() || '';
          
          let degree = '', date = '', gpa = '';
          if (nextLine.includes('|')) {
            const degParts = nextLine.split('|').map(p => p.trim());
            degree = degParts[0] || '';
            date = degParts[1] || '';
            gpa = degParts[2] || '';
            i++; // Skip next line
          }
          
          education.push({
            institution: parts[0] || '',
            location: parts[1] || '',
            degree,
            date,
            gpa
          });
        } else if (trimmed.includes('|')) {
          // Pipe-separated format: Institution | Degree | Date | GPA
          const parts = trimmed.split('|').map(p => p.trim());
          education.push({
            institution: parts[0] || '',
            degree: parts[1] || '',
            date: parts[2] || '',
            gpa: parts[3] || ''
          });
        }
      }

      return education;
    },

    // ============ FORMAT SKILLS SECTION ============
    formatSkillsSection(skillsText) {
      if (!skillsText) return '';

      const skills = skillsText
        .replace(/[•\-*]/g, ',')
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => s.length >= 2 && s.length <= 40);

      const uniqueSkills = [];
      const seen = new Set();
      
      for (const skill of skills) {
        const lower = skill.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          uniqueSkills.push(this.formatSkill(skill));
        }
      }

      return uniqueSkills.slice(0, 25).join(', ');
    },

    // ============ FORMAT SKILL NAME ============
    formatSkill(skill) {
      const acronyms = new Set([
        'SQL', 'AWS', 'GCP', 'API', 'REST', 'HTML', 'CSS', 'JSON', 'XML', 'SDK',
        'CI', 'CD', 'ETL', 'ML', 'AI', 'NLP', 'LLM', 'GPU', 'CPU', 'UI', 'UX',
        'HTTP', 'HTTPS', 'SSH', 'FTP', 'TCP', 'IP', 'DNS', 'VPN', 'CDN', 'S3',
        'EC2', 'RDS', 'IAM', 'VPC', 'ECS', 'EKS', 'SQS', 'SNS', 'SES', 'DMS',
        'JWT', 'OAuth', 'SAML', 'SSO', 'RBAC', 'CRUD', 'ORM', 'MVC', 'MVP',
        'TDD', 'BDD', 'DDD', 'SOLID', 'OOP', 'FP', 'MVVM', 'NoSQL'
      ]);

      const upper = skill.toUpperCase();
      if (acronyms.has(upper)) {
        return upper;
      }

      return skill.split(/\s+/).map(word => {
        if (word.length <= 2) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
    },

    // ============ FORMAT CERTIFICATIONS SECTION ============
    formatCertificationsSection(certsText) {
      if (!certsText) return '';

      const certs = certsText
        .replace(/[•\-*]/g, ',')
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 5 && s.length < 100);

      return certs.join(', ');
    },

    // ============ GENERATE HTML (for preview display) ============
    generateHTML(cvData) {
      const { contact, summary, experience, education, skills, certifications } = cvData;
      
      const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
      };

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(contact.name)} - CV</title>
  <style>
    @page {
      size: A4;
      margin: ${ATS_CONFIG.margins.top} ${ATS_CONFIG.margins.right} ${ATS_CONFIG.margins.bottom} ${ATS_CONFIG.margins.left};
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: ${ATS_CONFIG.fontFamily};
      font-size: ${ATS_CONFIG.fontSize.body};
      line-height: ${ATS_CONFIG.lineHeight.normal};
      color: ${ATS_CONFIG.colors.text};
      background: #fff;
      padding: 20px;
      margin: 0;
    }
    
    .cv-container {
      max-width: 700px;
      margin: 0 auto;
    }
    
    .cv-name {
      font-size: ${ATS_CONFIG.fontSize.name};
      font-weight: bold;
      text-align: center;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .cv-contact {
      text-align: center;
      font-size: ${ATS_CONFIG.fontSize.body};
      color: ${ATS_CONFIG.colors.secondary};
      margin-bottom: 16px;
      line-height: 1.4;
    }
    
    .cv-contact-line {
      margin-bottom: 2px;
    }
    
    .cv-section {
      margin-bottom: 16px;
    }
    
    .cv-section-title {
      font-size: ${ATS_CONFIG.fontSize.sectionTitle};
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid ${ATS_CONFIG.colors.text};
      padding-bottom: 4px;
      margin-bottom: 10px;
    }
    
    .cv-summary {
      text-align: justify;
      line-height: ${ATS_CONFIG.lineHeight.relaxed};
    }
    
    .cv-job {
      margin-bottom: 14px;
    }
    
    .cv-job-header {
      margin-bottom: 4px;
    }
    
    .cv-company {
      font-weight: bold;
      font-size: ${ATS_CONFIG.fontSize.body};
    }
    
    .cv-job-meta {
      font-size: ${ATS_CONFIG.fontSize.small};
      color: ${ATS_CONFIG.colors.secondary};
    }
    
    .cv-job-details {
      margin-top: 4px;
    }
    
    .cv-bullet {
      margin-left: 16px;
      margin-bottom: 3px;
      line-height: ${ATS_CONFIG.lineHeight.normal};
    }
    
    .cv-education-item {
      margin-bottom: 6px;
    }
    
    .cv-education-line {
      font-size: ${ATS_CONFIG.fontSize.body};
    }
    
    .cv-skills, .cv-certifications {
      line-height: ${ATS_CONFIG.lineHeight.relaxed};
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
        padding: 0;
      }
      
      .cv-container {
        max-width: 100%;
      }
      
      .cv-section, .cv-job {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="cv-container">
    <div class="cv-name">${escapeHtml(contact.name)}</div>
    
    <div class="cv-contact">
      <div class="cv-contact-line">${[contact.phone, contact.email, contact.location, contact.location ? 'open to relocation' : ''].filter(Boolean).join(' | ')}</div>
      ${contact.linkedin || contact.github ? `<div class="cv-contact-line">${[contact.linkedin, contact.github].filter(Boolean).join(' | ')}</div>` : ''}
    </div>
    
    ${summary ? `
    <div class="cv-section">
      <div class="cv-section-title">Professional Summary</div>
      <div class="cv-summary">${escapeHtml(summary)}</div>
    </div>
    ` : ''}
    
    ${experience.length > 0 ? `
    <div class="cv-section">
      <div class="cv-section-title">Work Experience</div>
      ${experience.map(job => `
      <div class="cv-job">
        <div class="cv-job-header">
          <div class="cv-company">${escapeHtml(job.company)}${job.location ? ` - ${escapeHtml(job.location)}` : ''}</div>
          <div class="cv-job-meta">${[job.title, job.dates].filter(Boolean).map(f => escapeHtml(f)).join(' | ')}</div>
        </div>
        ${job.bullets.length > 0 ? `
        <div class="cv-job-details">
          ${job.bullets.map(bullet => `<div class="cv-bullet">- ${escapeHtml(bullet)}</div>`).join('\n          ')}
        </div>
        ` : ''}
      </div>
      `).join('\n      ')}
    </div>
    ` : ''}
    
    ${education.length > 0 ? `
    <div class="cv-section">
      <div class="cv-section-title">Education</div>
      ${education.map(edu => `
      <div class="cv-education-item">
        <div class="cv-education-line"><strong>${escapeHtml(edu.institution)}${edu.location ? ` - ${escapeHtml(edu.location)}` : ''}</strong></div>
        <div class="cv-education-line">${[edu.degree, edu.date, edu.gpa].filter(Boolean).map(f => escapeHtml(f)).join(' | ')}</div>
      </div>
      `).join('\n      ')}
    </div>
    ` : ''}
    
    ${skills ? `
    <div class="cv-section">
      <div class="cv-section-title">Skills</div>
      <div class="cv-skills">${escapeHtml(skills)}</div>
    </div>
    ` : ''}
    
    ${certifications ? `
    <div class="cv-section">
      <div class="cv-section-title">Certifications</div>
      <div class="cv-certifications">${escapeHtml(certifications)}</div>
    </div>
    ` : ''}
  </div>
</body>
</html>`;
    },

    // ============ GENERATE TEXT VERSION ============
    generateText(cvData) {
      const { contact, summary, experience, education, skills, certifications } = cvData;
      const lines = [];

      // Name and contact - EXACT FORMAT REQUIRED
      lines.push(contact.name.toUpperCase());
      const contactLine = [contact.phone, contact.email, contact.location].filter(Boolean).join(' | ') + (contact.location ? ' | open to relocation' : '');
      lines.push(contactLine);
      if (contact.linkedin || contact.github) {
        lines.push([contact.linkedin, contact.github].filter(Boolean).join(' | '));
      }
      lines.push('');

      // Summary
      if (summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push(summary);
        lines.push('');
      }

      // Experience
      if (experience.length > 0) {
        lines.push('WORK EXPERIENCE');
        experience.forEach(job => {
          lines.push(`${job.company}${job.location ? ` - ${job.location}` : ''}`);
          lines.push([job.title, job.dates].filter(Boolean).join(' | '));
          job.bullets.forEach(bullet => {
            lines.push(`- ${bullet}`);
          });
          lines.push('');
        });
      }

      // Education
      if (education.length > 0) {
        lines.push('EDUCATION');
        education.forEach(edu => {
          lines.push(`${edu.institution}${edu.location ? ` - ${edu.location}` : ''}`);
          lines.push([edu.degree, edu.date, edu.gpa].filter(Boolean).join(' | '));
        });
        lines.push('');
      }

      // Skills
      if (skills) {
        lines.push('SKILLS');
        lines.push(skills);
        lines.push('');
      }

      // Certifications
      if (certifications) {
        lines.push('CERTIFICATIONS');
        lines.push(certifications);
      }

      return lines.join('\n');
    },

    // ============ HELPER METHODS ============
    getFilename(contact) {
      const firstName = (contact.name || 'CV').split(' ')[0] || 'CV';
      const lastName = (contact.name || '').split(' ').slice(1).join('_') || '';
      const name = lastName ? `${firstName}_${lastName}` : firstName;
      return `${name.replace(/[^a-zA-Z0-9_]/g, '')}_CV.pdf`;
    },

    isBrowserEnvironment() {
      return typeof window !== 'undefined' && typeof document !== 'undefined';
    },

    // ============ DOWNLOAD METHODS ============
    downloadHTML(htmlContent, filename = 'CV.html') {
      if (!this.isBrowserEnvironment()) return;

      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    downloadText(textContent, filename = 'CV.txt') {
      if (!this.isBrowserEnvironment()) return;

      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    downloadPDF(pdfBase64, filename = 'CV.pdf') {
      if (!this.isBrowserEnvironment() || !pdfBase64) return;

      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // ============ EXPORT ============
  if (typeof window !== 'undefined') {
    window.CVFormatterPerfect = CVFormatterPerfect;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CVFormatterPerfect;
  }
  if (typeof global !== 'undefined') {
    global.CVFormatterPerfect = CVFormatterPerfect;
  }

})(typeof window !== 'undefined' ? window : 
   typeof global !== 'undefined' ? global : this);
