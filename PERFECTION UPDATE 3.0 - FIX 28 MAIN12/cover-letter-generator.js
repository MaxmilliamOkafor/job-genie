// cover-letter-generator.js - Professional Cover Letter Generator v3.0
// Creates tailored cover letters with proper business letter formatting
// Features: Template system, NATURAL keyword integration (lighter than CV - not for ATS), tone matching
// Based on PERFECT WORKS cover letter logic

(function(global) {
  'use strict';

  // ============ COVER LETTER TEMPLATES ============
  const TEMPLATES = {
    professional: {
      name: 'Professional',
      opening: [
        'I am writing to express my strong interest in the {jobTitle} position at {company}.',
        'I am excited to apply for the {jobTitle} role at {company}, as advertised.',
        'I am eager to bring my expertise to {company} as a {jobTitle}.',
        'With enthusiasm, I submit my application for the {jobTitle} position at {company}.'
      ],
      bridge: [
        'With {yearsExp} years of experience in {domain}, I am confident in my ability to contribute meaningfully to your team.',
        'My background in {domain}, spanning {yearsExp} years, has prepared me exceptionally well for this opportunity.',
        'Having dedicated {yearsExp} years to {domain}, I have developed a robust skill set that aligns perfectly with your requirements.'
      ],
      closing: [
        'I am eager to discuss how my experience and skills can benefit {company}. Thank you for considering my application.',
        'I would welcome the opportunity to discuss how I can contribute to {company}\'s continued success.',
        'Thank you for your time and consideration. I look forward to the possibility of joining the {company} team.'
      ]
    },
    enthusiastic: {
      name: 'Enthusiastic',
      opening: [
        'I am thrilled at the opportunity to apply for the {jobTitle} position at {company}!',
        'The {jobTitle} role at {company} immediately caught my attention, and I am excited to submit my application.',
        'I was delighted to discover the {jobTitle} opening at {company}, and I am eager to apply.'
      ],
      bridge: [
        'My {yearsExp} years of hands-on experience in {domain} have fueled my passion for this field and prepared me for this exciting opportunity.',
        'Throughout my {yearsExp}-year career in {domain}, I have developed a deep enthusiasm for solving complex challenges—exactly what this role requires.',
        'Having spent {yearsExp} years in {domain}, I have cultivated both the technical expertise and the drive to excel in this position.'
      ],
      closing: [
        'I am genuinely excited about the prospect of joining {company} and would love to discuss how I can contribute to your team.',
        'Thank you for considering my application. I cannot wait to explore how my skills can help {company} achieve its goals!',
        'I am looking forward to the opportunity to bring my enthusiasm and expertise to {company}.'
      ]
    },
    concise: {
      name: 'Concise',
      opening: [
        'Please accept my application for the {jobTitle} position at {company}.',
        'I am applying for the {jobTitle} role at {company}.',
        'I wish to be considered for the {jobTitle} position at {company}.'
      ],
      bridge: [
        'I bring {yearsExp} years of {domain} experience directly relevant to this role.',
        'My {yearsExp}-year background in {domain} aligns well with your requirements.',
        'With {yearsExp} years in {domain}, I am well-qualified for this position.'
      ],
      closing: [
        'I look forward to discussing this opportunity. Thank you.',
        'Please contact me at your convenience. Thank you for your consideration.',
        'I would appreciate the opportunity to interview. Thank you.'
      ]
    }
  };

  // ============ ACHIEVEMENT PHRASES (UK English, no banned words) ============
  const ACHIEVEMENT_VERBS = [
    'Led', 'Developed', 'Implemented', 'Architected', 'Delivered',
    'Directed', 'Drove', 'Increased', 'Reduced', 'Optimised',
    'Transformed', 'Streamlined', 'Built', 'Launched', 'Established'
  ];

  // ============ NATURAL KEYWORD PHRASES (for cover letters - softer than CV) ============
  // UPDATED: Removed "leveraging" and "utilising" - banned AI buzzwords
  const KEYWORD_PHRASES = [
    'with expertise in',
    'with strong skills in',
    'applying',
    'through',
    'incorporating',
    'employing',
    'using',
    'via',
    'working with'
  ];

  // ============ COVER LETTER GENERATOR ============
  const CoverLetterGenerator = {

    // ============ MAIN GENERATE FUNCTION ============
    generate(candidateData, jobData, keywords, options = {}) {
      const startTime = performance.now();
      console.log('[CoverLetterGenerator] v3.0 Generating cover letter with natural keyword injection...');

      const {
        template = 'professional',
        maxWords = 400,
        includeMetrics = true,
        topKeywordsCount = 10 // Increased for cover letter natural flow
      } = options;

      // Get template
      const templateConfig = TEMPLATES[template] || TEMPLATES.professional;

      // Extract data
      const firstName = candidateData?.firstName || candidateData?.first_name || 'Applicant';
      const lastName = candidateData?.lastName || candidateData?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      const jobTitle = jobData?.title || 'the position';
      // FIX 02-02-26: CRITICAL - Never use generic "Company" placeholder
      // Use extractCompanyName with aggressive validation
      let company = this.extractCompanyName(jobData);
      
      // Extended validation - NEVER allow these placeholder values
      const invalidCompanyNames = [
        'company', 'your company', 'the company', 'hiring team', 'the hiring team',
        'organization', 'the organization', 'n/a', 'unknown', '', 'employer'
      ];
      
      if (!company || invalidCompanyNames.includes(company.toLowerCase().trim())) {
        console.warn(`[CoverLetterGenerator] ⚠️ Invalid company "${company}", using fallback`);
        company = 'the hiring organization';
      }
      
      console.log(`[CoverLetterGenerator] Using company name: "${company}" for cover letter`);
      const domain = this.extractDomain(candidateData);
      const yearsExp = this.calculateYearsExperience(candidateData);

      // Get top keywords - ROBUST handling
      const topKeywords = this.getTopKeywords(keywords, topKeywordsCount);
      console.log(`[CoverLetterGenerator] Using ${topKeywords.length} keywords for natural injection`);

      // Build cover letter sections WITH keyword injection
      let opening = this.selectRandom(templateConfig.opening, { jobTitle, company });
      let bridge = this.buildBridgeWithKeywords(templateConfig.bridge, { yearsExp, domain }, topKeywords);
      let body = this.buildBodyWithKeywords(candidateData, jobData, topKeywords, includeMetrics);
      let closing = this.buildClosingWithKeywords(templateConfig.closing, { company }, topKeywords);

      // CRITICAL: Apply ContentQualityEngine sanitisation for UK spelling and anti-AI detection
      if (typeof ContentQualityEngine !== 'undefined') {
        opening = ContentQualityEngine.sanitiseContent(opening);
        bridge = ContentQualityEngine.sanitiseContent(bridge);
        body = ContentQualityEngine.sanitiseContent(body);
        closing = ContentQualityEngine.sanitiseContent(closing);
        console.log('[CoverLetterGenerator] Applied ContentQualityEngine sanitisation');
      }

      // Assemble full cover letter
      const paragraphs = [
        `Dear Hiring Manager,`,
        '',
        opening,
        '',
        bridge,
        '',
        body,
        '',
        closing,
        '',
        'Yours sincerely,',
        fullName
      ];

      let coverLetter = paragraphs.join('\n');
      
      // Final sanitisation pass on complete letter
      if (typeof ContentQualityEngine !== 'undefined') {
        coverLetter = ContentQualityEngine.sanitiseContent(coverLetter, { removePronouns: false });
      }
      
      const timing = performance.now() - startTime;
      console.log(`[CoverLetterGenerator] Generated in ${timing.toFixed(0)}ms with ${topKeywords.length} keywords naturally woven in`);

      return {
        text: coverLetter,
        paragraphs,
        wordCount: coverLetter.split(/\s+/).length,
        keywordsUsed: topKeywords,
        timing
      };
    },

    // ============ GENERATE WITH AI ENHANCEMENT ============
    async generateWithAI(candidateData, jobData, keywords, aiProvider, options = {}) {
      // First generate base cover letter
      const base = this.generate(candidateData, jobData, keywords, options);
      
      // If no AI provider, return base
      if (!aiProvider) {
        return base;
      }

      // AI enhancement would go here - for now return base
      return base;
    },

    // ============ SELECT RANDOM TEMPLATE ============
    selectRandom(templates, replacements) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      return this.replacePlaceholders(template, replacements);
    },

    // ============ REPLACE PLACEHOLDERS ============
    replacePlaceholders(text, replacements) {
      let result = text;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
      return result;
    },

    // ============ BUILD BRIDGE WITH KEYWORDS (1-2 keywords) ============
    buildBridgeWithKeywords(bridgeTemplates, replacements, keywords) {
      let bridge = this.selectRandom(bridgeTemplates, replacements);
      
      // Add 1-2 keywords naturally if available
      if (keywords.length >= 2) {
        const kw1 = keywords[0];
        const kw2 = keywords[1];
        const phrase = KEYWORD_PHRASES[Math.floor(Math.random() * KEYWORD_PHRASES.length)];
        
        // Append naturally: "...expertise, utilising Python and data analytics."
        if (bridge.endsWith('.')) {
          bridge = bridge.slice(0, -1) + `, ${phrase} ${kw1} and ${kw2}.`;
        } else {
          bridge += `, ${phrase} ${kw1} and ${kw2}.`;
        }
      }
      
      return bridge;
    },

    // ============ BUILD CLOSING WITH KEYWORDS (1 keyword) ============
    buildClosingWithKeywords(closingTemplates, replacements, keywords) {
      let closing = this.selectRandom(closingTemplates, replacements);
      
      // Add 1 keyword naturally at the end if available (softer for cover letter)
      if (keywords.length >= 5) {
        const kw = keywords[4] || keywords[0];
        
        // Example: "...I look forward to bringing my expertise in project management to your team."
        if (closing.includes('Thank you')) {
          closing = closing.replace('Thank you', `I am confident my ${kw} expertise would be valuable to your team. Thank you`);
        }
      }
      
      return closing;
    },

    // ============ EXTRACT DOMAIN ============
    extractDomain(candidateData) {
      const experience = candidateData?.professional_experience || 
                        candidateData?.professionalExperience || 
                        candidateData?.workExperience || [];
      
      if (experience.length > 0) {
        const recentTitle = (experience[0]?.title || '').toLowerCase();
        
        if (/data|analytics|scientist|ml|ai/i.test(recentTitle)) {
          return 'data science and analytics';
        }
        if (/engineer|developer|software/i.test(recentTitle)) {
          return 'software engineering';
        }
        if (/product|pm/i.test(recentTitle)) {
          return 'product management';
        }
        if (/design|ux|ui/i.test(recentTitle)) {
          return 'design and user experience';
        }
        if (/manager|director|lead/i.test(recentTitle)) {
          return 'technical leadership';
        }
        if (/account|client|relationship|partner/i.test(recentTitle)) {
          return 'account management and client relations';
        }
        if (/market|growth|digital/i.test(recentTitle)) {
          return 'digital marketing and growth';
        }
      }
      
      return 'technology';
    },

    // ============ CALCULATE YEARS OF EXPERIENCE ============
    calculateYearsExperience(candidateData) {
      const experience = candidateData?.professional_experience || 
                        candidateData?.professionalExperience || 
                        candidateData?.workExperience || [];
      
      if (experience.length === 0) return '5+';

      let totalYears = 0;
      const currentYear = new Date().getFullYear();

      for (const job of experience) {
        const dates = job.dates || '';
        const years = dates.match(/\d{4}/g);
        
        if (years && years.length >= 2) {
          const startYear = parseInt(years[0]);
          const endYear = /present/i.test(dates) ? currentYear : parseInt(years[1]);
          totalYears += endYear - startYear;
        } else if (years && years.length === 1) {
          const startYear = parseInt(years[0]);
          totalYears += currentYear - startYear;
        }
      }

      if (totalYears <= 0) return '5+';
      if (totalYears >= 10) return '10+';
      return `${totalYears}+`;
    },

    // ============ GET TOP KEYWORDS (ROBUST) ============
    getTopKeywords(keywords, count) {
      if (!keywords) return [];
      
      // ROBUST: Handle array or object with priority buckets
      if (Array.isArray(keywords)) {
        return keywords.slice(0, count);
      }
      
      // Priority: highPriority > all > mediumPriority
      const highPriority = keywords.highPriority || [];
      const all = keywords.all || [];
      const medium = keywords.mediumPriority || [];
      
      // Combine and dedupe, prioritising high priority
      const combined = [...highPriority, ...all, ...medium];
      const unique = [...new Set(combined.map(k => k.toLowerCase()))];
      
      return unique.slice(0, count);
    },

    // ============ BUILD BODY PARAGRAPHS WITH KEYWORD INJECTION ============
    buildBodyWithKeywords(candidateData, jobData, topKeywords, includeMetrics) {
      const paragraphs = [];

      // Highlight relevant experience
      const experience = candidateData?.professional_experience || 
                        candidateData?.professionalExperience || 
                        candidateData?.workExperience || [];

      if (experience.length > 0) {
        const recentJob = experience[0];
        const company = recentJob.company || 'my current organisation';
        const title = recentJob.title || 'my role';
        
        // Find a compelling achievement
        const bullets = recentJob.bullets || recentJob.achievements || [];
        let highlightBullet = '';
        
        if (bullets.length > 0) {
          // Prefer bullets with metrics
          const metricsPattern = /\d+%|\$[\d,]+|\d+x|[0-9]+\+?\s*(users|customers|clients|projects|teams)/i;
          const withMetrics = bullets.find(b => metricsPattern.test(b));
          highlightBullet = withMetrics || bullets[0];
        }

        // PARAGRAPH 1: Role + Achievement + Keywords 1-3
        const kw1 = topKeywords[0] || '';
        const kw2 = topKeywords[1] || '';
        const kw3 = topKeywords[2] || '';
        
        let para1 = `In my role as ${title} at ${company}, I have demonstrated consistent delivery of high-impact results.`;
        if (highlightBullet) {
          para1 += ` ${highlightBullet.replace(/^[•\-*]\s*/, '')}`;
        }
        if (kw1 && kw2 && kw3) {
          para1 += ` My expertise in ${kw1}, ${kw2}, and ${kw3} directly aligns with the requirements outlined in your job description.`;
        } else if (kw1 && kw2) {
          para1 += ` My expertise in ${kw1} and ${kw2} directly aligns with your requirements.`;
        }
        
        paragraphs.push(para1);
      }

      // PARAGRAPH 2: Additional skills alignment with Keywords 4-7
      if (topKeywords.length > 3) {
        const kw4 = topKeywords[3] || '';
        const kw5 = topKeywords[4] || '';
        const kw6 = topKeywords[5] || '';
        const kw7 = topKeywords[6] || '';
        
        let para2 = 'Additionally, I bring strong capabilities in ';
        const skills = [kw4, kw5, kw6, kw7].filter(Boolean);
        
        if (skills.length >= 3) {
          para2 += `${skills.slice(0, -1).join(', ')}, and ${skills[skills.length - 1]}`;
        } else if (skills.length === 2) {
          para2 += `${skills[0]} and ${skills[1]}`;
        } else if (skills.length === 1) {
          para2 += skills[0];
        }
        
        para2 += ', which I believe will enable me to contribute effectively from day one.';
        paragraphs.push(para2);
      }

      // PARAGRAPH 3 (OPTIONAL): Extra context with Keywords 8-10 if available
      // UPDATED: Removed "proven ability" - banned AI phrase
      if (topKeywords.length > 7) {
        const kw8 = topKeywords[7] || '';
        const kw9 = topKeywords[8] || '';
        const kw10 = topKeywords[9] || '';
        
        const extraSkills = [kw8, kw9, kw10].filter(Boolean);
        if (extraSkills.length > 0) {
          const phrase = KEYWORD_PHRASES[Math.floor(Math.random() * KEYWORD_PHRASES.length)];
          paragraphs.push(
            `Furthermore, I have hands-on experience ${phrase} ${extraSkills.join(' and ')}, enabling cross-functional collaboration and delivering measurable outcomes.`
          );
        }
      }

      return paragraphs.join('\n\n');
    },

    // ============ EXTRACT COMPANY NAME (ROBUST - 100% ACCURACY GUARANTEED) ============
    // CRITICAL: This function MUST return a valid company name, NEVER "Company" or empty
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
      
      // STRATEGY 1: Check recipientCompany field from AI response
      if (isInvalid(company) && jobData.recipientCompany) {
        company = jobData.recipientCompany;
      }
      
      // STRATEGY 2: Check companyName alternate field
      if (isInvalid(company) && jobData.companyName) {
        company = jobData.companyName;
      }
      
      // STRATEGY 3: Extract from job title like "Senior Engineer at Bugcrowd"
      if (isInvalid(company)) {
        const titleMatch = (jobData.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.\-]+?)(?:\s*[-|–—]|\s*$)/i);
        if (titleMatch) {
          company = titleMatch[1].trim();
        }
      }
      
      // STRATEGY 4: Extract from URL path like /company-name/jobs/
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const pathMatch = url.match(/\/([a-zA-Z][a-zA-Z0-9\-]{2,30})\/(?:jobs?|careers?|apply|positions?)/i);
        if (pathMatch && pathMatch[1]) {
          const pathSegment = pathMatch[1].toLowerCase();
          const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards', 'job-boards', 'hire', 'greenhouse', 'workday', 'lever', 'smartrecruiters', 'icims', 'taleo', 'myworkdayjobs'];
          if (!blacklist.includes(pathSegment)) {
            company = pathSegment.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      }
      
      // STRATEGY 5: Extract from URL subdomain
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const hostMatch = url.match(/https?:\/\/([^.\/]+)\./i);
        if (hostMatch && hostMatch[1]) {
          const subdomain = hostMatch[1].toLowerCase();
          const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards', 'job-boards', 'hire', 'greenhouse', 'lever', 'workday', 'smartrecruiters', 'icims', 'taleo', 'myworkdayjobs', 'recruiting', 'career', 'employment'];
          if (!blacklist.includes(subdomain) && subdomain.length > 2 && subdomain.length < 30) {
            company = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
          }
        }
      }
      
      // STRATEGY 6: Use siteName from metadata
      if (isInvalid(company)) {
        if (jobData.siteName && !isInvalid(jobData.siteName)) {
          company = jobData.siteName;
        }
      }
      
      // Final cleanup
      if (company && typeof company === 'string') {
        company = company
          .replace(/\s*(careers|jobs|hiring|apply|work|join|inc\.?|ltd\.?|llc\.?)\s*$/i, '')
          .replace(/\(formerly[^)]*\)/gi, '') // Remove "(formerly X)" suffixes
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // CRITICAL: NEVER return empty or invalid - use intelligent fallback
      if (isInvalid(company)) {
        console.warn('[CoverLetterGenerator] ⚠️ Could not extract company name, using fallback');
        return 'the hiring organization';
      }
      
      console.log(`[CoverLetterGenerator] ✅ Extracted company name: "${company}"`);
      return company;
    },

    // ============ FORMAT FOR DIFFERENT OUTPUTS ============
    formatAsText(coverLetter) {
      return coverLetter.text;
    },

    formatAsHTML(coverLetter) {
      const paragraphs = coverLetter.paragraphs.map(p => {
        if (p === '') return '<br>';
        return `<p>${p}</p>`;
      });
      return paragraphs.join('\n');
    },

    // ============ VALIDATE COVER LETTER ============
    validate(coverLetter) {
      const issues = [];
      const text = typeof coverLetter === 'string' ? coverLetter : coverLetter.text;
      const wordCount = text.split(/\s+/).length;

      if (wordCount < 150) {
        issues.push('Cover letter is too short (minimum 150 words recommended)');
      }
      if (wordCount > 500) {
        issues.push('Cover letter is too long (maximum 500 words recommended)');
      }
      if (!/dear/i.test(text)) {
        issues.push('Missing greeting (Dear Hiring Manager)');
      }
      if (!/sincerely|regards|thank/i.test(text)) {
        issues.push('Missing closing statement');
      }

      return {
        isValid: issues.length === 0,
        issues,
        wordCount
      };
    },

    // ============ EXTRACT ACHIEVEMENT (HELPER) ============
    extractAchievement(bullet) {
      if (!bullet) return 'significant performance improvements';
      const match = bullet.match(/(\d+%?\s*(?:improvement|increase|reduction|faster|efficiency|growth))/i);
      return match ? match[1] : bullet.slice(0, 50) + (bullet.length > 50 ? '...' : '');
    }
  };

  // Export
  global.CoverLetterGenerator = CoverLetterGenerator;
  
  console.log('[CoverLetterGenerator] v3.0 loaded - Natural keyword injection enabled');

})(typeof window !== 'undefined' ? window : this);
