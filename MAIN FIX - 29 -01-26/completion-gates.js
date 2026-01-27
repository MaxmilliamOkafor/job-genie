// completion-gates.js - Content Verification Gates v1.0
// Replaces arbitrary delays with content-based verification
// ENSURES: Professional Summary, Work Experience, and bullet points are fully rendered

(function(global) {
  'use strict';

  // ============ COMPLETION THRESHOLDS ============
  const THRESHOLDS = {
    MIN_SUMMARY_LENGTH: 100,      // Minimum characters for professional summary
    MIN_ROLE_COUNT: 2,            // Minimum work experience roles
    MIN_TOTAL_BULLETS: 6,         // Minimum total bullet points across all roles
    MAX_WAIT_MS: 12000,           // Maximum wait time (12 seconds)
    POLL_INTERVAL_MS: 250,        // Check every 250ms
  };

  // ============ COMPLETION STATUS TRACKER ============
  const CompletionStatus = {
    lastCheck: null,
    summaryReady: false,
    experienceReady: false,
    bulletsReady: false,
    companyNameSource: null,
    verificationPassed: false,
  };

  // ============ WAIT FOR CONTENT READY ============
  /**
   * Polls structured CV data to verify all content is fully rendered
   * before PDF generation proceeds.
   * 
   * @param {Object} cvData - Structured CV data object
   * @param {Object} options - Optional overrides for thresholds
   * @returns {Promise<Object>} Verification result with status and details
   */
  async function waitForContentReady(cvData, options = {}) {
    const startTime = performance.now();
    const {
      minSummaryLength = THRESHOLDS.MIN_SUMMARY_LENGTH,
      minRoleCount = THRESHOLDS.MIN_ROLE_COUNT,
      minTotalBullets = THRESHOLDS.MIN_TOTAL_BULLETS,
      maxWaitMs = THRESHOLDS.MAX_WAIT_MS,
      pollIntervalMs = THRESHOLDS.POLL_INTERVAL_MS,
    } = options;

    console.log('[CompletionGates] Starting content verification...');

    let lastStatus = null;
    let attempts = 0;
    const maxAttempts = Math.ceil(maxWaitMs / pollIntervalMs);

    while (attempts < maxAttempts) {
      attempts++;
      const status = verifyContent(cvData, { minSummaryLength, minRoleCount, minTotalBullets });
      lastStatus = status;

      // Log progress
      console.log(`[CompletionGates] Attempt ${attempts}/${maxAttempts}:`, {
        summaryLength: status.summaryLength,
        roleCount: status.roleCount,
        totalBullets: status.totalBullets,
        passed: status.passed,
      });

      if (status.passed) {
        const elapsed = performance.now() - startTime;
        console.log(`[CompletionGates] ✅ Content verification PASSED in ${elapsed.toFixed(0)}ms`);
        
        CompletionStatus.lastCheck = Date.now();
        CompletionStatus.summaryReady = status.summaryReady;
        CompletionStatus.experienceReady = status.experienceReady;
        CompletionStatus.bulletsReady = status.bulletsReady;
        CompletionStatus.verificationPassed = true;

        return {
          success: true,
          status,
          timing: elapsed,
          attempts,
        };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - generate fallback summary if needed
    const elapsed = performance.now() - startTime;
    console.warn(`[CompletionGates] ⚠️ Verification timed out after ${elapsed.toFixed(0)}ms`);
    
    CompletionStatus.verificationPassed = false;
    CompletionStatus.lastCheck = Date.now();

    return {
      success: false,
      status: lastStatus,
      timing: elapsed,
      attempts,
      needsFallback: !lastStatus?.summaryReady,
    };
  }

  // ============ VERIFY CONTENT ============
  function verifyContent(cvData, thresholds) {
    const summary = cvData?.summary || '';
    const experience = cvData?.experience || [];
    
    // Count total bullets across all roles
    let totalBullets = 0;
    experience.forEach(job => {
      const bullets = job.bullets || job.achievements || job.description || [];
      totalBullets += Array.isArray(bullets) ? bullets.length : 0;
    });

    const summaryReady = summary.length >= thresholds.minSummaryLength;
    const experienceReady = experience.length >= thresholds.minRoleCount;
    const bulletsReady = totalBullets >= thresholds.minTotalBullets;

    return {
      summaryLength: summary.length,
      roleCount: experience.length,
      totalBullets,
      summaryReady,
      experienceReady,
      bulletsReady,
      passed: summaryReady && experienceReady && bulletsReady,
      thresholds,
    };
  }

  // ============ GENERATE FALLBACK SUMMARY ============
  /**
   * Generates a deterministic fallback summary from candidate profile + keywords
   * Uses UK English spelling
   */
  function generateFallbackSummary(candidateData, keywords, options = {}) {
    const firstName = candidateData?.firstName || candidateData?.first_name || 'Professional';
    const experience = candidateData?.professional_experience || 
                       candidateData?.professionalExperience ||
                       candidateData?.workExperience || [];
    
    // Calculate years of experience
    const currentYear = new Date().getFullYear();
    let totalYears = 0;
    
    experience.forEach(job => {
      const dates = job.dates || '';
      const years = dates.match(/\d{4}/g);
      if (years && years.length >= 2) {
        const startYear = parseInt(years[0]);
        const endYear = /present/i.test(dates) ? currentYear : parseInt(years[1]);
        totalYears += endYear - startYear;
      } else if (years && years.length === 1) {
        totalYears += currentYear - parseInt(years[0]);
      }
    });

    const yearsText = totalYears >= 10 ? '10+' : totalYears > 0 ? `${totalYears}+` : 'several';

    // Get domain from most recent role
    let domain = 'technology';
    if (experience.length > 0) {
      const recentTitle = (experience[0]?.title || '').toLowerCase();
      if (/data|analytics|scientist/i.test(recentTitle)) domain = 'data science and analytics';
      else if (/engineer|developer|software/i.test(recentTitle)) domain = 'software engineering';
      else if (/product/i.test(recentTitle)) domain = 'product management';
      else if (/manager|director|lead/i.test(recentTitle)) domain = 'technical leadership';
    }

    // Get top keywords for summary
    const topKeywords = (keywords?.highPriority || keywords?.all || []).slice(0, 5);
    const keywordPhrase = topKeywords.length > 0 
      ? ` Expertise includes ${topKeywords.join(', ')}.`
      : '';

    // Generate summary (UK English spelling: utilising, specialising, prioritising)
    const summary = `Results-driven professional with ${yearsText} years of experience in ${domain}, ` +
      `specialising in delivering high-impact solutions and driving organisational success. ` +
      `Demonstrated ability to lead cross-functional teams, optimise processes, and implement ` +
      `innovative strategies that enhance operational efficiency.${keywordPhrase}`;

    console.log('[CompletionGates] Generated fallback summary:', summary.length, 'chars');
    return summary;
  }

  // ============ EXTRACT COMPANY NAME ROBUSTLY ============
  /**
   * Extracts company name from multiple sources with fallback chain
   * Returns source indicator for debugging
   */
  function extractCompanyName(jobData, options = {}) {
    const result = { company: '', source: 'fallback' };
    
    // Source 1: Direct jobData field
    if (jobData?.company && jobData.company.trim() && 
        !['company', 'hiring team', 'your company'].includes(jobData.company.toLowerCase().trim())) {
      result.company = cleanCompanyName(jobData.company);
      result.source = 'jobData.company';
      console.log('[CompletionGates] Company from jobData:', result.company);
      return result;
    }

    // Source 2: Job title pattern (e.g., \"Software Engineer at Meta\")
    if (jobData?.title) {
      const titleMatch = jobData.title.match(/(?:at|@|for|with)\s+([A-Z][A-Za-z0-9\s&.,]+?)(?:\s*[-–|]|\s*$)/i);
      if (titleMatch && titleMatch[1]) {
        const extracted = titleMatch[1].trim();
        if (extracted.length > 2 && !['company', 'hiring team'].includes(extracted.toLowerCase())) {
          result.company = cleanCompanyName(extracted);
          result.source = 'jobTitle';
          console.log('[CompletionGates] Company from title:', result.company);
          return result;
        }
      }
    }

    // Source 3: URL subdomain (e.g., meta.workday.com -> Meta)
    if (jobData?.url || options.url) {
      const url = jobData?.url || options.url;
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        
        // Check for company subdomain pattern
        const subdomainMatch = hostname.match(/^([a-z0-9-]+)\.(workday|greenhouse|lever|icims|smartrecruiters)/i);
        if (subdomainMatch && subdomainMatch[1]) {
          const subdomain = subdomainMatch[1];
          if (subdomain.length > 2 && !['www', 'jobs', 'careers', 'apply'].includes(subdomain)) {
            result.company = formatCompanyFromUrl(subdomain);
            result.source = 'urlSubdomain';
            console.log('[CompletionGates] Company from subdomain:', result.company);
            return result;
          }
        }

        // Source 4: URL path (e.g., /finyard/jobs/ -> Finyard)
        const pathMatch = parsedUrl.pathname.match(/^\/([a-z0-9-]+)\/(?:jobs|careers|positions|apply)/i);
        if (pathMatch && pathMatch[1]) {
          const pathSegment = pathMatch[1];
          if (pathSegment.length > 2 && !['en', 'us', 'uk', 'global'].includes(pathSegment)) {
            result.company = formatCompanyFromUrl(pathSegment);
            result.source = 'urlPath';
            console.log('[CompletionGates] Company from path:', result.company);
            return result;
          }
        }
      } catch (e) {
        console.warn('[CompletionGates] URL parsing failed:', e);
      }
    }

    // Fallback: "Hiring Team"
    result.company = 'Hiring Team';
    result.source = 'fallback';
    console.log('[CompletionGates] Using fallback company name');
    
    CompletionStatus.companyNameSource = result.source;
    return result;
  }

  // ============ CLEAN COMPANY NAME ============
  function cleanCompanyName(name) {
    if (!name) return '';
    return name
      .replace(/\s*\(formerly\s+[^)]+\)/gi, '')  // Remove (formerly X)
      .replace(/\s*\([^)]*\)/g, '')               // Remove any parentheticals
      .replace(/,?\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|Limited|PLC)$/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ============ FORMAT COMPANY FROM URL ============
  function formatCompanyFromUrl(urlSegment) {
    return urlSegment
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // ============ SANITIZE CERTIFICATIONS ============
  /**
   * Detects and fixes keyword blobs incorrectly appended to certifications
   * Returns cleaned certifications array and extracted skills
   */
  function sanitizeCertifications(certifications, options = {}) {
    if (!certifications) return { cleaned: [], extractedSkills: [] };
    
    const certs = Array.isArray(certifications) ? certifications : [certifications];
    const cleaned = [];
    const extractedSkills = [];

    // Known certification patterns (to keep as certifications)
    const certPatterns = [
      /^(certified|certificate|certification)/i,
      /^(PMP|PRINCE2|CBAP|CISSP|CISM|AWS|Azure|Google|Microsoft|Oracle|Cisco|ITIL|Six Sigma|Scrum|PSM|CSM)/i,
      /\b(certified|certificate|associate|professional|specialist|expert|practitioner|master)\b/i,
    ];

    // Keyword blob indicators (should NOT be in certifications)
    const keywordBlobIndicators = [
      /\s+-\s+[a-z]/,                              // Multiple " - keyword" patterns
      /\b(management|collaboration|strategy|advertising|platform|technology)\b/i,
      /\b(leadership|coaching|mentorship|sales|account)\b/i,
      /(digital advertising|p&l|revenue growth|c-level|cross-functional)/i,
    ];

    certs.forEach(cert => {
      const certStr = typeof cert === 'string' ? cert : (cert.name || cert.title || '');
      if (!certStr || certStr.length < 3) return;

      // Count keyword indicators
      const blobScore = keywordBlobIndicators.reduce((score, pattern) => {
        return score + (pattern.test(certStr) ? 1 : 0);
      }, 0);

      // If it looks like a certification with appended keywords, split it
      if (blobScore >= 2) {
        // Find the actual certification part (before first unexpected dash pattern)
        const dashParts = certStr.split(/\s+-\s+/);
        
        // First part is likely the actual cert
        if (dashParts.length > 1) {
          const actualCert = dashParts[0].trim();
          
          // Verify first part looks like a cert
          const isCert = certPatterns.some(p => p.test(actualCert));
          if (isCert && actualCert.length > 5) {
            cleaned.push(actualCert);
            
            // Rest are skills - clean and add
            const skillsText = dashParts.slice(1).join(', ')
              .replace(/-/g, ' ')        // Remove dashes
              .replace(/\s{2,}/g, ' ')   // Collapse whitespace
              .split(/[,;]/)             // Split by commas
              .map(s => s.trim())
              .filter(s => s.length > 2 && s.length < 50);
            
            extractedSkills.push(...skillsText);
            console.log('[CompletionGates] Split certification blob:', { cert: actualCert, skills: skillsText });
            return;
          }
        }
      }

      // Check if it's a valid certification
      const isCert = certPatterns.some(p => p.test(certStr)) || blobScore === 0;
      if (isCert) {
        cleaned.push(cleanCompanyName(certStr)); // Reuse to clean parentheticals
      } else {
        // It's actually a skill list
        const skills = certStr
          .replace(/-/g, ', ')
          .split(/[,;]/)
          .map(s => s.trim())
          .filter(s => s.length > 2 && s.length < 50);
        extractedSkills.push(...skills);
      }
    });

    return { cleaned, extractedSkills };
  }

  // ============ FIX COVER LETTER HEADER ============
  /**
   * Rewrites cover letter header to use correct company name
   * Replaces generic "Company" placeholder with extracted name
   */
  function fixCoverLetterHeader(coverLetterText, jobData, options = {}) {
    if (!coverLetterText) return coverLetterText;

    const { company, source } = extractCompanyName(jobData, options);
    CompletionStatus.companyNameSource = source;

    // Replace common placeholder patterns
    let fixed = coverLetterText
      // Header line: "Company" or "Company Name"
      .replace(/^Company\s*$/gm, company)
      .replace(/^Company Name\s*$/gm, company)
      // "Re: ... at Company" pattern
      .replace(/\bat Company\b/gi, `at ${company}`)
      // "... position at Company" pattern  
      .replace(/position at Company/gi, `position at ${company}`)
      // "... role at Company" pattern
      .replace(/role at Company/gi, `role at ${company}`)
      // "Dear Company" or "Dear Company Team"
      .replace(/Dear Company(?:\s+Team)?/gi, 'Dear Hiring Manager')
      // "joining Company" pattern
      .replace(/joining Company\b/gi, `joining ${company}`)
      // "{company}" placeholder
      .replace(/\{company\}/gi, company)
      // Standalone "Company" with context
      .replace(/\bthe Company\b/gi, `${company}`)
      .replace(/\bCompany's\b/gi, `${company}'s`);

    // Specific header line fix for business letter format
    // Pattern: Line that is just "Company" after date
    const lines = fixed.split('\n');
    const fixedLines = lines.map((line, idx) => {
      const trimmed = line.trim();
      // If line is exactly "Company" and previous lines look like header
      if (trimmed === 'Company' || trimmed === 'Company Name') {
        return company;
      }
      return line;
    });

    return fixedLines.join('\n');
  }

  // ============ PRE-PDF VERIFICATION PANEL DATA ============
  function getVerificationPanelData(cvData, jobData, options = {}) {
    const contentStatus = verifyContent(cvData, {
      minSummaryLength: THRESHOLDS.MIN_SUMMARY_LENGTH,
      minRoleCount: THRESHOLDS.MIN_ROLE_COUNT,
      minTotalBullets: THRESHOLDS.MIN_TOTAL_BULLETS,
    });

    const companyResult = extractCompanyName(jobData, options);

    return {
      content: {
        summaryLength: contentStatus.summaryLength,
        summaryThreshold: THRESHOLDS.MIN_SUMMARY_LENGTH,
        summaryReady: contentStatus.summaryReady,
        roleCount: contentStatus.roleCount,
        roleThreshold: THRESHOLDS.MIN_ROLE_COUNT,
        experienceReady: contentStatus.experienceReady,
        totalBullets: contentStatus.totalBullets,
        bulletsThreshold: THRESHOLDS.MIN_TOTAL_BULLETS,
        bulletsReady: contentStatus.bulletsReady,
        allPassed: contentStatus.passed,
      },
      companyName: {
        value: companyResult.company,
        source: companyResult.source,
        sourceLabel: getSourceLabel(companyResult.source),
      },
      timestamp: Date.now(),
    };
  }

  function getSourceLabel(source) {
    const labels = {
      'jobData.company': 'Job Data Field',
      'jobTitle': 'Extracted from Title',
      'urlSubdomain': 'URL Subdomain',
      'urlPath': 'URL Path',
      'fallback': 'Fallback (Hiring Team)',
    };
    return labels[source] || source;
  }

  // ============ EXPORT ============
  const CompletionGates = {
    waitForContentReady,
    verifyContent,
    generateFallbackSummary,
    extractCompanyName,
    cleanCompanyName,
    sanitizeCertifications,
    fixCoverLetterHeader,
    getVerificationPanelData,
    THRESHOLDS,
    CompletionStatus,
    VERSION: '1.0.0',
  };

  if (typeof window !== 'undefined') {
    window.CompletionGates = CompletionGates;
  }
  if (typeof global !== 'undefined') {
    global.CompletionGates = CompletionGates;
  }

  console.log('[CompletionGates] v1.0.0 loaded - Content verification gates active');

})(typeof window !== 'undefined' ? window : global);
