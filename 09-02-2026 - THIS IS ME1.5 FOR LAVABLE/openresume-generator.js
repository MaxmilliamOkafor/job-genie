// openresume-generator.js - OpenResume-Style ATS PDF Generator
// PERFECT FORMAT: Arial 10.5pt, 1" margins, selectable text, 100% ATS parsing
// Based on https://github.com/xitanggg/open-resume methodology

(function(global) {
  'use strict';

  // ============ OPENRESUME ATS SPECIFICATIONS ============
  const ATS_SPEC = {
    font: {
      family: 'helvetica', // jsPDF uses helvetica as Arial equivalent
      name: 14,            // Name: 14pt
      sectionTitle: 11,    // Section headers: 11pt bold
      body: 10.5,          // Body text: 10.5pt (critical)
      small: 9             // Small text: 9pt
    },
    margins: {
      top: 72,    // 1 inch = 72pt
      bottom: 72,
      left: 72,
      right: 72
    },
    lineHeight: 1.15,
    page: {
      width: 595.28,   // A4 width in points
      height: 841.89,  // A4 height in points
      maxPages: 2
    },
    bullets: {
      char: '-',       // Standard Unicode dash (ATS safe)
      indent: 10
    }
  };

  // ============ MAIN GENERATOR CLASS ============
  const OpenResumeGenerator = {

    // ============ GENERATE COMPLETE ATS PACKAGE ============
    // Returns: { cv: blob, cover: blob, cvFilename, coverFilename, matchScore }
    async generateATSPackage(baseCV, keywords, jobData, candidateData) {
      const startTime = performance.now();
      console.log('[OpenResume] Generating ATS Package...');

      // Parse and structure CV data
      const cvData = this.parseAndStructureCV(baseCV, candidateData);
      
      // Tailor CV with keywords
      const tailoredData = this.tailorCVData(cvData, keywords, jobData);
      
      // Generate CV PDF
      const cvResult = await this.generateCVPDF(tailoredData, candidateData);
      
      // Generate Cover Letter PDF
      const coverResult = await this.generateCoverLetterPDF(tailoredData, keywords, jobData, candidateData);
      
      // Calculate match score
      const matchScore = this.calculateMatchScore(tailoredData, keywords);
      
      const timing = performance.now() - startTime;
      console.log(`[OpenResume] Package generated in ${timing.toFixed(0)}ms`);

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

    // ============ PARSE AND STRUCTURE CV ============
    parseAndStructureCV(cvText, candidateData) {
      const data = {
        contact: {
          name: '',
          phone: '',
          email: '',
          location: '',
          linkedin: '',
          github: '',
          portfolio: ''
        },
        summary: '',
        experience: [],
        skills: [],
        education: [],
        certifications: []
      };

      // Extract from candidate data first
      if (candidateData) {
        data.contact.name = `${candidateData.firstName || candidateData.first_name || ''} ${candidateData.lastName || candidateData.last_name || ''}`.trim();
        data.contact.phone = candidateData.phone || '';
        data.contact.email = candidateData.email || '';
        // CRITICAL: Strip "Remote" from location - user rule: never include Remote in CV
        const rawLocation = candidateData.city || candidateData.location || '';
        data.contact.location = this.normalizeLocation(rawLocation) || 'Dublin, IE';
        data.contact.linkedin = candidateData.linkedin || '';
        data.contact.github = candidateData.github || '';
        data.contact.portfolio = candidateData.portfolio || '';
        
        // Extract structured data if available
        if (candidateData.workExperience || candidateData.work_experience) {
          data.experience = (candidateData.workExperience || candidateData.work_experience).map(exp => ({
            company: exp.company || exp.organization || '',
            title: exp.title || exp.position || exp.role || '',
            dates: exp.dates || exp.duration || `${exp.startDate || ''} - ${exp.endDate || 'Present'}`,
            location: exp.location || '',
            bullets: this.normalizeBullets(exp.bullets || exp.achievements || exp.responsibilities || [])
          }));
        }
        
        if (candidateData.skills) {
          data.skills = Array.isArray(candidateData.skills) 
            ? candidateData.skills 
            : candidateData.skills.split(',').map(s => s.trim());
        }
        
        if (candidateData.education) {
          data.education = candidateData.education.map(edu => ({
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

      // Parse from CV text if structured data is missing
      if (cvText && data.experience.length === 0) {
        const parsed = this.parseCVText(cvText);
        Object.assign(data, parsed);
      }

      return data;
    },

    // ============ NORMALIZE BULLETS TO ARRAY ============
    normalizeBullets(bullets) {
      if (!bullets) return [];
      if (Array.isArray(bullets)) return bullets.map(b => b.replace(/^[-•*▪]\s*/, '').trim());
      return bullets.split('\n').filter(b => b.trim()).map(b => b.replace(/^[-•*▪]\s*/, '').trim());
    },

    // ============ PARSE CV TEXT ============
    // FIX v3.4.0: Robust parsing of AI-generated plain text CV with inline headers,
    // contact info stripping, and proper section detection
    parseCVText(cvText) {
      const result = {
        summary: '',
        experience: [],
        skills: [],
        education: [],
        certifications: []
      };

      if (!cvText) return result;

      // STEP 1: Strip contact header lines (name, phone, email, URLs) before section parsing
      // The AI puts contact info at the top which can pollute section detection
      const lines = cvText.split('\n');
      let contentStartIndex = 0;

      // Skip leading contact info lines (name, phone/email, links, blank lines)
      for (let i = 0; i < Math.min(lines.length, 8); i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) { contentStartIndex = i + 1; continue; }
        // Skip lines that look like contact info
        if (/^[A-Z][A-Z\s]+$/.test(trimmed) && trimmed.length < 50) { contentStartIndex = i + 1; continue; } // ALL CAPS name
        if (/[@]/.test(trimmed) || /linkedin\.com|github\.com/i.test(trimmed)) { contentStartIndex = i + 1; continue; } // email/links
        if (/^\+?\d[\d\s\-\(\):]+$/.test(trimmed.replace(/[|]/g, '').trim())) { contentStartIndex = i + 1; continue; } // phone
        if (/\|/.test(trimmed) && (/[@]/.test(trimmed) || /\+\d/.test(trimmed) || /linkedin|github/i.test(trimmed))) { contentStartIndex = i + 1; continue; } // combined contact line
        if (/open to relocation/i.test(trimmed)) { contentStartIndex = i + 1; continue; }
        if (/https?:\/\//i.test(trimmed) && !trimmed.toUpperCase().startsWith('PROFESSIONAL')) { contentStartIndex = i + 1; continue; }
        break; // First non-contact line found
      }

      const contentLines = lines.slice(contentStartIndex);

      const sectionMap = {
        'PROFESSIONAL SUMMARY': 'summary',
        'SUMMARY': 'summary',
        'PROFILE': 'summary',
        'WORK EXPERIENCE': 'experience',
        'PROFESSIONAL EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience',
        'EMPLOYMENT': 'experience',
        'SKILLS': 'skills',
        'TECHNICAL SKILLS': 'skills',
        'TECHNICAL PROFICIENCIES': 'skills',
        'CORE COMPETENCIES': 'skills',
        'KEY SKILLS': 'skills',
        'ADDITIONAL SKILLS': 'skills',
        'EDUCATION': 'education',
        'CERTIFICATIONS': 'certifications',
        'LICENSES': 'certifications'
      };

      // Build regex pattern for inline headers: "SECTION_NAME: content"
      const sectionNames = Object.keys(sectionMap).join('|');
      const inlineHeaderRegex = new RegExp(`^(${sectionNames})\\s*:\\s*(.+)$`, 'i');

      let currentSection = '';
      let currentContent = [];

      for (const line of contentLines) {
        const trimmed = line.trim();
        const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');

        // Check for inline header pattern first (e.g., "PROFESSIONAL SUMMARY: Experienced...")
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

      // STEP 2: Merge duplicate skills sections (AI sometimes outputs SKILLS + ADDITIONAL SKILLS)
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
          // Merge skills from multiple sections
          const newSkills = text
            .replace(/[•\-*]/g, ',')
            .split(/[,\n]/)
            .map(s => s.trim())
            .filter(s => s.length > 1 && s.length < 60);
          result.skills = [...result.skills, ...newSkills];
          break;
        case 'experience':
          const newExp = this.parseExperienceText(text);
          if (newExp.length > 0) {
            // Merge avoiding duplicates by company name
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

    // ============ PARSE EXPERIENCE TEXT ============
    // FIX v3.4.0: Robust job header detection supporting multiple formats:
    // "Company | Title | Dates", "Company | Title | MM/YYYY - Present", etc.
    parseExperienceText(text) {
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;

      // Section headers that should NOT be treated as job entries
      const sectionHeaders = new Set([
        'professional experience', 'work experience', 'experience',
        'employment history', 'career history', 'employment'
      ]);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip section header lines
        if (sectionHeaders.has(trimmed.toLowerCase().replace(/[:\s]+$/, ''))) continue;

        // Detect job header: must have pipe separator and NOT be a bullet
        if (trimmed.includes('|') && !trimmed.startsWith('•') && !trimmed.startsWith('-') && !trimmed.startsWith('*')) {
          if (currentJob && currentJob.company) jobs.push(currentJob);

          const parts = trimmed.split('|').map(p => p.trim());

          // Extract company, title, dates - clean each field
          let company = parts[0] || '';
          let title = parts[1] || '';
          let dates = parts[2] || '';
          let location = parts[3] || '';

          // Strip dates that leaked into company or title fields
          company = this.stripDatesFromField(company);
          title = this.stripDatesFromField(title);

          // If dates field is empty, check if it's embedded in other fields
          if (!dates) {
            const datePattern = /(\d{2}\/\d{4}\s*[-–]\s*(?:Present|\d{2}\/\d{4})|\d{4}\s*[-–]\s*(?:Present|\d{4}))/i;
            for (const part of parts) {
              const match = part.match(datePattern);
              if (match) { dates = match[1]; break; }
            }
          }

          // Normalize dates to "YYYY – YYYY" or "MM/YYYY – Present" format
          dates = this.normalizeDates(dates);

          // Skip if company looks like a section header
          if (sectionHeaders.has(company.toLowerCase())) continue;

          currentJob = {
            company: company,
            title: title,
            dates: dates,
            location: location,
            bullets: []
          };
        } else if (currentJob && /^[-•*▪]/.test(trimmed)) {
          currentJob.bullets.push(trimmed.replace(/^[-•*▪]\s*/, '').trim());
        }
      }

      if (currentJob && currentJob.company) jobs.push(currentJob);
      return jobs;
    },

    // ============ STRIP DATES FROM A FIELD ============
    stripDatesFromField(value) {
      if (!value) return '';
      return value
        .replace(/\d{2}\/\d{4}\s*[-–—]\s*(Present|\d{2}\/\d{4}|\d{4})/gi, '')
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

      // Handle MM/YYYY - MM/YYYY or MM/YYYY - Present format
      const monthYearMatch = dateStr.match(/(\d{2}\/\d{4})\s*[-–—]\s*(Present|\d{2}\/\d{4})/i);
      if (monthYearMatch) {
        return `${monthYearMatch[1]} – ${monthYearMatch[2]}`;
      }

      // Handle YYYY - YYYY or YYYY - Present format
      const years = dateStr.match(/\d{4}/g);
      const hasPresent = /present/i.test(dateStr);

      if (hasPresent && years && years.length >= 1) {
        return `${years[0]} – Present`;
      } else if (years && years.length >= 2) {
        return `${years[0]} – ${years[1]}`;
      } else if (years && years.length === 1) {
        return years[0];
      }

      // Normalize dashes to en-dash with spaces
      return dateStr.replace(/\s*[-–—]\s*/g, ' – ');
    },

    // ============ PARSE EDUCATION TEXT ============
    parseEducationText(text) {
      const entries = [];
      const lines = text.split('\n').filter(l => l.trim());

      for (const line of lines) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length >= 2) {
          entries.push({
            institution: parts[0],
            degree: parts[1],
            dates: parts[2] || '',
            gpa: parts[3] || ''
          });
        } else if (line.trim()) {
          entries.push({
            institution: line.trim(),
            degree: '',
            dates: '',
            gpa: ''
          });
        }
      }

      return entries;
    },

    // ============ TAILOR CV DATA WITH ALL KEYWORDS (100% MATCH) ============
    // UPDATED: Uses Strategic Keyword Integration to prioritise Work Experience
    tailorCVData(cvData, keywords, jobData) {
      const tailored = JSON.parse(JSON.stringify(cvData)); // Deep clone
      
      // ROBUST: Support both array and structured keywords
      // keywords can be: an array, or an object with {all, highPriority, mediumPriority, lowPriority}
      const allKeywords = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const highPriority = Array.isArray(keywords) ? allKeywords.slice(0, 15) : (keywords?.highPriority || allKeywords.slice(0, 15));
      const mediumPriority = Array.isArray(keywords) ? [] : (keywords?.mediumPriority || []);
      const lowPriority = Array.isArray(keywords) ? [] : (keywords?.lowPriority || []);

      // 1. Update location to job location
      if (jobData?.location) {
        tailored.contact.location = this.normalizeLocation(jobData.location);
      }

      // 2. Enhance summary with top 5-8 keywords
      tailored.summary = this.enhanceSummary(cvData.summary, [...highPriority.slice(0, 5), ...mediumPriority.slice(0, 3)]);

      // 3. STRATEGIC KEYWORD INTEGRATION: Inject keywords into Work Experience first
      // Use StrategicKeywordIntegration if available (prioritises bullets over skills list)
      if (typeof StrategicKeywordIntegration !== 'undefined') {
        console.log('[OpenResume] Using Strategic Keyword Integration for Work Experience');
        const integrationResult = StrategicKeywordIntegration.enhanceBulletPointsWithKeywords(
          cvData.experience,
          { all: allKeywords, highPriority, mediumPriority, lowPriority }
        );
        tailored.experience = integrationResult.enhancedExperience;
        
        // Remove integrated keywords from skills (they're now in bullets)
        const integratedKeywords = integrationResult.stats?.integratedKeywords || [];
        const remainingKeywords = allKeywords.filter(kw => 
          !integratedKeywords.some(ik => ik.toLowerCase() === kw.toLowerCase())
        );
        
        // Only add remaining keywords to skills (minimal skills list)
        tailored.skills = this.mergeSkills(cvData.skills, remainingKeywords.slice(0, 10));
        
        console.log('[OpenResume] Strategic Integration Stats:', {
          bulletsModified: integrationResult.stats?.bulletsModified || 0,
          keywordsIntegrated: integratedKeywords.length,
          remainingForSkills: remainingKeywords.length
        });
      } else {
        // Fallback to legacy injection
        tailored.experience = this.injectAllKeywordsIntoExperience(cvData.experience, {
          high: highPriority,
          medium: mediumPriority,
          low: lowPriority,
          all: allKeywords
        });
        
        // 4. Merge ALL keywords into skills
        tailored.skills = this.mergeSkills(cvData.skills, allKeywords);
      }

      return tailored;
    },

    // ============ NORMALIZE LOCATION ============
    // HARD RULE: NEVER include "Remote" in CV location (recruiter red flag)
    // Output format: "City, State" for US cities (e.g., "San Francisco, CA")
    normalizeLocation(location) {
      if (!location) return '';
      
      // CRITICAL: Strip "Remote" and similar terms first
      let normalized = location
        .replace(/\b(remote|work\s*from\s*home|wfh|virtual|fully\s*remote|remote\s*first|remote\s*friendly)\b/gi, '')
        .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
        .replace(/\s*(\||,|\/|-)\s*(\||,|\/|-)\s*/g, ', ')
        .replace(/\s*(\||,|\/|-)\s*$/g, '')
        .replace(/^\s*(\||,|\/|-)\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      // If empty after stripping Remote, return empty for fallback
      if (!normalized || normalized.length < 3) {
        return '';
      }
      
      // US State abbreviation mapping for "City, State" format
      const stateAbbrev = {
        'california': 'CA', 'texas': 'TX', 'new york': 'NY', 'florida': 'FL',
        'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH', 'georgia': 'GA',
        'north carolina': 'NC', 'michigan': 'MI', 'new jersey': 'NJ', 'virginia': 'VA',
        'washington': 'WA', 'arizona': 'AZ', 'massachusetts': 'MA', 'tennessee': 'TN',
        'indiana': 'IN', 'missouri': 'MO', 'maryland': 'MD', 'wisconsin': 'WI',
        'colorado': 'CO', 'minnesota': 'MN', 'south carolina': 'SC', 'alabama': 'AL',
        'louisiana': 'LA', 'kentucky': 'KY', 'oregon': 'OR', 'oklahoma': 'OK',
        'connecticut': 'CT', 'utah': 'UT', 'iowa': 'IA', 'nevada': 'NV',
        'arkansas': 'AR', 'mississippi': 'MS', 'kansas': 'KS', 'new mexico': 'NM',
        'nebraska': 'NE', 'idaho': 'ID', 'west virginia': 'WV', 'hawaii': 'HI',
        'new hampshire': 'NH', 'maine': 'ME', 'montana': 'MT', 'rhode island': 'RI',
        'delaware': 'DE', 'south dakota': 'SD', 'north dakota': 'ND', 'alaska': 'AK',
        'vermont': 'VT', 'wyoming': 'WY', 'district of columbia': 'DC'
      };
      
      // Convert full state names to abbreviations (City, California -> City, CA)
      for (const [full, abbrev] of Object.entries(stateAbbrev)) {
        const regex = new RegExp(`,\\s*${full}\\s*$`, 'i');
        if (regex.test(normalized)) {
          normalized = normalized.replace(regex, `, ${abbrev}`);
          break;
        }
      }
      
      // Remove "USA", "United States", "US" suffixes but keep state abbreviation
      normalized = normalized
        .replace(/,\s*(US|USA|United States)\s*$/i, '')
        .replace(/,\s*(UK|United Kingdom)\s*$/i, '')
        .trim();
      
      return normalized;
    },
    
    // ============ FORMAT PHONE FOR ATS ============
    // Format: "+CountryCode: LocalNumber" (e.g., "+353: 0874261508")
    formatPhoneForATS(phone) {
      if (!phone) return '';
      
      // Remove all non-digit and non-plus characters
      let cleaned = phone.replace(/[^\d+]/g, '');
      
      // If starts with +, format as "+XXX: rest"
      if (cleaned.startsWith('+')) {
        // Match country code (1-3 digits after +)
        const match = cleaned.match(/^\+(\d{1,3})(\d+)$/);
        if (match) {
          return `+${match[1]}: ${match[2]}`;
        }
      }
      
      // Return original if no country code detected
      return phone;
    },

    // ============ ENHANCE SUMMARY WITH KEYWORDS ============
    // UPDATED: UK spelling, no banned words, anti-AI detection
    enhanceSummary(summary, keywords) {
      // ROBUST: Ensure keywords is always an array
      const keywordsArray = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
      
      // Apply ContentQualityEngine if available
      const sanitise = (text) => {
        if (typeof ContentQualityEngine !== 'undefined') {
          return ContentQualityEngine.sanitiseSummary(text);
        }
        return text;
      };
      
      if (!summary) {
        // Generate default summary - UPDATED: No banned phrases
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
        if (result.endsWith('.')) {
          result = result.slice(0, -1) + injection + '.';
        } else {
          result = result + injection + '.';
        }
      }

      return result;
    },

    // ============ INJECT ALL KEYWORDS INTO EXPERIENCE (100% MATCH) ============
    // High/Medium: 3-5x mentions, Low: 1-2x mentions
    injectAllKeywordsIntoExperience(experience, keywordsByPriority) {
      if (!experience || experience.length === 0) return experience;
      
      const { high = [], medium = [], low = [], all = [] } = keywordsByPriority;
      const allKeywords = all.length > 0 ? all : [...high, ...medium, ...low];

      // Track keyword mentions with priority-based targets
      const mentions = {};
      const targets = {};
      const maxMentions = {};
      
      high.forEach(kw => { mentions[kw] = 0; targets[kw] = 3; maxMentions[kw] = 5; });
      medium.forEach(kw => { mentions[kw] = 0; targets[kw] = 3; maxMentions[kw] = 5; });
      low.forEach(kw => { mentions[kw] = 0; targets[kw] = 1; maxMentions[kw] = 2; });
      
      // For keywords not categorized, default to medium priority targets
      allKeywords.forEach(kw => {
        if (mentions[kw] === undefined) {
          mentions[kw] = 0;
          targets[kw] = 2;
          maxMentions[kw] = 3;
        }
      });

      // Count existing mentions
      experience.forEach(job => {
        job.bullets.forEach(bullet => {
          allKeywords.forEach(kw => {
            if (bullet.toLowerCase().includes(kw.toLowerCase())) {
              mentions[kw]++;
            }
          });
        });
      });

      // Natural injection phrases - UPDATED: No banned words (removed leveraging, utilizing)
      const phrases = [
        'implementing', 'applying', 'through', 'incorporating', 
        'via', 'using', 'with', 'employing'
      ];
      const getPhrase = () => phrases[Math.floor(Math.random() * phrases.length)];

      // AGGRESSIVE injection: process all bullets, inject until all keywords have enough mentions
      return experience.map((job, jobIndex) => {
        // More keywords in recent roles
        const maxKeywordsPerBullet = Math.max(2, 4 - jobIndex);
        
        const enhancedBullets = job.bullets.map((bullet) => {
          // Find keywords that need more mentions AND aren't in this bullet
          // Prioritize high > medium > low
          const needsMore = allKeywords.filter(kw => {
            const current = mentions[kw];
            const target = targets[kw] || 2;
            const inBullet = bullet.toLowerCase().includes(kw.toLowerCase());
            return current < target && !inBullet;
          });

          if (needsMore.length === 0) return bullet;

          let enhanced = bullet;
          
          // Sort by priority: high first
          const sorted = [
            ...needsMore.filter(kw => high.includes(kw)),
            ...needsMore.filter(kw => medium.includes(kw)),
            ...needsMore.filter(kw => low.includes(kw))
          ];
          
          // Inject up to maxKeywordsPerBullet keywords per bullet
          const toInject = sorted.slice(0, maxKeywordsPerBullet);
          
          toInject.forEach(kw => {
            if (mentions[kw] >= (maxMentions[kw] || 5)) return;
            
            const kwLower = kw.toLowerCase();
            const enhancedLower = enhanced.toLowerCase();
            
            if (enhancedLower.includes(kwLower)) return; // Already has it
            
            const phrase = getPhrase();
            
            // Strategy 1: After action verb - UPDATED: Removed "Spearheaded" (banned), replaced "Optimized" with UK spelling
            const verbMatch = enhanced.match(/^(Led|Managed|Developed|Built|Created|Implemented|Designed|Engineered|Delivered|Owned|Optimised|Automated|Directed|Shaped|Drove|Established)\b/i);
            if (verbMatch) {
              const idx = verbMatch[0].length;
              enhanced = `${enhanced.slice(0, idx)} ${kw}-focused${enhanced.slice(idx)}`;
              mentions[kw]++;
              return;
            }
            
            // Strategy 2: Before first comma
            const commaIdx = enhanced.indexOf(',');
            if (commaIdx > 15 && commaIdx < enhanced.length * 0.6) {
              enhanced = `${enhanced.slice(0, commaIdx)}, ${phrase} ${kw}${enhanced.slice(commaIdx)}`;
              mentions[kw]++;
              return;
            }
            
            // Strategy 3: Before period at end
            if (enhanced.endsWith('.')) {
              enhanced = `${enhanced.slice(0, -1)}, ${phrase} ${kw}.`;
              mentions[kw]++;
              return;
            }
            
            // Strategy 4: GUARANTEED - just append
            enhanced = `${enhanced}, ${phrase} ${kw}`;
            mentions[kw]++;
          });

          return enhanced;
        });

        return { ...job, bullets: enhancedBullets };
      });
    },
    
    // Legacy function for backward compatibility
    injectKeywordsIntoExperience(experience, keywords, options = {}) {
      return this.injectAllKeywordsIntoExperience(experience, { high: keywords, all: keywords });
    },

    // ============ MERGE SKILLS WITH KEYWORDS ============
    mergeSkills(existingSkills, keywords) {
      const skillSet = new Set((existingSkills || []).map(s => s.toLowerCase()));
      const merged = [...(existingSkills || [])];

      // Add top keywords not already in skills
      const topKeywords = (keywords.all || keywords).slice(0, 10);
      topKeywords.forEach(kw => {
        if (!skillSet.has(kw.toLowerCase())) {
          merged.push(this.formatSkillName(kw));
          skillSet.add(kw.toLowerCase());
        }
      });

      // Limit to 25 skills max
      return merged.slice(0, 25);
    },

    // ============ FORMAT SKILL NAME ============
    formatSkillName(skill) {
      const acronyms = new Set([
        'SQL', 'AWS', 'GCP', 'API', 'REST', 'HTML', 'CSS', 'JSON', 'XML',
        'CI', 'CD', 'ETL', 'ML', 'AI', 'NLP', 'LLM', 'UI', 'UX', 'SDK',
        'HTTP', 'JWT', 'OAuth', 'CRUD', 'ORM', 'MVC', 'TDD', 'NoSQL'
      ]);

      return skill.split(/\s+/).map(word => {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
        if (word.length <= 2) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
    },

    // ============ GENERATE CV PDF (OpenResume Style) ============
    async generateCVPDF(tailoredData, candidateData) {
      const startTime = performance.now();

      // Generate filename: {FirstName}_{LastName}_CV.pdf (user requested format)
      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (candidateData?.lastName || candidateData?.last_name || '')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const filename = lastName ? `${firstName}_${lastName}_CV.pdf` : `${firstName}_CV.pdf`;

      let pdfBlob = null;
      let pdfBase64 = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const result = await this.renderCVWithJsPDF(tailoredData);
        pdfBlob = result.blob;
        pdfBase64 = result.base64;
      } else {
        // Fallback: text-based PDF
        const text = this.generateCVText(tailoredData);
        pdfBase64 = btoa(unescape(encodeURIComponent(text)));
      }

      console.log(`[OpenResume] CV PDF generated in ${(performance.now() - startTime).toFixed(0)}ms`);

      return { blob: pdfBlob, base64: pdfBase64, filename };
    },

    // ============ RENDER CV WITH JSPDF (OpenResume Style) ============
    async renderCVWithJsPDF(data) {
      const { jsPDF } = jspdf;
      const { font, margins, lineHeight, page } = ATS_SPEC;
      const contentWidth = page.width - margins.left - margins.right;

      const doc = new jsPDF({ format: 'a4', unit: 'pt', putOnlyUsedFonts: true });
      doc.setFont(font.family, 'normal');
      let y = margins.top;

      // Helper: Add text with word wrap and page breaks
      const addText = (text, isBold = false, isCentered = false, size = font.body) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        
        const lines = doc.splitTextToSize(text, contentWidth);
        lines.forEach(line => {
          if (y > page.height - margins.bottom - 20) {
            doc.addPage();
            y = margins.top;
          }
          const x = isCentered ? (page.width - doc.getTextWidth(line)) / 2 : margins.left;
          doc.text(line, x, y);
          y += size * lineHeight + 2;
        });
      };

      // Helper: Add section header with line
      const addSectionHeader = (title) => {
        if (y > page.height - margins.bottom - 50) {
          doc.addPage();
          y = margins.top;
        }
        y += 10;
        addText(title, true, false, font.sectionTitle);
        doc.setLineWidth(0.5);
        doc.line(margins.left, y - 2, page.width - margins.right, y - 2);
        y += 4;
      };

      // === NAME ===
      addText(data.contact.name.toUpperCase(), true, true, font.name);
      y += 2;

      // === CONTACT LINE ===
      // Format: "+CountryCode: Number | email | City, State | open to relocation"
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);
      const contactParts = [formattedPhone, data.contact.email, data.contact.location].filter(Boolean);
      if (contactParts.length > 0) {
        // Add "open to relocation" if location exists
        const contactLine = contactParts.join(' | ') + (data.contact.location ? ' | open to relocation' : '');
        addText(contactLine, false, true, font.body);
      }

      // === LINKS LINE ===
      const linkParts = [data.contact.linkedin, data.contact.github, data.contact.portfolio].filter(Boolean);
      if (linkParts.length > 0) {
        addText(linkParts.join(' | '), false, true, font.small);
      }

      y += 8;

      // === PROFESSIONAL SUMMARY ===
      if (data.summary) {
        addSectionHeader('PROFESSIONAL SUMMARY');
        addText(data.summary, false, false, font.body);
        y += 4;
      }

      // === WORK EXPERIENCE ===
      if (data.experience && data.experience.length > 0) {
        addSectionHeader('WORK EXPERIENCE');

        data.experience.forEach((job, idx) => {
          // Check page break before each job (need room for header + at least 1 bullet)
          if (y > page.height - margins.bottom - 80) {
            doc.addPage();
            y = margins.top;
          }

          // Line 1: Company name (bold)
          doc.setFontSize(font.body);
          doc.setFont(font.family, 'bold');
          doc.text(job.company, margins.left, y);
          y += font.body * lineHeight + 2;

          // Line 2: Title (normal) with dates right-aligned
          doc.setFont(font.family, 'normal');
          doc.text(job.title, margins.left, y);
          if (job.dates) {
            doc.setFont(font.family, 'normal');
            const datesWidth = doc.getTextWidth(job.dates);
            doc.text(job.dates, page.width - margins.right - datesWidth, y);
          }
          y += font.body * lineHeight + 4;

          // Bullets
          job.bullets.forEach(bullet => {
            // Check page break before each bullet
            if (y > page.height - margins.bottom - 20) {
              doc.addPage();
              y = margins.top;
            }

            const bulletChar = ATS_SPEC.bullets.char;
            const bulletIndent = ATS_SPEC.bullets.indent;
            const bulletContentWidth = contentWidth - bulletIndent - 4;

            doc.setFont(font.family, 'normal');
            doc.setFontSize(font.body);

            // Render bullet character
            doc.text(bulletChar, margins.left, y);

            // Wrap and render bullet text
            const bulletLines = doc.splitTextToSize(bullet, bulletContentWidth);
            bulletLines.forEach((line, lineIdx) => {
              if (lineIdx > 0 && y > page.height - margins.bottom - 20) {
                doc.addPage();
                y = margins.top;
              }
              doc.text(line, margins.left + bulletIndent + 4, y);
              y += font.body * lineHeight + 1;
            });
            y += 1; // Small gap between bullets
          });

          if (idx < data.experience.length - 1) y += 8; // Gap between jobs
        });
        y += 4;
      }

      // === EDUCATION ===
      if (data.education && data.education.length > 0) {
        addSectionHeader('EDUCATION');
        
        data.education.forEach(edu => {
          const eduLine = [edu.institution, edu.degree, edu.dates, edu.gpa ? `GPA: ${edu.gpa}` : ''].filter(Boolean).join(' | ');
          addText(eduLine, false, false, font.body);
        });
        y += 4;
      }

      // === SKILLS (comma-separated, single line) ===
      if (data.skills && data.skills.length > 0) {
        addSectionHeader('TECHNICAL PROFICIENCIES');
        addText(data.skills.join(', '), false, false, font.body);
        y += 4;
      }

      // === CERTIFICATIONS ===
      if (data.certifications && data.certifications.length > 0) {
        addSectionHeader('CERTIFICATIONS');
        addText(data.certifications.join(', '), false, false, font.body);
      }

      // Generate output
      const base64 = doc.output('datauristring').split(',')[1];
      const blob = doc.output('blob');

      return { base64, blob };
    },

    // ============ GENERATE CV TEXT (Fallback) ============
    // FIX v3.4.0: Consistent text formatting that matches PDF structure
    generateCVText(data) {
      const lines = [];
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);

      // Header: Name, contact info, links
      lines.push(data.contact.name.toUpperCase());
      const contactParts = [formattedPhone, data.contact.email, data.contact.location].filter(Boolean);
      if (contactParts.length > 0) {
        lines.push(contactParts.join(' | ') + (data.contact.location ? ' | open to relocation' : ''));
      }
      const linkParts = [data.contact.linkedin, data.contact.github, data.contact.portfolio].filter(Boolean);
      if (linkParts.length > 0) {
        lines.push(linkParts.join(' | '));
      }
      lines.push('');

      // Professional Summary
      if (data.summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push(data.summary);
        lines.push('');
      }

      // Work Experience
      if (data.experience?.length > 0) {
        lines.push('WORK EXPERIENCE');
        lines.push('');
        data.experience.forEach((job, idx) => {
          // Company | Title | Dates format
          const headerParts = [job.company, job.title, job.dates].filter(Boolean);
          lines.push(headerParts.join(' | '));
          job.bullets.forEach(b => lines.push(`- ${b}`));
          if (idx < data.experience.length - 1) lines.push('');
        });
        lines.push('');
      }

      // Education
      if (data.education?.length > 0) {
        lines.push('EDUCATION');
        lines.push('');
        data.education.forEach(edu => {
          const eduParts = [edu.degree, edu.institution, edu.dates].filter(Boolean);
          const gpaPart = edu.gpa ? ` (${edu.gpa})` : '';
          lines.push(eduParts.join(' | ') + gpaPart);
        });
        lines.push('');
      }

      // Skills
      if (data.skills?.length > 0) {
        lines.push('SKILLS');
        lines.push(data.skills.join(', '));
        lines.push('');
      }

      // Certifications
      if (data.certifications?.length > 0) {
        lines.push('CERTIFICATIONS');
        lines.push(data.certifications.join(', '));
      }

      return lines.join('\n');
    },

    // ============ GENERATE COVER LETTER PDF ============
    async generateCoverLetterPDF(tailoredData, keywords, jobData, candidateData) {
      const startTime = performance.now();

      // Generate filename: {FirstName}_{LastName}_Cover_Letter.pdf (user requested format)
      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (candidateData?.lastName || candidateData?.last_name || '')
        .trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const filename = lastName ? `${firstName}_${lastName}_Cover_Letter.pdf` : `${firstName}_Cover_Letter.pdf`;

      let pdfBlob = null;
      let pdfBase64 = null;

      if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
        const result = await this.renderCoverLetterWithJsPDF(tailoredData, keywords, jobData, candidateData);
        pdfBlob = result.blob;
        pdfBase64 = result.base64;
      } else {
        const text = this.generateCoverLetterText(tailoredData, keywords, jobData, candidateData);
        pdfBase64 = btoa(unescape(encodeURIComponent(text)));
      }

      console.log(`[OpenResume] Cover Letter PDF generated in ${(performance.now() - startTime).toFixed(0)}ms`);

      return { blob: pdfBlob, base64: pdfBase64, filename };
    },

    // ============ RENDER COVER LETTER WITH JSPDF ============
    async renderCoverLetterWithJsPDF(data, keywords, jobData, candidateData) {
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
          doc.text(line, margins.left, y);
          y += size * lineHeight + 2;
        });
      };

      const addCenteredText = (text, isBold = false, size = font.body) => {
        doc.setFontSize(size);
        doc.setFont(font.family, isBold ? 'bold' : 'normal');
        doc.text(text, page.width / 2, y, { align: 'center' });
        y += size * lineHeight + 2;
      };

      // Extract info
      const name = data.contact.name;
      const jobTitle = jobData?.title || 'the open position';
      // FIX 02-02-26: ROBUST company extraction with CRITICAL validation
      let rawCompany = this.extractCompanyName(jobData);
      
      // Extended validation - NEVER allow these placeholder values
      const invalidCompanyNames = ['company', 'your company', 'the company', 'your organization', 
                                   'organization', 'n/a', 'unknown', '', 'employer'];
      const company = (rawCompany && !invalidCompanyNames.includes(rawCompany.toLowerCase().trim())) 
        ? rawCompany 
        : 'the hiring organization';
      
      console.log(`[OpenResume] Cover letter using company: "${company}"`);
      // ROBUST: Ensure keywords is always an array before slicing
      const keywordsArray = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
      const highPriority = Array.isArray(keywordsArray) ? keywordsArray.slice(0, 5) : [];
      const topExp = data.experience?.[0]?.company || 'my previous roles';

      // === HEADER ===
      addCenteredText(name.toUpperCase(), true, font.name);
      y += 2;
      
      // Phone | Email format (no location in cover letter header)
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);
      const contactLine = [formattedPhone, data.contact.email].filter(Boolean).join(' | ');
      addCenteredText(contactLine, false, font.body);
      y += 16;

      // === DATE ===
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      addText(today, false, font.body);
      y += 12;

      // === SUBJECT LINE (NO COMPANY NAME LINE) ===
      addText(`Re: ${jobTitle}`, true, font.body);
      y += 8;

      // === SALUTATION ===
      addText('Dear Hiring Manager,', false, font.body);
      y += 8;

      // === PARAGRAPH 1: Interest + Keywords ===
      const kw1 = highPriority[0] || 'software development';
      const kw2 = highPriority[1] || 'technical solutions';
      const years = this.extractYearsExperience(data.summary) || '7+';
      
      const para1 = `I am excited to apply for the ${jobTitle} position at ${company}. With ${years} years of experience leading ${kw1} and ${kw2} initiatives, I consistently deliver measurable business impact through innovative technical solutions and cross-functional collaboration.`;
      addText(para1, false, font.body);
      y += 18; // Proper paragraph spacing

      // === PARAGRAPH 2: Proof + Keywords ===
      const kw3 = highPriority[2] || 'project delivery';
      const kw4 = highPriority[3] || 'team leadership';
      const topBullet = data.experience?.[0]?.bullets?.[0] || 'driving efficiency improvements of 30%+';

      const para2 = `At ${topExp}, I led ${kw3} implementations that resulted in ${this.extractAchievement(topBullet)}. I have extensive experience mentoring cross-functional teams and applying ${kw4} methodologies to deliver complex projects on time and within budget.`;
      addText(para2, false, font.body);
      y += 18; // Proper paragraph spacing

      // === PARAGRAPH 3: Call to Action ===
      const kw5 = highPriority[4] || 'technical leadership';
      
      const para3 = `I would welcome the opportunity to discuss how my ${kw5} expertise can contribute to ${company}'s continued success. Thank you for considering my application. I look forward to the possibility of contributing to your team.`;
      addText(para3, false, font.body);
      y += 20; // Extra spacing before closing

      // === CLOSING ===
      addText('Sincerely,', false, font.body);
      y += 16;
      addText(name, true, font.body);

      // Generate output
      const base64 = doc.output('datauristring').split(',')[1];
      const blob = doc.output('blob');

      return { base64, blob };
    },

    // ============ HELPER: Extract Years Experience ============
    extractYearsExperience(summary) {
      if (!summary) return null;
      const match = summary.match(/(\d+)\+?\s*years?/i);
      return match ? match[1] : null;
    },

    // ============ HELPER: Extract Achievement ============
    extractAchievement(bullet) {
      if (!bullet) return 'significant performance improvements';
      // Try to extract a quantified achievement
      const match = bullet.match(/(\d+%?\s*(?:improvement|increase|reduction|faster|efficiency|growth))/i);
      return match ? match[1] : bullet.slice(0, 50) + (bullet.length > 50 ? '...' : '');
    },

    // ============ GENERATE COVER LETTER TEXT (Fallback) ============
    generateCoverLetterText(data, keywords, jobData, candidateData) {
      const name = data.contact.name;
      const jobTitle = jobData?.title || 'the open position';
      // FIX 02-02-26: ROBUST company extraction with CRITICAL validation
      let rawCompany = this.extractCompanyName(jobData);
      const invalidCompanyNames = ['company', 'your company', 'the company', 'your organization', 
                                   'organization', 'n/a', 'unknown', '', 'employer'];
      const company = (rawCompany && !invalidCompanyNames.includes(rawCompany.toLowerCase().trim())) 
        ? rawCompany 
        : 'the hiring organization';
      // ROBUST: Ensure keywords is always an array before slicing
      const keywordsArray = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
      const highPriority = Array.isArray(keywordsArray) ? keywordsArray.slice(0, 5) : [];
      // Default keywords if empty
      const kw1 = highPriority[0] || 'technical solutions';
      const kw2 = highPriority[1] || 'cross-functional collaboration';

      // Format: Name, Phone | Email, Date, Re: Title, Dear Hiring Manager (NO company name line)
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);
      const lines = [
        name.toUpperCase(),
        [formattedPhone, data.contact.email].filter(Boolean).join(' | '),
        '',
        new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        '',
        `Re: ${jobTitle}`,
        '',
        'Dear Hiring Manager,',
        '',
        `I am excited to apply for the ${jobTitle} position at ${company}. With experience in ${kw1} and ${kw2}, I deliver measurable business impact through innovative solutions.`,
        '',
        `In my previous roles, I have successfully implemented ${highPriority[2] || 'technical'} solutions and led ${highPriority[3] || 'cross-functional'} initiatives resulting in significant improvements.`,
        '',
        `I would welcome the opportunity to discuss how my ${highPriority[4] || 'expertise'} can contribute to ${company}'s success. Thank you for your consideration.`,
        '',
        'Sincerely,',
        name
      ];

      return lines.join('\n');
    },

    // ============ CALCULATE MATCH SCORE ============
    calculateMatchScore(tailoredData, keywords) {
      const allKeywords = keywords.all || keywords;
      if (!allKeywords || allKeywords.length === 0) return 0;

      // Build text from all sections
      const text = [
        tailoredData.summary,
        tailoredData.skills?.join(' '),
        tailoredData.experience?.map(e => e.bullets?.join(' ')).join(' '),
        tailoredData.certifications?.join(' ')
      ].filter(Boolean).join(' ').toLowerCase();

      // Count matches
      let matches = 0;
      allKeywords.forEach(kw => {
        if (text.includes(kw.toLowerCase())) matches++;
      });

      const score = Math.round((matches / allKeywords.length) * 100);
      console.log(`[OpenResume] Match Score: ${score}% (${matches}/${allKeywords.length})`);
      return score;
    },

    // ============ HELPER: Extract Company Name with Multi-Source Fallback (100% ACCURACY) ============
    // CRITICAL: This function MUST return a valid company name, NEVER "Company" or empty for cover letters
    extractCompanyName(jobData) {
      if (!jobData) return 'the hiring organization';
      
      // Try jobData.company first
      let company = jobData.company || '';
      
      // Extended list of invalid placeholder values
      const invalidNames = [
        'company', 'the company', 'your company', 'hiring team', 'organization', 
        'organisation', 'employer', 'n/a', 'unknown', 'hiring company', 'the hiring company',
        '[company]', '{company}', '{{company}}', 'company name', '[company name]'
      ];
      
      // Validate: reject invalid values
      const isInvalid = (val) => {
        if (!val || typeof val !== 'string') return true;
        const lower = val.toLowerCase().trim();
        return invalidNames.includes(lower) || lower.length < 2;
      };
      
      // STRATEGY 1: Check companyName alternate field
      if (isInvalid(company) && jobData.companyName) {
        company = jobData.companyName;
      }
      
      // STRATEGY 2: Check recipientCompany field from AI response
      if (isInvalid(company) && jobData.recipientCompany) {
        company = jobData.recipientCompany;
      }
      
      // STRATEGY 3: Extract from job title like "Senior Engineer at Bugcrowd"
      if (isInvalid(company)) {
        const titleMatch = (jobData.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.\-]+?)(?:\s*[-|–—]|\s*$)/i);
        if (titleMatch) {
          company = titleMatch[1].trim();
        }
      }
      
      // STRATEGY 4: Extract from URL path (e.g., /okx/jobs/ → OKX)
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const pathMatch = url.match(/\/([a-zA-Z][a-zA-Z0-9\-]{1,30})\/(?:jobs?|careers?|apply|positions?)/i);
        if (pathMatch && pathMatch[1]) {
          const pathSegment = pathMatch[1].toLowerCase();
          const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards', 'hire', 'greenhouse', 'lever', 'workday', 'smartrecruiters', 'icims', 'taleo'];
          if (!blacklist.includes(pathSegment)) {
            company = pathSegment.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        }
      }
      
      // STRATEGY 5: Extract from URL subdomain (e.g., okx.greenhouse.io → OKX)
      if (isInvalid(company)) {
        const url = jobData.url || '';
        const hostMatch = url.match(/https?:\/\/([^.\/]+)\./i);
        if (hostMatch && hostMatch[1]) {
          const subdomain = hostMatch[1].toLowerCase();
          const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards', 'job-boards', 'hire', 'greenhouse', 'lever', 'workday', 'smartrecruiters', 'icims', 'taleo', 'myworkdayjobs'];
          if (!blacklist.includes(subdomain) && subdomain.length > 2 && subdomain.length < 30) {
            company = subdomain.toUpperCase().length <= 4 ? subdomain.toUpperCase() : subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
          }
        }
      }
      
      // STRATEGY 6: Use siteName from stored metadata
      if (isInvalid(company)) {
        if (jobData.siteName && !isInvalid(jobData.siteName)) {
          company = jobData.siteName;
        }
      }
      
      // Final cleanup and sanitization
      if (company && typeof company === 'string') {
        company = company
          .replace(/\s*(careers|jobs|hiring|apply|work|join|inc\.?|ltd\.?|llc\.?)\s*$/i, '')
          .replace(/\(formerly[^)]*\)/gi, '') // Remove "(formerly X)" suffixes
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // CRITICAL: NEVER return empty - use intelligent fallback for cover letters
      if (isInvalid(company)) {
        console.warn('[OpenResume] ⚠️ Could not extract company name, using fallback');
        return 'the hiring organization';
      }
      
      console.log(`[OpenResume] ✅ Extracted company name: "${company}"`);
      return company;
    }
  };

  // ============ EXPORT ============
  global.OpenResumeGenerator = OpenResumeGenerator;

})(typeof window !== 'undefined' ? window : this);
