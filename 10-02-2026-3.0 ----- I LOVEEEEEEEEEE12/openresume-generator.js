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

      // CRITICAL: Apply dedupeSectionHeaders before parsing to prevent inline duplication
      let cleanedCV = baseCV;
      if (typeof window !== 'undefined' && window.quantumhireApp && typeof window.quantumhireApp.dedupeSectionHeaders === 'function') {
        cleanedCV = window.quantumhireApp.dedupeSectionHeaders(baseCV);
        console.log('[OpenResume] Applied dedupeSectionHeaders to input text');
      }

      // Parse and structure CV data
      const cvData = this.parseAndStructureCV(cleanedCV, candidateData);

      // CRITICAL: Sanitise structured data — filter bogus experience, apply neverLeakGuard
      this.sanitiseStructuredData(cvData);

      // Tailor CV with keywords
      const tailoredData = this.tailorCVData(cvData, keywords, jobData);

      // CRITICAL: Re-sanitise after tailoring (tailoring can reintroduce banned words)
      this.sanitiseStructuredData(tailoredData);
      
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
        // FIX: Check ALL possible field names including professionalExperience/professional_experience
        const rawExperience = candidateData.professionalExperience || candidateData.professional_experience ||
                              candidateData.workExperience || candidateData.work_experience || [];
        if (Array.isArray(rawExperience) && rawExperience.length > 0) {
          data.experience = rawExperience.map(exp => ({
            company: exp.company || exp.organization || exp.company_name || '',
            title: exp.title || exp.position || exp.role || exp.job_title || '',
            dates: exp.dates || exp.duration || `${exp.startDate || exp.start_date || ''} - ${exp.endDate || exp.end_date || 'Present'}`,
            location: exp.location || '',
            bullets: this.normalizeBullets(exp.bullets || exp.achievements || exp.responsibilities || exp.description || [])
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
        // MERGE parsed data with existing candidateData instead of overwriting
        if (parsed.summary && !data.summary) data.summary = parsed.summary;
        if (parsed.experience?.length) data.experience = parsed.experience;
        if (parsed.education?.length && !data.education?.length) data.education = parsed.education;
        // Merge skills (keep candidateData skills + add parsed skills)
        if (parsed.skills?.length) {
          const existingSkills = new Set((data.skills || []).map(s => s.toLowerCase()));
          for (const skill of parsed.skills) {
            if (!existingSkills.has(skill.toLowerCase())) {
              data.skills.push(skill);
              existingSkills.add(skill.toLowerCase());
            }
          }
        }
        // Merge certifications
        if (parsed.certifications?.length) {
          const existingCerts = new Set((data.certifications || []).map(c => c.toLowerCase()));
          for (const cert of parsed.certifications) {
            if (!existingCerts.has(cert.toLowerCase())) {
              data.certifications.push(cert);
              existingCerts.add(cert.toLowerCase());
            }
          }
        }
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
    // FIX v4.2.0: Handles inline headers like "SKILLS: PYTHON, JAVA, C++" by splitting them
    parseCVText(cvText) {
      const result = {
        summary: '',
        experience: [],
        skills: [],
        education: [],
        certifications: []
      };

      const sectionMap = {
        'PROFESSIONAL SUMMARY': 'summary',
        'SUMMARY': 'summary',
        'PROFILE': 'summary',
        'WORK EXPERIENCE': 'experience',
        'EXPERIENCE': 'experience',
        'EMPLOYMENT': 'experience',
        'SKILLS': 'skills',
        'TECHNICAL SKILLS': 'skills',
        'TECHNICAL PROFICIENCIES': 'skills',
        'EDUCATION': 'education',
        'CERTIFICATIONS': 'certifications'
      };

      /**
       * INLINE HEADER DETECTION: Matches "SKILLS: content" or "CERTIFICATIONS: content"
       * Returns { header, content } or null if not an inline header.
       */
      const parseInlineHeader = (line) => {
        const trimmed = (line || '').trim();
        // Pattern: HEADER: content (header is all caps, followed by colon and content)
        const inlineMatch = trimmed.match(/^([A-Z][A-Z\s]{2,30}):\s*(.+)$/);
        if (inlineMatch) {
          const potentialHeader = inlineMatch[1].trim().toUpperCase();
          if (sectionMap[potentialHeader]) {
            return { header: potentialHeader, content: inlineMatch[2].trim() };
          }
        }
        return null;
      };

      const lines = cvText.split('\n');
      let currentSection = '';
      let currentContent = [];
      let currentJob = null;

      for (const line of lines) {
        const trimmed = line.trim();
        
        // FIRST: Check for inline header (e.g., "SKILLS: PYTHON, JAVA, C++")
        const inlineResult = parseInlineHeader(line);
        if (inlineResult) {
          // Save previous section content
          this.saveSection(result, currentSection, currentContent, currentJob);
          // Start new section with the inline content
          currentSection = sectionMap[inlineResult.header];
          currentContent = [inlineResult.content]; // Content goes directly into the section
          currentJob = null;
          continue;
        }
        
        // Standard header detection (header on its own line)
        const upperTrimmed = trimmed.toUpperCase().replace(/[:\s]+$/, '');

        if (sectionMap[upperTrimmed]) {
          // Save previous section content
          this.saveSection(result, currentSection, currentContent, currentJob);
          currentSection = sectionMap[upperTrimmed];
          currentContent = [];
          currentJob = null;
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      // Save last section
      this.saveSection(result, currentSection, currentContent, currentJob);

      return result;
    },

    saveSection(result, section, content, job) {
      if (!section || content.length === 0) return;

      const text = content.join('\n').trim();

      switch (section) {
        case 'summary':
          // Append if summary already exists (rare but possible)
          result.summary = result.summary ? result.summary + ' ' + text : text;
          break;
        case 'skills': {
          // MERGE skills instead of overwriting — prevents loss when AI generates two SKILLS sections
          const newSkills = text.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 1);
          const existingSet = new Set((result.skills || []).map(s => s.toLowerCase()));
          const merged = [...(result.skills || [])];
          for (const skill of newSkills) {
            if (!existingSet.has(skill.toLowerCase())) {
              merged.push(skill);
              existingSet.add(skill.toLowerCase());
            }
          }
          result.skills = merged;
          break;
        }
        case 'experience': {
          // MERGE experience instead of overwriting
          const newExperience = this.parseExperienceText(text);
          result.experience = [...(result.experience || []), ...newExperience];
          break;
        }
        case 'education': {
          // MERGE education instead of overwriting
          const newEducation = this.parseEducationText(text);
          result.education = [...(result.education || []), ...newEducation];
          break;
        }
        case 'certifications': {
          // MERGE certifications instead of overwriting
          const newCerts = text.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 2);
          const existingCerts = new Set((result.certifications || []).map(c => c.toLowerCase()));
          const mergedCerts = [...(result.certifications || [])];
          for (const cert of newCerts) {
            if (!existingCerts.has(cert.toLowerCase())) {
              mergedCerts.push(cert);
              existingCerts.add(cert.toLowerCase());
            }
          }
          result.certifications = mergedCerts;
          break;
        }
      }
    },

    // ============ SANITISE STRUCTURED DATA ============
    // Filters out bogus experience entries and applies neverLeakGuard to text fields
    sanitiseStructuredData(data) {
      if (!data) return;

      // ── Filter bogus experience entries (section headers misidentified as jobs) ──
      const HEADER_PATTERNS = new Set([
        'professional experience', 'work experience', 'experience',
        'employment history', 'career history', 'employment',
        'work history', 'positions held', 'career',
        'education', 'skills', 'certifications', 'projects', 'achievements',
        'professional summary', 'summary', 'technical proficiencies',
        'technical skills', 'core skills'
      ]);

      const normalise = (s) => String(s || '').toLowerCase().replace(/[#:*|]/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s{2,}/g, ' ').trim();
      const isDupHeader = (v) => {
        const parts = v.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2 && parts.every(p => HEADER_PATTERNS.has(p))) return true;
        for (const h of HEADER_PATTERNS) {
          if (v === (h + ' ' + h)) return true;
        }
        return false;
      };

      if (Array.isArray(data.experience)) {
        data.experience = data.experience.filter(job => {
          const company = normalise(job.company || job.companyName || '');
          const title = normalise(job.title || job.jobTitle || job.position || '');
          if (HEADER_PATTERNS.has(company) || isDupHeader(company)) {
            console.log('[OpenResume] Stripped bogus experience entry (company is header):', job.company);
            return false;
          }
          if ((HEADER_PATTERNS.has(title) || isDupHeader(title)) && !company) {
            console.log('[OpenResume] Stripped bogus experience entry (title is header):', job.title);
            return false;
          }
          return true;
        });
      }

      // ── Apply neverLeakGuard to all text fields ──
      const guard = (typeof ContentQualityEngine !== 'undefined' && ContentQualityEngine.neverLeakGuard)
        ? ContentQualityEngine.neverLeakGuard.bind(ContentQualityEngine)
        : null;

      if (guard) {
        // Summary
        if (data.summary) {
          data.summary = guard(data.summary);
        }

        // Experience bullets
        if (Array.isArray(data.experience)) {
          data.experience.forEach(job => {
            if (Array.isArray(job.bullets)) {
              job.bullets = job.bullets.map(b => guard(b));
            }
            if (job.title) job.title = guard(job.title);
          });
        }

        // Skills (individual items)
        if (Array.isArray(data.skills)) {
          data.skills = data.skills.map(s => guard(s));
        }

        // Certifications
        if (Array.isArray(data.certifications)) {
          data.certifications = data.certifications.map(c => guard(c));
        }
      }

      // ── Deduplicate skills ──
      if (Array.isArray(data.skills)) {
        const seen = new Set();
        data.skills = data.skills.filter(s => {
          const key = s.toLowerCase().trim();
          if (seen.has(key) || !key) return false;
          seen.add(key);
          return true;
        });
      }

      // ── Deduplicate certifications ──
      if (Array.isArray(data.certifications)) {
        const seen = new Set();
        data.certifications = data.certifications.filter(c => {
          const key = c.toLowerCase().trim();
          if (seen.has(key) || !key) return false;
          seen.add(key);
          return true;
        });
      }
    },

    // ============ PARSE EXPERIENCE TEXT ============
    parseExperienceText(text) {
      const jobs = [];
      const lines = text.split('\n');
      let currentJob = null;

      // Section headers that must NEVER become company names
      const SECTION_HEADERS = new Set([
        'professional experience', 'work experience', 'experience',
        'employment history', 'career history', 'employment',
        'work history', 'positions held', 'career', 'roles',
        'education', 'skills', 'certifications', 'projects', 'achievements',
        'professional summary', 'summary', 'technical proficiencies'
      ]);
      const isHeaderish = (v) => {
        const norm = v.toLowerCase().replace(/[#:*|]/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (SECTION_HEADERS.has(norm)) return true;
        for (const h of SECTION_HEADERS) {
          if (norm === (h + ' ' + h)) return true;
          if (norm.startsWith(h + ' ') && norm.replace(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim() === '') return true;
        }
        return false;
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // CRITICAL: Skip lines that are section headers
        if (isHeaderish(trimmed)) continue;

        // Detect job header: Company | Title | Dates | Location
        if (/^[A-Z][A-Za-z\s&.,]+\s*\|/.test(trimmed) || 
            /^(Meta|Google|Amazon|Microsoft|Apple|Solim|Accenture|Citigroup)/i.test(trimmed)) {
          if (currentJob) jobs.push(currentJob);
          
          const parts = trimmed.split('|').map(p => p.trim());
          currentJob = {
            company: parts[0] || '',
            title: parts[1] || '',
            dates: parts[2] || '',
            location: parts[3] || '',
            bullets: []
          };
        } else if (currentJob && /^[-•*▪]/.test(trimmed)) {
          currentJob.bullets.push(trimmed.replace(/^[-•*▪]\s*/, ''));
        }
      }

      if (currentJob) jobs.push(currentJob);
      
      // Final safety: filter out any jobs where company is a section header
      return jobs.filter(job => !isHeaderish(job.company || ''));
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
      // Soft skills go ONLY into experience bullets, NEVER into skills section
      // Use TailorUniversal to identify soft skills if available
      const softSkillSet = (typeof TailorUniversal !== 'undefined' && TailorUniversal.SOFT_SKILLS_FOR_EXPERIENCE)
        ? TailorUniversal.SOFT_SKILLS_FOR_EXPERIENCE
        : new Set(['leadership', 'communication', 'collaboration', 'teamwork', 'mentoring',
          'problem-solving', 'critical thinking', 'adaptability', 'stakeholder management',
          'cross-functional', 'empathy', 'prioritisation', 'time management', 'conflict resolution',
          'creative thinking', 'decision-making', 'initiative', 'roadmap planning',
          'negotiation', 'coaching', 'facilitation', 'delegation', 'strategic thinking',
          'relationship building', 'change management', 'continuous improvement',
          'knowledge sharing', 'stakeholder engagement', 'requirements gathering',
          'analytical thinking', 'attention to detail', 'process improvement']);

      const softSkillKeywords = allKeywords.filter(kw => softSkillSet.has(kw.toLowerCase()));
      const technicalKeywords = allKeywords.filter(kw => !softSkillSet.has(kw.toLowerCase()));

      // Use StrategicKeywordIntegration if available (prioritises bullets over skills list)
      if (typeof StrategicKeywordIntegration !== 'undefined') {
        console.log('[OpenResume] Using Strategic Keyword Integration for Work Experience');
        // Pass ALL keywords (technical + soft) to experience integration
        const integrationResult = StrategicKeywordIntegration.enhanceBulletPointsWithKeywords(
          cvData.experience,
          { all: allKeywords, highPriority, mediumPriority: [...mediumPriority, ...softSkillKeywords], lowPriority }
        );
        tailored.experience = integrationResult.enhancedExperience;

        // Remove integrated keywords from skills (they're now in bullets)
        // Also remove ALL soft skills from skills list (they belong in experience only)
        const integratedKeywords = integrationResult.stats?.integratedKeywords || [];
        const remainingKeywords = technicalKeywords.filter(kw =>
          !integratedKeywords.some(ik => ik.toLowerCase() === kw.toLowerCase())
        );

        // Only add remaining TECHNICAL keywords to skills (minimal skills list)
        tailored.skills = this.mergeSkills(cvData.skills, remainingKeywords.slice(0, 10));

        console.log('[OpenResume] Strategic Integration Stats:', {
          bulletsModified: integrationResult.stats?.bulletsModified || 0,
          keywordsIntegrated: integratedKeywords.length,
          softSkillsIntegrated: softSkillKeywords.length,
          remainingForSkills: remainingKeywords.length
        });
      } else {
        // Fallback to legacy injection — include soft skills in experience
        tailored.experience = this.injectAllKeywordsIntoExperience(cvData.experience, {
          high: highPriority,
          medium: [...mediumPriority, ...softSkillKeywords],
          low: lowPriority,
          all: allKeywords
        });

        // Only merge TECHNICAL keywords into skills (not soft skills)
        tailored.skills = this.mergeSkills(cvData.skills, technicalKeywords);
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
      // Junk keywords that must NEVER appear in the skills section
      const SKILLS_BLOCKLIST = new Set([
        'customer service', 'high school diploma', 'commission', 'customer-facing',
        'lawn care', 'independent work', 'motivated', 'benefits', 'fast-paced',
        'work environment', 'crm software', 'motivation', 'self-motivated',
        'passion', 'passionate', 'enthusiasm', 'driven', 'dynamic', 'proactive',
        'synergy', 'paradigm', 'robust', 'commitment', 'reliable', 'reliability',
        'integrity', 'professionalism', 'multitasking', 'positive attitude',
        'work ethic', 'goal-oriented', 'results-oriented', 'training', 'teams',
        'environment', 'services', 'solutions', 'products', 'clients', 'customers',
        'business', 'communication skills', 'team player', 'detail-oriented',
        'hard-working', 'self-starter', 'quick learner', 'fast learner',
        'go-getter', 'can-do attitude', 'dedication', 'go above and beyond'
      ]);

      const skillSet = new Set((existingSkills || []).map(s => s.toLowerCase()));
      const merged = [...(existingSkills || [])].filter(s =>
        !SKILLS_BLOCKLIST.has(s.toLowerCase()) && s.trim().length >= 2
      );

      // Add top keywords not already in skills (filtered)
      const topKeywords = (keywords.all || keywords).slice(0, 10);
      topKeywords.forEach(kw => {
        const kwLower = kw.toLowerCase();
        if (!skillSet.has(kwLower) && !SKILLS_BLOCKLIST.has(kwLower) && kw.trim().length >= 2) {
          merged.push(this.formatSkillName(kw));
          skillSet.add(kwLower);
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

      // ██ SECTION HEADER DEDUP GUARD ██
      // Tracks which section headers have been rendered — prevents duplicate sections in PDF
      const renderedSections = new Set();

      // Helper: Add section header with line — GUARDED against duplicates
      const addSectionHeader = (title) => {
        // CRITICAL: Never render the same section header twice
        const normalised = title.toUpperCase().trim();
        if (renderedSections.has(normalised)) {
          console.warn(`[OpenResume] BLOCKED duplicate section header: "${title}"`);
          return false; // Signal that section was skipped
        }
        renderedSections.add(normalised);

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
      // FINAL SAFETY: Filter out any experience entries where company is a section header
      const HEADER_BLACKLIST = new Set([
        'professional experience', 'work experience', 'experience',
        'employment history', 'career history', 'employment',
        'work history', 'positions held', 'career', 'roles',
        'education', 'skills', 'certifications', 'projects', 'achievements'
      ]);
      const safeExperience = (data.experience || []).filter(job => {
        const norm = String(job.company || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (HEADER_BLACKLIST.has(norm)) {
          console.warn('[OpenResume] BLOCKED header-as-company in render:', job.company);
          return false;
        }
        // Catch duplicated headers like "work experience work experience"
        for (const h of HEADER_BLACKLIST) {
          if (norm === (h + ' ' + h) || (norm.startsWith(h + ' ') && norm.replace(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim() === '')) {
            console.warn('[OpenResume] BLOCKED repeated header-as-company in render:', job.company);
            return false;
          }
        }
        return true;
      });
      if (safeExperience.length > 0) {
        addSectionHeader('WORK EXPERIENCE');
        
        safeExperience.forEach((job, idx) => {
          // Job header: Company | Title | Dates | Location
          const header = [job.company, job.title, job.dates, job.location].filter(Boolean).join(' | ');
          addText(header, true, false, font.body);
          y += 2;

          // Bullets
          job.bullets.forEach(bullet => {
            const bulletText = `${ATS_SPEC.bullets.char} ${bullet}`;
            doc.setFont(font.family, 'normal');
            doc.setFontSize(font.body);
            
            const bulletLines = doc.splitTextToSize(bulletText, contentWidth - ATS_SPEC.bullets.indent);
            bulletLines.forEach((line, lineIdx) => {
              if (y > page.height - margins.bottom - 20) {
                doc.addPage();
                y = margins.top;
              }
              const indent = lineIdx === 0 ? 0 : ATS_SPEC.bullets.indent;
              doc.text(line, margins.left + indent, y);
              y += font.body * lineHeight + 1;
            });
          });

          if (idx < safeExperience.length - 1) y += 6;
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
      // GUARDED: addSectionHeader returns false if section already rendered
      if (data.skills && data.skills.length > 0) {
        if (addSectionHeader('TECHNICAL PROFICIENCIES') !== false) {
          addText(data.skills.join(', '), false, false, font.body);
          y += 4;
        }
      }

      // === CERTIFICATIONS ===
      if (data.certifications && data.certifications.length > 0) {
        if (addSectionHeader('CERTIFICATIONS') !== false) {
          addText(data.certifications.join(', '), false, false, font.body);
        }
      }

      // Generate output
      const base64 = doc.output('datauristring').split(',')[1];
      const blob = doc.output('blob');

      return { base64, blob };
    },

    // ============ GENERATE CV TEXT (Fallback) ============
    generateCVText(data) {
      const lines = [];
      const formattedPhone = this.formatPhoneForATS(data.contact.phone);
      
      lines.push(data.contact.name.toUpperCase());
      const contactParts = [formattedPhone, data.contact.email, data.contact.location].filter(Boolean);
      lines.push(contactParts.join(' | ') + (data.contact.location ? ' | open to relocation' : ''));
      lines.push([data.contact.linkedin, data.contact.github, data.contact.portfolio].filter(Boolean).join(' | '));
      lines.push('');

      if (data.summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push(data.summary);
        lines.push('');
      }

      if (data.experience?.length > 0) {
        lines.push('WORK EXPERIENCE');
        data.experience.forEach(job => {
          lines.push([job.company, job.title, job.dates, job.location].filter(Boolean).join(' | '));
          job.bullets.forEach(b => lines.push(`- ${b}`));
          lines.push('');
        });
      }

      if (data.education?.length > 0) {
        lines.push('EDUCATION');
        data.education.forEach(edu => {
          lines.push([edu.institution, edu.degree, edu.dates, edu.gpa ? `GPA: ${edu.gpa}` : ''].filter(Boolean).join(' | '));
        });
        lines.push('');
      }

      if (data.skills?.length > 0) {
        lines.push('TECHNICAL PROFICIENCIES');
        lines.push(data.skills.join(', '));
        lines.push('');
      }

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
