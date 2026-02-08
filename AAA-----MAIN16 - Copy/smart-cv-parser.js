// smart-cv-parser.js - Intelligent CV Parser with Deep Section Detection v2.0
// Features: Multi-format support, smart section detection, bullet normalization, date extraction

(function(global) {
  'use strict';

  // ============ SECTION DETECTION PATTERNS ============
  const SECTION_PATTERNS = {
    summary: {
      headers: [
        'PROFESSIONAL SUMMARY', 'EXECUTIVE SUMMARY', 'SUMMARY', 'PROFILE', 
        'OBJECTIVE', 'CAREER OBJECTIVE', 'ABOUT ME', 'OVERVIEW', 'PERSONAL STATEMENT'
      ],
      regex: /^(?:professional\s+)?(?:summary|profile|objective|overview|about\s*me)/i
    },
    experience: {
      headers: [
        'PROFESSIONAL EXPERIENCE', 'WORK EXPERIENCE', 'EXPERIENCE', 'EMPLOYMENT',
        'EMPLOYMENT HISTORY', 'CAREER HISTORY', 'WORK HISTORY', 'POSITIONS HELD'
      ],
      regex: /^(?:professional\s+|work\s+)?(?:experience|employment|career\s+history)/i
    },
    education: {
      headers: [
        'EDUCATION', 'ACADEMIC BACKGROUND', 'ACADEMIC QUALIFICATIONS',
        'EDUCATIONAL QUALIFICATIONS', 'QUALIFICATIONS', 'ACADEMIC HISTORY'
      ],
      regex: /^(?:education|academic|qualifications)/i
    },
    skills: {
      headers: [
        'SKILLS', 'TECHNICAL SKILLS', 'CORE SKILLS', 'KEY SKILLS', 
        'COMPETENCIES', 'CORE COMPETENCIES', 'TECHNICAL COMPETENCIES',
        'AREAS OF EXPERTISE', 'EXPERTISE'
      ],
      regex: /^(?:technical\s+|core\s+|key\s+)?(?:skills|competencies|expertise)/i
    },
    certifications: {
      headers: [
        'CERTIFICATIONS', 'CERTIFICATES', 'LICENSES', 'CREDENTIALS',
        'PROFESSIONAL CERTIFICATIONS', 'PROFESSIONAL LICENSES',
        'ACCREDITATIONS', 'TRAINING'
      ],
      regex: /^(?:professional\s+)?(?:certifications?|certificates?|licenses?|credentials?|accreditations?)/i
    },
    projects: {
      headers: [
        'PROJECTS', 'KEY PROJECTS', 'RELEVANT PROJECTS', 'PERSONAL PROJECTS',
        'SIDE PROJECTS', 'PROJECT EXPERIENCE'
      ],
      regex: /^(?:key\s+|relevant\s+|personal\s+)?projects?/i
    },
    awards: {
      headers: [
        'AWARDS', 'HONORS', 'ACHIEVEMENTS', 'RECOGNITION',
        'AWARDS AND RECOGNITION', 'HONOURS'
      ],
      regex: /^(?:awards?|honors?|honours?|achievements?|recognition)/i
    },
    publications: {
      headers: [
        'PUBLICATIONS', 'PAPERS', 'RESEARCH', 'RESEARCH PUBLICATIONS'
      ],
      regex: /^(?:publications?|papers?|research)/i
    }
  };

  // ============ KNOWN COMPANY PATTERNS ============
  const KNOWN_COMPANIES = new Set([
    'meta', 'facebook', 'google', 'alphabet', 'amazon', 'aws', 'microsoft', 'apple',
    'netflix', 'nvidia', 'tesla', 'uber', 'airbnb', 'stripe', 'salesforce', 'oracle',
    'ibm', 'intel', 'cisco', 'adobe', 'sap', 'vmware', 'servicenow', 'workday',
    'hubspot', 'twilio', 'datadog', 'snowflake', 'crowdstrike', 'palantir',
    'accenture', 'deloitte', 'pwc', 'kpmg', 'ey', 'mckinsey', 'bain', 'bcg',
    'jpmorgan', 'goldman', 'morgan stanley', 'citi', 'citigroup', 'barclays',
    'blackrock', 'fidelity', 'citadel', 'jane street', 'two sigma', 'de shaw'
  ]);

  // ============ JOB TITLE PATTERNS ============
  const JOB_TITLE_KEYWORDS = new Set([
    'engineer', 'developer', 'architect', 'analyst', 'manager', 'director',
    'scientist', 'specialist', 'lead', 'consultant', 'designer', 'administrator',
    'coordinator', 'officer', 'executive', 'vp', 'president', 'founder',
    'cto', 'ceo', 'cfo', 'coo', 'head', 'chief', 'associate', 'principal',
    'staff', 'senior', 'junior', 'intern', 'trainee'
  ]);

  // ============ DATE PATTERNS ============
  const DATE_PATTERNS = {
    // YYYY-MM - Present
    yearMonthRange: /(\d{4}[-\/]\d{1,2})\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2})/gi,
    // Month YYYY - Month YYYY or Present
    monthYearRange: /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*[-–—]\s*(Present|(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/gi,
    // YYYY - YYYY or Present
    yearRange: /\b(\d{4})\s*[-–—]\s*(Present|\d{4})\b/gi,
    // Single year
    singleYear: /\b(19|20)\d{2}\b/g
  };

  // ============ SMART CV PARSER ============
  const SmartCVParser = {

    // ============ MAIN PARSE FUNCTION ============
    parse(text, options = {}) {
      const startTime = performance.now();
      console.log('[SmartCVParser] Parsing CV text...');

      if (!text || typeof text !== 'string') {
        return this.emptyResult();
      }

      // Normalize text
      const normalizedText = this.normalizeText(text);
      
      // Extract contact info (usually at the top)
      const contact = this.extractContact(normalizedText);
      
      // Split into sections
      const sections = this.splitSections(normalizedText);
      
      // Parse each section type
      const result = {
        contact,
        summary: this.parseSummary(sections.summary),
        experience: this.parseExperience(sections.experience),
        education: this.parseEducation(sections.education),
        skills: this.parseSkills(sections.skills),
        certifications: this.parseCertifications(sections.certifications),
        projects: this.parseProjects(sections.projects),
        awards: sections.awards || '',
        publications: sections.publications || '',
        rawSections: sections
      };

      const timing = performance.now() - startTime;
      console.log(`[SmartCVParser] Parsed in ${timing.toFixed(0)}ms`);
      
      return { ...result, timing };
    },

    // ============ EMPTY RESULT ============
    emptyResult() {
      return {
        contact: { name: '', email: '', phone: '', location: '', linkedin: '', github: '' },
        summary: '',
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        projects: [],
        awards: '',
        publications: '',
        rawSections: {},
        timing: 0
      };
    },

    // ============ NORMALIZE TEXT ============
    normalizeText(text) {
      return text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\t/g, ' ')
        .replace(/\u00A0/g, ' ')    // Non-breaking space
        .replace(/\u2022/g, '•')    // Bullet
        .replace(/\u2013/g, '–')    // En-dash
        .replace(/\u2014/g, '—')    // Em-dash
        .replace(/\u2018|\u2019/g, "'")  // Smart quotes
        .replace(/\u201C|\u201D/g, '"')  // Smart double quotes
        .trim();
    },

    // ============ EXTRACT CONTACT INFO ============
    extractContact(text) {
      const contact = {
        name: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        github: ''
      };

      // Get first few lines for contact info
      const firstLines = text.split('\n').slice(0, 15).join('\n');

      // Email
      const emailMatch = firstLines.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) contact.email = emailMatch[0];

      // Phone (various formats)
      const phoneMatch = firstLines.match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/);
      if (phoneMatch) contact.phone = phoneMatch[0].trim();

      // LinkedIn
      const linkedinMatch = firstLines.match(/linkedin\.com\/in\/[\w-]+/i);
      if (linkedinMatch) contact.linkedin = linkedinMatch[0];

      // GitHub
      const githubMatch = firstLines.match(/github\.com\/[\w-]+/i);
      if (githubMatch) contact.github = githubMatch[0];

      // Name (usually first line, possibly all caps)
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        const firstLine = lines[0].trim();
        // If first line looks like a name (2-4 words, no special chars except spaces/hyphens)
        if (/^[A-Za-z\s\-']+$/.test(firstLine) && firstLine.split(/\s+/).length <= 5) {
          contact.name = this.titleCase(firstLine);
        }
      }

      // Location (city, state/country patterns)
      const locationMatch = firstLines.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2}|[A-Za-z\s]+)\b/);
      if (locationMatch) {
        contact.location = locationMatch[0];
      }

      return contact;
    },

    // ============ SPLIT INTO SECTIONS ============
    splitSections(text) {
      const sections = {};
      const lines = text.split('\n');
      
      let currentSection = null;
      let currentContent = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (currentSection) currentContent.push('');
          continue;
        }

        // Check if this line is a section header
        const sectionType = this.detectSectionHeader(trimmed);
        
        if (sectionType) {
          // Save previous section
          if (currentSection) {
            sections[currentSection] = currentContent.join('\n').trim();
          }
          currentSection = sectionType;
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      // Save last section
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }

      return sections;
    },

    // ============ DETECT SECTION HEADER ============
    detectSectionHeader(line) {
      const cleaned = line.toUpperCase().replace(/[:\s]+$/, '').trim();
      
      for (const [sectionType, config] of Object.entries(SECTION_PATTERNS)) {
        // Check exact header match
        if (config.headers.includes(cleaned)) {
          return sectionType;
        }
        
        // Check regex pattern
        if (config.regex.test(line)) {
          return sectionType;
        }
      }
      
      return null;
    },

    // ============ PARSE SUMMARY ============
    parseSummary(text) {
      if (!text) return '';
      // Remove leading bullets or dashes and clean up
      return text
        .split('\n')
        .map(l => l.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    },

    // ============ PARSE EXPERIENCE ============
    parseExperience(text) {
      if (!text) return [];
      
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;
      let bulletBuffer = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (!trimmed) {
          // Flush bullet buffer
          if (currentJob && bulletBuffer.length > 0) {
            currentJob.bullets.push(...bulletBuffer);
            bulletBuffer = [];
          }
          continue;
        }

        // Try to detect job header
        const jobHeader = this.detectJobHeader(trimmed);
        
        if (jobHeader) {
          // Save previous job
          if (currentJob) {
            if (bulletBuffer.length > 0) {
              currentJob.bullets.push(...bulletBuffer);
              bulletBuffer = [];
            }
            jobs.push(currentJob);
          }
          
          currentJob = {
            company: jobHeader.company,
            title: jobHeader.title,
            dates: jobHeader.dates,
            location: jobHeader.location || '',
            bullets: []
          };
        } else if (currentJob) {
          // Check if it's a bullet point
          if (this.isBulletPoint(trimmed)) {
            const bullet = this.cleanBullet(trimmed);
            if (bullet) bulletBuffer.push(bullet);
          } else if (this.isLocationLine(trimmed) && !currentJob.location) {
            currentJob.location = trimmed;
          } else if (this.isDateLine(trimmed) && !currentJob.dates) {
            currentJob.dates = this.normalizeDates(trimmed);
          }
        }
      }

      // Don't forget the last job
      if (currentJob) {
        if (bulletBuffer.length > 0) {
          currentJob.bullets.push(...bulletBuffer);
        }
        jobs.push(currentJob);
      }

      return jobs;
    },

    // ============ DETECT JOB HEADER ============
    detectJobHeader(line) {
      // Pattern 1: Company | Title | Dates
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 2) {
          return {
            company: this.stripDates(parts[0]),
            title: this.stripDates(parts[1]),
            dates: this.extractDates(parts[2] || line) || '',
            location: parts[3] || ''
          };
        }
      }

      // Pattern 2: Company — Title — Dates (em-dash or en-dash)
      const dashParts = line.split(/\s*[–—]\s*/).map(p => p.trim()).filter(Boolean);
      if (dashParts.length >= 2) {
        const hasCompanyIndicator = this.looksLikeCompany(dashParts[0]);
        const hasTitleIndicator = this.looksLikeJobTitle(dashParts[1]);
        
        if (hasCompanyIndicator || hasTitleIndicator) {
          return {
            company: this.stripDates(dashParts[0]),
            title: this.stripDates(dashParts[1]),
            dates: this.extractDates(dashParts[2] || line) || '',
            location: ''
          };
        }
      }

      // Pattern 3: Known company at start
      const lowerLine = line.toLowerCase();
      for (const company of KNOWN_COMPANIES) {
        if (lowerLine.startsWith(company)) {
          const rest = line.substring(company.length).trim();
          const restParts = rest.split(/\s*[|–—]\s*/).map(p => p.trim()).filter(Boolean);
          return {
            company: this.titleCase(company),
            title: this.stripDates(restParts[0] || ''),
            dates: this.extractDates(restParts[1] || rest) || '',
            location: ''
          };
        }
      }

      // Pattern 4: Line contains both company suffix and job title keyword
      const hasCompanySuffix = /\b(Inc|LLC|Ltd|Corp|Corporation|Company|Co|PLC|Group)\b/i.test(line);
      const hasJobTitle = [...JOB_TITLE_KEYWORDS].some(kw => 
        new RegExp(`\\b${kw}\\b`, 'i').test(line)
      );
      
      if (hasCompanySuffix || hasJobTitle) {
        // Try to split on common separators
        const sep = line.includes('|') ? '|' : (line.includes('–') ? '–' : (line.includes('—') ? '—' : null));
        if (sep) {
          const parts = line.split(sep).map(p => p.trim());
          return {
            company: this.stripDates(parts[0]),
            title: this.stripDates(parts[1] || ''),
            dates: this.extractDates(line) || '',
            location: ''
          };
        }
      }

      return null;
    },

    // ============ HELPER METHODS ============
    looksLikeCompany(text) {
      const lower = text.toLowerCase();
      if (KNOWN_COMPANIES.has(lower)) return true;
      return /\b(Inc|LLC|Ltd|Corp|Corporation|Company|Co|PLC|Group|Holdings|Partners|Technologies|Solutions)\b/i.test(text);
    },

    looksLikeJobTitle(text) {
      const lower = text.toLowerCase();
      return [...JOB_TITLE_KEYWORDS].some(kw => lower.includes(kw));
    },

    isBulletPoint(line) {
      return /^[•\-*▪▸►→]\s/.test(line) || /^[\d]+[\.\)]\s/.test(line);
    },

    cleanBullet(line) {
      return line.replace(/^[•\-*▪▸►→\d\.\)]+\s*/, '').trim();
    },

    isLocationLine(line) {
      return /^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}$/.test(line) || 
             /^[A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+$/.test(line);
    },

    isDateLine(line) {
      return DATE_PATTERNS.yearRange.test(line) || 
             DATE_PATTERNS.monthYearRange.test(line) ||
             DATE_PATTERNS.yearMonthRange.test(line);
    },

    extractDates(text) {
      if (!text) return '';
      
      // Try each date pattern
      let match;
      
      // Reset regex state
      DATE_PATTERNS.monthYearRange.lastIndex = 0;
      DATE_PATTERNS.yearMonthRange.lastIndex = 0;
      DATE_PATTERNS.yearRange.lastIndex = 0;
      
      match = DATE_PATTERNS.monthYearRange.exec(text);
      if (match) return this.normalizeDates(match[0]);
      
      match = DATE_PATTERNS.yearMonthRange.exec(text);
      if (match) return this.normalizeDates(match[0]);
      
      match = DATE_PATTERNS.yearRange.exec(text);
      if (match) return this.normalizeDates(match[0]);
      
      return '';
    },

    stripDates(text) {
      if (!text) return '';
      return text
        .replace(DATE_PATTERNS.monthYearRange, '')
        .replace(DATE_PATTERNS.yearMonthRange, '')
        .replace(DATE_PATTERNS.yearRange, '')
        .replace(/\s*[|–—]\s*$/, '')
        .replace(/^\s*[|–—]\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    },

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
      
      // Normalize dashes
      return dateStr.replace(/-/g, '–').replace(/\s*–\s*/g, ' – ');
    },

    titleCase(str) {
      if (!str) return '';
      return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    },

    // ============ PARSE EDUCATION ============
    parseEducation(text) {
      if (!text) return [];
      
      const education = [];
      const lines = text.split('\n').filter(l => l.trim());
      let currentEntry = null;

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Check if this looks like an education entry
        const hasInstitution = /\b(University|College|Institute|School|Academy)\b/i.test(trimmed);
        const hasDegree = /\b(Bachelor|Master|PhD|Doctor|Associate|Diploma|Certificate|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|M\.?B\.?A\.?)\b/i.test(trimmed);
        
        if (hasInstitution || hasDegree) {
          if (currentEntry) education.push(currentEntry);
          
          // Parse the entry
          if (trimmed.includes('|')) {
            const parts = trimmed.split('|').map(p => p.trim());
            currentEntry = {
              institution: parts[0] || '',
              degree: parts[1] || '',
              date: this.extractDates(parts[2] || trimmed) || '',
              gpa: this.extractGPA(trimmed)
            };
          } else {
            currentEntry = {
              institution: hasInstitution ? trimmed : '',
              degree: hasDegree ? trimmed : '',
              date: this.extractDates(trimmed) || '',
              gpa: this.extractGPA(trimmed)
            };
          }
        } else if (currentEntry) {
          // Additional info for current entry
          if (!currentEntry.gpa) {
            const gpa = this.extractGPA(trimmed);
            if (gpa) currentEntry.gpa = gpa;
          }
          if (!currentEntry.date) {
            const date = this.extractDates(trimmed);
            if (date) currentEntry.date = date;
          }
        }
      }

      if (currentEntry) education.push(currentEntry);
      return education;
    },

    extractGPA(text) {
      const match = text.match(/GPA[:\s]*(\d+\.?\d*)/i);
      return match ? match[1] : '';
    },

    // ============ PARSE SKILLS ============
    parseSkills(text) {
      if (!text) return [];
      
      // Common soft skills to filter out
      const softSkills = new Set([
        'collaboration', 'communication', 'teamwork', 'leadership', 'problem-solving',
        'initiative', 'ownership', 'passion', 'dedication', 'motivation',
        'self-starter', 'interpersonal', 'proactive', 'detail-oriented'
      ]);
      
      const skills = text
        .replace(/[•\-*▪]/g, ',')
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => {
          if (s.length < 2 || s.length > 40) return false;
          if (softSkills.has(s.toLowerCase())) return false;
          return true;
        });
      
      // Deduplicate
      return [...new Set(skills.map(s => s.toLowerCase()))].map(s => this.formatSkill(s));
    },

    formatSkill(skill) {
      const acronyms = new Set([
        'sql', 'aws', 'gcp', 'api', 'rest', 'html', 'css', 'json', 'xml',
        'ci', 'cd', 'etl', 'ml', 'ai', 'nlp', 'llm', 'gpu', 'cpu', 'ui', 'ux',
        'http', 'https', 'ssh', 'ftp', 'tcp', 'ip', 'dns', 'vpn', 'cdn', 's3',
        'ec2', 'rds', 'iam', 'vpc', 'ecs', 'eks', 'sqs', 'sns', 'jwt', 'oauth'
      ]);
      
      if (acronyms.has(skill.toLowerCase())) {
        return skill.toUpperCase();
      }
      
      return skill.split(/\s+/).map(word => {
        if (word.length <= 2 || acronyms.has(word.toLowerCase())) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
    },

    // ============ PARSE CERTIFICATIONS ============
    parseCertifications(text) {
      if (!text) return [];
      
      return text
        .replace(/[•\-*▪]/g, ',')
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 5 && s.length < 100);
    },

    // ============ PARSE PROJECTS ============
    parseProjects(text) {
      if (!text) return [];
      
      const projects = [];
      const lines = text.split('\n');
      let currentProject = null;
      let bulletBuffer = [];

      for (const line of lines) {
        const trimmed = line.trim();
        
        if (!trimmed) {
          if (currentProject && bulletBuffer.length > 0) {
            currentProject.bullets.push(...bulletBuffer);
            bulletBuffer = [];
          }
          continue;
        }

        // Check if this starts a new project (not a bullet)
        if (!this.isBulletPoint(trimmed) && trimmed.length > 5) {
          if (currentProject) {
            if (bulletBuffer.length > 0) {
              currentProject.bullets.push(...bulletBuffer);
              bulletBuffer = [];
            }
            projects.push(currentProject);
          }
          
          const parts = trimmed.split('|').map(p => p.trim());
          currentProject = {
            name: parts[0] || trimmed,
            role: parts[1] || '',
            bullets: []
          };
        } else if (currentProject && this.isBulletPoint(trimmed)) {
          const bullet = this.cleanBullet(trimmed);
          if (bullet) bulletBuffer.push(bullet);
        }
      }

      if (currentProject) {
        if (bulletBuffer.length > 0) {
          currentProject.bullets.push(...bulletBuffer);
        }
        projects.push(currentProject);
      }

      return projects;
    }
  };

  // Export
  global.SmartCVParser = SmartCVParser;
  
  console.log('[SmartCVParser] v2.0 loaded');

})(typeof window !== 'undefined' ? window : this);
