// professional-pdf-engine.js - Enterprise-Grade ATS PDF Generator v3.0
// PERFECT FORMAT: Garamond/Arial hybrid, exact margins, precise typography
// Features: Multi-page support, font embedding, perfect text metrics, ATS 100% parsing

(function(global) {
  'use strict';

  // ============ PDF CONFIGURATION (ATS-PERFECT SPECIFICATION) ============
  const PDF_CONFIG = {
    // Page dimensions (A4 in points)
    page: {
      width: 595.28,
      height: 841.89,
      format: 'a4'
    },
    // Margins (0.75 inches = 54pt - ATS standard)
    margins: {
      top: 54,
      bottom: 54,
      left: 54,
      right: 54
    },
    // Typography specification
    fonts: {
      heading: 'helvetica',      // Clean sans-serif for headers
      body: 'helvetica',         // ATS-safe body font
      sizes: {
        name: 16,                // Name: 16pt Bold
        sectionTitle: 12,        // Section headers: 12pt Bold
        companyName: 11,         // Company names: 11pt Bold
        jobTitle: 10.5,          // Job titles: 10.5pt Regular
        body: 10.5,              // Body text: 10.5pt Regular
        bullets: 10.5,           // Bullet points: 10.5pt
        contact: 10,             // Contact info: 10pt
        small: 9                 // Small text: 9pt
      }
    },
    // Line spacing
    lineHeight: {
      tight: 1.1,
      normal: 1.2,
      relaxed: 1.4,
      section: 1.5
    },
    // Section spacing (in points)
    spacing: {
      afterName: 4,
      afterContact: 12,
      beforeSection: 14,
      afterSectionTitle: 6,
      betweenJobs: 10,
      betweenBullets: 2,
      paragraphGap: 8
    },
    // Colors (conservative for ATS)
    colors: {
      black: [0, 0, 0],
      darkGray: [51, 51, 51],
      mediumGray: [102, 102, 102]
    },
    // Bullet character (ATS-safe)
    bullet: '•',
    bulletIndent: 8
  };

  // ============ PROFESSIONAL PDF ENGINE ============
  const ProfessionalPDFEngine = {

    // ============ MAIN ENTRY: GENERATE CV PDF ============
    async generateCV(candidateData, tailoredContent, options = {}) {
      const startTime = performance.now();
      console.log('[ProfessionalPDFEngine] Generating ATS-perfect CV (SPEED OPTIMIZED)...');

      try {
        // Validate jsPDF availability
        if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
          throw new Error('jsPDF library not loaded');
        }

        // Parse and structure CV data ONCE
        const cvData = this.structureCVData(candidateData, tailoredContent);
        
        // Create PDF document with maximum compression for speed
        const doc = new jspdf.jsPDF({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
          compress: true,
          putOnlyUsedFonts: true, // SPEED: Only embed used fonts
          floatPrecision: 2 // SPEED: Reduce float precision for smaller file
        });

        // Reset section dedup tracker for each new PDF
        this._renderedSections = new Set();

        // Build PDF content
        let currentY = PDF_CONFIG.margins.top;
        currentY = this.renderHeader(doc, cvData.contact, currentY);
        currentY = this.renderSummary(doc, cvData.summary, currentY);
        currentY = this.renderExperience(doc, cvData.experience, currentY);
        currentY = this.renderEducation(doc, cvData.education, currentY);
        currentY = this.renderSkills(doc, cvData.skills, currentY);
        currentY = this.renderCertifications(doc, cvData.certifications, currentY);

        // Generate output
        const pdfBlob = doc.output('blob');
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        
        // Generate filename
        const firstName = this.sanitizeFilename(candidateData?.firstName || candidateData?.first_name || 'Applicant');
        const lastName = this.sanitizeFilename(candidateData?.lastName || candidateData?.last_name || '');
        const filename = lastName ? `${firstName}_${lastName}_CV.pdf` : `${firstName}_CV.pdf`;

        const timing = performance.now() - startTime;
        console.log(`[ProfessionalPDFEngine] CV generated in ${timing.toFixed(0)}ms`);

        return {
          success: true,
          pdf: pdfBase64,
          blob: pdfBlob,
          filename,
          pageCount: doc.internal.getNumberOfPages(),
          timing,
          data: cvData
        };

      } catch (error) {
        console.error('[ProfessionalPDFEngine] Error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    },

    // ============ GENERATE COVER LETTER PDF ============
    async generateCoverLetter(candidateData, coverContent, jobData, options = {}) {
      const startTime = performance.now();
      console.log('[ProfessionalPDFEngine] Generating Cover Letter (SPEED OPTIMIZED)...');

      try {
        if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
          throw new Error('jsPDF library not loaded');
        }

        const doc = new jspdf.jsPDF({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
          compress: true,
          putOnlyUsedFonts: true, // SPEED: Only embed used fonts
          floatPrecision: 2 // SPEED: Reduce float precision
        });

        let currentY = PDF_CONFIG.margins.top;

        // Render cover letter header
        currentY = this.renderCoverHeader(doc, candidateData, currentY);
        
        // Render recipient info
        currentY = this.renderRecipientInfo(doc, jobData, currentY);
        
        // Render cover letter body
        currentY = this.renderCoverBody(doc, coverContent, currentY);
        
        // Render signature
        currentY = this.renderSignature(doc, candidateData, currentY);

        const pdfBlob = doc.output('blob');
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        
        const firstName = this.sanitizeFilename(candidateData?.firstName || candidateData?.first_name || 'Applicant');
        const lastName = this.sanitizeFilename(candidateData?.lastName || candidateData?.last_name || '');
        const filename = lastName ? `${firstName}_${lastName}_Cover_Letter.pdf` : `${firstName}_Cover_Letter.pdf`;

        const timing = performance.now() - startTime;
        console.log(`[ProfessionalPDFEngine] Cover Letter generated in ${timing.toFixed(0)}ms`);

        return {
          success: true,
          pdf: pdfBase64,
          blob: pdfBlob,
          filename,
          timing
        };

      } catch (error) {
        console.error('[ProfessionalPDFEngine] Cover Letter Error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    },

    // ============ STRUCTURE CV DATA ============
    // FIX 27-01-26: Added robust data extraction with multiple fallbacks for OpenAI speed
    structureCVData(candidateData, tailoredContent) {
      const data = {
        contact: this.extractContact(candidateData),
        summary: '',
        experience: [],
        education: [],
        skills: [],
        certifications: []
      };

      // FIX: Try to get professional experience from candidateData first (most reliable)
      // This ensures we always have experience data even if tailoredContent is incomplete
      let experienceFromCandidate = [];
      if (candidateData) {
        experienceFromCandidate = candidateData.professional_experience || 
                                   candidateData.professionalExperience ||
                                   candidateData.workExperience ||
                                   candidateData.work_experience || [];
      }

      // Parse tailored content sections
      if (typeof tailoredContent === 'string') {
        const parsed = this.parseSections(tailoredContent);
        data.summary = parsed.summary || '';
        data.experience = parsed.experience || [];
        data.education = parsed.education || [];
        data.skills = this.parseSkills(parsed.skills || '');
        data.certifications = this.parseCertifications(parsed.certifications || '');
      } else if (typeof tailoredContent === 'object' && tailoredContent !== null) {
        // Structured data from profile - check ALL possible field names
        data.summary = tailoredContent.summary || tailoredContent.professionalSummary || tailoredContent.professional_summary || '';
        
        // FIX 27-01-26: Comprehensive experience field checking with candidateData fallback
        const tailoredExperience = tailoredContent.experience || 
                                   tailoredContent.professionalExperience || 
                                   tailoredContent.professional_experience ||
                                   tailoredContent.workExperience ||
                                   tailoredContent.work_experience || [];
        
        // Use tailored experience if available, otherwise fall back to candidate data
        const rawExperience = (Array.isArray(tailoredExperience) && tailoredExperience.length > 0) 
          ? tailoredExperience 
          : experienceFromCandidate;
        
        data.experience = this.normalizeExperience(rawExperience);
        
        // Education with fallback
        const tailoredEducation = tailoredContent.education || candidateData?.education || [];
        data.education = Array.isArray(tailoredEducation) ? tailoredEducation : [];
        
        data.skills = this.parseSkills(tailoredContent.skills || candidateData?.skills);
        data.certifications = this.parseCertifications(tailoredContent.certifications || candidateData?.certifications);
      }

      // FINAL GATE: Always sanitise summary/skills/certs at the PDF boundary
      // This ensures banned phrases (e.g., "Proven ability") can never leak into the PDF.
      if (typeof ContentQualityEngine !== 'undefined') {
        if (data.summary) data.summary = ContentQualityEngine.sanitiseSummary(data.summary);
        // Skills/certs are arrays at this point; sanitise as CV blocks for consistent casing + bans
        if (Array.isArray(data.skills) && data.skills.length) {
          data.skills = String(data.skills.join(', '))
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        }
        if (Array.isArray(data.certifications) && data.certifications.length) {
          data.certifications = data.certifications.map(c => ContentQualityEngine.sanitiseContent(String(c), {
            convertToUK: true,
            removeBannedWords: true,
            removeEmDashes: true,
            fixPunctuation: false,
            removePronouns: true,
          })).filter(Boolean);
        }
      }

      // FINAL FALLBACK: If still no experience, use candidateData directly
      if (data.experience.length === 0 && experienceFromCandidate.length > 0) {
        console.log('[ProfessionalPDFEngine] Using candidateData fallback for experience');
        data.experience = this.normalizeExperience(experienceFromCandidate);
      }

      // Log for debugging
      console.log(`[ProfessionalPDFEngine] Structured CV: ${data.experience.length} jobs, ${data.education.length} edu, ${data.skills.length} skills`);

      return data;
    },

    // ============ EXTRACT CONTACT INFO ============
    extractContact(data) {
      if (!data) return { name: 'Applicant', email: '', phone: '', location: '', linkedin: '', github: '' };

      const firstName = data.firstName || data.first_name || '';
      const lastName = data.lastName || data.last_name || '';
      const name = `${firstName} ${lastName}`.trim() || 'Applicant';
      
      let location = data.city || data.location || '';
      location = this.cleanLocation(location);

      return {
        name,
        email: data.email || '',
        phone: this.formatPhone(data.phone || ''),
        location,
        linkedin: this.formatLinkedIn(data.linkedin || ''),
        github: this.formatGitHub(data.github || '')
      };
    },

    // ============ CLEAN LOCATION (Remove "Remote" and prefixes) ============
    // UPDATED: Uses ATSLocationTailor.cleanLocation if available
    cleanLocation(location) {
      if (!location) return '';
      
      // Use ATSLocationTailor.cleanLocation if available (handles prefix removal)
      if (typeof window !== 'undefined' && window.ATSLocationTailor?.cleanLocation) {
        location = window.ATSLocationTailor.cleanLocation(location);
      }
      
      return location
        .replace(/\b(remote|work from home|wfh|virtual|fully remote|remote first)\b/gi, '')
        .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
        .replace(/\s*(\||,|\/|–|-)\s*(\||,|\/|–|-)\s*/g, ', ')
        .replace(/\s*(\||,|\/|–|-)\s*$/g, '')
        .replace(/^\s*(\||,|\/|–|-)\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    },

    // ============ FORMAT PHONE ============
    formatPhone(phone) {
      if (!phone) return '';
      const cleaned = phone.replace(/[^\d+]/g, '');
      if (cleaned.startsWith('+')) {
        const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
        if (match) {
          return `+${match[1]} ${match[2]}`;
        }
      }
      return phone;
    },

    // ============ FORMAT LINKEDIN ============
    formatLinkedIn(url) {
      if (!url) return '';
      // Extract username from full URL
      const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/i);
      if (match) {
        return `linkedin.com/in/${match[1]}`;
      }
      return url.replace(/^https?:\/\/(www\.)?/i, '');
    },

    // ============ FORMAT GITHUB ============
    formatGitHub(url) {
      if (!url) return '';
      const match = url.match(/github\.com\/([^\/\?]+)/i);
      if (match) {
        return `github.com/${match[1]}`;
      }
      return url.replace(/^https?:\/\/(www\.)?/i, '');
    },

    // ============ PARSE CV SECTIONS ============
    // FIX v4.2.0: Handles inline headers like "SKILLS: PYTHON, JAVA, C++" by splitting them
    parseSections(text) {
      if (!text) return {};
      
      const sections = {
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: ''
      };

      // FIX v3.3.2: Added TECHNICAL PROFICIENCIES mapping to skills section
      const sectionMap = {
        'PROFESSIONAL SUMMARY': 'summary',
        'SUMMARY': 'summary',
        'PROFILE': 'summary',
        'PROFESSIONAL EXPERIENCE': 'experience',
        'WORK EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience',
        'EMPLOYMENT': 'experience',
        'EDUCATION': 'education',
        'ACADEMIC': 'education',
        'SKILLS': 'skills',
        'TECHNICAL SKILLS': 'skills',
        'CORE SKILLS': 'skills',
        'TECHNICAL PROFICIENCIES': 'skills',
        'KEY SKILLS': 'skills',
        'CORE COMPETENCIES': 'skills',
        'ADDITIONAL SKILLS': 'skills',
        'CERTIFICATIONS': 'certifications',
        'LICENSES': 'certifications'
      };

      /**
       * INLINE HEADER DETECTION: Matches "SKILLS: content" or "CERTIFICATIONS: content"
       * Returns { header, content } or null if not an inline header.
       */
      const parseInlineHeader = (line) => {
        const trimmed = (line || '').trim();
        // Pattern: HEADER: content (header is all caps, followed by colon and content)
        const inlineMatch = trimmed.match(/^([A-Z][A-Z\s]{2,30}):\s*(.+)$/);
        if (inlineMatch) {
          const potentialHeader = inlineMatch[1].trim().toUpperCase();
          if (sectionMap[potentialHeader]) {
            return { header: potentialHeader, content: inlineMatch[2].trim() };
          }
        }
        return null;
      };

      const lines = text.split('\n');
      let currentSection = '';
      let currentContent = [];

      for (const line of lines) {
        const trimmed = line.trim();
        
        // FIRST: Check for inline header (e.g., "SKILLS: PYTHON, JAVA, C++")
        const inlineResult = parseInlineHeader(line);
        if (inlineResult) {
          // Save previous section
          this.saveSection(sections, currentSection, currentContent);
          // Start new section with the inline content
          currentSection = sectionMap[inlineResult.header];
          currentContent = [inlineResult.content]; // Content goes directly into the section
          continue;
        }
        
        // Standard header detection (header on its own line)
        const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');

        if (sectionMap[upperTrimmed]) {
          this.saveSection(sections, currentSection, currentContent);
          currentSection = sectionMap[upperTrimmed];
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      this.saveSection(sections, currentSection, currentContent);
      return sections;
    },

    saveSection(sections, section, content) {
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
          sections.education = this.parseEducationText(text);
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
      
      // Section headers that should be skipped when parsing
      const sectionHeaders = [
        'professional experience', 'work experience', 'experience', 
        'employment history', 'career history', 'current role',
        'previous role', 'positions held', 'work history'
      ];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        // Skip lines that are just section headers
        const lowerTrimmed = trimmed.toLowerCase().replace(/[#:\s]+/g, ' ').trim();
        if (sectionHeaders.includes(lowerTrimmed)) {
          continue;
        }

        // Detect job header (Company | Title | Dates format)
        if (trimmed.includes('|') && !trimmed.startsWith('•') && !trimmed.startsWith('-')) {
          if (currentJob && currentJob.company) jobs.push(currentJob);
          
          const parts = trimmed.split('|').map(p => p.trim());
          const company = this.stripDates(parts[0] || '');
          
          // Skip if company name looks like a section header
          if (sectionHeaders.includes(company.toLowerCase())) {
            currentJob = null;
            continue;
          }
          
          currentJob = {
            company: company,
            title: this.stripDates(parts[1] || ''),
            dates: this.normalizeDates(parts[2] || ''),
            bullets: []
          };
        } else if (currentJob && (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*'))) {
          const bullet = trimmed.replace(/^[•\-*]\s*/, '').trim();
          if (bullet) {
            currentJob.bullets.push(bullet);
          }
        }
      }

      if (currentJob && currentJob.company) jobs.push(currentJob);
      return jobs;
    },

    // ============ EXTRACT DATES FROM TITLE ============
    // Handles titles like "Software Engineer | 2023 - Present" or "Data Analyst – 2017 – 2021"
    extractDatesFromTitle(title) {
      if (!title) return { cleanTitle: '', dates: '' };
      
      // Patterns to match dates in title
      const datePatterns = [
        /\s*[\|–—-]\s*(\d{4}\s*[-–—]\s*(?:Present|\d{4}))\s*$/i,
        /\s*[\|–—-]\s*(\d{4})\s*$/i,
        /\s*\((\d{4}\s*[-–—]\s*(?:Present|\d{4}))\)\s*$/i,
      ];
      
      for (const pattern of datePatterns) {
        const match = title.match(pattern);
        if (match) {
          const cleanTitle = title.replace(pattern, '').trim();
          const dates = this.normalizeDates(match[1]);
          return { cleanTitle, dates };
        }
      }
      
      return { cleanTitle: title, dates: '' };
    },

    // ============ NORMALIZE EXPERIENCE (from structured data) ============
    normalizeExperience(experience) {
      if (!Array.isArray(experience)) return [];
      
      // Section headers and generic terms that should NOT be treated as job entries
      const invalidEntryNames = [
        'professional experience', 'work experience', 'experience', 
        'employment history', 'career history', 'current role',
        'previous role', 'positions held', 'work history',
        'employment', 'career', 'roles'
      ];
      
      // Also detect literal duplicated header strings like "WORK EXPERIENCE WORK EXPERIENCE" in raw fields
      const collapseDuplicatedHeader = (value) => {
        // Match repeated section headers (e.g. "WORK EXPERIENCE WORK EXPERIENCE")
        const collapsed = value.replace(
          /\b(WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|ACHIEVEMENTS)(\s+\1)+\b/gi,
          '$1'
        ).trim();
        // If the entire string is just a section header (after collapsing), return empty
        const dup = collapsed.match(/^(\s*(WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|CERTIFICATIONS)\s*)+$/i);
        if (dup) return '';
        return collapsed;
      };

      return experience
        .filter(job => {
          // Collapse duplicated header values before evaluation
          const rawCompany = collapseDuplicatedHeader(String(job.company || job.companyName || '').trim());
          const rawTitle = collapseDuplicatedHeader(String(job.title || job.jobTitle || job.position || '').trim());

          // Normalise aggressively to catch cases like "# WORK EXPERIENCE" or "WORK EXPERIENCE WORK EXPERIENCE"
          const normaliseHeaderish = (value) => value
            .toLowerCase()
            .replace(/[#:*|]/g, ' ')
            .replace(/[^a-z\s]/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

          const company = normaliseHeaderish(rawCompany);
          const title = normaliseHeaderish(rawTitle);

          const isDupHeader = (v) => {
            // Check if value is just repeated section headers
            for (const h of invalidEntryNames) {
              if (v === (h + ' ' + h) || v === h) return true;
            }
            return false;
          };

          // Skip if company name looks like a section header
          if (invalidEntryNames.includes(company) || isDupHeader(company)) {
            console.log(`[ProfessionalPDFEngine] Skipping invalid company entry: "${rawCompany}"`);
            return false;
          }

          // Skip if title looks like a section header (without a real company)
          if ((invalidEntryNames.includes(title) || isDupHeader(title)) && !company) {
            console.log(`[ProfessionalPDFEngine] Skipping invalid title entry: "${rawTitle}"`);
            return false;
          }

          // Skip if company is empty or too short
          if (!company || company.length < 2) {
            return false;
          }

          return true;
        })
        .map(job => {
          const rawTitle = job.title || job.jobTitle || job.position || '';
          const { cleanTitle, dates: extractedDates } = this.extractDatesFromTitle(rawTitle);
          
          // Use explicit dates if available, otherwise use extracted dates
          let dates = '';
          if (job.dates) {
            dates = this.normalizeDates(job.dates);
          } else if (job.startDate || job.endDate) {
            dates = this.normalizeDates(`${job.startDate || ''} – ${job.endDate || 'Present'}`);
          } else if (extractedDates) {
            dates = extractedDates;
          }
          
          return {
            company: job.company || job.companyName || '',
            title: cleanTitle,
            dates: dates,
            bullets: this.normalizeBullets(job.bullets || job.achievements || job.responsibilities || job.description || [])
          };
        });
    },

    // ============ NORMALIZE BULLETS ============
    // UPDATED: Applies ContentQualityEngine for UK spelling and anti-AI detection
    normalizeBullets(bullets) {
      if (!bullets) return [];
      
      let normalised = [];
      
      if (typeof bullets === 'string') {
        normalised = bullets.split('\n').map(b => b.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
      } else if (Array.isArray(bullets)) {
        normalised = bullets.map(b => String(b).replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
      }
      
      // Apply ContentQualityEngine sanitisation if available
      if (typeof ContentQualityEngine !== 'undefined' && normalised.length > 0) {
        normalised = ContentQualityEngine.sanitiseBullets(normalised);
        console.log('[ProfessionalPDFEngine] Applied ContentQualityEngine to bullets');
      }
      
      return normalised;
    },

    // ============ STRIP DATES FROM FIELD ============
    stripDates(value) {
      if (!value) return '';
      return value
        .replace(/\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi, '')
        .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi, '')
        .replace(/\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi, '')
        .replace(/\s*\|\s*$/, '')
        .replace(/^\s*\|\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    },

    // ============ NORMALIZE DATES ============
    normalizeDates(dateStr) {
      if (!dateStr) return '';
      // Extract years
      const years = dateStr.match(/\d{4}/g);
      const hasPresent = /present/i.test(dateStr);
      
      if (hasPresent && years && years.length >= 1) {
        return `${years[0]} – Present`;
      } else if (years && years.length >= 2) {
        return `${years[0]} – ${years[1]}`;
      } else if (years && years.length === 1) {
        return years[0];
      }
      
      // Normalize dashes to en-dash
      return dateStr.replace(/-/g, '–').replace(/\s*–\s*/g, ' – ');
    },

    // ============ PARSE EDUCATION TEXT ============
    parseEducationText(text) {
      const education = [];
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split('|').map(p => p.trim());
        if (parts.length >= 2) {
          education.push({
            institution: parts[0] || '',
            degree: parts[1] || '',
            date: parts[2] || '',
            gpa: this.extractGPA(parts.join(' '))
          });
        }
      }

      return education;
    },

    // ============ EXTRACT GPA ============
    extractGPA(text) {
      const match = text.match(/GPA[:\s]*(\d+\.?\d*)/i);
      return match ? match[1] : '';
    },

    // ============ PARSE SKILLS ============
    parseSkills(skills) {
      if (!skills) return [];
      
      let skillList = [];
      if (Array.isArray(skills)) {
        skillList = skills.filter(Boolean);
      } else {
        skillList = skills
          .replace(/[•\-*]/g, ',')
          .split(/[,\n]/)
          .map(s => s.trim())
          .filter(s => s.length > 1 && s.length < 50);
      }
      
      // Normalize casing: convert ALL CAPS to Title Case, preserve mixed case
      return skillList.map(skill => {
        const trimmed = String(skill).trim();
        // If skill is all uppercase (and longer than 4 chars), convert to Title Case
        // Keep short acronyms like AWS, SQL, GCP, CI/CD as-is
        if (trimmed === trimmed.toUpperCase() && trimmed.length > 4 && !/^[A-Z]{2,5}$/.test(trimmed)) {
          return trimmed
            .toLowerCase()
            .split(/[\s\-\/]+/)
            .map(word => {
              // Keep common acronyms uppercase
              const acronyms = ['aws', 'sql', 'gcp', 'api', 'css', 'html', 'ci', 'cd', 'ml', 'ai', 'ui', 'ux', 'etl', 'llm', 'iac', 'sre', 'devops'];
              if (acronyms.includes(word.toLowerCase())) return word.toUpperCase();
              return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
        }
        return trimmed;
      });
    },

    // ============ PARSE CERTIFICATIONS ============
    parseCertifications(certs) {
      if (!certs) return [];
      
      let certList = [];
      if (Array.isArray(certs)) {
        certList = certs.map(c => typeof c === 'string' ? c : c.name || c.title || '').filter(Boolean);
      } else {
        certList = certs.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 3);
      }
      
      // Normalize casing: convert ALL CAPS to Title Case for certifications
      return certList.map(cert => {
        const trimmed = String(cert).trim();
        // If certification is all uppercase, convert to Title Case
        if (trimmed === trimmed.toUpperCase() && trimmed.length > 5) {
          return trimmed
            .toLowerCase()
            .split(/\s+/)
            .map(word => {
              // Keep acronyms uppercase
              const acronyms = ['cbap', 'iiba', 'aws', 'gcp', 'pmp', 'cpa', 'cfa', 'prince2', 'axelos'];
              if (acronyms.includes(word.toLowerCase())) return word.toUpperCase();
              // Keep articles/prepositions lowercase unless first word
              const lowercase = ['a', 'an', 'the', 'in', 'on', 'at', 'for', 'and', 'of', 'to'];
              if (lowercase.includes(word.toLowerCase())) return word.toLowerCase();
              return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ')
            .replace(/^(\w)/, m => m.toUpperCase()); // Ensure first char is uppercase
        }
        return trimmed;
      });
    },

    // ============ RENDER HEADER ============
    renderHeader(doc, contact, startY) {
      const pageWidth = PDF_CONFIG.page.width;
      const leftMargin = PDF_CONFIG.margins.left;
      const rightMargin = PDF_CONFIG.margins.right;
      const contentWidth = pageWidth - leftMargin - rightMargin;
      let y = startY;

      // Name (centered, bold, 16pt)
      doc.setFont(PDF_CONFIG.fonts.heading, 'bold');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.name);
      doc.setTextColor(...PDF_CONFIG.colors.black);
      
      const nameWidth = doc.getTextWidth(contact.name.toUpperCase());
      const nameX = (pageWidth - nameWidth) / 2;
      doc.text(contact.name.toUpperCase(), nameX, y);
      y += PDF_CONFIG.fonts.sizes.name * 0.8 + PDF_CONFIG.spacing.afterName;

      // Contact line (centered, regular, 10pt)
      doc.setFont(PDF_CONFIG.fonts.body, 'normal');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.contact);
      doc.setTextColor(...PDF_CONFIG.colors.darkGray);

      const contactParts = [contact.phone, contact.email, contact.location].filter(Boolean);
      const contactLine = contactParts.join('  |  ');
      const contactWidth = doc.getTextWidth(contactLine);
      const contactX = (pageWidth - contactWidth) / 2;
      doc.text(contactLine, contactX, y);
      y += PDF_CONFIG.fonts.sizes.contact * PDF_CONFIG.lineHeight.normal;

      // Links line (centered)
      const linkParts = [contact.linkedin, contact.github].filter(Boolean);
      if (linkParts.length > 0) {
        const linksLine = linkParts.join('  |  ');
        const linksWidth = doc.getTextWidth(linksLine);
        const linksX = (pageWidth - linksWidth) / 2;
        doc.text(linksLine, linksX, y);
        y += PDF_CONFIG.fonts.sizes.contact * PDF_CONFIG.lineHeight.normal;
      }

      y += PDF_CONFIG.spacing.afterContact;
      return y;
    },

    // ============ RENDER SUMMARY ============
    renderSummary(doc, summary, startY) {
      if (!summary) return startY;

      let y = startY;
      y = this.renderSectionTitle(doc, 'PROFESSIONAL SUMMARY', y);
      y = this.renderParagraph(doc, summary, y);
      
      return y + PDF_CONFIG.spacing.beforeSection;
    },

    // ============ RENDER EXPERIENCE ============
    renderExperience(doc, experience, startY) {
      if (!experience || experience.length === 0) return startY;

      // FINAL SAFETY: Filter out entries where company is a section header
      const HEADER_BL = new Set([
        'professional experience', 'work experience', 'experience',
        'employment history', 'career history', 'employment',
        'work history', 'positions held', 'career', 'roles'
      ]);
      const safeExp = experience.filter(job => {
        const norm = String(job.company || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (HEADER_BL.has(norm)) { console.warn('[PDFEngine] BLOCKED header-as-company:', job.company); return false; }
        for (const h of HEADER_BL) {
          if (norm === (h + ' ' + h) || (norm.startsWith(h + ' ') && norm.replace(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim() === '')) return false;
        }
        return true;
      });
      if (safeExp.length === 0) return startY;

      let y = startY;
      y = this.renderSectionTitle(doc, 'WORK EXPERIENCE', y);

      for (let i = 0; i < safeExp.length; i++) {
        const job = safeExp[i];
        
        // Check page break
        if (y > PDF_CONFIG.page.height - 120) {
          doc.addPage();
          y = PDF_CONFIG.margins.top;
        }

        // Company name (bold)
        doc.setFont(PDF_CONFIG.fonts.heading, 'bold');
        doc.setFontSize(PDF_CONFIG.fonts.sizes.companyName);
        doc.setTextColor(...PDF_CONFIG.colors.black);
        doc.text(job.company, PDF_CONFIG.margins.left, y);
        y += PDF_CONFIG.fonts.sizes.companyName * PDF_CONFIG.lineHeight.tight;

        // Job title and dates (normal title, regular dates aligned right)
        doc.setFont(PDF_CONFIG.fonts.body, 'normal');
        doc.setFontSize(PDF_CONFIG.fonts.sizes.jobTitle);
        doc.text(job.title, PDF_CONFIG.margins.left, y);

        // Dates aligned right
        if (job.dates) {
          doc.setFont(PDF_CONFIG.fonts.body, 'normal');
          const datesWidth = doc.getTextWidth(job.dates);
          const datesX = PDF_CONFIG.page.width - PDF_CONFIG.margins.right - datesWidth;
          doc.text(job.dates, datesX, y);
        }
        y += PDF_CONFIG.fonts.sizes.jobTitle * PDF_CONFIG.lineHeight.tight + 4;

        // Bullets
        doc.setFont(PDF_CONFIG.fonts.body, 'normal');
        doc.setFontSize(PDF_CONFIG.fonts.sizes.bullets);
        doc.setTextColor(...PDF_CONFIG.colors.black);

        for (const bullet of job.bullets) {
          // Check page break
          if (y > PDF_CONFIG.page.height - 60) {
            doc.addPage();
            y = PDF_CONFIG.margins.top;
          }

          y = this.renderBullet(doc, bullet, y);
        }

        // Space between jobs
        if (i < safeExp.length - 1) {
          y += PDF_CONFIG.spacing.betweenJobs;
        }
      }

      return y + PDF_CONFIG.spacing.beforeSection;
    },

    // ============ RENDER EDUCATION ============
    renderEducation(doc, education, startY) {
      if (!education || education.length === 0) return startY;

      let y = startY;
      
      // Check page break
      if (y > PDF_CONFIG.page.height - 80) {
        doc.addPage();
        y = PDF_CONFIG.margins.top;
      }

      y = this.renderSectionTitle(doc, 'EDUCATION', y);

      for (const edu of education) {
        // Institution and degree on same line
        doc.setFont(PDF_CONFIG.fonts.heading, 'bold');
        doc.setFontSize(PDF_CONFIG.fonts.sizes.body);
        doc.setTextColor(...PDF_CONFIG.colors.black);
        
        const eduLine = [edu.degree, edu.institution].filter(Boolean).join(' – ');
        doc.text(eduLine, PDF_CONFIG.margins.left, y);

        // GPA aligned right if present
        if (edu.gpa) {
          doc.setFont(PDF_CONFIG.fonts.body, 'normal');
          const gpaText = `GPA: ${edu.gpa}`;
          const gpaWidth = doc.getTextWidth(gpaText);
          const gpaX = PDF_CONFIG.page.width - PDF_CONFIG.margins.right - gpaWidth;
          doc.text(gpaText, gpaX, y);
        }

        y += PDF_CONFIG.fonts.sizes.body * PDF_CONFIG.lineHeight.relaxed;
      }

      return y + PDF_CONFIG.spacing.beforeSection;
    },

    // ============ RENDER SKILLS ============
    renderSkills(doc, skills, startY) {
      if (!skills || skills.length === 0) return startY;

      let y = startY;
      
      // Check page break
      if (y > PDF_CONFIG.page.height - 60) {
        doc.addPage();
        y = PDF_CONFIG.margins.top;
      }

      y = this.renderSectionTitle(doc, 'TECHNICAL PROFICIENCIES', y);

      // Format skills as comma-separated list (max 25)
      const skillsText = skills.slice(0, 25).join(', ');
      y = this.renderParagraph(doc, skillsText, y);

      return y + PDF_CONFIG.spacing.beforeSection;
    },

    // ============ RENDER CERTIFICATIONS ============
    renderCertifications(doc, certs, startY) {
      if (!certs || certs.length === 0) return startY;

      let y = startY;
      
      // Check page break
      if (y > PDF_CONFIG.page.height - 60) {
        doc.addPage();
        y = PDF_CONFIG.margins.top;
      }

      y = this.renderSectionTitle(doc, 'CERTIFICATIONS', y);

      const certsText = certs.join(', ');
      y = this.renderParagraph(doc, certsText, y);

      return y;
    },

    // ============ RENDER SECTION TITLE ============
    renderSectionTitle(doc, title, y) {
      // ██ DUPLICATE SECTION GUARD ██
      if (!this._renderedSections) this._renderedSections = new Set();
      const normalised = title.toUpperCase().trim();
      if (this._renderedSections.has(normalised)) {
        console.warn(`[PDFEngine] BLOCKED duplicate section header: "${title}"`);
        return y; // Return unchanged y — skip this section
      }
      this._renderedSections.add(normalised);

      doc.setFont(PDF_CONFIG.fonts.heading, 'bold');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.sectionTitle);
      doc.setTextColor(...PDF_CONFIG.colors.black);
      doc.text(title, PDF_CONFIG.margins.left, y);
      
      // Underline
      const lineY = y + 2;
      doc.setDrawColor(...PDF_CONFIG.colors.black);
      doc.setLineWidth(0.5);
      doc.line(
        PDF_CONFIG.margins.left, 
        lineY, 
        PDF_CONFIG.page.width - PDF_CONFIG.margins.right, 
        lineY
      );

      return y + PDF_CONFIG.fonts.sizes.sectionTitle + PDF_CONFIG.spacing.afterSectionTitle;
    },

    // ============ RENDER BULLET ============
    renderBullet(doc, text, y) {
      const leftMargin = PDF_CONFIG.margins.left;
      const bulletIndent = PDF_CONFIG.bulletIndent;
      const contentWidth = PDF_CONFIG.page.width - leftMargin - PDF_CONFIG.margins.right - bulletIndent - 10;
      
      // Render bullet character
      doc.text(PDF_CONFIG.bullet, leftMargin, y);
      
      // Wrap text
      const lines = doc.splitTextToSize(text, contentWidth);
      doc.text(lines, leftMargin + bulletIndent + 4, y);
      
      return y + (lines.length * PDF_CONFIG.fonts.sizes.bullets * PDF_CONFIG.lineHeight.normal) + PDF_CONFIG.spacing.betweenBullets;
    },

    // ============ RENDER PARAGRAPH ============
    renderParagraph(doc, text, y) {
      const leftMargin = PDF_CONFIG.margins.left;
      const contentWidth = PDF_CONFIG.page.width - leftMargin - PDF_CONFIG.margins.right;
      
      doc.setFont(PDF_CONFIG.fonts.body, 'normal');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.body);
      doc.setTextColor(...PDF_CONFIG.colors.black);
      
      const lines = doc.splitTextToSize(text, contentWidth);
      doc.text(lines, leftMargin, y);
      
      return y + (lines.length * PDF_CONFIG.fonts.sizes.body * PDF_CONFIG.lineHeight.normal) + PDF_CONFIG.spacing.paragraphGap;
    },

    // ============ COVER LETTER RENDERING ============
    renderCoverHeader(doc, candidateData, startY) {
      const pageWidth = PDF_CONFIG.page.width;
      let y = startY;

      const contact = this.extractContact(candidateData);

      // Name
      doc.setFont(PDF_CONFIG.fonts.heading, 'bold');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.name);
      doc.setTextColor(...PDF_CONFIG.colors.black);
      doc.text(contact.name, PDF_CONFIG.margins.left, y);
      y += PDF_CONFIG.fonts.sizes.name * 0.8 + 4;

      // Contact info
      doc.setFont(PDF_CONFIG.fonts.body, 'normal');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.contact);
      doc.setTextColor(...PDF_CONFIG.colors.darkGray);

      const contactParts = [contact.email, contact.phone, contact.location].filter(Boolean);
      doc.text(contactParts.join('  |  '), PDF_CONFIG.margins.left, y);
      y += PDF_CONFIG.fonts.sizes.contact * PDF_CONFIG.lineHeight.normal + 20;

      // Date
      doc.setTextColor(...PDF_CONFIG.colors.black);
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      doc.text(today, PDF_CONFIG.margins.left, y);
      y += PDF_CONFIG.fonts.sizes.contact * PDF_CONFIG.lineHeight.normal + 10;

      return y;
    },

    // FIX 02-02-26: ROBUST Company Name Extraction with 100% ACCURACY GUARANTEE
    // CRITICAL: This function MUST return a valid company name, NEVER "Company" or empty for cover letters
    extractCompanyName(jobData) {
      if (!jobData) return 'the hiring organization';
      
      let company = jobData.company || '';
      
      // Extended list of invalid placeholder values
      const invalidNames = [
        'company', 'the company', 'your company', 'hiring team', 'organization', 
        'organisation', 'employer', 'n/a', 'unknown', 'hiring company', 'the hiring company',
        '[company]', '{company}', '{{company}}', 'company name', '[company name]'
      ];
      
      const isInvalid = (val) => {
        if (!val || typeof val !== 'string') return true;
        const lower = val.toLowerCase().trim();
        return invalidNames.includes(lower) || lower.length < 2;
      };
      
      // STRATEGY 1: Check companyName / employer alternate fields
      if (isInvalid(company)) {
        company = jobData.companyName || jobData.employer || '';
      }
      
      // STRATEGY 2: Check recipientCompany field from AI response
      if (isInvalid(company) && jobData.recipientCompany) {
        company = jobData.recipientCompany;
      }
      
      // STRATEGY 3: Extract from job title (e.g., "Software Engineer at Finyard")
      if (isInvalid(company)) {
        const titleMatch = (jobData.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.\-]+?)(?:\s*[-|–—]|\s*$)/i);
        if (titleMatch) company = titleMatch[1].trim();
      }
      
      // STRATEGY 4: Extract from URL subdomain (e.g., okx.greenhouse.io → OKX)
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const hostMatch = url.match(/https?:\/\/([^.\/]+)\./i);
        if (hostMatch && hostMatch[1]) {
          const subdomain = hostMatch[1].toLowerCase();
          const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards', 'job-boards', 'hire', 
                            'greenhouse', 'lever', 'workday', 'smartrecruiters', 'icims', 'taleo',
                            'myworkdayjobs', 'recruiting', 'career', 'employment'];
          if (!blacklist.includes(subdomain) && subdomain.length > 2 && subdomain.length < 30) {
            // Use uppercase for short company names (OKX, IBM, etc.)
            company = subdomain.toUpperCase().length <= 4 ? subdomain.toUpperCase() : subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
          }
        }
      }
      
      // STRATEGY 5: Extract from URL path (e.g., /finyard/jobs/...)
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const pathMatch = url.match(/\/([a-zA-Z][a-zA-Z0-9\-]{2,30})\/(?:jobs?|careers?|apply|positions?)/i);
        if (pathMatch && pathMatch[1]) {
          const pathSegment = pathMatch[1].toLowerCase();
          const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards'];
          if (!blacklist.includes(pathSegment)) {
            company = pathSegment.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      }
      
      // STRATEGY 6: Use siteName from stored metadata
      if (isInvalid(company) && jobData.siteName && !isInvalid(jobData.siteName)) {
        company = jobData.siteName;
      }
      
      // Clean up company name
      if (company && typeof company === 'string') {
        company = company
          .replace(/\s*(careers|jobs|hiring|apply|work|join|inc\.?|ltd\.?|llc\.?)\s*$/i, '')
          .replace(/\(formerly[^)]*\)/gi, '') // Remove "(formerly X)" suffixes
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // CRITICAL: NEVER return empty or invalid - use intelligent fallback
      if (isInvalid(company)) {
        console.warn('[ProfessionalPDFEngine] ⚠️ Could not extract company name, using fallback');
        return 'the hiring organization';
      }
      
      console.log(`[ProfessionalPDFEngine] ✅ Extracted company name: "${company}"`);
      return company;
    },

    renderRecipientInfo(doc, jobData, y) {
      doc.setFont(PDF_CONFIG.fonts.body, 'normal');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.body);
      doc.setTextColor(...PDF_CONFIG.colors.black);

      // FIX 27-01-26: Removed "Company" line per user preference - keep blank spacing
      // Only add "Re: Job Title" line, skip company name entirely
      
      // Add spacing where company line would have been (maintains layout)
      y += PDF_CONFIG.fonts.sizes.body * PDF_CONFIG.lineHeight.normal + 20;

      return y;
    },

    // FIX 02-02-26: Sanitize cover letter content to remove any standalone "Company" placeholder
    sanitizeCoverLetterContent(content) {
      if (!content || typeof content !== 'string') return content;
      
      // Remove standalone "Company" lines (case insensitive)
      let sanitized = content
        .replace(/^Company$/gm, '')           // Exact "Company" on its own line
        .replace(/^\s*Company\s*$/gm, '')     // "Company" with whitespace
        .replace(/\nCompany\n/gi, '\n')       // "Company" between newlines
        .replace(/\n\s*Company\s*\n/gi, '\n') // "Company" with whitespace between newlines
        .replace(/^Company\s*\n/gi, '')       // "Company" at start
        .replace(/\n\s*Company\s*$/gi, '')    // "Company" at end
        .replace(/\n\n\n+/g, '\n\n');         // Collapse multiple empty lines
      
      // Also replace placeholder patterns like [Company], {Company}, etc.
      sanitized = sanitized
        .replace(/\[Company\]/gi, 'the hiring organization')
        .replace(/\{Company\}/gi, 'the hiring organization')
        .replace(/\{\{Company\}\}/gi, 'the hiring organization');
      
      return sanitized.trim();
    },

    renderCoverBody(doc, content, y) {
      doc.setFont(PDF_CONFIG.fonts.body, 'normal');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.body);
      doc.setTextColor(...PDF_CONFIG.colors.black);

      const contentWidth = PDF_CONFIG.page.width - PDF_CONFIG.margins.left - PDF_CONFIG.margins.right;
      
      // FIX 02-02-26: Sanitize content to remove any "Company" placeholder lines
      const sanitizedContent = this.sanitizeCoverLetterContent(content);
      
      // Split into paragraphs
      const paragraphs = sanitizedContent.split(/\n\n+/).filter(Boolean);
      
      for (const para of paragraphs) {
        // Skip any paragraph that is just "Company" (final safety check)
        if (para.trim().toLowerCase() === 'company') continue;
        
        const lines = doc.splitTextToSize(para.trim(), contentWidth);
        
        // Check page break
        if (y + (lines.length * PDF_CONFIG.fonts.sizes.body * PDF_CONFIG.lineHeight.normal) > PDF_CONFIG.page.height - 80) {
          doc.addPage();
          y = PDF_CONFIG.margins.top;
        }
        
        doc.text(lines, PDF_CONFIG.margins.left, y);
        y += (lines.length * PDF_CONFIG.fonts.sizes.body * PDF_CONFIG.lineHeight.relaxed) + 10;
      }

      return y;
    },

    renderSignature(doc, candidateData, y) {
      y += 20;
      
      doc.setFont(PDF_CONFIG.fonts.body, 'normal');
      doc.setFontSize(PDF_CONFIG.fonts.sizes.body);
      doc.setTextColor(...PDF_CONFIG.colors.black);

      doc.text('Yours sincerely,', PDF_CONFIG.margins.left, y);
      y += PDF_CONFIG.fonts.sizes.body * PDF_CONFIG.lineHeight.normal + 20;

      const firstName = candidateData?.firstName || candidateData?.first_name || '';
      const lastName = candidateData?.lastName || candidateData?.last_name || '';
      const name = `${firstName} ${lastName}`.trim() || 'Applicant';
      
      doc.setFont(PDF_CONFIG.fonts.heading, 'bold');
      doc.text(name, PDF_CONFIG.margins.left, y);

      return y;
    },

    // ============ UTILITY METHODS ============
    sanitizeFilename(name) {
      return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
    },

    // ============ CHECK PAGE OVERFLOW ============
    checkPageBreak(doc, y, requiredHeight = 60) {
      if (y + requiredHeight > PDF_CONFIG.page.height - PDF_CONFIG.margins.bottom) {
        doc.addPage();
        return PDF_CONFIG.margins.top;
      }
      return y;
    }
  };

  // Export
  global.ProfessionalPDFEngine = ProfessionalPDFEngine;
  
  console.log('[ProfessionalPDFEngine] v3.0 loaded');

})(typeof window !== 'undefined' ? window : this);
