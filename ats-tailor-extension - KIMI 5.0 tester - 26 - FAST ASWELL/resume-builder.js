// resume-builder.js - Resume Builder with Text Preview & Download
// Inspired by Resume-Matcher (srbhr/Resume-Matcher) approach
// Generates ATS-optimized CV with ALL extracted keywords

(function(global) {
  'use strict';

  const ResumeBuilder = {
    // ============ RESUME TEMPLATES ============
    TEMPLATES: {
      professional: {
        name: 'Professional',
        fontFamily: 'Arial, sans-serif',
        fontSize: '10.5pt',
        lineHeight: 1.15,
        margins: { top: 54, bottom: 54, left: 54, right: 54 }
      },
      modern: {
        name: 'Modern',
        fontFamily: 'Calibri, sans-serif',
        fontSize: '11pt',
        lineHeight: 1.2,
        margins: { top: 48, bottom: 48, left: 48, right: 48 }
      },
      minimal: {
        name: 'Minimal',
        fontFamily: 'Helvetica, sans-serif',
        fontSize: '10pt',
        lineHeight: 1.1,
        margins: { top: 36, bottom: 36, left: 36, right: 36 }
      }
    },

    // ============ BUILD RESUME WITH ALL KEYWORDS ============
    buildResumeWithKeywords(candidateData, keywords, options = {}) {
      const startTime = performance.now();
      const { template = 'professional', includeAllKeywords = true } = options;
      
      if (!candidateData) {
        console.warn('[ResumeBuilder] No candidate data provided');
        return null;
      }

      // Extract all keywords from the keywords object
      const allKeywords = this.extractAllKeywords(keywords);
      console.log(`[ResumeBuilder] Building resume with ${allKeywords.length} keywords`);

      // Build resume sections
      const resume = {
        contact: this.buildContactSection(candidateData),
        summary: this.buildSummarySection(candidateData, allKeywords),
        experience: this.buildExperienceSection(candidateData, allKeywords),
        skills: this.buildSkillsSection(candidateData, allKeywords),
        education: this.buildEducationSection(candidateData),
        certifications: this.buildCertificationsSection(candidateData),
        technicalProficiencies: includeAllKeywords ? this.buildTechnicalProficienciesSection(allKeywords) : ''
      };

      // Generate text version
      const textVersion = this.generateTextVersion(resume);
      
      // Generate HTML preview
      const htmlPreview = this.generateHTMLPreview(resume, template);

      const timing = performance.now() - startTime;
      console.log(`[ResumeBuilder] Resume built in ${timing.toFixed(0)}ms`);

      return {
        resume,
        textVersion,
        htmlPreview,
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

    // ============ BUILD CONTACT SECTION ============
    buildContactSection(data) {
      const name = `${data.firstName || data.first_name || ''} ${data.lastName || data.last_name || ''}`.trim();
      const phone = data.phone || '';
      const email = data.email || '';
      const location = data.city || data.location || '';
      const linkedin = data.linkedin || '';
      const github = data.github || '';
      const portfolio = data.portfolio || '';
      
      // Format phone for ATS: "+CountryCode: Number"
      const formattedPhone = this.formatPhoneForATS(phone);

      return {
        name: name || 'Applicant',
        contactLine: [formattedPhone, email, location].filter(Boolean).join(' | ') + (location ? ' | open to relocation' : ''),
        linksLine: [linkedin, github, portfolio].filter(Boolean).join(' | ')
      };
    },
    
    // ============ FORMAT PHONE FOR ATS ============
    formatPhoneForATS(phone) {
      if (!phone) return '';
      
      let cleaned = phone.replace(/[^\d+]/g, '');
      
      if (cleaned.startsWith('+')) {
        const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
        if (match) {
          return `+${match[1]}: ${match[2]}`;
        }
      }
      
      return phone;
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

    
    // BUILD EXPERIENCE SECTION - SINGLE SOURCE OF TRUTH: profile.work_experience
    // NEVER modify company, title, dates - only append keywords to bullets
    // LAYOUT: Single line with Company – Title on left, dates right-aligned, no pipes
    buildExperienceSection(data, keywords) {
      // 1) SINGLE SOURCE OF TRUTH: structured work_experience from profile
      const experience = Array.isArray(data.workExperience)
        ? data.workExperience
        : (Array.isArray(data.work_experience) 
            ? data.work_experience 
            : (Array.isArray(data.workexperience) ? data.workexperience : []));

      if (!experience.length) return "";

      // 2) Normalise keywords for injection, but NEVER touch company/title/dates
      const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const usedKeywords = new Set();
      const maxBulletsPerRole = 8;

      return experience
        .map((job) => {
          // ---- HEADER: READ-ONLY from profile ----
          const company = job.company || '';
          const title = job.title || '';
          
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
          
          // Build left part: Company – Title (no pipes)
          const leftPart = [company, title].filter(Boolean).join(' – ');
          
          // Build header: left part + dates (for plain text, use space padding)
          let headerLine = '';
          if (leftPart && normalisedDates) {
            headerLine = `${leftPart}    ${normalisedDates}`;
          } else if (leftPart) {
            headerLine = leftPart;
          } else if (normalisedDates) {
            headerLine = normalisedDates;
          }

          // ---- BULLETS: Preserve original content, only APPEND keywords ----
          // Use • (bullet) instead of - for ATS compatibility
          let bullets = job.bullets || job.achievements || job.responsibilities || [];

          if (typeof bullets === "string") {
            bullets = bullets
              .split("\n")
              .map(b => b.trim())
              .filter(Boolean);
          }

          if (!Array.isArray(bullets) || !bullets.length) {
            return headerLine;
          }

          const enhancedBullets = bullets.slice(0, maxBulletsPerRole).map((bullet, idx) => {
            // Clean bullet prefix
            let text = (bullet || "").replace(/^\s*[-•]\s*/, "").trim();
            if (!text) return "";

            // Only enhance first 3 bullets per role
            if (idx >= 3 || !keywordArray.length) {
              // Ensure proper sentence ending
              if (text && !text.endsWith('.')) text += '.';
              return `• ${text}`;
            }

            const bulletLower = text.toLowerCase();
            const toInject = [];

            // Inject at most 2 keywords not already in the bullet and not already used
            for (let i = 0; i < keywordArray.length && toInject.length < 2; i++) {
              const kw = keywordArray[i];
              if (!kw) continue;
              const kwLower = kw.toLowerCase();
              if (!bulletLower.includes(kwLower) && !usedKeywords.has(kwLower)) {
                toInject.push(kw);
                usedKeywords.add(kwLower);
              }
            }

            if (!toInject.length) {
              if (text && !text.endsWith('.')) text += '.';
              return `• ${text}`;
            }

            // UK spelling for injection phrases
            const phrases = ["leveraging", "utilising", "through", "with", "via"];
            const phrase = phrases[Math.floor(Math.random() * phrases.length)];
            const tail = `${phrase} ${toInject.join(" and ")}`;

            if (text.endsWith(".")) {
              text = `${text.slice(0, -1)}, ${tail}.`;
            } else {
              text = `${text}, ${tail}.`;
            }

            return `• ${text}`;
          }).filter(Boolean);

          return `${headerLine}\n${enhancedBullets.join("\n")}`;
        })
        .join("\n\n");
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
      
      // Format skills: comma-separated, max 25
      return skills.slice(0, 25).join(', ');
    },

    // ============ BUILD EDUCATION SECTION ============
    // IMPORTANT: Remove explicit year ranges to prevent age bias
    buildEducationSection(data) {
      const education = data.education || [];
      if (!Array.isArray(education) || education.length === 0) return '';
      
      return education.map(edu => {
        const institution = edu.institution || edu.school || edu.university || '';
        const degree = edu.degree || '';
        // REMOVED: dates to prevent age bias
        const gpa = edu.gpa ? `GPA: ${edu.gpa}` : '';
        
        return [degree, institution, gpa].filter(Boolean).join(' | ');
      }).join('\n');
    },

    // ============ BUILD CERTIFICATIONS SECTION ============
    buildCertificationsSection(data) {
      const certs = data.certifications || [];
      if (!Array.isArray(certs) || certs.length === 0) return '';
      
      return certs.map(c => typeof c === 'string' ? c : c.name || c.title || '').filter(Boolean).join(', ');
    },

    // ============ BUILD TECHNICAL PROFICIENCIES SECTION ============
    buildTechnicalProficienciesSection(keywords) {
      // Ensure keywords is always an array
      const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      if (!keywordArray || keywordArray.length === 0) return '';
      
      // Filter to technical keywords only (exclude soft skills)
      const softSkills = new Set([
        'collaboration', 'communication', 'teamwork', 'leadership', 'problem-solving',
        'initiative', 'ownership', 'passion', 'dedication', 'motivation'
      ]);
      
      const technical = keywordArray.filter(kw => !softSkills.has(kw.toLowerCase()));
      
      if (technical.length === 0) return '';
      
      return '• ' + technical.join(' • ');
    },

    // ============ GENERATE TEXT VERSION ============
    generateTextVersion(resume) {
      const sections = [];
      
      // Name and contact
      sections.push(resume.contact.name.toUpperCase());
      sections.push(resume.contact.contactLine);
      if (resume.contact.linksLine) sections.push(resume.contact.linksLine);
      sections.push('');
      
      // Summary
      if (resume.summary) {
        sections.push('PROFESSIONAL SUMMARY');
        sections.push(resume.summary);
        sections.push('');
      }
      
      // Experience
      if (resume.experience) {
        sections.push('WORK EXPERIENCE');
        sections.push(resume.experience);
        sections.push('');
      }
      
      // Education
      if (resume.education) {
        sections.push('EDUCATION');
        sections.push(resume.education);
        sections.push('');
      }
      
      // Skills
      if (resume.skills) {
        sections.push('SKILLS');
        sections.push(resume.skills);
        sections.push('');
      }
      
      // Certifications
      if (resume.certifications) {
        sections.push('CERTIFICATIONS');
        sections.push(resume.certifications);
        sections.push('');
      }
      
      // Technical Proficiencies
      if (resume.technicalProficiencies) {
        sections.push('TECHNICAL PROFICIENCIES');
        sections.push(resume.technicalProficiencies);
      }
      
      return sections.join('\n');
    },

    // ============ GENERATE HTML PREVIEW ============
    generateHTMLPreview(resume, templateName = 'professional') {
      const template = this.TEMPLATES[templateName] || this.TEMPLATES.professional;
      
      const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/\n/g, '<br>');
      };
      
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(resume.contact.name)} - Resume</title>
  <style>
    body {
      font-family: ${template.fontFamily};
      font-size: ${template.fontSize};
      line-height: ${template.lineHeight};
      margin: ${template.margins.top}px ${template.margins.right}px ${template.margins.bottom}px ${template.margins.left}px;
      color: #000;
      background: #fff;
    }
    .name { font-size: 18pt; font-weight: bold; text-align: center; margin-bottom: 4px; }
    .contact { text-align: center; color: #333; margin-bottom: 16px; }
    .section-title { font-size: 12pt; font-weight: bold; border-bottom: 1px solid #000; margin: 16px 0 8px 0; padding-bottom: 4px; }
    .section-content { margin-bottom: 12px; }
    .bullet { margin-left: 16px; }
    .job-header { display: flex; justify-content: space-between; font-weight: bold; margin-top: 12px; }
    .job-left, .job-right { white-space: nowrap; }
    .job-right { font-weight: normal; }
    ul.job-bullets { margin: 4px 0 0 16px; padding: 0; list-style-type: disc; }
    ul.job-bullets li { margin-bottom: 3px; }
  </style>
</head>
<body>
  <div class="name">${escapeHtml(resume.contact.name)}</div>
  <div class="contact">${escapeHtml(resume.contact.contactLine)}</div>
  ${resume.contact.linksLine ? `<div class="contact">${escapeHtml(resume.contact.linksLine)}</div>` : ''}
  
  ${resume.summary ? `
    <div class="section-title">PROFESSIONAL SUMMARY</div>
    <div class="section-content">${escapeHtml(resume.summary)}</div>
  ` : ''}
  
  ${resume.experience ? `
    <div class="section-title">WORK EXPERIENCE</div>
    <div class="section-content">${escapeHtml(resume.experience)}</div>
  ` : ''}
  
  ${resume.education ? `
    <div class="section-title">EDUCATION</div>
    <div class="section-content">${escapeHtml(resume.education)}</div>
  ` : ''}
  
  ${resume.skills ? `
    <div class="section-title">SKILLS</div>
    <div class="section-content">${escapeHtml(resume.skills)}</div>
  ` : ''}
  
  ${resume.certifications ? `
    <div class="section-title">CERTIFICATIONS</div>
    <div class="section-content">${escapeHtml(resume.certifications)}</div>
  ` : ''}
  
  ${resume.technicalProficiencies ? `
    <div class="section-title">TECHNICAL PROFICIENCIES</div>
    <div class="section-content">${escapeHtml(resume.technicalProficiencies)}</div>
  ` : ''}
</body>
</html>`;
    },

    // ============ DOWNLOAD TEXT VERSION ============
    downloadTextVersion(textContent, fileName = 'Resume.txt') {
      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`[ResumeBuilder] Downloaded: ${fileName}`);
    },

    // ============ SHOW TEXT PREVIEW ============
    showTextPreview(textContent, containerSelector = '#previewContent') {
      const container = document.querySelector(containerSelector);
      if (!container) {
        console.warn('[ResumeBuilder] Preview container not found:', containerSelector);
        return false;
      }
      
      // Format text with proper whitespace preservation
      container.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 11px; line-height: 1.4;">${textContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      container.classList.remove('placeholder');
      return true;
    }
  };

  // Export globally
  global.ResumeBuilder = ResumeBuilder;

})(typeof window !== 'undefined' ? window : this);
