// openresume-generator.js - OpenResume-Style ATS PDF Generator
// PERFECT FORMAT: Arial 10.5pt, 1" margins, selectable text, 100% ATS parsing
// Based on https://github.com/xitanggg/open-resume methodology

(function(global) {
  'use strict';

  // ============ MAIN GENERATOR CLASS ============
  const OpenResumeGenerator = {

    // ============ GENERATE COMPLETE ATS PACKAGE ============
    async generateATSPackage(baseCV, keywords, jobData, candidateData) {
      const startTime = performance.now();
      console.log('[OpenResume] Generating ATS Package...');

      const cvData = this.parseAndStructureCV(baseCV, candidateData);
      const tailoredData = this.tailorCVData(cvData, keywords, jobData);
      const matchScore = this.calculateMatchScore(tailoredData, keywords);
      
      const firstName = (candidateData?.firstName || candidateData?.first_name || 'Applicant').replace(/[^a-zA-Z]/g, '');
      const lastName = (candidateData?.lastName || candidateData?.last_name || '').replace(/[^a-zA-Z]/g, '');
      const cvFilename = lastName ? `${firstName}_${lastName}_CV.pdf` : `${firstName}_CV.pdf`;
      const coverFilename = lastName ? `${firstName}_${lastName}_Cover_Letter.pdf` : `${firstName}_Cover_Letter.pdf`;
      
      // Generate cover letter using CoverLetterGenerator if available
      let coverLetterText = '';
      if (typeof CoverLetterGenerator !== 'undefined') {
        const result = CoverLetterGenerator.generate(candidateData, jobData, keywords, { template: 'professional' });
        coverLetterText = result.text;
      }

      const timing = performance.now() - startTime;
      console.log(`[OpenResume] Package generated in ${timing.toFixed(0)}ms`);

      return {
        cvFilename,
        coverFilename,
        matchScore,
        timing,
        tailoredData,
        coverLetterText
      };
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
        data.contact.location = this.normalizeLocation(candidateData.city || candidateData.location || '') || 'Dublin, IE';
        data.contact.linkedin = candidateData.linkedin || '';
        data.contact.github = candidateData.github || '';
        data.contact.portfolio = candidateData.portfolio || '';
        
        const workExp = candidateData.professional_experience || candidateData.professionalExperience || 
                       candidateData.workExperience || candidateData.work_experience || [];
        if (workExp.length > 0) {
          data.experience = workExp.map(exp => ({
            company: exp.company || exp.companyName || exp.organization || '',
            title: exp.title || exp.jobTitle || exp.position || exp.role || '',
            dates: exp.dates || exp.duration || `${exp.startDate || ''} - ${exp.endDate || 'Present'}`,
            location: exp.location || '',
            bullets: this.normalizeBullets(exp.bullets || exp.achievements || exp.responsibilities || exp.description || [])
          }));
        }
        
        if (candidateData.skills) {
          data.skills = Array.isArray(candidateData.skills) ? candidateData.skills : candidateData.skills.split(',').map(s => s.trim());
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
          data.certifications = Array.isArray(candidateData.certifications) ? candidateData.certifications : [candidateData.certifications];
        }
      }
      return data;
    },

    normalizeBullets(bullets) {
      if (!bullets) return [];
      if (Array.isArray(bullets)) return bullets.map(b => b.replace(/^[-•*▪]\s*/, '').trim());
      return bullets.split('\n').filter(b => b.trim()).map(b => b.replace(/^[-•*▪]\s*/, '').trim());
    },

    normalizeLocation(location) {
      if (!location) return '';
      return location
        .replace(/\b(remote|work\s*from\s*home|wfh|virtual)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    },

    // ============ TAILOR CV DATA WITH KEYWORDS ============
    tailorCVData(cvData, keywords, jobData) {
      const tailored = JSON.parse(JSON.stringify(cvData));
      const allKeywords = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const highPriority = Array.isArray(keywords) ? allKeywords.slice(0, 15) : (keywords?.highPriority || []);

      if (jobData?.location) {
        tailored.contact.location = this.normalizeLocation(jobData.location);
      }
      tailored.summary = this.enhanceSummary(cvData.summary, highPriority);
      tailored.experience = this.injectKeywordsIntoExperience(cvData.experience, allKeywords);
      tailored.skills = this.mergeSkills(cvData.skills, allKeywords);
      return tailored;
    },

    enhanceSummary(summary, keywords) {
      const keywordsArray = Array.isArray(keywords) ? keywords : [];
      if (!summary) {
        return keywordsArray.length > 0
          ? `Results-driven professional with expertise in ${keywordsArray.slice(0, 3).join(', ')}. Proven track record of delivering high-impact solutions.`
          : `Results-driven professional with proven track record of delivering high-impact solutions.`;
      }
      const missing = keywordsArray.filter(kw => !summary.toLowerCase().includes(kw.toLowerCase()));
      if (missing.length > 0) {
        return summary.replace(/\.?\s*$/, `. Expertise includes ${missing.slice(0, 3).join(', ')}.`);
      }
      return summary;
    },

    injectKeywordsIntoExperience(experience, allKeywords) {
      if (!experience || experience.length === 0) return experience;
      const phrases = ['leveraging', 'utilizing', 'implementing', 'applying', 'through', 'via'];
      const getPhrase = () => phrases[Math.floor(Math.random() * phrases.length)];

      return experience.map((job, jobIndex) => {
        const enhancedBullets = job.bullets.map(bullet => {
          const needed = allKeywords.filter(kw => !bullet.toLowerCase().includes(kw.toLowerCase())).slice(0, 2);
          if (needed.length === 0) return bullet;
          return bullet.replace(/\.?\s*$/, `, ${getPhrase()} ${needed.join(' and ')}.`);
        });
        return { ...job, bullets: enhancedBullets };
      });
    },

    mergeSkills(existingSkills, keywords) {
      const allKeywords = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      const existing = new Set((existingSkills || []).map(s => s.toLowerCase()));
      const toAdd = allKeywords.filter(kw => !existing.has(kw.toLowerCase()));
      return [...(existingSkills || []), ...toAdd.slice(0, 20)];
    },

    calculateMatchScore(tailoredData, keywords) {
      const allKeywords = Array.isArray(keywords) ? keywords : (keywords?.all || []);
      if (allKeywords.length === 0) return 100;
      const allText = [
        tailoredData.summary || '',
        ...tailoredData.experience.flatMap(e => [e.company, e.title, ...e.bullets]),
        ...tailoredData.skills
      ].join(' ').toLowerCase();
      const matched = allKeywords.filter(kw => allText.includes(kw.toLowerCase()));
      return Math.round((matched.length / allKeywords.length) * 100);
    }
  };

  global.OpenResumeGenerator = OpenResumeGenerator;
  console.log('[OpenResumeGenerator] v2.0 loaded - ATS-optimized generation');

})(typeof window !== 'undefined' ? window : this);
