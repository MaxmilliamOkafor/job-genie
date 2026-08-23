// JobRefer.ai Extension - Content Script
// Version 3.2 - Auto-refresh via background relay

(function() {
  'use strict';
  
  // Track state
  let lastExtractedJobId = '';
  let lastJobTitle = '';
  let debounceTimer = null;
  let isProcessing = false;
  let pollInterval = null;
  
  const DEBOUNCE_DELAY = 150; // Quick debounce for non-click events
  const POLL_INTERVAL = 250; // Check every 250ms
  const POLL_MAX_DURATION = 4000; // Poll for max 4 seconds
  const DOM_SETTLE_DELAY = 300; // Wait 300ms after detecting change for DOM to settle
  
  // Listen for messages from side panel
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getJobData') {
      const data = extractJobData();
      data.extractedAt = Date.now();
      data.pageUrl = window.location.href.split('?')[0];
      
      console.log('JobRefer - Extracted data:', data);
      sendResponse({ success: true, data });
      return true;
    }
    
    if (request.action === 'getCurrentUrl') {
      sendResponse({ url: window.location.href });
      return true;
    }
    
    return true;
  });
  
  // ==========================================
  // MULTI-RECRUITER EXTRACTION
  // ==========================================
  function extractAllRecruiters() {
    const recruiters = [];
    const seenUrls = new Set();
    
    // All possible sections where recruiters can appear (updated 2024/2025)
    const sectionSelectors = [
      // Hiring team sections
      '.hirer-card__hirer-information',
      '.hirer-card',
      '.hiring-team-card',
      '[class*="hirer-card"]',
      '[class*="hiring-team"]',
      // People sections
      '.job-details-connections-card',
      '.job-details-people-who-can-help__section',
      '.job-details-people',
      '[class*="people-you-can-reach"]',
      '[class*="connections-card"]',
      // Job poster
      '.jobs-poster',
      'section.jobs-poster',
      '[class*="job-poster"]',
      // Meet the team
      '[class*="meet-the-hiring"]',
      // Generic sections that might contain recruiter info
      '.jobs-details section',
      '.scaffold-layout__detail section'
    ];
    
    // Find all profile links in recruiter sections
    for (const sectionSelector of sectionSelectors) {
      const sections = document.querySelectorAll(sectionSelector);
      
      sections.forEach(section => {
        const links = section.querySelectorAll('a[href*="/in/"]');
        
        links.forEach(link => {
          const href = link.href;
          if (!href || seenUrls.has(href)) return;
          
          // Extract name - get first line, clean it up
          let name = link.textContent?.trim() || '';
          
          // Skip if it's just "profile photo" or empty
          if (!name || name.toLowerCase().includes('profile photo')) {
            // Try to find name from nearby elements
            const parent = link.closest('.artdeco-entity-lockup__content, .artdeco-entity-lockup, [class*="entity-lockup"]');
            if (parent) {
              const titleEl = parent.querySelector('.artdeco-entity-lockup__title span, .artdeco-entity-lockup__title, [class*="entity-lockup__title"]');
              if (titleEl) {
                name = titleEl.textContent?.trim() || '';
              }
            }
          }
          
          // Clean the name
          name = name.split('\n')[0].trim();
          name = name.replace(/is verified/gi, '').trim();
          name = name.replace(/\s+/g, ' ').trim();
          
          // Skip if still no valid name
          if (!name || name.length < 2 || name.toLowerCase() === 'profile photo') return;
          
          // Truncate if too long (likely has headline)
          if (name.length > 40) {
            const words = name.split(' ');
            name = words.slice(0, 3).join(' ');
          }
          
          // Determine recruiter type based on section
          let type = 'contact';
          if (sectionSelector.includes('hirer') || sectionSelector.includes('hiring-team') || sectionSelector.includes('poster')) {
            type = 'job_poster';
          } else if (sectionSelector.includes('connections')) {
            type = 'connection';
          }
          
          seenUrls.add(href);
          recruiters.push({
            name: name,
            linkedin: href,
            type: type
          });
        });
      });
    }
    
    // Fallback: If no recruiters found in sections, search entire job details area
    if (recruiters.length === 0) {
      const jobDetailsArea = document.querySelector('.jobs-search__job-details, .job-view-layout, .jobs-details, .scaffold-layout__detail, .jobs-details__main-content');
      
      if (jobDetailsArea) {
        const links = jobDetailsArea.querySelectorAll('a[href*="/in/"]');
        
        links.forEach(link => {
          const href = link.href;
          if (!href || seenUrls.has(href)) return;
          
          let name = link.textContent?.trim().split('\n')[0] || '';
          name = name.replace(/is verified/gi, '').trim();
          name = name.replace(/\s+/g, ' ').trim();
          
          if (!name || name.length < 2 || name.toLowerCase().includes('profile photo')) return;
          
          if (name.length > 40) {
            name = name.split(' ').slice(0, 3).join(' ');
          }
          
          seenUrls.add(href);
          recruiters.push({
            name: name,
            linkedin: href,
            type: 'contact'
          });
        });
      }
    }
    
    // Sort: job_poster first, then connections, then others
    recruiters.sort((a, b) => {
      const order = { 'job_poster': 0, 'connection': 1, 'contact': 2 };
      return (order[a.type] || 2) - (order[b.type] || 2);
    });
    
    console.log('JobRefer - Found recruiters:', recruiters);
    return recruiters;
  }
  
  // ==========================================
  // CLICK LISTENER - Auto-refresh on job click
  // ==========================================
  function setupClickListener() {
    // Broad click listener for job cards
    document.addEventListener('click', (e) => {
      // Expanded selectors to catch all job card variations
      const jobCard = e.target.closest(`
        .job-card-container,
        .jobs-search-results__list-item,
        .scaffold-layout__list-item,
        .jobs-search-results-list__list-item,
        .job-card-list__entity-lockup,
        [data-job-id],
        [data-occludable-job-id],
        .artdeco-list__item,
        .jobs-job-board-list__item,
        li[class*="jobs-search"],
        div[class*="job-card"],
        a[href*="/jobs/view/"]
      `.replace(/\s+/g, ' ').trim());
      
      if (jobCard) {
        console.log('JobRefer - Job card clicked!');
        startJobChangeDetection();
      }
    }, true);
    
    console.log('JobRefer - Click listener ready');
  }
  
  // Start detection when job card is clicked
  function startJobChangeDetection() {
    // Stop any existing poll
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    
    // Capture state BEFORE LinkedIn updates
    const preClickJobId = extractJobIdFromUrl();
    const preClickTitle = getJobTitle();
    const pollStartTime = Date.now();
    
    console.log('JobRefer - Pre-click state:', { 
      jobId: preClickJobId, 
      title: preClickTitle?.substring(0, 30) 
    });
    
    // Start polling for changes
    pollInterval = setInterval(() => {
      const currentJobId = extractJobIdFromUrl();
      const currentTitle = getJobTitle();
      const elapsed = Date.now() - pollStartTime;
      
      const urlChanged = currentJobId && currentJobId !== preClickJobId;
      const titleChanged = currentTitle && currentTitle !== preClickTitle && 
                          currentTitle !== 'Unknown Position' && currentTitle.length > 2;
      const isNewJob = currentJobId !== lastExtractedJobId;
      
      // Trigger if URL changed AND (title changed OR enough time passed for DOM)
      if (urlChanged && isNewJob && (titleChanged || elapsed >= 1000)) {
        console.log(`JobRefer - Job change confirmed after ${elapsed}ms`);
        clearInterval(pollInterval);
        pollInterval = null;
        
        lastJobTitle = currentTitle;
        lastExtractedJobId = currentJobId;
        
        // Small delay for DOM to settle, then trigger
        setTimeout(() => triggerJobChange(currentJobId), 200);
        return;
      }
      
      // Timeout
      if (elapsed >= POLL_MAX_DURATION) {
        console.log('JobRefer - Poll timeout');
        clearInterval(pollInterval);
        pollInterval = null;
        
        // Final fallback: if URL changed at all, trigger anyway
        if (urlChanged && isNewJob) {
          triggerJobChange(currentJobId);
        }
      }
    }, POLL_INTERVAL);
  }
  
  // Trigger job change - notify sidepanel to refresh
  function triggerJobChange(jobId) {
    if (isProcessing) {
      console.log('JobRefer - Already processing, skipping');
      return;
    }
    
    console.log('JobRefer - Triggering refresh for job:', jobId);
    isProcessing = true;
    
    chrome.runtime.sendMessage({ 
      action: 'jobChanged', 
      jobId: jobId,
      url: window.location.href
    }).then(() => {
      console.log('JobRefer - Message sent successfully');
      isProcessing = false;
    }).catch((err) => {
      console.log('JobRefer - Message error:', err.message);
      isProcessing = false;
    });
  }
  
  // ==========================================
  // CONTENT OBSERVER - For DOM changes (backup)
  // ==========================================
  function setupContentObserver() {
    const targetSelectors = [
      '.jobs-search__job-details',
      '.job-view-layout',
      '.jobs-details',
      '.scaffold-layout__detail'
    ];
    
    let targetElement = null;
    for (const selector of targetSelectors) {
      targetElement = document.querySelector(selector);
      if (targetElement) break;
    }
    
    if (!targetElement) {
      setTimeout(setupContentObserver, 1000);
      return;
    }
    
    const contentObserver = new MutationObserver((mutations) => {
      // Skip if we're already polling from a click
      if (pollInterval) return;
      
      const currentTitle = getJobTitle();
      const currentJobId = extractJobIdFromUrl();
      
      // Only trigger if job ID changed AND we have a valid new title
      if (currentJobId && currentJobId !== lastExtractedJobId && 
          currentTitle && currentTitle !== lastJobTitle && 
          currentTitle !== 'Unknown Position' && currentTitle.length > 2) {
        console.log('JobRefer - Content observer detected job change:', { jobId: currentJobId, title: currentTitle?.substring(0, 30) });
        lastJobTitle = currentTitle;
        debouncedJobChange('content', currentJobId);
      }
    });
    
    contentObserver.observe(targetElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    console.log('JobRefer - Content observer ready');
  }
  
  // ==========================================
  // DEBOUNCE - For content observer/URL watcher
  // ==========================================
  function debouncedJobChange(source, jobId) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    console.log(`JobRefer - Job change (${source}), debouncing...`);
    
    debounceTimer = setTimeout(() => {
      const currentJobId = jobId || extractJobIdFromUrl();
      
      if (currentJobId && currentJobId !== lastExtractedJobId) {
        triggerJobChange(currentJobId);
      }
    }, DEBOUNCE_DELAY);
  }
  
  // ==========================================
  // URL WATCHER - Backup detection
  // ==========================================
  function setupUrlWatcher() {
    let currentUrl = window.location.href;
    
    setInterval(() => {
      // Skip if we're already polling from a click
      if (pollInterval) return;
      
      if (window.location.href !== currentUrl) {
        const oldJobId = extractJobIdFromUrl(currentUrl);
        const newJobId = extractJobIdFromUrl(window.location.href);
        currentUrl = window.location.href;
        
        if (newJobId && newJobId !== oldJobId && newJobId !== lastExtractedJobId) {
          console.log('JobRefer - URL watcher detected change:', newJobId);
          debouncedJobChange('url', newJobId);
        }
      }
    }, 500);
  }
  
  // ==========================================
  // HELPERS
  // ==========================================
  function extractJobIdFromUrl(url) {
    if (!url) url = window.location.href;
    
    const patterns = [
      /currentJobId=(\d+)/,
      /\/jobs\/view\/(\d+)/,
      /\/jobs\/(\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    
    return null;
  }
  
  function getJobTitle() {
    const selectors = [
      // New LinkedIn selectors (2024/2025)
      '.job-details-jobs-unified-top-card__job-title h1 a',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title a',
      '.jobs-unified-top-card__job-title',
      'h1.t-24',
      'h2.t-24',
      '.jobs-details h1',
      '.jobs-search__job-details h1',
      '.scaffold-layout__detail h1',
      // Generic
      'h1[class*="job"]',
      'h1[class*="title"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent?.trim()) {
        const text = el.textContent.trim().split('\n')[0];
        if (text.length > 2) return text;
      }
    }
    
    // Fallback: extract from page title
    const pageTitle = document.title;
    if (pageTitle && pageTitle.includes('|')) {
      const titlePart = pageTitle.split('|')[0].trim();
      if (titlePart.length > 2 && !titlePart.toLowerCase().includes('linkedin')) {
        return titlePart;
      }
    }
    
    return '';
  }
  
  function getTextFromSelectors(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent?.trim()) {
        return el.textContent.trim();
      }
    }
    return '';
  }
  
  // ==========================================
  // MAIN EXTRACTION
  // ==========================================
  function extractJobData() {
    const isListView = window.location.href.includes('/jobs/search') || 
                       window.location.href.includes('/jobs/collections') ||
                       document.querySelector('.jobs-search-results-list');
    
    // Job Title - Updated selectors for 2024/2025 LinkedIn
    const jobTitleSelectors = [
      // New LinkedIn selectors
      '.job-details-jobs-unified-top-card__job-title h1 a',
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title a',
      '.jobs-unified-top-card__job-title',
      // Top card patterns
      '.t-24.job-details-jobs-unified-top-card__job-title',
      'h1.t-24',
      'h2.t-24',
      // Generic h1 in job details
      '.jobs-details__main-content h1',
      '.jobs-details-top-card__job-title',
      '.job-view-layout h1',
      '.jobs-search__job-details h1',
      '.jobs-details h1',
      // Scaffold layout (newer)
      '.scaffold-layout__detail h1',
      '.scaffold-layout__detail h2.t-24',
      // Artdeco patterns
      '.artdeco-entity-lockup__title',
      // Generic fallbacks
      'h1[class*="job"]',
      'h1[class*="title"]',
      '.jobs-top-card h1',
      '.job-view h1'
    ];
    
    // Company Name - Updated selectors
    const companyNameSelectors = [
      // New LinkedIn selectors
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.job-details-jobs-unified-top-card__primary-description-container a',
      '.job-details-jobs-unified-top-card__primary-description a',
      // Company link patterns
      'a[href*="/company/"][data-tracking-control-name*="company"]',
      'a[href*="/company/"]',
      // Top card patterns
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__subtitle-primary-grouping a',
      // Artdeco patterns
      '.artdeco-entity-lockup__subtitle a',
      '.artdeco-entity-lockup__subtitle',
      // Other patterns
      'a[data-tracking-control-name="public_jobs_topcard-org-name"]',
      '.jobs-details-top-card__company-url',
      // Scaffold layout
      '.scaffold-layout__detail a[href*="/company/"]',
      // Generic fallbacks with company in URL
      'div[class*="company"] a',
      'span[class*="company"]'
    ];
    
    // Job Description
    const jobDescriptionSelectors = [
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '#job-details',
      '.jobs-description',
      '.jobs-description-content',
      // Newer patterns
      '.jobs-description-content__text--stretch',
      'article[class*="description"]',
      '.job-view-layout article'
    ];
    
    let jobTitle = getTextFromSelectors(jobTitleSelectors).split('\n')[0].trim();
    let companyName = getTextFromSelectors(companyNameSelectors).split('\n')[0].trim();
    const jobDescription = getTextFromSelectors(jobDescriptionSelectors);
    const jobUrl = window.location.href.split('?')[0];
    const jobId = extractJobIdFromUrl(window.location.href);
    
    // Fallback: Try to get title from page title
    if (!jobTitle || jobTitle === 'Unknown Position') {
      const pageTitle = document.title;
      // LinkedIn page titles are like "Job Title | Company Name | LinkedIn"
      if (pageTitle && pageTitle.includes('|')) {
        const parts = pageTitle.split('|');
        if (parts.length >= 2) {
          jobTitle = parts[0].trim();
          if (!companyName) {
            companyName = parts[1].trim();
          }
        }
      }
    }
    
    // Debug logging for troubleshooting
    console.log('JobRefer - DOM Debug:', {
      foundH1: document.querySelector('h1')?.textContent?.substring(0, 50),
      foundH2: document.querySelector('h2.t-24')?.textContent?.substring(0, 50),
      foundCompanyLink: document.querySelector('a[href*="/company/"]')?.textContent?.substring(0, 50),
      pageTitle: document.title?.substring(0, 80)
    });
    
    // Extract ALL recruiters
    const recruiters = extractAllRecruiters();
    
    // For backwards compatibility, also set posterName and posterLinkedin from first recruiter
    const primaryRecruiter = recruiters[0] || {};
    
    console.log('JobRefer - Extraction complete:', { 
      jobTitle, 
      companyName, 
      recruitersCount: recruiters.length,
      recruiters,
      jobId,
      isListView
    });
    
    return {
      jobTitle,
      companyName,
      jobUrl,
      jobId,
      isListView,
      jobDescription: jobDescription.substring(0, 2000),
      // Multiple recruiters (new)
      recruiters: recruiters,
      // Single recruiter (backwards compatibility)
      posterName: primaryRecruiter.name || '',
      posterLinkedin: primaryRecruiter.linkedin || '',
      recruiterLocation: ''
    };
  }
  
  // ==========================================
  // INIT
  // ==========================================
  function init() {
    console.log('JobRefer - Content script v2.8 (URL+DOM polling) initializing...');
    
    lastJobTitle = getJobTitle();
    lastExtractedJobId = extractJobIdFromUrl();
    
    setupClickListener();
    setupContentObserver();
    setupUrlWatcher();
    
    console.log('JobRefer - Ready on:', window.location.href, 'Job ID:', lastExtractedJobId, 'Title:', lastJobTitle?.substring(0, 30));
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
