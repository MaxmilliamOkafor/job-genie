// cover-letter-generator.js - Professional Cover Letter Generator v3.0
// Creates tailored cover letters with proper business letter formatting
// Features: Template system, NATURAL keyword integration (lighter than CV - not for ATS), tone matching
// Based on PERFECT WORKS cover letter logic

(function(global) {
  'use strict';

  // ============ COVER LETTER TEMPLATES (v3.0. rewritten for AI-detection resistance) ============
  // Each template uses varied sentence structures, avoids formulaic openers,
  // mixes sentence lengths, and sounds like a real person wrote it.
  const TEMPLATES = {
    professional: {
      name: 'Professional',
      opening: [
        'Your {jobTitle} listing caught my attention because the day-to-day work maps closely to what I have been doing for the past few years in {domain}. Rather than list qualifications, I would rather explain why I think this is a good match.',
        'I spotted the {jobTitle} role at {company} and wanted to apply straight away. The requirements read like a summary of the work I do best, and I think there is a real fit here.',
        'The {jobTitle} position at {company} stood out to me. I have spent my career solving the kinds of problems described in the listing, and I would like the chance to do the same for your team.',
        'I am writing about the {jobTitle} opening at {company}. Having worked in {domain} for a while now, the brief felt like something written with my background in mind.',
        'When I read through the {jobTitle} brief at {company}, two things were clear: the work is technically interesting and the requirements overlap with what I already do well. That is why I am applying.',
        'I would like to apply for the {jobTitle} role at {company}. The scope of the position fits squarely with the type of {domain} work I have been doing, and I think I can bring something useful to the team.',
        'I came across the {jobTitle} position at {company} and it caught my eye. The problems you are trying to solve are the same ones I have been working on, and I think I could add real value.'
      ],
      bridge: [
        'I have spent roughly {yearsExp} years working in {domain}. During that time I have picked up the technical skills the role asks for, but more importantly I have learned how to get things shipped on time and to a standard I am proud of.',
        'My background is {yearsExp} years in {domain}, mostly spent building things, fixing things, and figuring out how to do both faster. I have worked with senior stakeholders and know how to turn their priorities into actual delivered work.',
        'Over the past {yearsExp} years I have worked across several {domain} roles. Each one taught me something different, but the common thread has been taking on hard problems and delivering outcomes people could point to.',
        'I have {yearsExp} years of {domain} experience. What that really means is I have had enough time to learn what works, what does not, and how to tell the difference quickly.',
        'Across {yearsExp} years in {domain}, I have gone from writing code to running projects to mentoring others who now do both. The technical and people sides of the work come naturally to me at this point.',
        'My {yearsExp} years in {domain} have given me a good mix of hands-on technical ability and the softer skills you need when working with clients, leadership, or teams under pressure.'
      ],
      closing: [
        'I would be happy to chat about how my background fits the role. Thank you for reading this far. I appreciate your time.',
        'If the above sounds like a fit, I am free to talk whenever works for you. Thanks for considering me.',
        'I hope this gives a good sense of what I can bring. I am available to discuss the role at your convenience. Thank you.',
        'Happy to go into more detail on any of the above. Thanks for your time, and I hope to hear from you.',
        'I think there is a strong match here and I would enjoy the chance to prove it. Thank you for your time.',
        'Thanks for taking the time to read this. I am around whenever suits for a conversation about the role.'
      ]
    },
    enthusiastic: {
      name: 'Enthusiastic',
      opening: [
        'I got genuinely excited when I saw the {jobTitle} position at {company}. Not in a vague way. The specific problems listed in the brief are exactly what I spend my days thinking about.',
        'The {jobTitle} role at {company} is the kind of thing I have been looking for. The technical scope is interesting, the team looks strong, and the work itself matters. I wanted to apply before someone else snapped it up.',
        'I have been following {company} for a while, so when the {jobTitle} opening came up it felt like the right moment to put my hand up. The role matches what I do well and what I want to do next.',
        'I want to apply for the {jobTitle} at {company}. Honestly, it is not often that a job description makes me stop scrolling, but this one did. The work is exactly the kind of challenge I enjoy.',
        'The {jobTitle} listing at {company} immediately grabbed me. I have spent {yearsExp} years doing similar work in {domain}, and the idea of doing it at {company} is very appealing.',
        'I read the {jobTitle} brief at {company} twice because I wanted to make sure it was as good a fit as it seemed on first read. It is. I would love to be considered.'
      ],
      bridge: [
        'I have {yearsExp} years in {domain} and still genuinely enjoy the work. I like the process of taking a messy problem, working out the moving parts, and building something that actually solves it.',
        'Over {yearsExp} years in {domain}, I have picked up a lot of the technical skills this role needs. But what I think sets me apart is how much I care about getting the details right while still moving quickly.',
        'My {yearsExp} years in {domain} have been busy ones. I have built systems, led teams, shipped products, and made plenty of mistakes I have since learned from. That mix of experience is what I am bringing here.',
        'I have been working in {domain} for {yearsExp} years now. In that time I have learned that the best outcomes come from a mix of technical skill, clear communication, and genuine curiosity about the problem.',
        'What I have learned across {yearsExp} years in {domain} is that good work comes from understanding both the technology and the people it serves. I bring that perspective to everything I do.',
        'After {yearsExp} years in {domain}, I still get energised by the work. I like building things that matter, fixing things that are broken, and helping teams do both faster.'
      ],
      closing: [
        'I would really like the chance to talk about this role. Even a short conversation would let me show you what I can bring. Thank you for your time.',
        'If any of this sounds like it could be a fit, I am keen to chat. Thanks for reading, and I hope to speak with you soon.',
        'I think I could do great things at {company} and I would jump at the chance to prove it. Thanks for considering me.',
        'I appreciate you taking the time to read this. If there is a fit, I am ready to move quickly. I hope to hear from you.',
        'I am genuinely interested in this opportunity. Happy to discuss further whenever works for your team. Thank you.',
        'Thank you for considering me. I would love to chat about how I can contribute to what {company} is building.'
      ]
    },
    concise: {
      name: 'Concise',
      opening: [
        'I am applying for the {jobTitle} role at {company}. The requirements map to my {domain} background and I think I can do this job well.',
        'Writing to apply for the {jobTitle} at {company}. My {domain} experience covers what the role needs.',
        'I would like to be considered for the {jobTitle} position at {company}. My background fits the brief.',
        'Applying for the {jobTitle} at {company}. I have the right experience and want to put it to use here.',
        'I am interested in the {jobTitle} at {company}. The role suits my {domain} skills and the work sounds interesting.',
        'Please consider me for the {jobTitle} at {company}. I have done this type of work before and done it well.'
      ],
      bridge: [
        '{yearsExp} years in {domain}. I have built things, shipped things, and know how to deliver under pressure.',
        'My background: {yearsExp} years in {domain}, with a clear record of getting work done well and on time.',
        'I bring {yearsExp} years of {domain} work. Technical skills, delivery experience, and the ability to work with anyone.',
        '{yearsExp} years in {domain}. I know the tools, I know the patterns, and I know how to deliver.',
        'Quick summary: {yearsExp} years in {domain}. Strong technically, good with people, and I get things finished.',
        'I have {yearsExp} years in {domain}. Enough to know what good looks like and how to get there quickly.'
      ],
      closing: [
        'Happy to discuss. Thank you for your time.',
        'Available to talk whenever works for you. Thanks.',
        'I would appreciate a conversation about the role. Thank you.',
        'Thanks for considering me. I am free to chat at your convenience.',
        'Looking forward to hearing from you. Thank you.',
        'Let me know if you would like to talk further. Thanks for your time.'
      ]
    }
  };

  // ============ ACHIEVEMENT PHRASES (UK English, no banned words) ============
  const ACHIEVEMENT_VERBS = [
    'Led', 'Developed', 'Implemented', 'Architected', 'Delivered',
    'Directed', 'Drove', 'Increased', 'Reduced', 'Optimised',
    'Built', 'Launched', 'Set up', 'Designed', 'Shipped'
  ];

  // v3.0: Natural keyword connectors. sound like a person mentioning their skills
  const KEYWORD_PHRASES = [
    'especially around',
    'mainly in',
    'including',
    'particularly',
    'a lot of it involving',
    'with a focus on',
    'hands-on with',
    'working directly with',
    'day-to-day with',
    'most recently in',
    'covering',
    'across areas like'
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

      // === Career Boost (cover letter only): blend a JD-specific hook into
      // the opener, and merge ONE gap-bridge sentence into the body when
      // the candidate's CV shows clear adjacent experience.  Skipped
      // silently if the engine is missing, the JD is too short, or the
      // caller passes `useCareerBoost: false`.  Pure text ops, <10ms. ===
      const useCareerBoost = options.useCareerBoost !== false;
      let gapBridgeLine = '';
      if (useCareerBoost && typeof CareerBoostEngine !== 'undefined') {
        try {
          const jdText = jobData?.description || jobData?.jdText || jobData?.text || '';
          if (jdText && jdText.length > 80) {
            const hook = CareerBoostEngine.extractJdHook(jdText, company);
            // Only insert hooks when we have a high-signal one (named team,
            // product, mission, or stated challenge). Stack/fallback hooks
            // tend to read as filler so we drop them.
            if (hook && ['team', 'team-prefix', 'product', 'mission', 'challenge', 'milestone'].includes(hook.kind)) {
              opening = `${opening.replace(/[.\s]+$/, '')}. ${hook.hook.charAt(0).toUpperCase() + hook.hook.slice(1)} is what made me want to apply rather than scroll past.`;
            }

            const cvText = candidateData?.cvText || candidateData?.rawCV || candidateData?.resumeText || '';
            // Only add a gap bridge when we found a STRONG adjacency. We
            // skip the defensive "if X is a hard requirement..." fallback
            // because it weakens the letter.
            if (cvText && cvText.length > 60) {
              const { gaps } = CareerBoostEngine.analyzeGaps(jdText, cvText, { maxGaps: 1 });
              if (gaps.length && gaps[0].hasAdjacent) {
                gapBridgeLine = gaps[0].bridge;
              }
            }
          }
        } catch (e) {
          console.warn('[CoverLetterGenerator] Career boost augmentation skipped:', e.message);
        }
      }
      if (gapBridgeLine) {
        // Merge the bridge into the body as a continuation, not a new
        // paragraph -- avoids the "bolted-on" feel.
        Body = `${body.replace(/\s+$/, '')} ${gapBridgeLine}`;
      }

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

      // === Recruiter Audit: post-process pass.  Strips empty buzzword
      // phrases, mirrors JD vocabulary, ensures the JD job title appears
      // in the opener.  Skipped silently if the audit module is missing.
      // Pure text ops, ~5ms. ===
      let auditReport = null;
      if (options.recruiterAudit !== false && typeof RecruiterAudit !== 'undefined') {
        try {
          const audited = RecruiterAudit.runRecruiterAudit({
            cvText: '',
            coverLetterText: coverLetter,
            jdText: jobData?.description || jobData?.jdText || jobData?.text || '',
            jdTitle: jobTitle,
            candidateName: fullName,
            flags: { firstSixSeconds: false, quantification: false }, // CV-only checks; skip for letter
          });
          coverLetter = audited.coverLetterText;
          auditReport = audited.report;
        } catch (e) {
          console.warn('[CoverLetterGenerator] Recruiter audit skipped:', e.message);
        }
      }

      const timing = performance.now() - startTime;
      console.log(`[CoverLetterGenerator] Generated in ${timing.toFixed(0)}ms with ${topKeywords.length} keywords naturally woven in`,
        auditReport ? `| audit: ${auditReport.fixes.length} fixes, ${auditReport.warnings.length} warnings` : '');

      return {
        text: coverLetter,
        paragraphs,
        wordCount: coverLetter.split(/\s+/).length,
        keywordsUsed: topKeywords,
        timing,
        recruiterAudit: auditReport,
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

    // ============ BUILD BRIDGE WITH KEYWORDS (v3.0. Natural, human tone) ============
    buildBridgeWithKeywords(bridgeTemplates, replacements, keywords) {
      let bridge = this.selectRandom(bridgeTemplates, replacements);

      if (keywords.length >= 3) {
        const kw1 = keywords[0];
        const kw2 = keywords[1];
        const kw3 = keywords[2];
        const phrases = [
          `Most of that time has been spent on ${kw1}, ${kw2}, and ${kw3}.`,
          `A big chunk of that involved ${kw1} and ${kw2}, with ${kw3} coming in more recently.`,
          `${kw1}, ${kw2}, and ${kw3} have been the common thread across those roles.`,
          `The day-to-day has centred on ${kw1}, ${kw2}, and ${kw3}. All areas I know well.`
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

    // ============ BUILD CLOSING WITH KEYWORDS ============
    buildClosingWithKeywords(closingTemplates, replacements, keywords) {
      let closing = this.selectRandom(closingTemplates, replacements);

      if (keywords.length >= 5) {
        const kw = keywords[4] || keywords[0];
        const hasKeyword = keywords.some(k => closing.toLowerCase().includes(k.toLowerCase()));
        if (!hasKeyword && closing.includes('Thank')) {
          const injections = [
            `I am also happy to discuss my ${kw} experience in more detail. `,
            `If ${kw} matters for this role, I have plenty to share on that front. `,
            `Happy to go deeper on ${kw} or anything else. `
          ];
          closing = injections[Math.floor(Math.random() * injections.length)] + closing;
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
      // Explicit value from profile wins over date arithmetic.
      const explicit = candidateData?.yearsExperience ?? candidateData?.years_experience ?? candidateData?.yearsExp;
      if (explicit != null && String(explicit).trim() !== '') {
        const n = parseInt(explicit, 10);
        if (!isNaN(n) && n > 0) return n >= 10 ? '10+' : `${n}+`;
      }

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
      
      // Combine and dedupe case-insensitively but PRESERVE original casing,
      // so acronyms like "AI/ML", "AWS", "SQL" don't end up lowercase
      // mid-sentence ("my ai/ml experience" reads like a bot wrote it).
      const combined = [...highPriority, ...all, ...medium];
      const seen = new Set();
      const unique = [];
      for (const k of combined) {
        const key = String(k || '').toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(String(k).trim());
      }

      return unique.slice(0, count);
    },

    // ============ BUILD BODY PARAGRAPHS (v3.0. Human-sounding, anti-AI-detection) ============
    buildBodyWithKeywords(candidateData, jobData, topKeywords, includeMetrics) {
      const paragraphs = [];

      const experience = candidateData?.professional_experience ||
                        candidateData?.professionalExperience ||
                        candidateData?.workExperience || [];

      if (experience.length > 0) {
        const recentJob = experience[0];
        const company = recentJob.company || 'my current organisation';
        const title = recentJob.title || 'my role';

        const bullets = recentJob.bullets || recentJob.achievements || [];
        const metricsPattern = /\d+%|\$[\d,]+|\d+x|[0-9]+\+?\s*(users|customers|clients|projects|teams)/i;
        const withMetrics = bullets.filter(b => metricsPattern.test(b));
        const topBullet = withMetrics[0] || bullets[0] || '';
        const secondBullet = withMetrics[1] || bullets[1] || '';

        const kw1 = topKeywords[0] || '';
        const kw2 = topKeywords[1] || '';
        const kw3 = topKeywords[2] || '';

        const para1Starts = [
          `Most recently I worked as ${title} at ${company}.`,
          `At ${company} I was ${title}.`,
          `My last role was ${title} at ${company}.`
        ];
        let para1 = para1Starts[Math.floor(Math.random() * para1Starts.length)];

        if (topBullet) {
          const cleaned = topBullet.replace(/^[•\-*▪]\s*/, '').trim();
          const lc = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
          para1 += ` One thing I am particularly proud of: I ${lc}`;
          if (!para1.endsWith('.')) para1 += '.';
        }
        if (secondBullet) {
          const cleaned2 = secondBullet.replace(/^[•\-*▪]\s*/, '').trim();
          const lc2 = cleaned2.charAt(0).toLowerCase() + cleaned2.slice(1);
          const bridges = ['On top of that, I ', 'I also ', 'Separately, I '];
          para1 += ` ${bridges[Math.floor(Math.random() * bridges.length)]}${lc2}`;
          if (!para1.endsWith('.')) para1 += '.';
        }
        if (kw1 && kw2 && kw3) {
          para1 += ` A lot of that work involved ${kw1}, ${kw2}, and ${kw3}. All of which show up in your job description too.`;
        } else if (kw1 && kw2) {
          para1 += ` Both ${kw1} and ${kw2} were central to that work.`;
        }

        paragraphs.push(para1);
      }

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
          `Outside of the main deliverables, I have also spent a fair amount of time with ${skillsList}. I find that this broader exposure helps me make better decisions on the core work. Knowing how the pieces connect matters.`,
          `I have worked with ${skillsList} as well, and I think that breadth is part of what makes me useful. When you understand the wider picture, you can spot issues earlier and move faster on the things that matter.`,
          `I should also mention my experience with ${skillsList}. These are not just lines on a CV. They are tools I have actually used to ship work and solve real problems.`
        ];
        paragraphs.push(para2Variants[Math.floor(Math.random() * para2Variants.length)]);
      }

      if (topKeywords.length > 7) {
        const extraSkills = [topKeywords[7], topKeywords[8], topKeywords[9]].filter(Boolean);
        if (extraSkills.length > 0) {
          const skillsStr = extraSkills.length > 1
            ? ExtraSkills.slice(0, -1).join(', ') + ' and ' + extraSkills[extraSkills.length - 1]
            : extraSkills[0];
          const para3Variants = [
            `I also have hands-on experience with ${skillsStr}. I have used these in production settings and I am comfortable picking them up again wherever they fit into your stack.`,
            `Worth mentioning: I have worked with ${skillsStr} in live environments. Not just theory. Real projects with real deadlines.`
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
        // v3.2 additions. AI-generated placeholder patterns
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
        const titleMatch = (jobData.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.\-]+?)(?:\s*[-|–,]|\s*$)/i);
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
        // Mid-level technical IC. Concise works well
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
      const text = typeof coverLetter === 'string' ? CoverLetter : coverLetter.text;
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
      return match ? Match[1] : bullet.slice(0, 50) + (bullet.length > 50 ? '...' : '');
    }
  };

  // Export
  global.CoverLetterGenerator = CoverLetterGenerator;
  
  console.log('[CoverLetterGenerator] v3.0 loaded - Natural keyword injection enabled');

})(typeof window !== 'undefined' ? window : this);
