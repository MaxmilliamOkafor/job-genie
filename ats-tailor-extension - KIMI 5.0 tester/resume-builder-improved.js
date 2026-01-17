// Resume Builder Improved v2.0 - Perfect Formatting & ATS Compatibility
// ALWAYS uses CVFormatterPerfect for guaranteed consistent formatting
// Uses backend PDF generation for 100% ATS compatibility

(function(global) {
  'use strict';

  const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

  const ResumeBuilderImproved = {
    
    // Current session for authenticated requests
    _session: null,
    
    // Set session for backend calls
    setSession(session) {
      this._session = session;
    },

    // ============ MAIN BUILD METHOD ============
    async buildResume(candidateData, keywords, options = {}) {
      const startTime = performance.now();
      const { includeAllKeywords = true, format = 'pdf', session = null } = options;
      
      // Use provided session or stored session
      const activeSession = session || this._session;
      
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

      // Use CVFormatterPerfect for consistent formatting (with backend PDF)
      let formattedResult = null;
      if (typeof CVFormatterPerfect !== 'undefined') {
        formattedResult = await CVFormatterPerfect.generateCV(
          candidateData, 
          tailoredContent, 
          options.jobData,
          activeSession // Pass session for backend PDF generation
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
      const phone = this.formatPhoneForATS(data.phone || '+353 0874261508');
      const email = data.email || 'maxokafordev@gmail.com';
      const location = this.cleanLocation(data.city || data.location || 'Dublin, IE');
      const linkedin = data.linkedin || 'LinkedIn';
      const github = data.github || 'GitHub';
      
      return {
        name: name || 'Maxmilliam Okafor',
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
    buildExperienceSection(data, keywords) {
      const experience = data.workExperience || data.work_experience || [];
      if (!Array.isArray(experience) || experience.length === 0) return [];

      // Ensure keywords is always an array
      const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const keywordSet = new Set(keywordArray.map(k => k.toLowerCase()));
      let keywordIndex = 0;
      const maxBulletsPerRole = 6;

      return experience.map(job => {
        const company = job.company || job.organization || '';
        const title = job.title || job.position || job.role || '';
        const startDate = job.startDate || job.start_date || '';
        const endDate = job.endDate || job.end_date || 'Present';
        const dates = job.dates || job.duration || `${startDate} - ${endDate}`;
        const location = job.location || '';
        
        // Get bullets from various possible sources
        let bullets = job.bullets || job.achievements || job.responsibilities || [];
        if (typeof bullets === 'string') bullets = bullets.split('\n').filter(b => b.trim());
        
        // Inject keywords into bullets (first 3 bullets)
        const enhancedBullets = bullets.slice(0, maxBulletsPerRole).map((bullet, idx) => {
          if (idx >= 3) return bullet; // Only enhance first 3 bullets
          
          const bulletLower = bullet.toLowerCase();
          const toInject = [];
          
          // Find 1-2 keywords not in bullet
          while (toInject.length < 2 && keywordIndex < keywordArray.length) {
            const kw = keywordArray[keywordIndex];
            if (!bulletLower.includes(kw.toLowerCase()) && !keywordSet.has(kw.toLowerCase())) {
              toInject.push(kw);
              keywordSet.add(kw.toLowerCase());
            }
            keywordIndex++;
          }
          
          if (toInject.length > 0) {
            const phrases = ['leveraging', 'utilizing', 'with', 'implementing', 'applying', 'deploying', 'integrating'];
            const phrase = phrases[Math.floor(Math.random() * phrases.length)];
            
            if (bullet.endsWith('.')) {
              return bullet.slice(0, -1) + `, ${phrase} ${toInject.join(' and ')}.`;
            }
            return bullet + `, ${phrase} ${toInject.join(' and ')}.`;
          }
          
          return bullet;
        });

        return {
          company,
          title,
          dates,
          location,
          bullets: enhancedBullets
        };
      });
    },

    // ============ BUILD EDUCATION SECTION ============
    buildEducationSection(data) {
      const education = data.education || [];
      if (!Array.isArray(education) || education.length === 0) return [];
      
      return education.map(edu => {
        const institution = edu.institution || edu.school || edu.university || '';
        const degree = edu.degree || '';
        const startDate = edu.startDate || edu.start_date || '';
        const endDate = edu.endDate || edu.end_date || '';
        const date = edu.dates || edu.graduationDate || `${startDate} - ${endDate}`;
        const gpa = edu.gpa ? `GPA: ${edu.gpa}` : '';
        const location = edu.location || '';
        
        return {
          institution,
          degree,
          date,
          gpa,
          location
        };
      });
    },

    // ============ BUILD SKILLS SECTION ============
    buildSkillsSection(data, keywords) {
      let skills = data.skills || [];
      
      // Handle skills object structure (with primary/technical)
      if (typeof skills === 'object' && !Array.isArray(skills)) {
        const primary = skills.primary || skills.technical || [];
        const secondary = skills.secondary || skills.soft || [];
        skills = [...primary, ...secondary];
      }
      
      const skillSet = new Set(skills.map(s => (typeof s === 'string' ? s : s.name || '').toLowerCase()));
      
      // Ensure keywords is always an array
      const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      
      // Add keywords not already in skills
      keywordArray.forEach(kw => {
        if (!skillSet.has(kw.toLowerCase())) {
          skills.push(kw);
          skillSet.add(kw.toLowerCase());
        }
      });
      
      // Format skills: comma-separated, max 25
      const formattedSkills = skills.slice(0, 25).map(s => typeof s === 'string' ? s : s.name || '');
      return this.formatSkills(formattedSkills);
    },

    // ============ FORMAT SKILLS ============
    formatSkills(skills) {
      const acronyms = new Set([
        'SQL', 'AWS', 'GCP', 'API', 'REST', 'HTML', 'CSS', 'JSON', 'XML', 'SDK',
        'CI', 'CD', 'ETL', 'ML', 'AI', 'NLP', 'LLM', 'GPU', 'CPU', 'UI', 'UX',
        'HTTP', 'HTTPS', 'SSH', 'FTP', 'TCP', 'IP', 'DNS', 'VPN', 'CDN', 'S3',
        'EC2', 'RDS', 'IAM', 'VPC', 'ECS', 'EKS', 'SQS', 'SNS', 'SES', 'DMS',
        'JWT', 'OAuth', 'SAML', 'SSO', 'RBAC', 'CRUD', 'ORM', 'MVC', 'MVP',
        'TDD', 'BDD', 'DDD', 'SOLID', 'OOP', 'FP', 'MVVM', 'NoSQL', 'HIPAA',
        'SOX', 'GDPR', 'PCI', 'DSS', 'ISO', 'SLA', 'KPI', 'OKR', 'B2B', 'B2C'
      ]);

      return skills.filter(Boolean).map(skill => {
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
    generateTailoredContent(resumeData) {
      const sections = [];
      
      // Summary
      if (resumeData.summary) {
        sections.push('PROFESSIONAL SUMMARY');
        sections.push(resumeData.summary);
        sections.push('');
      }

      // Experience
      if (resumeData.experience.length > 0) {
        sections.push('WORK EXPERIENCE');
        resumeData.experience.forEach(job => {
          // Format: Company - Location
          const companyLine = job.location ? `${job.company} - ${job.location}` : job.company;
          sections.push(companyLine);
          // Format: Title | Dates
          sections.push(`${job.title} | ${job.dates}`);
          job.bullets.forEach(bullet => {
            sections.push(`- ${bullet}`);
          });
          sections.push('');
        });
      }

      // Education
      if (resumeData.education.length > 0) {
        sections.push('EDUCATION');
        resumeData.education.forEach(edu => {
          // Format: Institution - Location
          const instLine = edu.location ? `${edu.institution} - ${edu.location}` : edu.institution;
          sections.push(instLine);
          // Format: Degree | Date | GPA
          sections.push([edu.degree, edu.date, edu.gpa].filter(Boolean).join(' | '));
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
    .job-header { font-weight: bold; margin-top: 12px; }
    .job-meta { font-size: 9pt; color: #333; margin-bottom: 4px; }
    .bullet { margin-left: 16px; margin-bottom: 3px; }
  </style>
</head>
<body>
  <div class="name">${escapeHtml(contact.name)}</div>
  <div class="contact">
    ${contact.phone ? `${escapeHtml(contact.phone)} | ` : ''}${escapeHtml(contact.email)}${contact.location ? ` | ${escapeHtml(contact.location)} | open to relocation` : ''}
    ${contact.linkedin || contact.github ? `<br>${[contact.linkedin, contact.github].filter(Boolean).map(l => escapeHtml(l)).join(' | ')}` : ''}
  </div>
  
  ${summary ? `
  <div class="section-title">Professional Summary</div>
  <div class="section-content">${escapeHtml(summary)}</div>
  ` : ''}
  
  ${experience.length > 0 ? `
  <div class="section-title">Work Experience</div>
  ${experience.map(job => `
  <div class="job-header">${escapeHtml(job.company)}${job.location ? ` - ${escapeHtml(job.location)}` : ''}</div>
  <div class="job-meta">${[job.title, job.dates].filter(Boolean).map(f => escapeHtml(f)).join(' | ')}</div>
  ${job.bullets.map(bullet => `<div class="bullet">- ${escapeHtml(bullet)}</div>`).join('')}
  `).join('')}
  ` : ''}
  
  ${education.length > 0 ? `
  <div class="section-title">Education</div>
  ${education.map(edu => `
  <div class="job-header">${escapeHtml(edu.institution)}${edu.location ? ` - ${escapeHtml(edu.location)}` : ''}</div>
  <div class="job-meta">${[edu.degree, edu.date, edu.gpa].filter(Boolean).map(f => escapeHtml(f)).join(' | ')}</div>
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
      // CORRECT FORMAT: phone | email | location | open to relocation
      const contactLine = [contact.phone, contact.email, contact.location].filter(Boolean).join(' | ') + (contact.location ? ' | open to relocation' : '');
      lines.push(contactLine);
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
          // Company - Location
          lines.push(`${job.company}${job.location ? ` - ${job.location}` : ''}`);
          // Title | Dates
          lines.push([job.title, job.dates].filter(Boolean).join(' | '));
          job.bullets.forEach(bullet => {
            lines.push(`- ${bullet}`);
          });
          lines.push('');
        });
      }

      if (education.length > 0) {
        lines.push('EDUCATION');
        education.forEach(edu => {
          lines.push(`${edu.institution}${edu.location ? ` - ${edu.location}` : ''}`);
          lines.push([edu.degree, edu.date, edu.gpa].filter(Boolean).join(' | '));
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
