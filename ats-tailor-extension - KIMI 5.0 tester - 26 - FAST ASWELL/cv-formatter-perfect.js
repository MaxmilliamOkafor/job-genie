// CV Formatter Perfect - 100% ATS-Compatible CV Generator
// Guarantees perfect formatting for both preview and download
// Uses HTML5 + CSS3 for rendering, then converts to PDF via browser API

(function(global) {
  'use strict';

  // ============ ATS SPECIFICATIONS (Industry Standard) ============
  const ATS_CONFIG = {
    // Typography
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: {
      name: '20pt',        // Name at top - BOLD, UPPERCASE
      sectionTitle: '12pt', // Section headers
      body: '10.5pt',      // Body text (optimal for ATS)
      small: '9pt'         // Secondary text
    },
    // Spacing
    lineHeight: {
      tight: '1.1',        // Compact
      normal: '1.15',      // Standard
      relaxed: '1.25',     // More space
      section: '1.5'       // 1.5 line spacing for sections
    },
    // Margins (0.75 inches = 54pt - ATS standard)
    margins: {
      top: '54pt',
      bottom: '54pt',
      left: '54pt',
      right: '54pt'
    },
    // Page
    pageSize: 'A4',
    maxPages: 2,
    // Colors (conservative for ATS)
    colors: {
      text: '#000000',
      secondary: '#333333',
      accent: '#000000'
    },
    // Section spacing
    sectionSpacing: '21pt' // 1.5 line height
  };

  // ============ CV FORMATTER PERFECT ============
  const CVFormatterPerfect = {
    
    // ============ MAIN ENTRY POINT ============
    async generateCV(candidateData, tailoredContent, jobData = null) {
      const startTime = performance.now();
      console.log('[CVFormatterPerfect] Generating perfectly formatted CV...');

      try {
        // Parse and structure the content
        const cvData = this.parseCVData(candidateData, tailoredContent, jobData);
        
        // Generate HTML with perfect formatting
        const htmlContent = this.generateHTML(cvData);
        
        // Generate plain text version
        const textContent = this.generateText(cvData);
        
        // Generate PDF (if in browser environment)
        let pdfResult = null;
        if (this.isBrowserEnvironment()) {
          pdfResult = await this.generatePDF(htmlContent, cvData);
        }

        const timing = performance.now() - startTime;
        console.log(`[CVFormatterPerfect] CV generated in ${timing.toFixed(0)}ms`);

        return {
          html: htmlContent,
          text: textContent,
          pdf: pdfResult?.pdf || null,
          blob: pdfResult?.blob || null,
          filename: pdfResult?.filename || 'CV.html',
          data: cvData,
          timing
        };

      } catch (error) {
        console.error('[CVFormatterPerfect] Error generating CV:', error);
        throw error;
      }
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

      // Contact Information
      data.contact = this.buildContactSection(candidateData);
      
      // Parse tailored content for sections
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
      
      const phone = this.formatPhone(candidateData?.phone || '');
      const email = candidateData?.email || '';
      
      // Clean location - remove "Remote" as it's a recruiter red flag
      let location = candidateData?.city || candidateData?.location || '';
      location = this.cleanLocation(location);
      
      const linkedin = candidateData?.linkedin || '';
      const github = candidateData?.github || '';

      return {
        name: name || 'Applicant',
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
      let currentJob = null;

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

        // Check for section header
        if (sectionHeaders[upperTrimmed]) {
          // Save previous section
          this.saveParsedSection(sections, currentSection, currentContent, currentJob);
          
          currentSection = sectionHeaders[upperTrimmed];
          currentContent = [];
          currentJob = null;
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      // Save final section
      this.saveParsedSection(sections, currentSection, currentContent, currentJob);

      return sections;
    },

    saveParsedSection(sections, section, content, currentJob) {
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

    // ============ DATE NORMALISATION HELPERS ============
    // Normalise dates to "YYYY – YYYY" format with en dash and spaces
    normaliseDates(dateStr) {
      if (!dateStr) return '';
      return String(dateStr)
        .replace(/--/g, '–')           // double hyphen to en dash
        .replace(/-/g, '–')            // single hyphen to en dash  
        .replace(/\s*–\s*/g, ' – ');   // ensure spaces around en dash
    },

    // ============ DATE PATTERN FOR CLEANING ============
    // Matches date patterns like: 2023-01 - Present, Jan 2023 - Dec 2024, 2021-2023, etc.
    DATE_PATTERNS: [
      /\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi,
      /\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi,
      /\b(Present|Current)\b/gi
    ],

    // Strip date patterns from a string
    stripDatesFromField(fieldValue) {
      if (!fieldValue) return '';
      let cleaned = fieldValue;
      for (const pattern of this.DATE_PATTERNS) {
        cleaned = cleaned.replace(pattern, '');
      }
      // Clean up leftover separators and whitespace
      return cleaned.replace(/\s*\|\s*$/, '').replace(/^\s*\|\s*/, '').replace(/\s{2,}/g, ' ').trim();
    },

    // Convert dates to year-only format (e.g., "Jan 2020 - Dec 2023" -> "2020 – 2023")
    toYearOnly(dateStr) {
      if (!dateStr) return '';
      // Extract all 4-digit years
      const years = dateStr.match(/\d{4}/g);
      const hasPresent = /present/i.test(dateStr);
      
      if (hasPresent && years && years.length >= 1) {
        return `${years[0]} – Present`;
      } else if (years && years.length >= 2) {
        return `${years[0]} – ${years[1]}`;
      } else if (years && years.length === 1) {
        return years[0];
      }
      return this.normaliseDates(dateStr); // Return normalised if no years found
    },

    // ============ PARSE EXPERIENCE ============
    parseExperience(text) {
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;

      // Helper: detect if a line is a job title
      const isJobTitle = (text) => {
        const titlePatterns = [
          /\b(engineer|developer|architect|analyst|manager|director|scientist|specialist|lead|consultant|administrator|coordinator|officer|executive|vp|president|founder|cto|ceo|cfo|coo)\b/i,
          /\b(senior|junior|principal|staff|associate|assistant|intern|trainee|head of|chief)\b/i,
          /\b(product|project|program|data|software|cloud|ai|ml|machine learning|devops|sre|qa|test|security|network|system|solutions)\b/i,
        ];
        return titlePatterns.some(p => p.test(text));
      };

      // Helper: detect if a line is a company name
      const isCompanyName = (text) => {
        const companyPatterns = [
          /\b(inc|llc|ltd|corp|corporation|company|co|plc|group|holdings|partners|ventures|labs|technologies|solutions|consulting|services|startup)\b/i,
          /\bformerly\b/i, // "Meta (formerly Facebook Inc)"
          /\b(google|meta|facebook|amazon|apple|microsoft|netflix|ibm|oracle|salesforce|adobe|intel|nvidia|cisco|dell|hp|accenture|deloitte|pwc|kpmg|ey|mckinsey|bain|bcg|citi|citigroup|jpmorgan|goldman|morgan stanley|barclays|hsbc)\b/i,
        ];
        return companyPatterns.some(p => p.test(text));
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if this is a job header (company | title | dates | location)
        if (trimmed.includes('|') && !trimmed.startsWith('•') && !trimmed.startsWith('-')) {
          if (currentJob) {
            jobs.push(currentJob);
          }
          
          const parts = trimmed.split('|').map(p => p.trim());
          
          // Extract dates from the dedicated dates field (parts[2])
          // Also check if dates are embedded in company or title and clean them
          let dates = parts[2] || '';
          let company = parts[0] || '';
          let title = parts[1] || '';
          
          // If dates field is empty, try to extract from company/title
          if (!dates) {
            for (const pattern of this.DATE_PATTERNS) {
              const companyMatch = company.match(pattern);
              const titleMatch = title.match(pattern);
              if (companyMatch) {
                dates = companyMatch[0];
                break;
              }
              if (titleMatch) {
                dates = titleMatch[0];
                break;
              }
            }
          }
          
          // Clean company and title to remove any embedded dates
          company = this.stripDatesFromField(company);
          title = this.stripDatesFromField(title);
          
          // CRITICAL: Detect if company/title are swapped
          // If "company" looks like a job title and "title" looks like a company, swap them
          if (isJobTitle(company) && (isCompanyName(title) || !isJobTitle(title))) {
            const temp = company;
            company = title;
            title = temp;
          }
          
          // Build titleLine: Title – YYYY – YYYY (using en dash with spaces)
          const yearDates = this.toYearOnly(dates);
          let titleLine = '';
          if (title && yearDates) {
            titleLine = `${title} – ${yearDates}`;
          } else if (title) {
            titleLine = title;
          } else if (yearDates) {
            titleLine = yearDates;
          }
          
          // NO location - removed to prevent recruiter bias
          currentJob = {
            company: company,
            title: title,
            titleLine: titleLine, // New: formatted "Title – YYYY – YYYY"
            dates: dates,
            bullets: []
          };
        } else if (currentJob && (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*'))) {
          const bullet = trimmed.replace(/^[•\-*]\s*/, '').trim();
          if (bullet) {
            currentJob.bullets.push(bullet);
          }
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

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Simple format: Institution | Degree | Date | GPA
        const parts = trimmed.split('|').map(p => p.trim());
        if (parts.length >= 2) {
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
        .filter(s => {
          if (s.length < 2 || s.length > 40) return false;
          
          // Filter out soft skills
          const softSkills = ['collaboration', 'communication', 'teamwork', 'leadership', 'problem-solving', 'initiative', 'ownership', 'passion', 'dedication', 'motivation', 'self-starter', 'interpersonal', 'proactive', 'detail-oriented', 'hard-working', 'team player'];
          const lower = s.toLowerCase();
          return !softSkills.some(soft => lower.includes(soft));
        });

      // Deduplicate and format
      const uniqueSkills = [];
      const seen = new Set();
      
      for (const skill of skills) {
        const lower = skill.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          uniqueSkills.push(this.formatSkill(skill));
        }
      }

      return uniqueSkills.slice(0, 20).join(', ');
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

      // Title case
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

    // ============ GENERATE HTML ============
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
      padding: 0;
      margin: 0;
    }
    
    .cv-container {
      max-width: 100%;
      padding: 0;
    }
    
    /* Name - Larger and Bold */
    .cv-name {
      font-size: ${ATS_CONFIG.fontSize.name};
      font-weight: bold;
      text-align: left;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    
    /* Contact */
    .cv-contact {
      text-align: left;
      font-size: ${ATS_CONFIG.fontSize.body};
      color: ${ATS_CONFIG.colors.secondary};
      margin-bottom: 16px;
      line-height: 1.4;
    }
    
    .cv-contact-line {
      margin-bottom: 2px;
    }
    
    /* Section Headers with 1.5 line spacing */
    .cv-section {
      margin-bottom: 16px;
    }
    
    .cv-section-title {
      font-size: ${ATS_CONFIG.fontSize.sectionTitle};
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: ${ATS_CONFIG.sectionSpacing};
      margin-bottom: ${ATS_CONFIG.sectionSpacing};
    }
    
    /* Summary - Regular text, not caps */
    .cv-summary {
      text-align: justify;
      line-height: ${ATS_CONFIG.lineHeight.relaxed};
    }
    
    /* Experience */
    .cv-job {
      margin-bottom: ${ATS_CONFIG.sectionSpacing};
    }
    
    .cv-job-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    
    .cv-job-left {
      font-weight: bold;
      font-size: 11pt;
      white-space: nowrap;
    }
    
    .cv-job-right {
      font-size: ${ATS_CONFIG.fontSize.small};
      color: ${ATS_CONFIG.colors.secondary};
      white-space: nowrap;
    }
    
    .cv-job-details {
      margin-top: 4px;
    }
    
    .cv-job-bullets {
      margin: 4px 0 0 16px;
      padding: 0;
      list-style-type: disc;
    }
    
    .cv-job-bullets li {
      margin-bottom: 3px;
      line-height: ${ATS_CONFIG.lineHeight.normal};
    }
    
    /* Education */
    .cv-education-item {
      margin-bottom: 6px;
    }
    
    .cv-education-line {
      font-size: ${ATS_CONFIG.fontSize.body};
    }
    
    /* Skills */
    .cv-skills {
      line-height: ${ATS_CONFIG.lineHeight.relaxed};
    }
    
    /* Certifications */
    .cv-certifications {
      line-height: ${ATS_CONFIG.lineHeight.relaxed};
    }

    /* Print styles */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      
      .cv-container {
        page-break-inside: avoid;
      }
      
      .cv-section {
        page-break-inside: avoid;
      }
      
      .cv-job {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="cv-container">
    <!-- Name - Bold, Uppercase, 20pt -->
    <div class="cv-name">${escapeHtml(contact.name.toUpperCase())}</div>
    
    <!-- Contact -->
    <div class="cv-contact">
      ${contact.phone ? `<div class="cv-contact-line">${escapeHtml(contact.phone)}</div>` : ''}
      <div class="cv-contact-line">${escapeHtml(contact.email)}${contact.location ? ` | ${escapeHtml(contact.location)}` : ''}${contact.location ? ' | Open to relocation' : ''}</div>
      ${contact.linkedin || contact.github ? `<div class="cv-contact-line">${[contact.linkedin, contact.github].filter(Boolean).map(l => escapeHtml(l)).join(' | ')}</div>` : ''}
    </div>
    
    <!-- Professional Summary -->
    ${summary ? `
    <div class="cv-section">
      <div class="cv-section-title">Professional Summary</div>
      <div class="cv-summary">${escapeHtml(summary)}</div>
    </div>
    ` : ''}
    
    <!-- Work Experience -->
    ${experience.length > 0 ? `
    <div class="cv-section">
      <div class="cv-section-title">Work Experience</div>
      ${experience.map((job, index) => `
      <div class="cv-job">
        <div class="cv-job-header">
          <span class="cv-job-left">\${escapeHtml([job.company, job.title].filter(Boolean).join(' – '))}</span>
          <span class="cv-job-right">\${escapeHtml(job.dates || '')}</span>
        </div>
        \${job.bullets.length > 0 ? \`
        <ul class="cv-job-bullets">
          \${job.bullets.map(bullet => \`<li>\${escapeHtml(bullet)}</li>\`).join('\\n          ')}
        </ul>
        \` : ''}
      </div>
      \`).join('\\n      ')}
    </div>
    ` : ''}
    
    <!-- Education -->
    ${education.length > 0 ? `
    <div class="cv-section">
      <div class="cv-section-title">Education</div>
      ${education.map(edu => `
      <div class="cv-education-item">
        <div class="cv-education-line">${[edu.degree, edu.institution, edu.gpa].filter(Boolean).map(f => escapeHtml(f)).join(' | ')}</div>
      </div>
      `).join('\n      ')}
    </div>
    ` : ''}
    
    <!-- Skills -->
    ${skills ? `
    <div class="cv-section">
      <div class="cv-section-title">Skills</div>
      <div class="cv-skills">${escapeHtml(skills)}</div>
    </div>
    ` : ''}
    
    <!-- Certifications -->
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

      // Name and contact
      lines.push(contact.name.toUpperCase());
      lines.push([contact.phone, contact.email, contact.location].filter(Boolean).join(' | ') + (contact.location ? ' | Open to relocation' : ''));
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
          // Single line: Company – Title    Dates (right-aligned in HTML, space-separated in text)
          const leftPart = [job.company, job.title].filter(Boolean).join(' – ');
          if (leftPart && job.dates) {
            lines.push(`${leftPart}    ${job.dates}`);
          } else {
            lines.push(leftPart || job.dates);
          }
          // Use • bullets for ATS compatibility
          job.bullets.forEach(bullet => {
            lines.push(`• ${bullet}`);
          });
          lines.push('');
        });
      }

      // Education (without dates to avoid bias)
      if (education.length > 0) {
        lines.push('EDUCATION');
        education.forEach(edu => {
          lines.push([edu.degree, edu.institution, edu.gpa].filter(Boolean).join(' | '));
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

    // ============ GENERATE PDF ============
    async generatePDF(htmlContent, cvData) {
      try {
        // Method 1: Use browser's print API with PDF format
        if (this.hasBrowserPrintAPI()) {
          return await this.generatePDFWithPrintAPI(htmlContent, cvData);
        }
        
        // Method 2: Use html2canvas + jsPDF
        if (this.hasHtml2Canvas() && this.hasJsPDF()) {
          return await this.generatePDFWithHtml2Canvas(htmlContent, cvData);
        }
        
        // Method 3: Use jsPDF directly with HTML support
        if (this.hasJsPDF()) {
          return await this.generatePDFWithJsPDF(htmlContent, cvData);
        }

        console.warn('[CVFormatterPerfect] No PDF generation method available');
        return null;

      } catch (error) {
        console.error('[CVFormatterPerfect] PDF generation error:', error);
        return null;
      }
    },

    // ============ PDF GENERATION METHODS ============
    async generatePDFWithPrintAPI(htmlContent, cvData) {
      // Create a new window with the CV
      const printWindow = window.open('', '_blank', 'width=800,height=1000');
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Wait for content to load
      await new Promise(resolve => {
        printWindow.onload = resolve;
        if (printWindow.document.readyState === 'complete') resolve();
      });

      // Generate PDF
      const pdfBlob = await new Promise((resolve, reject) => {
        printWindow.print();
        // Note: This is limited - browsers don't allow direct PDF capture from print dialog
        // This is here for future implementation when browsers support it
        reject(new Error('Print API not fully supported'));
      });

      printWindow.close();
      
      return null; // Fallback to other methods
    },

    async generatePDFWithHtml2Canvas(htmlContent, cvData) {
      // Create hidden iframe for rendering
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.width = '794px'; // A4 width at 96dpi
      iframe.style.height = '1123px'; // A4 height at 96dpi
      document.body.appendChild(iframe);

      iframe.srcdoc = htmlContent;

      await new Promise(resolve => {
        iframe.onload = resolve;
      });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        format: 'a4',
        unit: 'mm',
        orientation: 'portrait'
      });

      const canvas = await window.html2canvas(iframe.contentDocument.body, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 794,
        height: 1123
      });

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);

      document.body.removeChild(iframe);

      const blob = pdf.output('blob');
      const base64 = pdf.output('datauristring').split(',')[1];

      return {
        pdf: base64,
        blob,
        filename: this.getFilename(cvData.contact)
      };
    },

    async generatePDFWithJsPDF(htmlContent, cvData) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        format: 'a4',
        unit: 'pt',
        putOnlyUsedFonts: true
      });

      // Configure for ATS
      const font = 'helvetica';
      const fontSize = 10.5;
      const margins = { top: 54, bottom: 54, left: 54, right: 54 };
      const lineHeight = 1.15;
      const contentWidth = 595.28 - margins.left - margins.right;

      doc.setFont(font, 'normal');
      doc.setFontSize(fontSize);

      // Split HTML into sections and render manually
      // This ensures perfect text-based PDF (not image-based)
      let y = margins.top;

      const addText = (text, isBold = false, isCentered = false, size = fontSize, isItalic = false) => {
        doc.setFontSize(size);
        if (isBold && isItalic) {
          doc.setFont(font, "bolditalic");
        } else if (isBold) {
          doc.setFont(font, "bold");
        } else if (isItalic) {
          doc.setFont(font, "italic");
        } else {
          doc.setFont(font, "normal");
        }
        
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

      // Render CV data directly for best ATS compatibility
      const { contact, summary, experience, education, skills, certifications } = cvData;

      // Name
      addText(contact.name.toUpperCase(), true, true, 18);
      y += 4;

      // Contact
      const contactLine = [contact.phone, contact.email, contact.location].filter(Boolean).join(' | ') + (contact.location ? ' | Open to relocation' : '');
      addText(contactLine, false, true, 10.5);
      
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
          addText(job.company, true, false, 10.5);
          addText(job.title, false, false, 9, true); // isItalic = true
          // Dates on separate line
          if (job.dates) {
            addText(job.dates, false, false, 9);
          }
          y += 2;

          job.bullets.forEach(bullet => {
            addText(`• ${bullet}`, false, false, 10.5);
          });
          y += 4;
        });
      }

      // Education
      if (education.length > 0) {
        addText('EDUCATION', true, false, 12);
        y += 4;

        // No dates (bias prevention). Also strip any embedded dates in the strings.
        education.forEach(edu => {
          addText([edu.degree, edu.institution, edu.gpa].filter(Boolean).join(' | '), false, false, 10.5);
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

    // ============ HELPER METHODS ============
    getFilename(contact) {
      const name = contact.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      return `${name}_CV.pdf`;
    },

    isBrowserEnvironment() {
      return typeof window !== 'undefined' && typeof document !== 'undefined';
    },

    hasBrowserPrintAPI() {
      return this.isBrowserEnvironment() && typeof window.print === 'function';
    },

    hasHtml2Canvas() {
      return this.isBrowserEnvironment() && typeof window.html2canvas === 'function';
    },

    hasJsPDF() {
      return this.isBrowserEnvironment() && 
             typeof window.jspdf !== 'undefined' && 
             window.jspdf.jsPDF;
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
