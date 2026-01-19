// Profile-Only Parser - 100% ATS-Friendly Technical Experience Parser
// ONLY uses profile page data - NO fallback to base CV text
// Designed for perfect ATS compatibility across all platforms

(function(global) {
  'use strict';

  const ProfileOnlyParser = {
    
    // ============ MAIN ENTRY POINT - PARSE FROM PROFILE PAGE ============
    async parseFromProfilePage(profileData) {
      const startTime = performance.now();
      console.log('[ProfileOnlyParser] Parsing profile page data...');

      try {
        // Extract ONLY technical experience from profile
        const parsedData = this.extractTechnicalExperience(profileData);
        
        // Enhance with ATS-safe formatting
        const enhancedData = this.enhanceForATS(parsedData);

        const timing = performance.now() - startTime;
        console.log(`[ProfileOnlyParser] Profile parsed in ${timing.toFixed(0)}ms`);

        return {
          success: true,
          data: enhancedData,
          timing,
          source: 'profile_page_only'
        };

      } catch (error) {
        console.error('[ProfileOnlyParser] Error parsing profile:', error);
        return {
          success: false,
          error: error.message,
          data: null
        };
      }
    },

    // ============ EXTRACT TECHNICAL EXPERIENCE ONLY ============
    extractTechnicalExperience(profileData) {
      const data = {
        contact: {},
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: ''
      };

      // Contact Information - from profile
      data.contact = this.extractContactInfo(profileData);
      
      // Professional Summary - from profile (if available)
      data.summary = this.extractSummary(profileData);
      
      // CRITICAL: Only use work_experience from profile - NO fallback
      const workExperience = profileData?.workExperience || profileData?.work_experience || [];
      if (Array.isArray(workExperience) && workExperience.length > 0) {
        data.experience = this.parseProfileExperience(workExperience);
      } else {
        console.warn('[ProfileOnlyParser] No work experience found in profile data');
      }

      // Education - from profile
      data.education = this.extractEducation(profileData);
      
      // Skills - from profile
      data.skills = this.extractSkills(profileData);
      
      // Certifications - from profile
      data.certifications = this.extractCertifications(profileData);

      return data;
    },

    // ============ CONTACT INFO EXTRACTION ============
    extractContactInfo(profile) {
      const contact = {
        name: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        github: '',
        portfolio: ''
      };

      // Name
      const firstName = profile?.firstName || profile?.first_name || '';
      const lastName = profile?.lastName || profile?.last_name || '';
      contact.name = `${firstName} ${lastName}`.trim();

      // Email
      contact.email = profile?.email || '';

      // Phone
      contact.phone = this.formatPhone(profile?.phone || '');

      // Location - clean location (remove remote flags)
      contact.location = this.cleanLocation(profile?.city || profile?.location || '');

      // LinkedIn
      contact.linkedin = profile?.linkedin || '';

      // GitHub
      contact.github = profile?.github || '';

      // Portfolio
      contact.portfolio = profile?.portfolio || '';

      return contact;
    },

    // ============ FORMAT PHONE FOR ATS ============
    formatPhone(phone) {
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

    // ============ EXTRACT SUMMARY ============
    extractSummary(profile) {
      return profile?.summary || profile?.professionalSummary || profile?.profile || '';
    },

    // ============ PARSE PROFILE EXPERIENCE ============
    parseProfileExperience(workExperience) {
      const jobs = [];
      
      workExperience.forEach((job, index) => {
        // CRITICAL: Use EXACT company, title, dates from profile - NO modification
        const company = (job.company || job.organization || '').trim();
        const title = (job.title || job.position || job.role || '').trim();
        
        // Dates - normalize format
        let dates = job.dates || job.duration || '';
        if (!dates && (job.startDate || job.endDate)) {
          const start = job.startDate || '';
          const end = job.endDate || 'Present';
          dates = start ? `${start} - ${end}` : end;
        }
        dates = this.normalizeDates(dates);
        
        const location = job.location || '';
        
        // Bullets - preserve exactly as they are
        let bullets = job.bullets || job.achievements || job.responsibilities || [];
        if (typeof bullets === 'string') {
          bullets = bullets.split('\n').filter(b => b.trim());
        }
        
        // Clean bullets (remove bullet markers but preserve content)
        const cleanedBullets = bullets.map(bullet => {
          return bullet.replace(/^[-•*▪▸►]\s*/, '').trim();
        }).filter(bullet => bullet.length > 0);

        // Build title line for ATS formatting
        const titleLine = dates ? `${title} | ${dates}` : title;

        jobs.push({
          company,
          title,
          titleLine, // Pre-formatted for ATS
          dates,
          location,
          bullets: cleanedBullets
        });
      });

      return jobs;
    },

    // ============ NORMALIZE DATES ============
    normalizeDates(dateStr) {
      if (!dateStr) return '';
      
      // Normalize to "YYYY – YYYY" format with en dash
      return String(dateStr)
        .replace(/--/g, '–')
        .replace(/-/g, '–')
        .replace(/\s*–\s*/g, ' – ');
    },

    // ============ EXTRACT EDUCATION ============
    extractEducation(profile) {
      const education = profile?.education || [];
      if (!Array.isArray(education)) return [];
      
      return education.map(edu => ({
        institution: edu.institution || edu.school || edu.university || '',
        degree: edu.degree || '',
        dates: edu.dates || edu.graduationDate || '',
        gpa: edu.gpa || ''
      }));
    },

    // ============ EXTRACT SKILLS ============
    extractSkills(profile) {
      const skills = profile?.skills || [];
      if (Array.isArray(skills)) {
        return skills.join(', ');
      }
      if (typeof skills === 'string') {
        return skills;
      }
      return '';
    },

    // ============ EXTRACT CERTIFICATIONS ============
    extractCertifications(profile) {
      const certifications = profile?.certifications || [];
      if (Array.isArray(certifications)) {
        return certifications.join(', ');
      }
      if (typeof certifications === 'string') {
        return certifications;
      }
      return '';
    },

    // ============ ENHANCE FOR ATS ============
    enhanceForATS(data) {
      const enhanced = { ...data };
      
      // Ensure proper ATS formatting
      enhanced.metadata = {
        parsedAt: new Date().toISOString(),
        parser: 'ProfileOnlyParser',
        source: 'profile_page_only',
        atsVersion: '1.0.0'
      };
      
      return enhanced;
    },

    // ============ GENERATE ATS-SAFE TEXT ============
    generateATSText(profileData) {
      const parsed = this.extractTechnicalExperience(profileData);
      const { contact, summary, experience, education, skills, certifications } = parsed;
      
      const lines = [];
      
      // Name
      lines.push(contact.name.toUpperCase());
      
      // Contact line
      const contactParts = [contact.phone, contact.email, contact.location].filter(Boolean);
      if (contactParts.length > 0) {
        lines.push(contactParts.join(' | ') + (contact.location ? ' | Open to relocation' : ''));
      }
      
      // Links
      if (contact.linkedin || contact.github || contact.portfolio) {
        const links = [];
        if (contact.linkedin) links.push(contact.linkedin);
        if (contact.github) links.push(contact.github);
        if (contact.portfolio) links.push(contact.portfolio);
        lines.push(links.join(' | '));
      }
      
      lines.push('');
      
      // Summary
      if (summary) {
        lines.push('PROFESSIONAL SUMMARY');
        lines.push(summary);
        lines.push('');
      }
      
      // Experience
      if (experience.length > 0) {
        lines.push('WORK EXPERIENCE');
        experience.forEach(job => {
          lines.push(job.company);
          lines.push(job.titleLine);
          job.bullets.forEach(bullet => {
            lines.push(`• ${bullet}`);
          });
          lines.push('');
        });
      }
      
      // Education (no dates to prevent age bias)
      if (education.length > 0) {
        lines.push('EDUCATION');
        education.forEach(edu => {
          const parts = [edu.degree, edu.institution];
          if (edu.gpa) parts.push(edu.gpa);
          lines.push(parts.join(' | '));
        });
        lines.push('');
      }
      
      // Skills
      if (skills) {
        lines.push('SKILLS');
        lines.push(skills);
        lines.push('');
      }
      
      // Certifications
      if (certifications) {
        lines.push('CERTIFICATIONS');
        lines.push(certifications);
      }
      
      return lines.join('\n');
    }
  };

  // ============ EXPORT ============
  global.ProfileOnlyParser = ProfileOnlyParser;

})(typeof window !== 'undefined' ? window : this);
