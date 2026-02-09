// openresume-generator.js - ATS PDF Generator v4.0
// REWRITTEN: Bulletproof parsing, Option B format, 100% ATS compatibility
// Format: Company (bold), Title | Dates (italic), bullets
// Sections: PROFESSIONAL SUMMARY, WORK EXPERIENCE, EDUCATION, SKILLS, CERTIFICATIONS only

(function(global) {
  'use strict';

  // ============ ATS SPECIFICATIONS ============
  const ATS_SPEC = {
    font: {
      family: 'helvetica',
      name: 14,
      sectionTitle: 11,
      body: 10.5,
      small: 9
    },
    margins: {
      top: 72,
      bottom: 72,
      left: 72,
      right: 72
    },
    lineHeight: 1.15,
    page: {
      width: 595.28,
      height: 841.89,
      maxPages: 2
    },
    bullets: {
      char: '-',
      indent: 10
    }
  };

  // ============ MAIN GENERATOR ============
  const OpenResumeGenerator = {

    // ============ GENERATE COMPLETE ATS PACKAGE ============
    async generateATSPackage(baseCV, keywords, jobData, candidateData, coverLetterText) {
      const startTime = performance.now();
      console.log('[ATSGen] Generating ATS Package v4.0...');

      const normalisedCV = this.normaliseNewlines(baseCV);
      const normalisedCoverLetter = this.normaliseNewlines(coverLetterText);

      const cvData = this.parseAndStructureCV(normalisedCV, candidateData);
      const tailoredData = this.tailorCVData(cvData, keywords, jobData);
      const cvResult = await this.generateCVPDF(tailoredData, candidateData);
      const coverResult = await this.generateCoverLetterPDF(tailoredData, keywords, jobData, candidateData, normalisedCoverLetter);
      const matchScore = this.calculateMatchScore(tailoredData, keywords);

      const timing = performance.now() - startTime;
      console.log(`[ATSGen] Package generated in ${timing.toFixed(0)}ms`);

      return {
        cv: cvResult.blob,
        cvBase64: cvResult.base64,
        cvFilename: cvResult.filename,
        cover: coverResult.blob,
        coverBase64: coverResult.base64,
        coverFilename: coverResult.filename,
        matchScore,
        timing,
        tailoredData
      };
    },

    // ============ NORMALISE NEWLINES ============
    normaliseNewlines(text) {
      if (!text || typeof text !== 'string') return text || '';
      let result = text;
      result = result.replace(/\\n/g, '\n');
      result = result.replace(/\r\n/g, '\n');
      result = result.replace(/\r/g, '\n');
      if (!result.includes('\n') && result.length > 200) {
        console.warn('[ATSGen] Text has no newlines - attempting structural restoration');
        result = this.restoreTextStructure(result);
      }
      return result;
    },

    // ============ RESTORE TEXT STRUCTURE ============
    restoreTextStructure(text) {
      if (!text) return text;
      const sectionHeaders = [
        'PROFESSIONAL SUMMARY', 'SUMMARY', 'PROFILE',
        'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE', 'EXPERIENCE', 'EMPLOYMENT',
        'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS', 'TECHNICAL PROFICIENCIES',
        'CORE COMPETENCIES', 'KEY SKILLS', 'ADDITIONAL SKILLS',
        'CERTIFICATIONS', 'LICENSES', 'ACHIEVEMENTS', 'PROJECTS'
      ];
      let result = text;
      for (const header of sectionHeaders) {
        const regex = new RegExp(`(?<!^)\\b(${header})\\s*:?\\s*`, 'gi');
        result = result.replace(regex, (match, h) => `\n\n${h.toUpperCase()}\n`);
      }
      result = result.replace(/([.!?])\s+([-•*])\s+/g, '$1\n$2 ');
      result = result.replace(/([.!?])\s+([A-Z][A-Za-z\s&.,]+\s*\|\s*[A-Za-z])/g, '$1\n\n$2');
      return result.trim();
    },

    // ============ DETECT IF A STRING IS PRIMARILY A DATE ============
    isDateLine(str) {
      if (!str) return false;
      const trimmed = str.trim();
      // Matches: "January 2023", "01/2023", "2023", "Present", "January 2023 - Present",
      // "01/2023 - 12/2025", "2023 - Present", "2023 - 2025"
      const datePatterns = [
        /^\d{2}\/\d{4}\s*[-–—]\s*(Present|\d{2}\/\d{4})$/i,
        /^\d{4}\s*[-–—]\s*(Present|\d{4})$/i,
        /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4}$/i,
        /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4}\s*[-–—]\s*(Present|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4})$/i,
        /^Present$/i,
        /^\d{4}$/,
        /^\d{2}\/\d{4}$/
      ];
      return datePatterns.some(p => p.test(trimmed));
    },

    // ============ DETECT IF A LINE IS PRIMARILY A DATE RANGE (with pipes) ============
    isDateRangeLine(str) {
      if (!str) return false;
      const trimmed = str.trim();
      // Lines like "Present | 2023 - Present" or "December 2025 | 2024 - 2025"
      // Split by pipe and check if ALL parts are dates
      const parts = trimmed.split('|').map(p => p.trim());
      return parts.every(p => this.isDateLine(p));
    },

    // ============ PARSE AND STRUCTURE CV ============
    parseAndStructureCV(cvText, candidateData) {
      const data = {
        contact: { name: '', phone: '', email: '', location: '', linkedin: '', github: '', portfolio: '' },
        summary: '',
        experience: [],
        skills: [],
        education: [],
        certifications: []
      };

      if (candidateData) {
        data.contact.name = `${candidateData.firstName || candidateData.first_name || ''} ${candidateData.lastName || candidateData.last_name || ''}`.trim();
        data.contact.phone = candidateData.phone || '';
        data.contact.email = candidateData.email || '';
        const rawLocation = candidateData.city || candidateData.location || '';
        data.contact.location = this.normalizeLocation(rawLocation) || 'Dublin, IE';
        data.contact.linkedin = candidateData.linkedin || '';
        data.contact.github = candidateData.github || '';
        data.contact.portfolio = candidateData.portfolio || '';

        // Extract structured work experience - support ALL field name variants
        const rawExp = candidateData.workExperience || candidateData.work_experience
          || candidateData.professionalExperience || candidateData.professional_experience;
        if (rawExp && Array.isArray(rawExp) && rawExp.length > 0) {
          data.experience = rawExp.map(exp => {
            let dates = exp.dates || exp.duration || '';
            if (!dates && (exp.startDate || exp.start_date)) {
              const start = exp.startDate || exp.start_date || '';
              const end = exp.endDate || exp.end_date || 'Present';
              dates = `${start} - ${end}`;
            }
            dates = this.normalizeDates(dates);
            let bullets = exp.bullets || exp.achievements || exp.responsibilities || [];
            if ((!bullets || (Array.isArray(bullets) && bullets.length === 0)) && exp.description) {
              bullets = exp.description.split('\n').filter(b => b.trim());
            }
            return {
              company: exp.company || exp.organization || '',
              title: exp.title || exp.position || exp.role || '',
              dates: dates,
              location: exp.location || '',
              bullets: this.normalizeBullets(bullets)
            };
          });
          console.log(`[ATSGen] Loaded ${data.experience.length} experiences from profile`);
        }

        if (candidateData.skills) {
          data.skills = Array.isArray(candidateData.skills)
            ? candidateData.skills
            : candidateData.skills.split(',').map(s => s.trim());
        }

        if (candidateData.education) {
          data.education = (Array.isArray(candidateData.education) ? candidateData.education : []).map(edu => ({
            institution: edu.institution || edu.school || edu.university || '',
            degree: edu.degree || '',
            dates: edu.dates || edu.graduationDate || '',
            gpa: edu.gpa || ''
          }));
        }

        if (candidateData.certifications) {
          data.certifications = Array.isArray(candidateData.certifications)
            ? candidateData.certifications
            : [candidateData.certifications];
        }
      }

      // ONLY parse from text if structured experience is empty
      if (cvText && data.experience.length === 0) {
        console.log('[ATSGen] No structured experience - parsing from CV text');
        const parsed = this.parseCVText(cvText);
        // Merge parsed data, but don't overwrite non-empty fields
        if (!data.summary && parsed.summary) data.summary = parsed.summary;
        if (parsed.experience.length > 0) data.experience = parsed.experience;
        if (data.skills.length === 0 && parsed.skills.length > 0) data.skills = parsed.skills;
        if (data.education.length === 0 && parsed.education.length > 0) data.education = parsed.education;
        if (data.certifications.length === 0 && parsed.certifications.length > 0) data.certifications = parsed.certifications;
      } else if (cvText) {
        // Even with structured experience, extract summary and other missing sections from text
        const parsed = this.parseCVText(cvText);
        if (!data.summary && parsed.summary) data.summary = parsed.summary;
        if (data.skills.length === 0 && parsed.skills.length > 0) data.skills = parsed.skills;
        if (data.education.length === 0 && parsed.education.length > 0) data.education = parsed.education;
        if (data.certifications.length === 0 && parsed.certifications.length > 0) data.certifications = parsed.certifications;
      }

      return data;
    },

    normalizeBullets(bullets) {
      if (!bullets) return [];
      if (Array.isArray(bullets)) return bullets.map(b => b.replace(/^[-•*▪]\s*/, '').trim()).filter(b => b.length > 0);
      return bullets.split('\n').filter(b => b.trim()).map(b => b.replace(/^[-•*▪]\s*/, '').trim()).filter(b => b.length > 0);
    },

    // ============ PARSE CV TEXT ============
    parseCVText(cvText) {
      const result = { summary: '', experience: [], skills: [], education: [], certifications: [] };
      if (!cvText) return result;

      const lines = cvText.split('\n');
      let contentStartIndex = 0;

      // Skip contact header lines
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) { contentStartIndex = i + 1; continue; }
        if (/^[A-Z][A-Z\s]+$/.test(trimmed) && trimmed.length < 50 &&
            !/^(PROFESSIONAL|WORK|EDUCATION|SKILLS|CERTIFICATIONS|TECHNICAL|CORE|KEY|ADDITIONAL|EMPLOYMENT|EXPERIENCE|SUMMARY|PROFILE)/.test(trimmed)) {
          contentStartIndex = i + 1; continue;
        }
        if (/@/.test(trimmed) || /linkedin\.com|github\.com/i.test(trimmed)) { contentStartIndex = i + 1; continue; }
        if (/^\+?\d[\d\s\-\(\):]+$/.test(trimmed.replace(/[|]/g, '').trim())) { contentStartIndex = i + 1; continue; }
        if (/\|/.test(trimmed) && (/@/.test(trimmed) || /\+\d/.test(trimmed) || /linkedin|github/i.test(trimmed))) { contentStartIndex = i + 1; continue; }
        if (/open to relocation/i.test(trimmed)) { contentStartIndex = i + 1; continue; }
        if (/https?:\/\//i.test(trimmed)) { contentStartIndex = i + 1; continue; }
        break;
      }

      const contentLines = lines.slice(contentStartIndex);
      const sectionMap = {
        'PROFESSIONAL SUMMARY': 'summary', 'SUMMARY': 'summary', 'PROFILE': 'summary',
        'WORK EXPERIENCE': 'experience', 'PROFESSIONAL EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience', 'EMPLOYMENT': 'experience',
        'SKILLS': 'skills', 'TECHNICAL SKILLS': 'skills', 'TECHNICAL PROFICIENCIES': 'skills',
        'CORE COMPETENCIES': 'skills', 'KEY SKILLS': 'skills', 'ADDITIONAL SKILLS': 'skills',
        'SOFT SKILLS': 'skills',
        'EDUCATION': 'education',
        'CERTIFICATIONS': 'certifications', 'LICENSES': 'certifications'
      };

      const sectionNames = Object.keys(sectionMap).join('|');
      const inlineHeaderRegex = new RegExp(`^(${sectionNames})\\s*:\\s*(.+)$`, 'i');

      let currentSection = '';
      let currentContent = [];

      for (const line of contentLines) {
        const trimmed = line.trim();
        const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');

        const inlineMatch = trimmed.match(inlineHeaderRegex);
        if (inlineMatch) {
          this.saveSection(result, currentSection, currentContent);
          const headerKey = inlineMatch[1].toUpperCase().trim();
          currentSection = sectionMap[headerKey] || '';
          currentContent = [inlineMatch[2].trim()];
          continue;
        }

        if (sectionMap[upperTrimmed]) {
          this.saveSection(result, currentSection, currentContent);
          currentSection = sectionMap[upperTrimmed];
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      this.saveSection(result, currentSection, currentContent);

      // Deduplicate skills
      if (result.skills.length > 0) {
        const seen = new Set();
        result.skills = result.skills.filter(s => {
          const lower = s.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
      }

      return result;
    },

    saveSection(result, section, content) {
      if (!section || content.length === 0) return;
      const text = content.join('\n').trim();

      switch (section) {
        case 'summary':
          if (!result.summary) result.summary = text;
          break;
        case 'skills':
          const newSkills = text.replace(/[•\-*]/g, ',').split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 60);
          result.skills = [...result.skills, ...newSkills];
          break;
        case 'experience':
          const newExp = this.parseExperienceText(text);
          if (newExp.length > 0) {
            const existingCompanies = new Set(result.experience.map(e => (e.company || '').toLowerCase()));
            for (const exp of newExp) {
              if (!existingCompanies.has((exp.company || '').toLowerCase())) {
                result.experience.push(exp);
                existingCompanies.add((exp.company || '').toLowerCase());
              }
            }
          }
          break;
        case 'education':
          const newEdu = this.parseEducationText(text);
          if (newEdu.length > 0) {
            const existingInst = new Set(result.education.map(e => (e.institution || '').toLowerCase()));
            for (const edu of newEdu) {
              if (!existingInst.has((edu.institution || '').toLowerCase())) {
                result.education.push(edu);
              }
            }
          }
          break;
        case 'certifications':
          const newCerts = text.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 2);
          const existingCerts = new Set(result.certifications.map(c => c.toLowerCase()));
          for (const cert of newCerts) {
            if (!existingCerts.has(cert.toLowerCase())) {
              result.certifications.push(cert);
              existingCerts.add(cert.toLowerCase());
            }
          }
          break;
      }
    },

    // ============ PARSE EXPERIENCE TEXT - BULLETPROOF v4.0 ============
    // Handles ALL common AI output formats:
    // Format A: "Company | Title | Dates" then bullets
    // Format B: "Company\nTitle | Dates" then bullets
    // Format C: "Dates\nCompany | Title" then bullets (date-first)
    // Format D: "Company\nTitle\nDates" then bullets
    parseExperienceText(text) {
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;
      let pendingCompany = null;
      let pendingDate = null;

      const sectionHeaders = new Set([
        'professional experience', 'work experience', 'experience',
        'employment history', 'career history', 'employment'
      ]);

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        if (sectionHeaders.has(trimmed.toLowerCase().replace(/[:\s]+$/, ''))) continue;

        // Is this line a bullet point?
        if (/^[-•*▪]/.test(trimmed)) {
          if (currentJob) {
            currentJob.bullets.push(trimmed.replace(/^[-•*▪]\s*/, '').trim());
          }
          pendingCompany = null;
          pendingDate = null;
          continue;
        }

        // Is this line purely a date/date range (including with pipes)?
        if (this.isDateRangeLine(trimmed) || this.isDateLine(trimmed)) {
          // Save as pending date for the next job entry
          pendingDate = trimmed.replace(/\|/g, ' ').replace(/\s{2,}/g, ' ').trim();
          continue;
        }

        // Does this line contain pipe separators? (potential job header)
        if (trimmed.includes('|')) {
          const parts = trimmed.split('|').map(p => p.trim());

          // Filter out parts that are purely dates
          const nonDateParts = [];
          const dateParts = [];
          for (const part of parts) {
            if (this.isDateLine(part)) {
              dateParts.push(part);
            } else {
              nonDateParts.push(part);
            }
          }

          // If ALL parts are dates, this is a date line, not a job header
          if (nonDateParts.length === 0) {
            pendingDate = trimmed.replace(/\|/g, ' ').replace(/\s{2,}/g, ' ').trim();
            continue;
          }

          // We have a real job header with at least one non-date part
          if (currentJob && currentJob.company) jobs.push(currentJob);

          let company = '';
          let title = '';
          let dates = dateParts.join(' – ') || '';

          if (nonDateParts.length >= 2) {
            company = nonDateParts[0];
            title = nonDateParts[1];
            // If 3+ non-date parts, might be Company | Title | SubTitle
            if (nonDateParts.length >= 3) {
              // Check if part 3 is actually a subtitle or location
              title = nonDateParts.slice(1).join(' | ');
            }
          } else if (nonDateParts.length === 1) {
            // Single non-date part - could be "Company" or "Title"
            // If we have a pending company, this is the title
            if (pendingCompany) {
              company = pendingCompany;
              title = nonDateParts[0];
              pendingCompany = null;
            } else {
              company = nonDateParts[0];
            }
          }

          // If there's also a separate date extracted from the parts
          if (!dates) {
            // Check if any part contains an embedded date range
            for (const part of parts) {
              const dateMatch = part.match(/(\d{2}\/\d{4}\s*[-–]\s*(?:Present|\d{2}\/\d{4})|\d{4}\s*[-–]\s*(?:Present|\d{4}))/i);
              if (dateMatch) {
                dates = dateMatch[1];
                break;
              }
            }
          }

          // Use pending date if no dates found in header
          if (!dates && pendingDate) {
            dates = pendingDate;
            pendingDate = null;
          }

          // Clean company and title from any remaining dates
          company = this.stripDatesFromField(company);
          title = this.stripDatesFromField(title);
          dates = this.normalizeDates(dates);

          // Validate company - skip if it looks like a section header
          if (sectionHeaders.has(company.toLowerCase())) continue;

          currentJob = { company, title, dates, location: '', bullets: [] };
          pendingCompany = null;
          pendingDate = null;

        } else {
          // Non-bullet, non-date, non-pipe line
          // This could be a standalone company name, title, or continuation text

          // If we have a pending date and no current job, this might be a company name after a date
          if (pendingDate && !currentJob) {
            // Date came first, so this line is likely the company or company + title
            if (currentJob && currentJob.company) jobs.push(currentJob);
            currentJob = {
              company: trimmed,
              title: '',
              dates: this.normalizeDates(pendingDate),
              location: '',
              bullets: []
            };
            pendingDate = null;
            pendingCompany = null;
            continue;
          }

          // Check if this line looks like a company name (starts with uppercase, no bullet chars)
          const looksLikeCompanyOrTitle = /^[A-Z]/.test(trimmed) && trimmed.length > 2 && trimmed.length < 80;

          if (looksLikeCompanyOrTitle && !currentJob) {
            // First non-header line in experience section - probably a company name
            pendingCompany = trimmed;
            continue;
          }

          if (looksLikeCompanyOrTitle && currentJob && currentJob.bullets.length === 0 && !currentJob.title) {
            // We have a company but no title and no bullets yet - this might be the title
            currentJob.title = trimmed;
            continue;
          }

          if (pendingCompany && looksLikeCompanyOrTitle) {
            // We had a pending company and now see another line - save as new job
            if (currentJob && currentJob.company) jobs.push(currentJob);
            currentJob = {
              company: pendingCompany,
              title: trimmed,
              dates: pendingDate ? this.normalizeDates(pendingDate) : '',
              location: '',
              bullets: []
            };
            pendingCompany = null;
            pendingDate = null;
            continue;
          }

          // If we're in a job and have bullets, this might be continuation text or a new company
          if (currentJob && currentJob.bullets.length > 0 && looksLikeCompanyOrTitle) {
            // Looks like a new company name
            if (currentJob.company) jobs.push(currentJob);
            pendingCompany = trimmed;
            currentJob = null;
            continue;
          }
        }
      }

      if (currentJob && currentJob.company) jobs.push(currentJob);

      // Post-processing: validate and clean all jobs
      return jobs.filter(job => {
        // Remove jobs where company is just a date
        if (this.isDateLine(job.company)) return false;
        // Remove jobs with no company
        if (!job.company || job.company.length < 2) return false;
        return true;
      });
    },

    stripDatesFromField(value) {
      if (!value) return '';
      return value
        .replace(/\d{2}\/\d{4}\s*[-–—]\s*(Present|\d{2}\/\d{4}|\d{4})/gi, '')
        .replace(/\d{4}[-\/]\d{1,2}\s*[-–—]\s*(Present|\d{4}[-\/]\d{1,2}|\d{4})/gi, '')
        .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s*\d{4}\s*[-–—]\s*(Present|\w+\.?\s*\d{4})/gi, '')
        .replace(/\b\d{4}\s*[-–—]\s*(Present|\d{4})\b/gi, '')
        .replace(/\s*\|\s*$/, '').replace(/^\s*\|\s*/, '')
        .replace(/[^\S\n\r]{2,}/g, ' ').trim();
    },

    normalizeDates(dateStr) {
      if (!dateStr) return '';
      const monthYearMatch = dateStr.match(/(\d{2}\/\d{4})\s*[-–—]\s*(Present|\d{2}\/\d{4})/i);
      if (monthYearMatch) return `${monthYearMatch[1]} - ${monthYearMatch[2]}`;

      const years = dateStr.match(/\d{4}/g);
      const hasPresent = /present/i.test(dateStr);
      if (hasPresent && years && years.length >= 1) return `${years[0]} - Present`;
      if (years && years.length >= 2) return `${years[0]} - ${years[1]}`;
      if (years && years.length === 1) return years[0];
      return dateStr.replace(/\s*[-–—]\s*/g, ' - ');
    },

    parseEducationText(text) {
      const entries = [];
      const lines = text.split('\n').filter(l => l.trim());
      let currentEntry = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Check if this line has pipe separators (structured education line)
        if (trimmed.includes('|')) {
          const parts = trimmed.split('|').map(p => p.trim());
          if (parts.length >= 2) {
            entries.push({
              institution: parts[0],
              degree: parts[1],
              dates: parts[2] || '',
              gpa: parts[3] || ''
            });
            currentEntry = null;
            continue;
          }
        }

        // Check if line looks like a degree (contains keywords)
        const isDegree = /\b(bachelor|master|msc|bsc|ba|ma|mba|phd|doctorate|diploma|certificate|degree|science|arts|engineering)\b/i.test(trimmed);
        // Check if line looks like an institution
        const isInstitution = /\b(university|college|institute|school|academy|polytechnic)\b/i.test(trimmed);

        if (isDegree) {
          // Extract GPA if embedded: "Degree - Grade (GPA)"
          const gpaMatch = trimmed.match(/[\(\[]?\s*(\d+\.\d+\/\d+\.\d+)\s*[\)\]]?/);
          const gradeMatch = trimmed.match(/\s*[-–]\s*(Distinction|First Class|Upper Second|Lower Second|Pass|Merit|Honours?)[^)]*(\(\d+\.\d+\/\d+\.\d+\))?/i);

          currentEntry = {
            degree: trimmed,
            institution: '',
            dates: '',
            gpa: gpaMatch ? gpaMatch[1] : ''
          };
          entries.push(currentEntry);
        } else if (isInstitution && currentEntry) {
          currentEntry.institution = trimmed;
          currentEntry = null;
        } else if (isInstitution) {
          entries.push({ institution: trimmed, degree: '', dates: '', gpa: '' });
          currentEntry = null;
        } else if (currentEntry && !currentEntry.institution) {
          // Might be the institution line after a degree
          currentEntry.institution = trimmed;
          currentEntry = null;
        } else {
          entries.push({ institution: trimmed, degree: '', dates: '', gpa: '' });
          currentEntry = null;
        }
      }

      return entries;
    },

    // ============ TAILOR CV DATA ============
    tailorCVData(cvData, keywords, jobData) {
      const tailored = JSON.parse(JSON.stringify(cvData));
      const allKeywords = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const highPriority = Array.isArray(keywords) ? allKeywords.slice(0, 15) : (keywords?.highPriority || allKeywords.slice(0, 15));
      const mediumPriority = Array.isArray(keywords) ? [] : (keywords?.mediumPriority || []);
      const lowPriority = Array.isArray(keywords) ? [] : (keywords?.lowPriority || []);

      if (jobData?.location) {
        tailored.contact.location = this.normalizeLocation(jobData.location);
      }

      tailored.summary = this.enhanceSummary(cvData.summary, [...highPriority.slice(0, 5), ...mediumPriority.slice(0, 3)]);

      if (typeof StrategicKeywordIntegration !== 'undefined') {
        const integrationResult = StrategicKeywordIntegration.enhanceBulletPointsWithKeywords(
          cvData.experience, { all: allKeywords, highPriority, mediumPriority, lowPriority }
        );
        tailored.experience = integrationResult.enhancedExperience;
        const integratedKeywords = integrationResult.stats?.integratedKeywords || [];
        const remainingKeywords = allKeywords.filter(kw =>
          !integratedKeywords.some(ik => ik.toLowerCase() === kw.toLowerCase())
        );
        tailored.skills = this.mergeSkills(cvData.skills, remainingKeywords.slice(0, 10));
      } else {
        tailored.experience = this.injectAllKeywordsIntoExperience(cvData.experience, {
          high: highPriority, medium: mediumPriority, low: lowPriority, all: allKeywords
        });
        tailored.skills = this.mergeSkills(cvData.skills, allKeywords);
      }

      return tailored;
    },

    normalizeLocation(location) {
      if (!location) return '';
      let normalized = location
        .replace(/\b(remote|work\s*from\s*home|wfh|virtual|fully\s*remote|remote\s*first|remote\s*friendly)\b/gi, '')
        .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
        .replace(/\s*(\||,|\/|-)\s*(\||,|\/|-)\s*/g, ', ')
        .replace(/\s*(\||,|\/|-)\s*$/g, '').replace(/^\s*(\||,|\/|-)\s*/g, '')
        .replace(/\s{2,}/g, ' ').trim();
      if (!normalized || normalized.length < 3) return '';
      const stateAbbrev = {
        'california': 'CA', 'texas': 'TX', 'new york': 'NY', 'florida': 'FL',
        'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH', 'georgia': 'GA',
        'north carolina': 'NC', 'michigan': 'MI', 'new jersey': 'NJ', 'virginia': 'VA',
        'washington': 'WA', 'arizona': 'AZ', 'massachusetts': 'MA', 'tennessee': 'TN',
        'indiana': 'IN', 'missouri': 'MO', 'maryland': 'MD', 'wisconsin': 'WI',
        'colorado': 'CO', 'minnesota': 'MN', 'connecticut': 'CT', 'utah': 'UT',
        'iowa': 'IA', 'nevada': 'NV', 'hawaii': 'HI', 'district of columbia': 'DC'
      };
      for (const [full, abbrev] of Object.entries(stateAbbrev)) {
        const regex = new RegExp(`,\\s*${full}\\s*$`, 'i');
        if (regex.test(normalized)) { normalized = normalized.replace(regex, `, ${abbrev}`); break; }
      }
      normalized = normalized.replace(/,\s*(US|USA|United States)\s*$/i, '').replace(/,\s*(UK|United Kingdom)\s*$/i, '').trim();
      return normalized;
    },

    formatPhoneForATS(phone) {
      if (!phone) return '';
      let cleaned = phone.replace(/[^\d+]/g, '');
      if (cleaned.startsWith('+')) {
        const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
        if (match) return `+${match[1]}: ${match[2]}`;
      }
      return phone;
    },

    enhanceSummary(summary, keywords) {
      const keywordsArray = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
      const sanitise = (text) => {
        if (typeof ContentQualityEngine !== 'undefined') return ContentQualityEngine.sanitiseSummary(text);
        return text;
      };
      if (!summary) {
        const topKeywords = keywordsArray.slice(0, 3);
        const baseSummary = topKeywords.length > 0
          ? `Professional with extensive expertise in ${topKeywords.join(', ')}. Track record of delivering high-impact solutions and driving measurable business outcomes.`
          : `Professional with track record of delivering high-impact solutions and driving measurable business outcomes.`;
        return sanitise(baseSummary);
      }
      let result = sanitise(summary);
      const summaryLower = result.toLowerCase();
      const missing = keywordsArray.filter(kw => !summaryLower.includes(kw.toLowerCase()));
      if (missing.length > 0) {
        const injection = `. Expertise includes ${missing.slice(0, 3).join(', ')}`;
        result = result.endsWith('.') ? result.slice(0, -1) + injection + '.' : result + injection + '.';
      }
      return result;
    },

    injectAllKeywordsIntoExperience(experience, keywordsByPriority) {
      if (!experience || experience.length === 0) return experience;
      const { high = [], medium = [], low = [], all = [] } = keywordsByPriority;
      const allKeywords = all.length > 0 ? all : [...high, ...medium, ...low];
      const mentions = {};
      const targets = {};
      const maxMentions = {};
      high.forEach(kw => { mentions[kw] = 0; targets[kw] = 3; maxMentions[kw] = 5; });
      medium.forEach(kw => { mentions[kw] = 0; targets[kw] = 3; maxMentions[kw] = 5; });
      low.forEach(kw => { mentions[kw] = 0; targets[kw] = 1; maxMentions[kw] = 2; });
      allKeywords.forEach(kw => {
        if (mentions[kw] === undefined) { mentions[kw] = 0; targets[kw] = 2; maxMentions[kw] = 3; }
      });
      experience.forEach(job => {
        job.bullets.forEach(bullet => {
          allKeywords.forEach(kw => { if (bullet.toLowerCase().includes(kw.toLowerCase())) mentions[kw]++; });
        });
      });
      const phrases = ['implementing', 'applying', 'through', 'incorporating', 'via', 'using', 'with', 'employing'];
      const getPhrase = () => phrases[Math.floor(Math.random() * phrases.length)];

      return experience.map((job, jobIndex) => {
        const maxKwPerBullet = Math.max(2, 4 - jobIndex);
        const enhancedBullets = job.bullets.map(bullet => {
          const needsMore = allKeywords.filter(kw => {
            return mentions[kw] < (targets[kw] || 2) && !bullet.toLowerCase().includes(kw.toLowerCase());
          });
          if (needsMore.length === 0) return bullet;
          let enhanced = bullet;
          const sorted = [...needsMore.filter(kw => high.includes(kw)), ...needsMore.filter(kw => medium.includes(kw)), ...needsMore.filter(kw => low.includes(kw))];
          sorted.slice(0, maxKwPerBullet).forEach(kw => {
            if (mentions[kw] >= (maxMentions[kw] || 5)) return;
            if (enhanced.toLowerCase().includes(kw.toLowerCase())) return;
            const phrase = getPhrase();
            if (enhanced.endsWith('.')) { enhanced = `${enhanced.slice(0, -1)}, ${phrase} ${kw}.`; }
            else { enhanced = `${enhanced}, ${phrase} ${kw}`; }
            mentions[kw]++;
          });
          return enhanced;
        });
        return { ...job, bullets: enhancedBullets };
      });
    },

    injectKeywordsIntoExperience(experience, keywords, options = {}) {
      return this.injectAllKeywordsIntoExperience(experience, { high: keywords, all: keywords });
    },

    mergeSkills(existingSkills, keywords) {
      const skillSet = new Set((existingSkills || []).map(s => s.toLowerCase()));
      const merged = [...(existingSkills || [])];
      const topKeywords = (keywords.all || keywords).slice(0, 10);
      topKeywords.forEach(kw => {
        if (!skillSet.has(kw.toLowerCase())) {
          merged.push(this.formatSkillName(kw));
          skillSet.add(kw.toLowerCase());
        }
      });
      return merged.slice(0, 25);
    },

    formatSkillName(skill) {
      const acronyms = new Set(['SQL', 'AWS', 'GCP', 'API', 'REST', 'HTML', 'CSS', 'JSON', 'XML', 'CI', 'CD', 'ETL', 'ML', 'AI', 'NLP', 'LLM', 'UI', 'UX', 'SDK', 'HTTP', 'JWT', 'NoSQL']);
      return skill.split(/\s+/).map(word => {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
        if (word.length <= 2) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
    },

    // ============ GENERATE CV PDF ============
    async generateCVPDF(tailoredData, candidateData) {
      const startTime = performance.now();
      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (candidateData?.lastName || candidateData?.last_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const filename = lastName ? `${firstName}_${lastName}_CV.pdf` : `${firstName}_CV.pdf`;

      let pdfBlob = null;
      let pdfBase64 = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const result = await this.renderCVWithJsPDF(tailoredData);
        pdfBlob = result.blob;
        pdfBase64 = result.base64;
      } else {
        const text = this.generateCVText(tailoredData);
        pdfBase64 = btoa(unescape(encodeURIComponent(text)));
      }

      console.log(`[ATSGen] CV PDF generated in ${(performance.now() - startTime).toFixed(0)}ms`);
      return { blob: pdfBlob, base64: pdfBase64, filename };
    },

    // ============ RENDER CV WITH JSPDF - OPTION B FORMAT ============
    // Format: Company (bold), Title | Dates (italic), bullets with dash
    // Sections: PROFESSIONAL SUMMARY, WORK EXPERIENCE, EDUCATION, SKILLS, CERTIFICATIONS
    async renderCVWithJsPDF(data) {
      const { jsPDF } = jspdf;
      const { font, margins, lineHeight, page } = ATS_SPEC;
      const contentWidth = page.width - margins.left - margins.right;

      const doc = new jsPDF({ format: 'a4', unit: 'pt', putOnlyUsedFonts: true });
      doc.setFont(font.family, 'normal');
      let y = margins.top;

      // ---- HELPERS ----
      const checkPageBreak = (needed = 30) => {
        if (y > page.height - margins.bottom - needed) { doc.addPage(); y = margins.top; }
      };

      const addWrappedText = (text, isBold = false, isItalic = false, size = font.body, indent = 0) => {
        doc.setFontSize(size);
        const style = isBold ? 'bold' : (isItalic ? 'italic' : 'normal');
        doc.setFont(font.family, style);
        const lines = doc.splitTextToSize(text, contentWidth - indent);
        lines.forEach(line => {
          checkPageBreak();
          doc.text(line, margins.left + indent, y);
          y += size * lineHeight + 1.5;
        });
      };

      const addCenteredText = (text, isBold = false, size = font.body) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        checkPageBreak();
        doc.text(text, page.width / 2, y, { align: 'center' });
        y += size * lineHeight + 1.5;
      };

      const addSectionHeader = (title) => {
        checkPageBreak(50);
        y += 10;
        doc.setFontSize(font.sectionTitle);
        doc.setFont(font.family, 'bold');
        doc.text(title, margins.left, y);
        y += 3;
        doc.setLineWidth(0.75);
        doc.line(margins.left, y, page.width - margins.right, y);
        y += 8;
      };

      // ---- NAME ----
      addCenteredText(data.contact.name.toUpperCase(), true, font.name);
      y += 2;

      // ---- CONTACT LINE ----
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);
      const contactParts = [formattedPhone, data.contact.email, data.contact.location].filter(Boolean);
      if (contactParts.length > 0) {
        const contactLine = contactParts.join(' | ') + (data.contact.location ? ' | open to relocation' : '');
        addCenteredText(contactLine, false, font.small);
      }

      // ---- LINKS LINE ----
      const linkParts = [data.contact.linkedin, data.contact.github, data.contact.portfolio].filter(Boolean);
      if (linkParts.length > 0) {
        addCenteredText(linkParts.join(' | '), false, font.small);
      }
      y += 4;

      // ---- PROFESSIONAL SUMMARY ----
      if (data.summary) {
        addSectionHeader('PROFESSIONAL SUMMARY');
        addWrappedText(data.summary, false, false, font.body);
        y += 2;
      }

      // ---- WORK EXPERIENCE ----
      if (data.experience && data.experience.length > 0) {
        addSectionHeader('WORK EXPERIENCE');

        data.experience.forEach((job, idx) => {
          checkPageBreak(60);

          // Line 1: COMPANY NAME (bold)
          doc.setFontSize(font.body);
          doc.setFont(font.family, 'bold');
          doc.text(job.company, margins.left, y);
          y += font.body * lineHeight + 2;

          // Line 2: Title | Dates (italic title, normal dates right-aligned)
          if (job.title || job.dates) {
            doc.setFontSize(font.body);
            doc.setFont(font.family, 'italic');
            const titleText = job.title || '';
            const datesText = job.dates || '';

            if (datesText) {
              // Render "Title | Dates" with dates right-aligned
              doc.text(titleText + (titleText ? ' | ' + datesText : datesText), margins.left, y);
            } else {
              doc.text(titleText, margins.left, y);
            }
            y += font.body * lineHeight + 4;
          }

          // Bullets
          job.bullets.forEach(bullet => {
            checkPageBreak();
            const bulletIndent = ATS_SPEC.bullets.indent;
            const bulletContentWidth = contentWidth - bulletIndent - 4;

            doc.setFont(font.family, 'normal');
            doc.setFontSize(font.body);
            doc.text('-', margins.left, y);

            const bulletLines = doc.splitTextToSize(bullet, bulletContentWidth);
            bulletLines.forEach((line, lineIdx) => {
              if (lineIdx > 0) checkPageBreak();
              doc.text(line, margins.left + bulletIndent + 4, y);
              y += font.body * lineHeight + 1;
            });
            y += 1;
          });

          if (idx < data.experience.length - 1) y += 6;
        });
        y += 2;
      }

      // ---- EDUCATION ----
      if (data.education && data.education.length > 0) {
        addSectionHeader('EDUCATION');

        data.education.forEach(edu => {
          checkPageBreak(30);

          // Line 1: Degree (bold) - include GPA if available
          const degreeLine = [edu.degree, edu.gpa ? `(${edu.gpa})` : ''].filter(Boolean).join(' ');
          if (degreeLine) {
            doc.setFontSize(font.body);
            doc.setFont(font.family, 'bold');
            const degreeLines = doc.splitTextToSize(degreeLine, contentWidth);
            degreeLines.forEach(line => {
              checkPageBreak();
              doc.text(line, margins.left, y);
              y += font.body * lineHeight + 1.5;
            });
          }

          // Line 2: Institution (normal)
          if (edu.institution) {
            doc.setFontSize(font.body);
            doc.setFont(font.family, 'normal');
            doc.text(edu.institution, margins.left, y);
            y += font.body * lineHeight + 4;
          }
        });
        y += 2;
      }

      // ---- SKILLS (comma-separated) ----
      if (data.skills && data.skills.length > 0) {
        addSectionHeader('SKILLS');
        addWrappedText(data.skills.join(', '), false, false, font.body);
        y += 2;
      }

      // ---- CERTIFICATIONS (comma-separated) ----
      if (data.certifications && data.certifications.length > 0) {
        addSectionHeader('CERTIFICATIONS');
        addWrappedText(data.certifications.join(', '), false, false, font.body);
      }

      const base64 = doc.output('datauristring').split(',')[1];
      const blob = doc.output('blob');
      return { base64, blob };
    },

    generateCVText(data) {
      const lines = [];
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);
      lines.push(data.contact.name.toUpperCase());
      const contactParts = [formattedPhone, data.contact.email, data.contact.location].filter(Boolean);
      if (contactParts.length > 0) lines.push(contactParts.join(' | ') + (data.contact.location ? ' | open to relocation' : ''));
      const linkParts = [data.contact.linkedin, data.contact.github, data.contact.portfolio].filter(Boolean);
      if (linkParts.length > 0) lines.push(linkParts.join(' | '));
      lines.push('');
      if (data.summary) { lines.push('PROFESSIONAL SUMMARY'); lines.push(data.summary); lines.push(''); }
      if (data.experience?.length > 0) {
        lines.push('WORK EXPERIENCE'); lines.push('');
        data.experience.forEach((job, idx) => {
          lines.push(job.company);
          lines.push(`${job.title} | ${job.dates}`);
          job.bullets.forEach(b => lines.push(`- ${b}`));
          if (idx < data.experience.length - 1) lines.push('');
        });
        lines.push('');
      }
      if (data.education?.length > 0) {
        lines.push('EDUCATION'); lines.push('');
        data.education.forEach(edu => {
          if (edu.degree) lines.push(edu.degree + (edu.gpa ? ` (${edu.gpa})` : ''));
          if (edu.institution) lines.push(edu.institution);
          lines.push('');
        });
      }
      if (data.skills?.length > 0) { lines.push('SKILLS'); lines.push(data.skills.join(', ')); lines.push(''); }
      if (data.certifications?.length > 0) { lines.push('CERTIFICATIONS'); lines.push(data.certifications.join(', ')); }
      return lines.join('\n');
    },

    // ============ COVER LETTER PDF ============
    async generateCoverLetterPDF(tailoredData, keywords, jobData, candidateData, coverLetterText) {
      const startTime = performance.now();
      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (candidateData?.lastName || candidateData?.last_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const filename = lastName ? `${firstName}_${lastName}_Cover_Letter.pdf` : `${firstName}_Cover_Letter.pdf`;

      let pdfBlob = null;
      let pdfBase64 = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const result = await this.renderCoverLetterWithJsPDF(tailoredData, keywords, jobData, candidateData, coverLetterText);
        pdfBlob = result.blob;
        pdfBase64 = result.base64;
      } else {
        const text = coverLetterText || this.generateCoverLetterText(tailoredData, keywords, jobData, candidateData);
        pdfBase64 = btoa(unescape(encodeURIComponent(text)));
      }

      console.log(`[ATSGen] Cover Letter PDF generated in ${(performance.now() - startTime).toFixed(0)}ms`);
      return { blob: pdfBlob, base64: pdfBase64, filename };
    },

    // ============ RENDER COVER LETTER ============
    async renderCoverLetterWithJsPDF(data, keywords, jobData, candidateData, coverLetterText) {
      const { jsPDF } = jspdf;
      const { font, margins, lineHeight, page } = ATS_SPEC;
      const contentWidth = page.width - margins.left - margins.right;

      const doc = new jsPDF({ format: 'a4', unit: 'pt', putOnlyUsedFonts: true });
      doc.setFont(font.family, 'normal');
      let y = margins.top;

      const addText = (text, isBold = false, size = font.body) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, contentWidth);
        lines.forEach(line => {
          if (y > page.height - margins.bottom - 20) { doc.addPage(); y = margins.top; }
          doc.text(line, margins.left, y);
          y += size * lineHeight + 2;
        });
      };

      const addCenteredText = (text, isBold = false, size = font.body) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        if (y > page.height - margins.bottom - 20) { doc.addPage(); y = margins.top; }
        doc.text(text, page.width / 2, y, { align: 'center' });
        y += size * lineHeight + 2;
      };

      const name = data.contact?.name || `${candidateData?.firstName || ''} ${candidateData?.lastName || ''}`.trim() || 'Applicant';
      const jobTitle = jobData?.title || 'the open position';
      let rawCompany = this.extractCompanyName(jobData);
      const invalidNames = ['company', 'your company', 'the company', 'your organization', 'organisation', 'n/a', 'unknown', '', 'employer'];
      const company = (rawCompany && !invalidNames.includes(rawCompany.toLowerCase().trim())) ? rawCompany : 'the hiring organisation';

      if (coverLetterText && coverLetterText.trim().length > 100) {
        // USE AI-GENERATED COVER LETTER
        const cleanedText = this.stripCoverLetterHeader(coverLetterText, name);

        // Header
        addCenteredText(name.toUpperCase(), true, font.name);
        y += 2;
        const formattedPhone = this.formatPhoneForATS(data.contact?.phone);
        const contactLine = [formattedPhone, data.contact?.email].filter(Boolean).join(' | ');
        if (contactLine) addCenteredText(contactLine, false, font.body);
        y += 16;

        // Date
        const dateMatch = cleanedText.match(/^(Date:\s*)?(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/m);
        const dateText = dateMatch ? dateMatch[2] || dateMatch[0].replace(/^Date:\s*/i, '') : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        addText(dateText, false, font.body);
        y += 12;

        // Re: line
        const reMatch = cleanedText.match(/^Re:\s*(.+)$/m);
        addText(reMatch ? reMatch[0] : `Re: ${jobTitle}`, true, font.body);
        y += 8;

        // Salutation
        const dearMatch = cleanedText.match(/^(Dear\s+.+[,:])\s*$/m);
        addText(dearMatch ? dearMatch[1] : 'Dear Hiring Manager,', false, font.body);
        y += 8;

        // Body paragraphs
        const bodyParagraphs = this.extractCoverLetterBody(cleanedText);
        for (const para of bodyParagraphs) {
          const trimmed = para.trim();
          if (!trimmed) continue;
          addText(trimmed, false, font.body);
          y += 14;
        }
        y += 6;

        // Closing
        const closingMatch = cleanedText.match(/^(Yours sincerely|Sincerely|Best regards|Kind regards|Regards),?\s*$/mi);
        addText(closingMatch ? closingMatch[0].replace(/,?\s*$/, ',') : 'Yours sincerely,', false, font.body);
        y += 16;
        addText(name, true, font.body);

      } else {
        // TEMPLATE-BASED COVER LETTER
        addCenteredText(name.toUpperCase(), true, font.name);
        y += 2;
        const formattedPhone = this.formatPhoneForATS(data.contact?.phone);
        const contactLine = [formattedPhone, data.contact?.email].filter(Boolean).join(' | ');
        if (contactLine) addCenteredText(contactLine, false, font.body);
        y += 16;

        addText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), false, font.body);
        y += 12;
        addText(`Re: ${jobTitle}`, true, font.body);
        y += 8;
        addText('Dear Hiring Manager,', false, font.body);
        y += 8;

        const kwa = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
        const hp = Array.isArray(kwa) ? kwa.slice(0, 5) : [];
        const topExp = data.experience?.[0]?.company || 'previous roles';
        const years = this.extractYearsExperience(data.summary) || '7+';

        addText(`I am writing to express my interest in the ${jobTitle} position at ${company}. With ${years} years of experience in ${hp[0] || 'technical solutions'} and ${hp[1] || 'cross-functional collaboration'}, I have consistently delivered measurable business impact.`, false, font.body);
        y += 14;
        addText(`At ${topExp}, I led ${hp[2] || 'project delivery'} initiatives and bring extensive experience in ${hp[3] || 'team leadership'} and delivering complex projects on time and within budget.`, false, font.body);
        y += 14;
        addText(`I would welcome the opportunity to discuss how my ${hp[4] || 'technical leadership'} expertise can contribute to ${company}'s continued success. Thank you for considering my application.`, false, font.body);
        y += 20;

        addText('Yours sincerely,', false, font.body);
        y += 16;
        addText(name, true, font.body);
      }

      const base64 = doc.output('datauristring').split(',')[1];
      const blob = doc.output('blob');
      return { base64, blob };
    },

    stripCoverLetterHeader(text, name) {
      if (!text) return '';
      const lines = text.split('\n');
      let startIdx = 0;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) { startIdx = i + 1; continue; }
        if (trimmed.toUpperCase() === (name || '').toUpperCase()) { startIdx = i + 1; continue; }
        if (/@/.test(trimmed) && !trimmed.toLowerCase().startsWith('dear')) { startIdx = i + 1; continue; }
        if (/^\+?\d[\d\s\-\(\):]+$/.test(trimmed.replace(/[|]/g, '').trim())) { startIdx = i + 1; continue; }
        if (/\|/.test(trimmed) && (/@/.test(trimmed) || /\+\d/.test(trimmed))) { startIdx = i + 1; continue; }
        if (/^https?:\/\//i.test(trimmed)) { startIdx = i + 1; continue; }
        if (/linkedin\.com|github\.com/i.test(trimmed)) { startIdx = i + 1; continue; }
        break;
      }
      return lines.slice(startIdx).join('\n');
    },

    extractCoverLetterBody(text) {
      if (!text) return [];
      const lines = text.split('\n');
      const bodyLines = [];
      let inBody = false;
      const closingPatterns = /^(Yours sincerely|Sincerely|Best regards|Kind regards|Regards|Warm regards|Respectfully),?\s*$/i;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!inBody) {
          if (/^Dear\s+/i.test(trimmed)) { inBody = true; }
          continue;
        }
        if (closingPatterns.test(trimmed)) break;
        bodyLines.push(line);
      }

      const paragraphs = bodyLines.join('\n').split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
      if (paragraphs.length === 0 && text.length > 100) {
        const sentences = text.replace(/^.*?Dear[^,]*,\s*/s, '').replace(/\s*(Yours sincerely|Sincerely|Best regards).*/si, '');
        if (sentences.length > 50) return [sentences];
      }
      return paragraphs;
    },

    extractYearsExperience(summary) {
      if (!summary) return null;
      const match = summary.match(/(\d+)\+?\s*years?/i);
      return match ? match[1] : null;
    },

    extractAchievement(bullet) {
      if (!bullet) return 'significant performance improvements';
      const match = bullet.match(/(\d+%?\s*(?:improvement|increase|reduction|faster|efficiency|growth))/i);
      return match ? match[1] : bullet.slice(0, 50) + (bullet.length > 50 ? '...' : '');
    },

    generateCoverLetterText(data, keywords, jobData, candidateData) {
      const name = data.contact.name;
      const jobTitle = jobData?.title || 'the open position';
      let rawCompany = this.extractCompanyName(jobData);
      const invalidNames = ['company', 'your company', 'the company', 'your organization', 'organization', 'n/a', 'unknown', '', 'employer'];
      const company = (rawCompany && !invalidNames.includes(rawCompany.toLowerCase().trim())) ? rawCompany : 'the hiring organisation';
      const kwa = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
      const hp = Array.isArray(kwa) ? kwa.slice(0, 5) : [];
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);
      return [
        name.toUpperCase(),
        [formattedPhone, data.contact.email].filter(Boolean).join(' | '),
        '',
        new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        '',
        `Re: ${jobTitle}`,
        '',
        'Dear Hiring Manager,',
        '',
        `I am writing to express my interest in the ${jobTitle} position at ${company}. With experience in ${hp[0] || 'technical solutions'} and ${hp[1] || 'cross-functional collaboration'}, I deliver measurable business impact.`,
        '',
        `In previous roles, I have successfully implemented ${hp[2] || 'technical'} solutions and led ${hp[3] || 'cross-functional'} initiatives producing significant improvements.`,
        '',
        `I would welcome the opportunity to discuss how my ${hp[4] || 'expertise'} can contribute to ${company}'s success. Thank you for your consideration.`,
        '',
        'Yours sincerely,',
        name
      ].join('\n');
    },

    calculateMatchScore(tailoredData, keywords) {
      const allKeywords = keywords.all || keywords;
      if (!allKeywords || allKeywords.length === 0) return 0;
      const text = [
        tailoredData.summary, tailoredData.skills?.join(' '),
        tailoredData.experience?.map(e => e.bullets?.join(' ')).join(' '),
        tailoredData.certifications?.join(' ')
      ].filter(Boolean).join(' ').toLowerCase();
      let matches = 0;
      allKeywords.forEach(kw => { if (text.includes(kw.toLowerCase())) matches++; });
      return Math.round((matches / allKeywords.length) * 100);
    },

    extractCompanyName(jobData) {
      if (!jobData) return 'the hiring organisation';
      let company = jobData.company || '';
      const invalidNames = ['company', 'the company', 'your company', 'hiring team', 'organization', 'organisation', 'employer', 'n/a', 'unknown', 'hiring company', '[company]', '{company}', '{{company}}', 'company name'];
      const isInvalid = (val) => { if (!val || typeof val !== 'string') return true; return invalidNames.includes(val.toLowerCase().trim()) || val.trim().length < 2; };

      if (isInvalid(company) && jobData.companyName) company = jobData.companyName;
      if (isInvalid(company) && jobData.recipientCompany) company = jobData.recipientCompany;
      if (isInvalid(company)) {
        const titleMatch = (jobData.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.\-]+?)(?:\s*[-|–—]|\s*$)/i);
        if (titleMatch) company = titleMatch[1].trim();
      }
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const pathMatch = url.match(/\/([a-zA-Z][a-zA-Z0-9\-]{1,30})\/(?:jobs?|careers?|apply|positions?)/i);
        if (pathMatch && pathMatch[1]) {
          const seg = pathMatch[1].toLowerCase();
          const bl = ['www', 'apply', 'jobs', 'careers', 'boards', 'hire', 'greenhouse', 'lever', 'workday', 'smartrecruiters', 'icims', 'taleo'];
          if (!bl.includes(seg)) company = seg.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const hostMatch = url.match(/https?:\/\/([^.\/]+)\./i);
        if (hostMatch && hostMatch[1]) {
          const sub = hostMatch[1].toLowerCase();
          const bl = ['www', 'apply', 'jobs', 'careers', 'boards', 'hire', 'greenhouse', 'lever', 'workday', 'smartrecruiters', 'icims', 'taleo', 'myworkdayjobs'];
          if (!bl.includes(sub) && sub.length > 2 && sub.length < 30) company = sub.toUpperCase().length <= 4 ? sub.toUpperCase() : sub.charAt(0).toUpperCase() + sub.slice(1);
        }
      }
      if (isInvalid(company) && jobData.siteName && !isInvalid(jobData.siteName)) company = jobData.siteName;
      if (company && typeof company === 'string') {
        company = company.replace(/\s*(careers|jobs|hiring|apply|work|join|inc\.?|ltd\.?|llc\.?)\s*$/i, '').replace(/\(formerly[^)]*\)/gi, '').replace(/\s+/g, ' ').trim();
      }
      if (isInvalid(company)) return 'the hiring organisation';
      return company;
    }
  };

  global.OpenResumeGenerator = OpenResumeGenerator;
  console.log('[ATSGen] ATS PDF Generator v4.0 loaded');

})(typeof window !== 'undefined' ? window : this);
