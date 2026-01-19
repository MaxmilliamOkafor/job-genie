// Resume Builder Improved - Perfect Formatting & ATS Compatibility
// Integrates with CVFormatterPerfect for guaranteed consistent formatting

(function(global) {
  'use strict';

  const ResumeBuilderImproved = {
    
    // ============ MAIN BUILD METHOD ============
    async buildResume(candidateData, keywords, options = {}) {
      const startTime = performance.now();
      const { includeAllKeywords = true, format = 'pdf' } = options;
      
      if (!candidateData) {
        console.warn('[ResumeBuilderImproved] No candidate data provided');
        return null;
      }

      console.log('[ResumeBuilderImproved] Building resume with perfect formatting...');

      // Extract all keywords
      const allKeywords = this.extractAllKeywords(keywords);
      
      // Build structured resume data
      const resumeData = this.buildResumeData(candidateData, allKeywords);
      
      // Generate tailored content string
      const tailoredContent = this.generateTailoredContent(resumeData);

      // Use CVFormatterPerfect for consistent formatting
      let formattedResult = null;
      if (typeof CVFormatterPerfect !== 'undefined') {
        formattedResult = await CVFormatterPerfect.generateCV(
          candidateData, 
          tailoredContent, 
          options.jobData
        );
      } else {
        // Fallback to legacy HTML generation
        formattedResult = this.generateLegacyHTML(resumeData);
      }

      const timing = performance.now() - startTime;
      console.log(`[ResumeBuilderImproved] Resume built in ${timing.toFixed(0)}ms`);

      return {
        data: resumeData,
        html: formattedResult.html,
        text: formattedResult.text,
        pdf: formattedResult.pdf,
        blob: formattedResult.blob,
        filename: formattedResult.filename,
        keywords: allKeywords,
        keywordCount: allKeywords.length,
        timing
      };
    },

    // ============ EXTRACT ALL KEYWORDS ============
    extractAllKeywords(keywords) {
      if (!keywords) return [];
      
      const allKw = new Set();
      
      // Add from all priority levels
      if (keywords.highPriority) keywords.highPriority.forEach(k => allKw.add(k));
      if (keywords.mediumPriority) keywords.mediumPriority.forEach(k => allKw.add(k));
      if (keywords.lowPriority) keywords.lowPriority.forEach(k => allKw.add(k));
      if (keywords.all) keywords.all.forEach(k => allKw.add(k));
      if (keywords.workExperience) keywords.workExperience.forEach(k => allKw.add(k));
      
      return [...allKw];
    },

    // ============ BUILD RESUME DATA ============
    buildResumeData(candidateData, keywords) {
      return {
        contact: this.buildContactSection(candidateData),
        summary: this.buildSummarySection(candidateData, keywords),
        experience: this.buildExperienceSection(candidateData, keywords),
        education: this.buildEducationSection(candidateData),
        skills: this.buildSkillsSection(candidateData, keywords),
        certifications: this.buildCertificationsSection(candidateData)
      };
    },

    // ============ BUILD CONTACT SECTION ============
    buildContactSection(data) {
      const name = `${data.firstName || data.first_name || ''} ${data.lastName || data.last_name || ''}`.trim();
      const phone = this.formatPhoneForATS(data.phone || '');
      const email = data.email || '';
      const location = this.cleanLocation(data.city || data.location || '');
      const linkedin = data.linkedin || '';
      const github = data.github || '';
      
      return {
        name: name || 'Applicant',
        phone,
        email,
        location,
        linkedin,
        github
      };
    },

    // ============ FORMAT PHONE FOR ATS ============
    formatPhoneForATS(phone) {
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

    // ============ BUILD SUMMARY SECTION ============
    buildSummarySection(data, keywords) {
      let summary = data.summary || data.professionalSummary || data.profile || '';
      
      // Ensure keywords is always an array
      const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      
      // Inject top 5 keywords into summary if not present
      if (summary && keywordArray.length > 0) {
        const summaryLower = summary.toLowerCase();
        const toInject = keywordArray.slice(0, 5).filter(kw => !summaryLower.includes(kw.toLowerCase()));
        
        if (toInject.length > 0) {
          const injection = `. Expertise includes ${toInject.join(', ')}`;
          if (summary.endsWith('.')) {
            summary = summary.slice(0, -1) + injection + '.';
          } else {
            summary += injection + '.';
          }
        }
      }
      
      return summary;
    },

    // ============ BUILD EXPERIENCE SECTION ============
    // SINGLE SOURCE OF TRUTH: profile.work_experience
    // NEVER modify company, title, dates - only append keywords to bullets
    // LAYOUT:
    //   Line 1: Company (bold)
    //   Line 2: Job Title (left) with dates right-aligned (same line)
    // BULLETS: Use proper ATS bullet points (•) not dashes
    buildExperienceSection(data, keywords) {
      const experience = data.workExperience || data.work_experience || [];
      if (!Array.isArray(experience) || experience.length === 0) return [];

      // Ensure keywords is always an array
      const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const usedKeywords = new Set();
      const maxBulletsPerRole = 6;

      return experience.map(job => {
        // READ-ONLY from profile - NEVER modify these fields
        const company = (job.company || '').trim();
        const title = (job.title || '').trim();
        
        // Build dates - normalise to "YYYY – YYYY" format with en dash and spaces
        let dates = job.dates || '';
        if (!dates && (job.startDate || job.endDate)) {
          const start = job.startDate || '';
          const end = job.endDate || 'Present';
          dates = start ? `${start} - ${end}` : end;
        }
        
        // Normalise date format: replace hyphens with en dash, ensure spaces around it
        const normalisedDates = dates ? String(dates)
          .replace(/--/g, '–')           // double hyphen to en dash
          .replace(/-/g, '–')            // single hyphen to en dash  
          .replace(/\s*–\s*/g, ' – ')    // ensure spaces around en dash
          : '';
        
        const location = job.location || '';
        
        // Get bullets from profile - preserve original content
        let bullets = job.bullets || job.achievements || job.responsibilities || [];
        if (typeof bullets === 'string') bullets = bullets.split('\n').filter(b => b.trim());
        
        // Inject keywords into bullets - ONLY append, never rewrite
        const enhancedBullets = bullets.slice(0, maxBulletsPerRole).map((bullet, idx) => {
          // Clean bullet text
          let text = (bullet || '').replace(/^\s*[-•*]\s*/, '').trim();
          if (!text) return '';
          
          // Only enhance first 3 bullets per role
          if (idx >= 3) {
            if (!text.endsWith('.')) text += '.';
            return text;
          }
          
          const bulletLower = text.toLowerCase();
          const toInject = [];
          
          // Find 1-2 keywords not in bullet and not already used
          for (let i = 0; i < keywordArray.length && toInject.length < 2; i++) {
            const kw = keywordArray[i];
            if (!kw) continue;
            const kwLower = kw.toLowerCase();
            if (!bulletLower.includes(kwLower) && !usedKeywords.has(kwLower)) {
              toInject.push(kw);
              usedKeywords.add(kwLower);
            }
          }
          
          if (toInject.length > 0) {
            // UK spelling for injection phrases
            const phrases = ['leveraging', 'utilising', 'through', 'with', 'via'];
            const phrase = phrases[Math.floor(Math.random() * phrases.length)];
            
            if (text.endsWith('.')) {
              text = text.slice(0, -1) + `, ${phrase} ${toInject.join(' and ')}.`;
            } else {
              text = `${text}, ${phrase} ${toInject.join(' and ')}.`;
            }
          } else {
            if (!text.endsWith('.')) text += '.';
          }
          
          return text;
        }).filter(Boolean);

        return {
          company,
          title,
          dates: normalisedDates,
          location,
          bullets: enhancedBullets
        };
      });
    },

    // ============ BUILD EDUCATION SECTION ============
    // IMPORTANT: Remove explicit year ranges to prevent age bias
    buildEducationSection(data) {
      const education = data.education || [];
      if (!Array.isArray(education) || education.length === 0) return [];
      
      return education.map(edu => {
        const institution = edu.institution || edu.school || edu.university || '';
        const degree = edu.degree || '';
        // REMOVED: date to prevent age bias
        const gpa = edu.gpa ? `GPA: ${edu.gpa}` : '';
        
        return {
          institution,
          degree,
          date: '', // Empty - no dates to prevent age bias
          gpa
        };
      });
    },

    // ============ BUILD SKILLS SECTION ============
    buildSkillsSection(data, keywords) {
      const skills = data.skills || [];
      const skillSet = new Set(skills.map(s => s.toLowerCase()));
      
      // Ensure keywords is always an array
      const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      
      // Add keywords not already in skills
      keywordArray.forEach(kw => {
        if (!skillSet.has(kw.toLowerCase())) {
          skills.push(kw);
          skillSet.add(kw.toLowerCase());
        }
      });
      
      // Format skills: comma-separated, max 20
      return this.formatSkills(skills.slice(0, 20));
    },

    // ============ FORMAT SKILLS ============
    formatSkills(skills) {
      const acronyms = new Set([
        'SQL', 'AWS', 'GCP', 'API', 'REST', 'HTML', 'CSS', 'JSON', 'XML', 'SDK',
        'CI', 'CD', 'ETL', 'ML', 'AI', 'NLP', 'LLM', 'GPU', 'CPU', 'UI', 'UX',
        'HTTP', 'HTTPS', 'SSH', 'FTP', 'TCP', 'IP', 'DNS', 'VPN', 'CDN', 'S3',
        'EC2', 'RDS', 'IAM', 'VPC', 'ECS', 'EKS', 'SQS', 'SNS', 'SES', 'DMS',
        'JWT', 'OAuth', 'SAML', 'SSO', 'RBAC', 'CRUD', 'ORM', 'MVC', 'MVP',
        'TDD', 'BDD', 'DDD', 'SOLID', 'OOP', 'FP', 'MVVM', 'NoSQL'
      ]);

      return skills.map(skill => {
        const upper = skill.toUpperCase();
        if (acronyms.has(upper)) {
          return upper;
        }
        return skill.split(/\s+/).map(word => {
          if (word.length <= 2) return word.toUpperCase();
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
      }).join(', ');
    },

    // ============ BUILD CERTIFICATIONS SECTION ============
    buildCertificationsSection(data) {
      const certs = data.certifications || [];
      if (!Array.isArray(certs) || certs.length === 0) return '';
      
      return certs.map(c => typeof c === 'string' ? c : c.name || c.title || '')
                  .filter(Boolean)
                  .join(', ');
    },

    // ============ GENERATE TAILORED CONTENT STRING ============
    // LAYOUT: 
    //   Line 1: Company
    //   Line 2: Title | YYYY – YYYY
    // Used for parsing by cv-formatter-perfect
    generateTailoredContent(resumeData) {
      const sections = [];
      
      // Contact is handled by formatter
      
      // Summary
      if (resumeData.summary) {
        sections.push('PROFESSIONAL SUMMARY');
        sections.push(resumeData.summary);
        sections.push('');
      }

      // Experience - Two-line header format:
      //   Line 1: Company
      //   Line 2: Title | YYYY – YYYY
      // Bullets with proper • character
      if (resumeData.experience.length > 0) {
        sections.push('WORK EXPERIENCE');
        resumeData.experience.forEach(job => {
          // Line 1: Company
          sections.push(job.company || '');
          // Line 2: Title | Dates (pipe for parsing, displayed with flex)
          const titleLine = job.dates 
            ? `${job.title} | ${job.dates}`
            : job.title;
          sections.push(titleLine);
          job.bullets.forEach(bullet => {
            sections.push(`• ${bullet}`);
          });
          sections.push('');
        });
      }

      // Education (no dates to prevent age bias)
      if (resumeData.education.length > 0) {
        sections.push('EDUCATION');
        resumeData.education.forEach(edu => {
          // Remove empty parts from output
          const parts = [edu.degree, edu.institution, edu.gpa].filter(Boolean);
          sections.push(parts.join(' | '));
        });
        sections.push('');
      }

      // Skills
      if (resumeData.skills) {
        sections.push('SKILLS');
        sections.push(resumeData.skills);
        sections.push('');
      }

      // Certifications
      if (resumeData.certifications) {
        sections.push('CERTIFICATIONS');
        sections.push(resumeData.certifications);
      }

      return sections.join('\n');
    },

    // ============ LEGACY HTML GENERATOR (Fallback) ============
    // Layout:
    //   Line 1: Company (bold)
    //   Line 2: Job Title (left, italic) with dates right-aligned (same line)
    // Bullets: Use proper ATS bullet points with <ul><li>
    generateLegacyHTML(resumeData) {
      const { contact, summary, experience, education, skills, certifications } = resumeData;
      
      const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;');
      };

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(contact.name)} - Resume</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.15;
      margin: 54pt;
      color: #000;
      background: #fff;
    }
    .name { font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 8px; text-transform: uppercase; }
    .contact { text-align: center; color: #333; margin-bottom: 16px; font-size: 10.5pt; }
    .section-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; margin: 16px 0 8px 0; padding-bottom: 4px; }
    .section-content { margin-bottom: 12px; }
    
    /* Job layout: Company on Line 1, Title + Dates on Line 2 */
    .job { margin-bottom: 16px; }
    .job-company { 
      font-weight: bold; 
      font-size: 10.5pt;
      margin-bottom: 2px;
    }
    .job-title-line { 
      display: flex; 
      justify-content: space-between; 
      align-items: baseline;
      margin-bottom: 4px;
    }
    .job-title { 
      font-style: italic;
      font-size: 10.5pt;
    }
    .job-dates { 
      white-space: nowrap; 
      font-size: 10pt;
      color: #333;
    }
    
    /* ATS-friendly bullet list */
    .job-bullets {
      margin: 4px 0 0 20px;
      padding: 0;
      list-style-type: disc;
    }
    .job-bullets li {
      margin-bottom: 3px;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="name">${escapeHtml(contact.name)}</div>
  <div class="contact">
    ${contact.phone ? `${escapeHtml(contact.phone)} | ` : ''}${escapeHtml(contact.email)}${contact.location ? ` | ${escapeHtml(contact.location)} | Open to relocation` : ''}
    ${contact.linkedin || contact.github ? `<br>${[contact.linkedin, contact.github].filter(Boolean).map(l => escapeHtml(l)).join(' | ')}` : ''}
  </div>
  
  ${summary ? `
  <div class="section-title">Professional Summary</div>
  <div class="section-content">${escapeHtml(summary)}</div>
  ` : ''}
  
  ${experience.length > 0 ? `
  <div class="section-title">Work Experience</div>
  ${experience.map(job => `
  <div class="job">
    <div class="job-company">${escapeHtml(job.company)}</div>
    <div class="job-title-line">
      <span class="job-title">${escapeHtml(job.title)}</span>
      ${job.dates ? `<span class="job-dates">${escapeHtml(job.dates)}</span>` : ''}
    </div>
    ${job.bullets.length > 0 ? `
    <ul class="job-bullets">
      ${job.bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('\n      ')}
    </ul>
    ` : ''}
  </div>
  `).join('')}
  ` : ''}
  
  ${education.length > 0 ? `
  <div class="section-title">Education</div>
  ${education.map(edu => `
  <div>${[edu.degree, edu.institution, edu.gpa].filter(Boolean).map(f => escapeHtml(f)).join(' | ')}</div>
  `).join('')}
  ` : ''}
  
  ${education.length > 0 ? `
  <div class="section-title">Education</div>
  ${education.map(edu => `
  <div>${[edu.degree, edu.institution, edu.gpa].filter(Boolean).map(f => escapeHtml(f)).join(' | ')}</div>
  `).join('')}
  ` : ''}
  
  ${skills ? `
  <div class="section-title">Skills</div>
  <div class="section-content">${escapeHtml(skills)}</div>
  ` : ''}
  
  ${certifications ? `
  <div class="section-title">Certifications</div>
  <div class="section-content">${escapeHtml(certifications)}</div>
  ` : ''}
</body>
</html>`;

      const text = this.generateLegacyText(resumeData);

      return {
        html,
        text,
        filename: `${contact.name.replace(/\s+/g, '_')}_CV.html`
      };
    },

    // ============ LEGACY TEXT GENERATOR ============
    generateLegacyText(resumeData) {
      const { contact, summary, experience, education, skills, certifications } = resumeData;
      const lines = [];

      lines.push(contact.name.toUpperCase());
      lines.push([contact.phone, contact.email, contact.location].filter(Boolean).join(' | ') + (contact.location ? ' | Open to relocation' : ''));
      if (contact.linkedin || contact.github) {
        lines.push([contact.linkedin, contact.github].filter(Boolean).join(' | '));
      }
      lines.push('');

      if (summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push(summary);
        lines.push('');
      }

      if (experience.length > 0) {
        lines.push('WORK EXPERIENCE');
        experience.forEach(job => {
          // Line 1: Company
          lines.push(job.company);
          // Line 2: Title – YYYY – YYYY
          lines.push(job.titleLine || job.title);
          job.bullets.forEach(bullet => {
            lines.push(`• ${bullet}`);
          });
          lines.push('');
        });
      }

      if (education.length > 0) {
        lines.push('EDUCATION');
        education.forEach(edu => {
          lines.push([edu.degree, edu.institution, edu.date, edu.gpa].filter(Boolean).join(' | '));
        });
        lines.push('');
      }

      if (skills) {
        lines.push('SKILLS');
        lines.push(skills);
        lines.push('');
      }

      if (certifications) {
        lines.push('CERTIFICATIONS');
        lines.push(certifications);
      }

      return lines.join('\n');
    }
  };

  // ============ EXPORT ============
  if (typeof window !== 'undefined') {
    window.ResumeBuilderImproved = ResumeBuilderImproved;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResumeBuilderImproved;
  }
  if (typeof global !== 'undefined') {
    global.ResumeBuilderImproved = ResumeBuilderImproved;
  }

})(typeof window !== 'undefined' ? window : 
   typeof global !== 'undefined' ? global : this);
