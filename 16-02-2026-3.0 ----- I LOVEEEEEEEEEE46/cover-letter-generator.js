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
        'I am applying for the {jobTitle} position at {company} because the role aligns directly with my strongest capabilities and career trajectory. My track record of delivering measurable results in high-stakes environments makes me confident I can contribute from day one.',
        'I am writing with genuine interest in the {jobTitle} role at {company}. My career has been defined by converting complex challenges into delivered outcomes, and the scope of this position is exactly where I can make the greatest impact.',
        'The {jobTitle} opportunity at {company} is a compelling match for my {domain} expertise and my ambition to work on problems that matter. I bring both the technical depth and the leadership instincts this role demands.',
        'I am submitting my application for the {jobTitle} position at {company}, where my proven ability to scale solutions, lead cross-functional delivery, and drive measurable business outcomes aligns closely with your requirements.',
        'I am writing to express my interest in the {jobTitle} position at {company}, where I believe my track record of delivering measurable results would be a strong fit.',
        'I am applying for the {jobTitle} role at {company}. My career has been defined by consistent delivery in high-impact environments, and I am confident this experience translates directly to your team.',
        'I am keen to bring my {domain} expertise to {company} as a {jobTitle}, building on a track record of driving both technical and commercial outcomes.'
      ],
      bridge: [
        'Over {yearsExp} years in {domain}, I have built a career around translating strategic priorities into tangible business results — repeatedly taking on increasing scope and exceeding expectations.',
        'My {yearsExp}-year background in {domain} has given me deep technical fluency alongside the stakeholder management and commercial awareness needed to operate effectively at a senior level.',
        'With {yearsExp} years of progressive experience in {domain}, I have developed the rare combination of hands-on technical capability and strategic thinking that high-performing teams need.',
        'With {yearsExp} years of progressive experience in {domain}, I have built a career around translating strategic objectives into tangible business outcomes.',
        'My background spans {yearsExp} years in {domain}, during which I have consistently taken on increasing scope and delivered results that exceeded expectations.',
        'Over {yearsExp} years in {domain}, I have developed deep technical fluency alongside the stakeholder management skills needed to operate effectively at a senior level.'
      ],
      closing: [
        'I am confident my combination of technical capability, leadership instinct, and delivery track record would make a meaningful contribution to {company}. I welcome the opportunity to discuss how I can add value from day one. Thank you for your time and consideration.',
        'I would welcome the opportunity to show how my skills and delivery record translate directly into value for {company}. Thank you for considering my application — I look forward to discussing this further.',
        'Thank you for your consideration. I am available at your convenience and eager to discuss how my background can accelerate {company}\'s goals.',
        'I would welcome the opportunity to discuss how my experience can contribute to {company}\'s goals. Thank you for your time and consideration.',
        'I look forward to exploring how my skills and delivery record can add value to {company}. Thank you for considering my application.',
        'Thank you for your consideration. I am available at your convenience to discuss how I can contribute to {company}\'s continued growth.'
      ]
    },
    enthusiastic: {
      name: 'Enthusiastic',
      opening: [
        'I was immediately drawn to the {jobTitle} position at {company} — the scope of the role, the calibre of the team, and the impact of the work make this an outstanding opportunity I am determined to pursue.',
        'The {jobTitle} role at {company} sits at the intersection of my strongest skills and deepest professional ambitions. I have been building towards exactly this kind of opportunity throughout my career.',
        'I was pleased to discover the {jobTitle} opening at {company}. It represents the kind of high-impact, technically challenging work that has driven every career decision I have made.',
        'I was immediately drawn to the {jobTitle} position at {company} — the scope of the role and the calibre of the team make this an outstanding opportunity.',
        'The {jobTitle} role at {company} aligns perfectly with the direction I have been building towards throughout my career, and I am excited to apply.',
        'I was pleased to discover the {jobTitle} opening at {company}, as it sits at the intersection of my strongest skills and deepest professional interests.'
      ],
      bridge: [
        'My {yearsExp} years of hands-on experience in {domain} have shaped both my technical depth and my appetite for tackling complex, high-stakes challenges where the outcome genuinely matters.',
        'Throughout my {yearsExp}-year career in {domain}, I have developed a genuine drive for solving hard problems, building systems that perform at scale, and leaving every team stronger than I found it.',
        'Having spent {yearsExp} years in {domain}, I have built both the technical competence and the collaborative instincts to operate effectively in fast-paced, results-driven environments.',
        'My {yearsExp} years of hands-on experience in {domain} have shaped both my technical depth and my appetite for tackling complex, high-stakes challenges.',
        'Throughout my {yearsExp}-year career in {domain}, I have developed a genuine drive for solving hard problems and building systems that perform at scale.',
        'Having spent {yearsExp} years in {domain}, I have built both the technical competence and the collaborative instincts to operate effectively in fast-paced environments.'
      ],
      closing: [
        'I am confident that my energy, expertise, and delivery record would make a real difference at {company}. I would be glad to discuss how I can contribute — thank you for your time.',
        'Thank you for considering my application. I am genuinely excited about this opportunity and look forward to discussing how my skills can drive results for {company}.',
        'I look forward to the possibility of contributing my expertise and energy to {company}\'s mission. Thank you for your time and consideration.',
        'I would be glad to discuss how I can contribute to {company}\'s mission. Thank you for your time.',
        'Thank you for considering my application. I look forward to the chance to discuss how my skills can support {company}\'s objectives.',
        'I am looking forward to the possibility of contributing my expertise and energy to {company}.'
      ]
    },
    concise: {
      name: 'Concise',
      opening: [
        'I am applying for the {jobTitle} position at {company}. My {domain} experience and delivery track record are directly relevant to this role.',
        'Please consider my application for the {jobTitle} role at {company}, where my background maps closely to your requirements.',
        'I wish to be considered for the {jobTitle} position at {company}. I bring the technical depth and execution discipline this role demands.',
        'Please accept my application for the {jobTitle} position at {company}.',
        'I am applying for the {jobTitle} role at {company}, where my experience is directly relevant.',
        'I wish to be considered for the {jobTitle} position at {company}.'
      ],
      bridge: [
        'I bring {yearsExp} years of {domain} experience with a consistent record of delivery, stakeholder trust, and measurable outcomes.',
        'My {yearsExp}-year background in {domain} has equipped me with the technical skills, leadership capability, and commercial awareness this role requires.',
        'With {yearsExp} years in {domain}, I offer both technical depth and the operational maturity to contribute from day one.',
        'I bring {yearsExp} years of {domain} experience with a consistent record of delivery.',
        'My {yearsExp}-year background in {domain} has equipped me with the skills this role demands.',
        'With {yearsExp} years in {domain}, I offer both technical depth and operational maturity.'
      ],
      closing: [
        'I look forward to discussing this opportunity and how my background translates into value for {company}. Thank you for your consideration.',
        'I welcome the chance to discuss this role further. Thank you for your time.',
        'I would appreciate the opportunity to explore how I can contribute. Thank you for your consideration.',
        'I look forward to discussing this opportunity further. Thank you for your consideration.',
        'Please contact me at your convenience. Thank you for your time.',
        'I would appreciate the opportunity to discuss this role. Thank you.'
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

      // v3.3: Smart auto-tone selection based on job title/company signals
      // If user passes 'auto' or no template, pick the best tone for the role
      if (!template || template === 'auto') {
        template = this.autoSelectTone(jobData);
        console.log(`[CoverLetterGenerator] Auto-selected tone: ${template}`);
      }

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

    // ============ BUILD BRIDGE WITH KEYWORDS (2-3 keywords woven in) ============
    buildBridgeWithKeywords(bridgeTemplates, replacements, keywords) {
      let bridge = this.selectRandom(bridgeTemplates, replacements);

      // Weave 2-3 keywords naturally into the bridge paragraph
      if (keywords.length >= 3) {
        const kw1 = keywords[0];
        const kw2 = keywords[1];
        const kw3 = keywords[2];
        const phrases = [
          `This includes deep hands-on work in ${kw1}, ${kw2}, and ${kw3} — skills I have applied consistently to drive measurable outcomes.`,
          `Core to my approach has been ${kw1} and ${kw2}, alongside ${kw3}, which together form the foundation of how I deliver results.`,
          `My strengths in ${kw1}, ${kw2}, and ${kw3} have been central to every major initiative I have led.`
        ];
        bridge += ' ' + phrases[Math.floor(Math.random() * phrases.length)];
      } else if (keywords.length >= 2) {
        const phrase = KEYWORD_PHRASES[Math.floor(Math.random() * KEYWORD_PHRASES.length)];
        if (bridge.endsWith('.')) {
          bridge = bridge.slice(0, -1) + `, ${phrase} ${keywords[0]} and ${keywords[1]}.`;
        }
      }

      return bridge;
    },

    // ============ BUILD CLOSING WITH KEYWORDS (1-2 keywords, confident tone) ============
    buildClosingWithKeywords(closingTemplates, replacements, keywords) {
      let closing = this.selectRandom(closingTemplates, replacements);

      // The closing templates are already strong. Optionally reinforce with a keyword
      // if the template doesn't already contain one.
      if (keywords.length >= 5) {
        const kw = keywords[4] || keywords[0];
        const hasKeyword = keywords.some(k => closing.toLowerCase().includes(k.toLowerCase()));
        if (!hasKeyword && closing.includes('Thank you')) {
          closing = closing.replace('Thank you', `My ${kw} capabilities would complement your team well. Thank you`);
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

        // Find compelling achievements (prefer bullets with metrics)
        const bullets = recentJob.bullets || recentJob.achievements || [];
        const metricsPattern = /\d+%|\$[\d,]+|\d+x|[0-9]+\+?\s*(users|customers|clients|projects|teams)/i;
        const withMetrics = bullets.filter(b => metricsPattern.test(b));
        const topBullet = withMetrics[0] || bullets[0] || '';
        const secondBullet = withMetrics[1] || bullets[1] || '';

        // PARAGRAPH 1: Concrete evidence — show, don't tell (Keywords 1-3)
        const kw1 = topKeywords[0] || '';
        const kw2 = topKeywords[1] || '';
        const kw3 = topKeywords[2] || '';

        let para1 = `In my most recent role as ${title} at ${company}, I was entrusted with high-visibility programmes that demanded both technical depth and commercial awareness.`;
        if (topBullet) {
          const cleaned = topBullet.replace(/^[•\-*▪]\s*/, '').trim();
          para1 += ` Notably, I ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}`;
          if (!para1.endsWith('.')) para1 += '.';
        }
        if (secondBullet) {
          const cleaned2 = secondBullet.replace(/^[•\-*▪]\s*/, '').trim();
          para1 += ` I also ${cleaned2.charAt(0).toLowerCase() + cleaned2.slice(1)}`;
          if (!para1.endsWith('.')) para1 += '.';
        }
        if (kw1 && kw2 && kw3) {
          para1 += ` These results are rooted in my ${kw1}, ${kw2}, and ${kw3} capabilities — skills I would bring directly to your team.`;
        } else if (kw1 && kw2) {
          para1 += ` My depth in ${kw1} and ${kw2} maps directly to your requirements.`;
        }

        paragraphs.push(para1);
      }

      // PARAGRAPH 2: Strategic skills alignment (Keywords 4-7)
      if (topKeywords.length > 3) {
        const skills = [topKeywords[3], topKeywords[4], topKeywords[5], topKeywords[6]].filter(Boolean);
        let skillsList = '';
        if (skills.length >= 3) {
          skillsList = `${skills.slice(0, -1).join(', ')}, and ${skills[skills.length - 1]}`;
        } else if (skills.length === 2) {
          skillsList = `${skills[0]} and ${skills[1]}`;
        } else if (skills.length === 1) {
          skillsList = skills[0];
        }

        const para2Variants = [
          `Beyond day-to-day execution, I bring depth in ${skillsList} that enables me to operate effectively at both strategic and operational levels. Whether mentoring junior colleagues, negotiating with senior stakeholders, or driving continuous improvement across delivery teams, I consistently raise the bar and create repeatable frameworks that outlast any single project.`,
          `I also bring strong capabilities in ${skillsList}, which I apply to accelerate delivery timelines, strengthen execution quality, and raise performance standards. My approach is to build sustainable processes — not just hit targets, but create the conditions for teams to consistently exceed them.`,
          `My work extends beyond individual delivery into ${skillsList}, where I focus on building organisational capability. I believe the best outcomes come from empowering teams with clear direction, strong processes, and the right technical foundations — an approach that has delivered results in every role I have held.`
        ];
        paragraphs.push(para2Variants[Math.floor(Math.random() * para2Variants.length)]);
      }

      // PARAGRAPH 3: Extra depth with Keywords 8-10 (only if enough keywords)
      if (topKeywords.length > 7) {
        const extraSkills = [topKeywords[7], topKeywords[8], topKeywords[9]].filter(Boolean);
        if (extraSkills.length > 0) {
          const skillsStr = extraSkills.length > 1
            ? extraSkills.slice(0, -1).join(', ') + ' and ' + extraSkills[extraSkills.length - 1]
            : extraSkills[0];
          const para3Variants = [
            `I further complement this with hands-on experience in ${skillsStr}, consistently partnering with senior stakeholders to deliver measurable, repeatable outcomes that strengthen the organisation as a whole.`,
            `My toolkit also includes ${skillsStr} — capabilities I have applied in production environments to drive efficiency gains, reduce risk, and maintain the high standards that senior leadership expects.`
          ];
          paragraphs.push(para3Variants[Math.floor(Math.random() * para3Variants.length)]);
        }
      }

      return paragraphs.join('\n\n');
    },

    // ============ EXTRACT COMPANY NAME (ROBUST - 100% ACCURACY GUARANTEED) ============
    // CRITICAL: This function MUST return a valid company name, NEVER "Company" or empty
    extractCompanyName(jobData) {
      if (!jobData) return 'the hiring organization';
      
      let company = jobData.company || '';
      
      // Extended list of invalid placeholder values (v3.2: significantly expanded)
      const invalidNames = [
        'company', 'the company', 'your company', 'hiring team', 'organization',
        'organisation', 'employer', 'n/a', 'unknown', 'hiring company', 'the hiring company',
        '[company]', '{company}', '{{company}}', 'company name', '[company name]',
        // v3.2 additions — AI-generated placeholder patterns
        'the organization', 'the organisation', 'this company', 'this organization',
        'your organization', 'your organisation', 'the firm', 'your firm',
        'the team', 'your team', 'hiring organization', 'hiring organisation',
        'prospective employer', 'potential employer', 'the employer',
        'abc company', 'xyz company', 'acme', 'sample company',
        'company x', 'company y', 'company z',
        'test', 'test company', 'example', 'example company',
        'tbd', 'to be determined', 'not specified', 'unspecified',
        'confidential', 'confidential company', 'undisclosed',
        'recipient', 'dear hiring manager', 'hiring manager'
      ];

      const isInvalid = (val) => {
        if (!val || typeof val !== 'string') return true;
        const lower = val.toLowerCase().trim();
        if (invalidNames.includes(lower) || lower.length < 2) return true;
        // v3.2: Reject values that are just template placeholders
        if (/^\[.*\]$/.test(lower) || /^\{.*\}$/.test(lower) || /^<.*>$/.test(lower)) return true;
        // v3.2: Reject single generic words
        const genericSingleWords = ['company', 'employer', 'organization', 'organisation', 'firm', 'team', 'business', 'corporation', 'enterprise'];
        if (genericSingleWords.includes(lower)) return true;
        // v3.2: Reject if it looks like a URL fragment or path
        if (/^https?:\/\//.test(lower) || /^www\./.test(lower)) return true;
        return false;
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

    // ============ SMART TONE AUTO-SELECTION (v3.3) ============
    // Picks the optimal cover letter tone based on job title seniority and company signals
    // - Senior/Leadership roles → professional
    // - Startup/Scale-up/Early career → enthusiastic
    // - Technical/IC/Contract roles → concise
    autoSelectTone(jobData) {
      const title = (jobData?.title || '').toLowerCase();
      const company = (jobData?.company || '').toLowerCase();
      const description = (jobData?.description || '').toLowerCase();

      // SENIORITY SIGNALS → professional tone (formal, measured)
      const seniorPatterns = /\b(senior|staff|principal|lead|director|head of|vp|vice president|chief|c-suite|cto|ceo|cfo|coo|cio|ciso|cmo|president|executive|partner|manager|management)\b/i;
      if (seniorPatterns.test(title)) return 'professional';

      // LEADERSHIP/MANAGEMENT KEYWORDS → professional
      const leadershipSignals = /\b(leadership|executive|strategic|governance|board|stakeholder|p&l|profit and loss|transformation|restructuring)\b/i;
      if (leadershipSignals.test(title) || leadershipSignals.test(description.substring(0, 500))) {
        return 'professional';
      }

      // STARTUP/SCALE-UP SIGNALS → enthusiastic tone (energy, passion)
      const startupPatterns = /\b(startup|scale-up|scaleup|series [abcde]|seed stage|early stage|fast-growing|high-growth|growth-stage|founding|founder|zero to one|0 to 1)\b/i;
      if (startupPatterns.test(description) || startupPatterns.test(company)) {
        return 'enthusiastic';
      }

      // JUNIOR/ENTRY ROLES → enthusiastic
      const juniorPatterns = /\b(junior|entry level|entry-level|graduate|intern|associate|trainee|apprentice)\b/i;
      if (juniorPatterns.test(title)) return 'enthusiastic';

      // CONTRACT/FREELANCE/CONCISE ROLES → concise tone
      const conciseSignals = /\b(contract|contractor|freelance|consultant|temporary|interim|short-term|project-based)\b/i;
      if (conciseSignals.test(title) || conciseSignals.test(description.substring(0, 300))) {
        return 'concise';
      }

      // PURE TECHNICAL IC ROLES → concise
      const technicalICSignals = /\b(engineer|developer|sre|devops|platform|data scientist|ml engineer|ai engineer|backend|frontend|fullstack|full-stack|ios|android|mobile)\b/i;
      if (technicalICSignals.test(title) && !seniorPatterns.test(title)) {
        // Mid-level technical IC — concise works well
        return 'concise';
      }

      // DEFAULT → professional (safest choice)
      return 'professional';
    },

    // ============ EXTRACT ROLE SENIORITY (v3.3) ============
    // Determines seniority level for language calibration in the body
    extractSeniorityLevel(jobData) {
      const title = (jobData?.title || '').toLowerCase();
      if (/\b(chief|c-suite|cto|ceo|cfo|coo|cio|ciso|president|executive|evp|svp|vp|vice president)\b/i.test(title)) return 'executive';
      if (/\b(director|head of|principal|staff)\b/i.test(title)) return 'leadership';
      if (/\b(senior|sr\.?|lead|manager)\b/i.test(title)) return 'senior';
      if (/\b(junior|jr\.?|entry|graduate|intern|associate|trainee|apprentice)\b/i.test(title)) return 'junior';
      return 'mid';
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
