// cover-letter-generator.js - Professional Cover Letter Generator v2.0
// Creates tailored cover letters with proper business letter formatting
// Features: Template system, keyword integration, tone matching

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

  // ============ ACHIEVEMENT PHRASES ============
  const ACHIEVEMENT_VERBS = [
    'Led', 'Developed', 'Implemented', 'Architected', 'Delivered',
    'Spearheaded', 'Drove', 'Increased', 'Reduced', 'Optimized',
    'Transformed', 'Streamlined', 'Built', 'Launched', 'Pioneered'
  ];

  // ============ COVER LETTER GENERATOR ============
  const CoverLetterGenerator = {

    // ============ MAIN GENERATE FUNCTION ============
    generate(candidateData, jobData, keywords, options = {}) {
      const startTime = performance.now();
      console.log('[CoverLetterGenerator] Generating cover letter...');

      const {
        template = 'professional',
        maxWords = 400,
        includeMetrics = true,
        topKeywordsCount = 8
      } = options;

      // Get template
      const templateConfig = TEMPLATES[template] || TEMPLATES.professional;

      // Extract data
      const firstName = candidateData?.firstName || candidateData?.first_name || 'Applicant';
      const lastName = candidateData?.lastName || candidateData?.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      const jobTitle = jobData?.title || 'the position';
      const company = jobData?.company || 'your company';
      const domain = this.extractDomain(candidateData);
      const yearsExp = this.calculateYearsExperience(candidateData);

      // Get top keywords
      const topKeywords = this.getTopKeywords(keywords, topKeywordsCount);

      // Build cover letter sections
      const opening = this.selectRandom(templateConfig.opening, { jobTitle, company });
      const bridge = this.selectRandom(templateConfig.bridge, { yearsExp, domain });
      const body = this.buildBody(candidateData, jobData, topKeywords, includeMetrics);
      const closing = this.selectRandom(templateConfig.closing, { company });

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

      const coverLetter = paragraphs.join('\n');
      
      const timing = performance.now() - startTime;
      console.log(`[CoverLetterGenerator] Generated in ${timing.toFixed(0)}ms`);

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
      // This can be enhanced with API calls to OpenAI/Kimi
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

    // ============ EXTRACT DOMAIN ============
    extractDomain(candidateData) {
      // Try to determine domain from job titles
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

    // ============ GET TOP KEYWORDS ============
    getTopKeywords(keywords, count) {
      if (!keywords) return [];
      
      const all = keywords.highPriority || keywords.all || [];
      return all.slice(0, count);
    },

    // ============ BUILD BODY PARAGRAPHS ============
    buildBody(candidateData, jobData, topKeywords, includeMetrics) {
      const paragraphs = [];

      // Highlight relevant experience
      const experience = candidateData?.professional_experience || 
                        candidateData?.professionalExperience || 
                        candidateData?.workExperience || [];

      if (experience.length > 0) {
        const recentJob = experience[0];
        const company = recentJob.company || 'my current organization';
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

        paragraphs.push(
          `In my role as ${title} at ${company}, I have demonstrated consistent delivery of high-impact results. ` +
          (highlightBullet ? highlightBullet.replace(/^[•\-*]\s*/, '') : '') +
          (topKeywords.length > 0 ? ` My expertise in ${topKeywords.slice(0, 3).join(', ')} directly aligns with the requirements outlined in your job description.` : '')
        );
      }

      // Add skills alignment
      if (topKeywords.length > 3) {
        paragraphs.push(
          `Additionally, I bring strong capabilities in ${topKeywords.slice(3, 6).join(', ')}, ` +
          `which I believe will enable me to contribute effectively from day one.`
        );
      }

      return paragraphs.join('\n\n');
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
    }
  };

  // Export
  global.CoverLetterGenerator = CoverLetterGenerator;
  
  console.log('[CoverLetterGenerator] v2.0 loaded');

})(typeof window !== 'undefined' ? window : this);
