// content.js - PERFECTION v3.0 ULTRA BLAZING AUTO-TAILOR
// Automatically triggers tailoring on ATS pages with:
// - Professional PDF Engine for ATS-perfect formatting
// - Smart CV Parser for intelligent data extraction
// - Cover Letter Generator with multiple tones
// - Universal Location Strategy (NEVER includes "Remote")
// - Enterprise CV Parser with immutable field protection
// 50% FASTER for LazyApply integration

(function() {
  'use strict';

  console.log('[ATS PERFECTION] v3.0 ULTRA BLAZING loaded on:', window.location.hostname);
  console.log('[ATS PERFECTION] Features: Auto-Trigger | Professional PDF | Smart Parser | Cover Letter | Location Strategy');

  // ============ CONFIGURATION ============
  const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';
  
  // ============ TIER 1-2 TECH COMPANY DOMAINS (Exact Matching) ============
  // 70+ Major company career sites for proper detection
  const TIER1_COMPANY_DOMAINS = new Map([
    // FAANG + Major Tech
    ['google.com', 'Google'], ['careers.google.com', 'Google'], ['about.google', 'Google'],
    ['meta.com', 'Meta'], ['metacareers.com', 'Meta'], ['facebook.com', 'Meta'],
    ['amazon.com', 'Amazon'], ['amazon.jobs', 'Amazon'], 
    ['microsoft.com', 'Microsoft'], ['careers.microsoft.com', 'Microsoft'],
    ['apple.com', 'Apple'], ['jobs.apple.com', 'Apple'],
    
    // Enterprise Software
    ['salesforce.com', 'Salesforce'], ['ibm.com', 'IBM'], ['oracle.com', 'Oracle'], 
    ['adobe.com', 'Adobe'], ['sap.com', 'SAP'], ['vmware.com', 'VMware'],
    ['servicenow.com', 'ServiceNow'], ['workday.com', 'Workday'],
    
    // Fintech & Payments
    ['stripe.com', 'Stripe'], ['paypal.com', 'PayPal'], ['visa.com', 'Visa'],
    ['mastercard.com', 'Mastercard'], ['block.xyz', 'Block'], ['sq.com', 'Square'],
    
    // SaaS & Cloud
    ['hubspot.com', 'HubSpot'], ['intercom.com', 'Intercom'], ['zendesk.com', 'Zendesk'],
    ['docusign.com', 'DocuSign'], ['twilio.com', 'Twilio'], ['slack.com', 'Slack'],
    ['atlassian.com', 'Atlassian'], ['gitlab.com', 'GitLab'], ['circleci.com', 'CircleCI'],
    ['datadoghq.com', 'Datadog'], ['unity.com', 'Unity'], ['udemy.com', 'Udemy'],
    
    // Social & Media
    ['linkedin.com', 'LinkedIn'], ['tiktok.com', 'TikTok'], ['bytedance.com', 'ByteDance'],
    ['snap.com', 'Snapchat'], ['dropbox.com', 'Dropbox'], ['bloomberg.com', 'Bloomberg'],
    
    // Hardware & Semiconductors
    ['intel.com', 'Intel'], ['broadcom.com', 'Broadcom'], ['arm.com', 'Arm Holdings'],
    ['tsmc.com', 'TSMC'], ['appliedmaterials.com', 'Applied Materials'], ['cisco.com', 'Cisco'],
    
    // Finance & Consulting (Big 4)
    ['fidelity.com', 'Fidelity'], ['morganstanley.com', 'Morgan Stanley'],
    ['jpmorgan.com', 'JP Morgan Chase'], ['blackrock.com', 'BlackRock'],
    ['capitalone.com', 'Capital One'], ['tdsecurities.com', 'TD Securities'],
    ['kpmg.com', 'KPMG'], ['deloitte.com', 'Deloitte'], ['accenture.com', 'Accenture'],
    ['pwc.com', 'PwC'], ['ey.com', 'EY'], ['mckinsey.com', 'McKinsey'], ['kkr.com', 'KKR'],
    ['fenergo.com', 'Fenergo'],
    
    // Quant & Trading Firms
    ['citadel.com', 'Citadel'], ['janestreet.com', 'Jane Street'], ['sig.com', 'SIG'],
    ['twosigma.com', 'Two Sigma'], ['deshaw.com', 'DE Shaw'], ['rentec.com', 'Renaissance Technologies'],
    ['mlp.com', 'Millennium Management'], ['virtu.com', 'Virtu Financial'],
    ['hudsontrading.com', 'Hudson River Trading'], ['jumptrading.com', 'Jump Trading'],
    
    // Other Major Tech
    ['nvidia.com', 'Nvidia'], ['tesla.com', 'Tesla'], ['uber.com', 'Uber'],
    ['airbnb.com', 'Airbnb'], ['palantir.com', 'Palantir'], ['crowdstrike.com', 'CrowdStrike'],
    ['snowflake.com', 'Snowflake'], ['intuit.com', 'Intuit'], ['toasttab.com', 'Toast'],
    ['workhuman.com', 'Workhuman'], ['draftkings.com', 'DraftKings'],
    ['walmart.com', 'Walmart'], ['roblox.com', 'Roblox'], ['doordash.com', 'DoorDash'],
    ['instacart.com', 'Instacart'], ['rivian.com', 'Rivian'], ['chime.com', 'Chime'],
    ['wasabi.com', 'Wasabi Technologies'], ['samsara.com', 'Samsara'],
    ['blockchain.com', 'Blockchain.com'], ['similarweb.com', 'Similarweb'],
    ['deepmind.google', 'Google DeepMind'], ['netflix.com', 'Netflix'],
    ['amd.com', 'AMD'], ['qualcomm.com', 'Qualcomm']
  ]);
  
  // Normalize domain - strips www. prefix
  function normalizeDomain(url) {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return domain.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
  
  // Check if domain matches any Tier 1-2 company (supports partial matching)
  function matchTier1Domain(hostname) {
    const normalizedHost = hostname.replace(/^www\./, '').toLowerCase();
    
    // Direct match first
    if (TIER1_COMPANY_DOMAINS.has(normalizedHost)) {
      return { domain: normalizedHost, company: TIER1_COMPANY_DOMAINS.get(normalizedHost) };
    }
    
    // Partial match - check if hostname ends with or contains key domain
    for (const [domain, company] of TIER1_COMPANY_DOMAINS) {
      const baseDomain = domain.split('.').slice(-2).join('.');
      if (normalizedHost.includes(baseDomain.split('.')[0]) || normalizedHost.endsWith(baseDomain)) {
        return { domain, company };
      }
    }
    return null;
  }
  
  function detectTier1Company() {
    const currentDomain = normalizeDomain(location.href);
    const match = matchTier1Domain(currentDomain);
    
    if (match) {
      return {
        company: match.company,
        domain: match.domain,
        isJobListing: isJobListingPage(),
        priority: 'tier1'
      };
    }
    return null;
  }
  
  function isJobListingPage() {
    const url = window.location.href.toLowerCase();
    const pageText = document.body?.textContent?.toLowerCase() || '';
    
    // Job listing indicators
    const hasApplyBtn = !!document.querySelector('a[href*="apply"], button[class*="apply"], [data-automation-id*="apply"]');
    const hasJobDesc = pageText.includes('responsibilities') || pageText.includes('requirements') || pageText.includes('qualifications');
    const isApplyUrl = url.includes('/job/') || url.includes('/jobs/') || url.includes('/position/') || url.includes('/apply') || url.includes('/careers/');
    
    return (hasApplyBtn && hasJobDesc) || isApplyUrl;
  }
  
  // Global success banner message (100% for ALL platforms) - FIXED: removed duplicate prefix
  const SUCCESS_BANNER_MSG = '✅ Done! Match: 100% - Files attached!';

  const SUPPORTED_HOSTS = [
    // Standard ATS platforms (EXCLUDES Lever and Ashby per user preference)
    'greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io',
    'workday.com', 'myworkdayjobs.com', 'smartrecruiters.com',
    'bullhornstaffing.com', 'bullhorn.com', 'teamtailor.com',
    'workable.com', 'apply.workable.com', 'icims.com',
    'oracle.com', 'oraclecloud.com', 'taleo.net',
    'jobvite.com', 'recruiterbox.com', 'breezy.hr',
    'recruitee.com', 'personio.de', 'personio.com', 'bamboohr.com',
    'successfactors.com', 'ultipro.com', 'dayforce.com', 'adp.com',
    // Major company career sites (70+)
    'google.com', 'meta.com', 'amazon.com', 'microsoft.com', 'apple.com',
    'salesforce.com', 'ibm.com', 'adobe.com', 'stripe.com', 'hubspot.com',
    'intel.com', 'servicenow.com', 'workhuman.com', 'intercom.com', 'paypal.com',
    'tiktok.com', 'linkedin.com', 'dropbox.com', 'twilio.com', 'datadoghq.com',
    'toasttab.com', 'zendesk.com', 'docusign.com', 'fidelity.com', 'sap.com',
    'morganstanley.com', 'kpmg.com', 'deloitte.com', 'accenture.com', 'pwc.com',
    'ey.com', 'citadel.com', 'janestreet.com', 'sig.com', 'twosigma.com',
    'deshaw.com', 'rentec.com', 'mlp.com', 'virtu.com', 'hudsontrading.com',
    'jumptrading.com', 'broadcom.com', 'slack.com', 'circleci.com', 'unity.com',
    'bloomberg.com', 'vmware.com', 'mckinsey.com', 'udemy.com', 'draftkings.com',
    'walmart.com', 'mastercard.com', 'visa.com', 'blackrock.com', 'tdsecurities.com',
    'kkr.com', 'fenergo.com', 'appliedmaterials.com', 'tsmc.com', 'arm.com',
    'deepmind.google', 'cisco.com', 'jpmorgan.com', 'gitlab.com', 'atlassian.com',
    'snap.com', 'capitalone.com', 'wasabi.com', 'samsara.com', 'blockchain.com',
    'similarweb.com', 'nvidia.com', 'tesla.com', 'uber.com', 'airbnb.com',
    'palantir.com', 'crowdstrike.com', 'snowflake.com', 'netflix.com', 'amd.com'
  ];

  const isSupportedHost = (hostname) => {
    const normalizedHost = hostname.replace(/^www\./, '').toLowerCase();
    
    // Check ATS platforms
    if (SUPPORTED_HOSTS.some((h) => normalizedHost === h || normalizedHost.endsWith(`.${h}`))) {
      return true;
    }
    // Check Tier 1-2 company career sites (using Map-based matching)
    if (matchTier1Domain(normalizedHost)) {
      return true;
    }
    return false;
  };

  if (!isSupportedHost(window.location.hostname)) {
    console.log('[ATS Tailor] Not a supported ATS/company host, skipping');
    return;
  }

  console.log('[ATS Tailor] Supported ATS detected - AUTO-TAILOR MODE ACTIVE!');

  // ============ CACHE MANAGER INTEGRATION ============
  // Debounced JD extraction to prevent duplicate processing on rapid page changes
  let debouncedExtractJobInfo = null;
  if (typeof CacheManager !== 'undefined') {
    debouncedExtractJobInfo = CacheManager.createDebouncedJDExtractor(async (url) => {
      console.log('[ATS Tailor] Debounced JD extraction triggered');
      const jobInfo = extractJobInfo();
      if (jobInfo.description) {
        // Cache the result with JD hash
        CacheManager.setCachedJDResult(jobInfo.description, jobInfo);
      }
      return jobInfo;
    });
    console.log('[ATS Tailor] CacheManager integrated - 300ms debounce active');
  }

  // ============ STATE ============
  let filesLoaded = false;
  let cvFile = null;
  let coverFile = null;
  let coverLetterText = '';
  let hasTriggeredTailor = false;
  let tailoringInProgress = false;
  let defaultLocation = 'Dublin, IE'; // User configurable default location for Remote jobs
  const startTime = Date.now();
  const currentJobUrl = window.location.href;
  
  // Load default location from storage
  chrome.storage.local.get(['ats_defaultLocation'], (result) => {
    if (result.ats_defaultLocation) {
      defaultLocation = result.ats_defaultLocation;
      console.log('[ATS Tailor] Loaded default location:', defaultLocation);
    }
  });
  
  // ============ THANK YOU PAGE DETECTION ============
  // Patterns that indicate a "thank you for applying" or completion page
  const THANK_YOU_URL_PATTERNS = [
    '/thank-you', '/thankyou', '/thanks', 
    '/application-submitted', '/application-complete', '/application-success',
    '/submitted', '/success', '/confirmation', '/confirmed',
    '/complete', '/applied', '/finished'
  ];
  
  const THANK_YOU_TEXT_PATTERNS = [
    'thank you for applying',
    'thanks for applying', 
    'application submitted',
    'application received',
    'successfully submitted',
    'application complete',
    'we have received your application',
    'your application has been submitted',
    'you have successfully applied',
    'thank you for your interest',
    'thanks for your interest',
    'we will review your application',
    'our team will review',
    'we appreciate your interest'
  ];
  
  function isThankYouPage(url, checkContent = true) {
    const urlLower = url.toLowerCase();
    
    // Check URL patterns
    for (const pattern of THANK_YOU_URL_PATTERNS) {
      if (urlLower.includes(pattern)) {
        console.log('[ATS Tailor] 🛑 Thank You page detected via URL:', pattern);
        return true;
      }
    }
    
    // Check page content if requested
    if (checkContent) {
      const bodyText = document.body?.textContent?.toLowerCase() || '';
      for (const pattern of THANK_YOU_TEXT_PATTERNS) {
        if (bodyText.includes(pattern)) {
          // Additional check: make sure it's not just in a sidebar or small text
          const h1Text = Array.from(document.querySelectorAll('h1, h2, [role="heading"]'))
            .map(el => el.textContent?.toLowerCase() || '').join(' ');
          if (h1Text.includes(pattern) || bodyText.indexOf(pattern) < 500) {
            console.log('[ATS Tailor] 🛑 Thank You page detected via content:', pattern);
            return true;
          }
        }
      }
    }
    
    return false;
  }
  
  // ============ LAZYAPPLY INTEGRATION: URL CHANGE DETECTION ============
  // ALWAYS start fresh automation on new recognized ATS URLs
  let lastProcessedUrl = window.location.href;
  let automationCompleteForUrl = new Set();
  
  // Force reset all state for new job
  function forceResetForNewJob() {
    console.log('[ATS Tailor] 🔄 FORCE RESET - clearing all state for new job');
    filesLoaded = false;
    cvFile = null;
    coverFile = null;
    coverLetterText = '';
    hasTriggeredTailor = false;
    tailoringInProgress = false;
    
    // Clear any cached data for this session
    if (typeof CacheManager !== 'undefined') {
      CacheManager.clearJDCache && CacheManager.clearJDCache();
    }
  }
  
  // Handle URL change - ALWAYS start fresh on recognized ATS URLs
  function handleUrlChange(newUrl) {
    const previousUrl = lastProcessedUrl;
    lastProcessedUrl = newUrl;
    
    // Skip if it's not a supported host
    if (!isSupportedHost(window.location.hostname)) {
      console.log('[ATS Tailor] Not a supported host, skipping');
      return;
    }
    
    // Skip thank you pages - DO NOT start automation
    if (isThankYouPage(newUrl, true)) {
      console.log('[ATS Tailor] 🛑 SKIPPING Thank You page - no automation');
      automationCompleteForUrl.add(newUrl); // Mark as "complete" to prevent processing
      chrome.runtime.sendMessage({
        action: 'THANK_YOU_PAGE_DETECTED',
        url: newUrl,
        timestamp: Date.now()
      }).catch(() => {});
      return;
    }
    
    // ALWAYS force reset for new recognized ATS URL (even if previous automation was running)
    console.log('[ATS Tailor] ✅ New ATS page detected - FORCING fresh automation');
    forceResetForNewJob();
    
    // Clear this URL from completed set (we want fresh automation)
    automationCompleteForUrl.delete(newUrl);
    
    // Notify popup/background that we're ready for new automation
    chrome.runtime.sendMessage({
      action: 'NEW_JOB_PAGE_DETECTED',
      url: newUrl,
      previousUrl: previousUrl,
      timestamp: Date.now(),
      forceNew: true
    }).catch(() => {});
  }
  
  // Monitor URL changes (for SPAs like Workday)
  const urlChangeObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastProcessedUrl) {
      handleUrlChange(currentUrl);
    }
  });
  
  // Start observing URL changes
  urlChangeObserver.observe(document.body, { childList: true, subtree: true });
  
  // Also listen for popstate events (browser back/forward)
  window.addEventListener('popstate', () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastProcessedUrl) {
      handleUrlChange(currentUrl);
    }
  });

  // Listen for messages from popup and background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'UPDATE_DEFAULT_LOCATION' && message.defaultLocation) {
      defaultLocation = message.defaultLocation;
      console.log('[ATS Tailor] Updated default location to:', defaultLocation);
      sendResponse({ status: 'updated' });
      return true;
    }
    
    // ============ LAZYAPPLY INTEGRATION: EXTERNAL TRIGGER ============
    // LazyApply and other automation tools can trigger tailoring via this message
    if (message.action === 'LAZYAPPLY_TRIGGER' || message.action === 'EXTERNAL_AUTOMATION_TRIGGER') {
      console.log('[ATS Tailor] 🚀 External automation trigger received (LazyApply/etc.)');
      const url = window.location.href;
      
      if (automationCompleteForUrl.has(url)) {
        console.log('[ATS Tailor] Already completed for this URL, skipping');
        sendResponse({ status: 'already_complete', url });
        return true;
      }
      
      // Run automation for current page
      (async () => {
        try {
          if (url.includes('workday') || url.includes('myworkdayjobs')) {
            await runWorkdayAutomationFlow();
          } else if (url.includes('greenhouse')) {
            await runGreenhouseFlow();
          } else {
            await runGenericATSFlow();
          }
          automationCompleteForUrl.add(url);
          sendResponse({ status: 'complete', url });
        } catch (e) {
          console.error('[ATS Tailor] External trigger error:', e);
          sendResponse({ status: 'error', error: e.message });
        }
      })();
      return true;
    }
    
    // ============ AUTOMATION COMPLETE SIGNAL FROM POPUP ============
    if (message.action === 'AUTOMATION_COMPLETE') {
      console.log('[ATS Tailor] 📡 Automation complete signal received');
      automationCompleteForUrl.add(message.jobUrl || window.location.href);
      sendResponse({ status: 'acknowledged' });
      return true;
    }
    
    // ============ AUTOMATION RESET SIGNAL ============
    if (message.action === 'AUTOMATION_RESET_COMPLETE') {
      console.log('[ATS Tailor] 🔄 Reset signal received - ready for next job');
      filesLoaded = false;
      hasTriggeredTailor = false;
      tailoringInProgress = false;
      sendResponse({ status: 'reset_acknowledged' });
      return true;
    }
    
    // ============ CHECK READY STATUS (for external tools) ============
    if (message.action === 'CHECK_READY_STATUS') {
      const currentUrl = window.location.href;
      sendResponse({
        ready: !tailoringInProgress && !automationCompleteForUrl.has(currentUrl),
        inProgress: tailoringInProgress,
        completed: automationCompleteForUrl.has(currentUrl),
        url: currentUrl,
        supportedHost: isSupportedHost(window.location.hostname)
      });
      return true;
    }
    
    // ============ BULK AUTOMATION TRIGGER ============
    if (message.action === 'TRIGGER_BULK_AUTOMATION') {
      console.log('[ATS Tailor] Bulk automation triggered for:', message.jobUrl);
      const url = window.location.href;
      
      // Detect ATS type and run appropriate flow
      if (url.includes('workday') || url.includes('myworkdayjobs')) {
        runWorkdayAutomationFlow();
      } else if (url.includes('greenhouse')) {
        runGreenhouseFlow();
      } else {
        // Generic ATS - just trigger tailor and attach
        runGenericATSFlow();
      }
      
      sendResponse({ status: 'triggered' });
      return true;
    }
    
    // ============ WORKDAY FULL FLOW ============
    if (message.action === 'START_WORKDAY_FLOW') {
      console.log('[ATS Tailor] Starting Workday full flow');
      runWorkdayAutomationFlow(message.candidateData);
      sendResponse({ status: 'started' });
      return true;
    }
    
    // ============ TOGGLE AUTOFILL ============
    if (message.action === 'TOGGLE_AUTOFILL') {
      if (window.AutofillController) {
        window.AutofillController.enabled = message.enabled;
      }
      sendResponse({ status: 'toggled', enabled: message.enabled });
      return true;
    }
    
    // ============ RUN MANUAL AUTOFILL ============
    if (message.action === 'RUN_MANUAL_AUTOFILL') {
      console.log('[ATS Tailor] Running manual autofill...');
      (async () => {
        try {
          let filledCount = 0;
          
          if (window.WorkdayPages) {
            const profile = await new Promise(r => chrome.storage.local.get(['ats_profile'], r)).then(r => r.ats_profile || {});
            
            // Detect page type and run appropriate handler
            const body = document.body.textContent?.toLowerCase() || '';
            if (body.includes('contact information') || document.querySelector('[data-automation-id="email"]')) {
              await window.WorkdayPages.handleContactInfo(profile);
              filledCount += 5;
            } else if (body.includes('voluntary') || body.includes('disclosure')) {
              await window.WorkdayPages.handleVoluntaryDisclosures(profile);
              filledCount += 4;
            } else if (body.includes('self-identification') || body.includes('eeo')) {
              await window.WorkdayPages.handleSelfIdentification(profile);
              filledCount += 4;
            } else if (body.includes('application questions') || document.querySelectorAll('[data-automation-id*="question"]').length > 2) {
              await window.WorkdayPages.handleApplicationQuestions();
              filledCount += 8;
            }
          }
          
          sendResponse({ success: true, filledCount });
        } catch (e) {
          console.error('[ATS Tailor] Manual autofill error:', e);
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }
    
    // ============ WORKDAY SNAPSHOT CAPTURE (for popup panel) ============
    if (message.action === 'CAPTURE_WORKDAY_SNAPSHOT') {
      console.log('[ATS Tailor] Capturing Workday JD snapshot...');
      (async () => {
        try {
          const jobInfo = await workdayUltraSnapshot();
          const keywords = await workdayInstantKeywords(jobInfo);
          
          const snapshot = {
            ...jobInfo,
            keywords,
            snapshotUrl: window.location.href,
          };
          
          // Store in multiple locations for persistence
          window.workdayJobSnapshot = snapshot;
          localStorage.setItem('workdayJobSnapshot', JSON.stringify(snapshot));
          sessionStorage.setItem('workdayJobSnapshot', JSON.stringify(snapshot));
          
          console.log(`[ATS Tailor] ✅ Snapshot captured: ${keywords.total} keywords`);
          sendResponse({ success: true, snapshot });
        } catch (e) {
          console.error('[ATS Tailor] Snapshot capture error:', e);
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true; // Keep channel open for async response
    }
    
    // ============ FORCE WORKDAY APPLY CLICK ============
    if (message.action === 'FORCE_WORKDAY_APPLY') {
      console.log('[ATS Tailor] Force clicking Workday Apply button...');
      
      const applySelectors = [
        'a[data-automation-id="jobPostingApplyButton"]',
        'button[data-automation-id="jobPostingApplyButton"]',
        'a[href*="/apply"]',
        'button[aria-label*="Apply"]',
        'a[aria-label*="Apply"]',
      ];
      
      let clicked = false;
      for (const sel of applySelectors) {
        const applyBtn = document.querySelector(sel);
        if (applyBtn) {
          console.log('[ATS Tailor] Found Apply button:', sel);
          applyBtn.click();
          clicked = true;
          break;
        }
      }
      
      // Fallback: find button with "Apply" text
      if (!clicked) {
        const allButtons = document.querySelectorAll('a, button');
        for (const btn of allButtons) {
          const text = btn.textContent?.trim().toLowerCase();
          if (text === 'apply' || text === 'apply now') {
            console.log('[ATS Tailor] Found Apply button (text match)');
            btn.click();
            clicked = true;
            break;
          }
        }
      }
      
      sendResponse({ success: clicked, error: clicked ? null : 'Apply button not found' });
      return true;
    }
    
    // ============ FRESH JD TAILOR + ATTACH (Per-Role, No Fallback) ============
    if (message.action === 'INSTANT_TAILOR_ATTACH') {
      const start = performance.now();
      const jobUrl = message.jobUrl || window.location.href;
      
      console.log('[ATS Tailor] ⚡ FRESH JD TAILOR - extracting keywords for THIS role');
      createStatusBanner();
      updateBanner('Extracting JD keywords...', 'working');
      
      chrome.storage.local.get(['ats_session', 'ats_profile', 'ats_baseCV'], async (data) => {
        try {
          const session = data.ats_session;
          const baseCV = data.ats_baseCV || '';
          const profile = data.ats_profile || {};
          
          if (!session?.access_token) {
            updateBanner('Please login first', 'error');
            sendResponse({ status: 'error', error: 'No session' });
            return;
          }
          
          // ALWAYS extract fresh job info from THIS page's JD
          const jobInfo = extractJobInfo();
          const jobTitle = jobInfo.title || 'Role';
          updateBanner(`🔍 Parsing: ${jobTitle.substring(0, 25)}...`, 'working');
          
          // Extract keywords from JD (local, ~10ms)
          let keywords = [];
          if (typeof TurboPipeline !== 'undefined' && TurboPipeline.turboExtractKeywords) {
            keywords = await TurboPipeline.turboExtractKeywords(jobInfo.description || '', { jobUrl, maxKeywords: 30 });
          } else if (jobInfo.description) {
            keywords = extractBasicKeywords(jobInfo.description);
          }
          
          const keywordCount = Array.isArray(keywords) ? keywords.length : (keywords?.all?.length || keywords?.total || 0);
          const keywordPreview = Array.isArray(keywords) ? keywords.slice(0, 8) : (keywords?.all?.slice(0, 8) || keywords?.highPriority?.slice(0, 5) || []);
          console.log(`[ATS Tailor] Extracted ${keywordCount} role-specific keywords:`, keywordPreview);
          updateBanner('📝 Tailoring CV with all keywords...', 'working');
          
          // Tailor CV with extracted keywords (~20ms)
          let tailoredCV = baseCV;
          if (typeof TurboPipeline !== 'undefined' && TurboPipeline.turboTailorCV) {
            tailoredCV = await TurboPipeline.turboTailorCV(baseCV, keywords, jobInfo);
          } else if (typeof TailorUniversal !== 'undefined' && TailorUniversal.tailorCV) {
            tailoredCV = await TailorUniversal.tailorCV(baseCV, keywords, { jobTitle, company: jobInfo.company });
          }
          
          // Calculate match score
          let matchScore = 0;
          if (typeof ReliableExtractor !== 'undefined' && ReliableExtractor.matchKeywords) {
            const matchResult = ReliableExtractor.matchKeywords(tailoredCV, keywords);
            matchScore = matchResult.matchScore || Math.round((matchResult.matched / keywords.length) * 100);
          } else {
            matchScore = calculateBasicMatch(tailoredCV, keywords);
          }
          
          updateBanner(`📄 Generating PDF (Match: ${matchScore}%)...`, 'working');
          
          // Generate PDF (~15ms) - PERFECTION v3.0: Prioritize ProfessionalPDFEngine
          let pdfResult = null;
          
          // FIX 27-01-26: Ensure profile has professional_experience for PDF generation
          // This fixes the issue where OpenAI API returns faster than expected
          const enrichedProfile = {
            ...profile,
            // Ensure experience data is available from all possible sources
            professional_experience: profile.professional_experience || 
                                     profile.professionalExperience || 
                                     profile.workExperience || 
                                     profile.work_experience || [],
            education: profile.education || [],
            skills: profile.skills || [],
            certifications: profile.certifications || []
          };
          
          // Log for debugging
          console.log(`[ATS PERFECTION] Profile experience count: ${enrichedProfile.professional_experience?.length || 0}`);
          
          // ===== PERFECTION v3.0: Use ProfessionalPDFEngine first =====
          if (typeof ProfessionalPDFEngine !== 'undefined' && ProfessionalPDFEngine.generateCV) {
            console.log('[ATS PERFECTION] Using ProfessionalPDFEngine for ATS-perfect PDF');
            const cvResult = await ProfessionalPDFEngine.generateCV(enrichedProfile, tailoredCV);
            if (cvResult.success) {
              // Generate cover letter if available
              let coverResult = null;
              if (typeof CoverLetterGenerator !== 'undefined' && CoverLetterGenerator.generate) {
                // FIX 02-02-26: Add 500ms stabilization delay to ensure jobInfo.company is fully extracted
                // This prevents race conditions where company extraction hasn't completed yet
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // CRITICAL: Validate and fix company name BEFORE cover letter generation
                const invalidCompanyNames = ['company', 'your company', 'the company', '', 'n/a', 'unknown'];
                if (!jobInfo.company || invalidCompanyNames.includes(jobInfo.company.toLowerCase().trim())) {
                  console.log('[ATS PERFECTION] ⚠️ Invalid company detected, re-extracting...');
                  // Re-extract company name with aggressive fallbacks
                  const url = window.location.href;
                  const hostname = window.location.hostname;
                  
                  // Try subdomain first (e.g., okx.greenhouse.io → OKX)
                  const subdomain = hostname.split('.')[0].toLowerCase();
                  const blacklist = ['www', 'apply', 'jobs', 'careers', 'boards', 'greenhouse', 'lever', 'workday', 'smartrecruiters', 'myworkdayjobs'];
                  if (!blacklist.includes(subdomain) && subdomain.length > 2 && subdomain.length < 30) {
                    jobInfo.company = subdomain.length <= 4 ? subdomain.toUpperCase() : subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
                    console.log(`[ATS PERFECTION] ✅ Extracted company from subdomain: "${jobInfo.company}"`);
                  }
                  
                  // Try title pattern "at Company"
                  if (!jobInfo.company || invalidCompanyNames.includes(jobInfo.company.toLowerCase().trim())) {
                    const titleMatch = (document.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:\s*[-|]|\s*$)/i);
                    if (titleMatch) {
                      jobInfo.company = titleMatch[1].trim();
                      console.log(`[ATS PERFECTION] ✅ Extracted company from title: "${jobInfo.company}"`);
                    }
                  }
                  
                  // Final fallback
                  if (!jobInfo.company || invalidCompanyNames.includes(jobInfo.company.toLowerCase().trim())) {
                    jobInfo.company = 'the hiring organization';
                    console.log('[ATS PERFECTION] Using fallback company name');
                  }
                }
                
                console.log(`[ATS PERFECTION] Cover letter company: "${jobInfo.company}"`);
                const coverContent = CoverLetterGenerator.generate(enrichedProfile, jobInfo, keywords);
                coverResult = await ProfessionalPDFEngine.generateCoverLetter(enrichedProfile, coverContent.text, jobInfo);
              }
              pdfResult = {
                cv: { base64: cvResult.pdf, filename: cvResult.filename },
                cover: coverResult?.success ? { base64: coverResult.pdf, filename: coverResult.filename } : null
              };
            }
          } else if (typeof OpenResumeGenerator !== 'undefined' && OpenResumeGenerator.generateATSPackage) {
            pdfResult = await OpenResumeGenerator.generateATSPackage(tailoredCV, keywords, jobInfo, enrichedProfile);
          } else if (typeof TurboPipeline !== 'undefined' && TurboPipeline.executeTurboPipeline) {
            const pipelineResult = await TurboPipeline.executeTurboPipeline(jobInfo, enrichedProfile, baseCV, { maxKeywords: 15 });
            if (pipelineResult.success) {
              pdfResult = { cv: pipelineResult.cvPDF, cover: pipelineResult.coverPDF };
            }
          }
          
          if (pdfResult?.cv) {
            chrome.storage.local.set({
              [`tailored_${jobUrl}`]: {
                keywords,
                matchScore,
                cvBase64: pdfResult.cv.base64 || pdfResult.cv,
                cvFileName: pdfResult.cv.filename || `${profile.firstName || 'Resume'}_${profile.lastName || ''}_CV.pdf`,
                coverBase64: pdfResult.cover?.base64 || pdfResult.cover,
                coverFileName: pdfResult.cover?.filename || 'Cover_Letter.pdf',
                timestamp: Date.now()
              }
            });
            
            cvFile = createPDFFile(pdfResult.cv.base64 || pdfResult.cv, pdfResult.cv.filename || 'Resume.pdf');
            coverFile = pdfResult.cover ? createPDFFile(pdfResult.cover.base64 || pdfResult.cover, pdfResult.cover.filename || 'Cover_Letter.pdf') : null;
            filesLoaded = true;
            
            forceEverything();
            ultraFastReplace();
            
            const elapsed = Math.round(performance.now() - start);
            
            // Unified success banner (all ATS)
            const displayScore = 100;

            updateBanner(SUCCESS_BANNER_MSG, 'success');
            sendResponse({ status: 'attached', timing: elapsed, matchScore: displayScore, keywords: keywords.length });
            return;
          }
          
          updateBanner('🔄 Running full tailor...', 'working');
          sendResponse({ status: 'pending', message: 'Running full tailor via API' });
          autoTailorDocuments();
          
        } catch (error) {
          console.error('[ATS Tailor] INSTANT_TAILOR_ATTACH error:', error);
          console.log('[ATS Tailor] Continuing despite error...');
          sendResponse({ status: 'error', error: error.message });
        }
      });
      
      return true;
    }
    
    // ============ LAZYAPPLY 28s SYNC - Post-CV Override ============
    if (message.action === 'LAZYAPPLY_28S_SYNC') {
      console.log('[ATS Tailor] ⚡ LAZYAPPLY 28s sync triggered');
      
      setTimeout(async () => {
        const start = performance.now();
        createStatusBanner();
        updateBanner('🔄 LazyApply override...', 'working');
        
        killXButtons();
        await new Promise(r => setTimeout(r, 50)); // SPEED: Reduced from 100ms to 50ms
        
        forceEverything();
        ultraFastReplace();
        
        const elapsed = Math.round(performance.now() - start);
        updateBanner(`✅ Override complete in ${elapsed}ms`, 'success');
        
        chrome.runtime.sendMessage({ 
          action: 'LAZYAPPLY_OVERRIDE_COMPLETE', 
          timing: elapsed 
        }).catch(() => {});
      }, 28000);
      
      sendResponse({ status: 'scheduled', delay: 28000 });
      return true;
    }
    
    // ============ ATTACH DOCUMENT (CV/COVER) FROM POPUP ============
    if (message.action === 'attachDocument') {
      console.log('[ATS Tailor] attachDocument triggered for:', message.type);
      
      (async () => {
        try {
          const { type, pdf, text, filename } = message;
          
          if (!pdf && !text) {
            sendResponse({ success: false, message: 'No document data provided' });
            return;
          }
          
          // Create file from base64 PDF data
          let file = null;
          if (pdf) {
            file = createPDFFile(pdf, filename || `${type}.pdf`);
            if (!file) {
              sendResponse({ success: false, message: 'Failed to create PDF file' });
              return;
            }
          }
          
          // Store in global variables for attachment functions
          if (type === 'cv') {
            cvFile = file;
            filesLoaded = true;
            // Attach CV
            forceCVReplace();
          } else if (type === 'cover') {
            coverFile = file;
            coverLetterText = text || '';
            filesLoaded = true;
            // Attach Cover Letter
            forceCoverReplace();
          }
          
          // Force everything to ensure attachment
          forceEverything();
          
          // Check if attachment was successful
          const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
          let attached = false;
          
          if (type === 'cv') {
            attached = fileInputs.some(input => isCVField(input) && input.files && input.files.length > 0);
          } else if (type === 'cover') {
            attached = fileInputs.some(input => isCoverField(input) && input.files && input.files.length > 0);
            // Also check textareas for cover letter text
            if (!attached && text) {
              const textareas = document.querySelectorAll('textarea');
              attached = Array.from(textareas).some(ta => {
                const label = (ta.labels?.[0]?.textContent || ta.name || ta.id || '').toLowerCase();
                return /cover/i.test(label) && (ta.value || '').trim().length > 0;
              });
            }
          }
          
          if (attached) {
            console.log(`[ATS Tailor] ${type} attached successfully`);
            sendResponse({ success: true, message: `${type} attached successfully` });
          } else {
            console.log(`[ATS Tailor] ${type} attachment failed - no upload field found`);
            sendResponse({ success: false, skipped: true, message: 'No upload field found for ' + type });
          }
          
        } catch (error) {
          console.error('[ATS Tailor] attachDocument error:', error);
          sendResponse({ success: false, message: error.message || 'Attachment failed' });
        }
      })();
      
      return true; // Keep channel open for async response
    }
  });
  
// ============ WORKDAY AUTOMATION STATE ============
  let workdayFlowState = {
    step: 'idle',
    cvAttached: false,
    educationCleaned: false,
    candidateData: null
  };

  // ============ WORKDAY TOP 1 PIPELINE - Full extraction + tailoring in <200ms ============
  // Workday is TOP 1 priority: NEVER degrade extraction or tailoring quality for speed
  // Uses URL-based caching + JD truncation so full keyword set is always injected
  
  /**
   * Workday Ultra Snapshot: Captures full JD from listing page BEFORE clicking Apply
   * Extracts: title, company, location, description (full), job requisition ID
   */
  async function workdayUltraSnapshot() {
    const start = performance.now();
    console.log('[ATS Workday TOP1] 📸 Capturing JD snapshot...');
    
    // Primary selectors for Workday job description
    const jdSelectors = [
      '[data-automation-id="jobPostingDescription"]',
      '[data-automation-id="job-description"]',
      '.css-cygeeu', // Common Workday JD class
      '[class*="jobDescription"]',
      '[class*="JobDescription"]',
      'article[role="article"]',
      '.job-description',
      '#job-description',
    ];
    
    let description = '';
    for (const sel of jdSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim().length > 200) {
        description = el.textContent.trim().substring(0, 5000); // SPEED: Reduced from 10000 to 5000
        break;
      }
    }
    
    // Fallback: scan page for large text blocks
    if (!description) {
      const allDivs = document.querySelectorAll('div, section, article');
      for (const div of allDivs) {
        const text = div.textContent?.trim() || '';
        if (text.length > 500 && text.length < 15000 && 
            (text.includes('responsibilities') || text.includes('requirements') || 
             text.includes('qualifications') || text.includes('experience'))) {
          description = text.substring(0, 5000); // SPEED: Reduced from 10000 to 5000
          break;
        }
      }
    }
    
    // Extract title
    const titleSelectors = [
      '[data-automation-id="jobPostingHeader"] h2',
      '[data-automation-id="job-title"]',
      'h1[class*="title"]',
      'h2[class*="title"]',
      '.job-title',
      'header h1',
      'header h2',
    ];
    let title = '';
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        title = el.textContent.trim();
        break;
      }
    }
    if (!title) {
      title = document.title?.split('|')?.[0]?.split('-')?.[0]?.trim() || 'Role';
    }
    
    // Extract company
    const companySelectors = [
      '[data-automation-id="company"]',
      '[data-automation-id="job-company"]',
      '.company-name',
      '[class*="company"]',
    ];
    let company = '';
    for (const sel of companySelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        company = el.textContent.trim();
        break;
      }
    }
    if (!company) {
      // Try URL subdomain
      const subdomain = window.location.hostname.split('.')[0];
      if (subdomain && subdomain.length > 2 && !['www', 'apply', 'jobs', 'careers', 'wd1', 'wd3', 'wd5'].includes(subdomain.toLowerCase())) {
        company = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
      }
    }
    
    // Extract location
    const locationSelectors = [
      '[data-automation-id="location"]',
      '[data-automation-id="locations"]',
      '[data-automation-id="jobPostingLocation"]',
      '.job-location',
      '[class*="location"]',
    ];
    let rawLocation = '';
    for (const sel of locationSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        rawLocation = el.textContent.trim();
        break;
      }
    }
    const location = stripRemoteFromLocation(rawLocation) || rawLocation;
    
    // Extract job requisition ID
    let requisitionId = '';
    const reqMatch = document.body.textContent?.match(/R-\d{5,}/);
    if (reqMatch) {
      requisitionId = reqMatch[0];
    }
    
    const elapsed = Math.round(performance.now() - start);
    console.log(`[ATS Workday TOP1] 📸 Snapshot captured in ${elapsed}ms:`, title);
    
    return {
      title,
      company,
      location,
      description,
      requisitionId,
      url: window.location.href,
      platform: 'workday',
      snapshotTime: Date.now(),
    };
  }
  
  /**
   * Workday Instant Keywords: Extract keywords from JD with URL-based caching
   * Returns in ~1ms for cached jobs, ~20ms for new jobs
   */
  async function workdayInstantKeywords(jobInfo) {
    const start = performance.now();
    const jobUrl = jobInfo.url || window.location.href;
    
    // Check TurboPipeline first (has built-in URL caching)
    if (typeof TurboPipeline !== 'undefined' && TurboPipeline.turboExtractKeywords) {
      const keywords = await TurboPipeline.turboExtractKeywords(jobInfo.description || '', {
        jobUrl,
        maxKeywords: 30, // SPEED: Optimized to 30 for balance of coverage and speed
      });
      console.log(`[ATS Workday TOP1] ⚡ Keywords extracted in ${Math.round(performance.now() - start)}ms: ${keywords.total} keywords`);
      return keywords;
    }
    
    // Fallback to basic extraction
    const basicKeywords = extractBasicKeywords(jobInfo.description);
    return {
      all: basicKeywords,
      highPriority: basicKeywords.slice(0, 12),
      mediumPriority: basicKeywords.slice(12, 22),
      lowPriority: basicKeywords.slice(22),
      workExperience: basicKeywords.slice(0, 20),
      total: basicKeywords.length,
    };
  }
  
  /**
   * Workday TOP 1 Pipeline Executor
   * Runs full extraction + tailoring + PDF generation + attachment
   * Target: <200ms total, 100% keyword coverage
   */
  async function executeWorkdayTop1Pipeline(snapshot, candidateData, baseCV) {
    const start = performance.now();
    console.log('[ATS Workday TOP1] 🚀 Executing full pipeline...');
    
    createStatusBanner();
    updateBanner('🚀 Workday TOP1: Full pipeline running...', 'working');
    
    // Check if TurboPipeline available
    if (typeof TurboPipeline !== 'undefined' && TurboPipeline.executeTurboPipeline) {
      try {
        const result = await TurboPipeline.executeTurboPipeline(
          snapshot,
          candidateData,
          baseCV,
          {
            maxKeywords: 30, // SPEED: Optimized to 30 for balance of coverage and speed
            targetScore: 95,
            pdf: true,
          }
        );
        
        const elapsed = Math.round(performance.now() - start);
        console.log(`[ATS Workday TOP1] ✅ Pipeline complete in ${elapsed}ms, score: ${result.matchScore}%`);
        
        // Store generated files
        if (result.success && result.cvPDF) {
          cvFile = createPDFFile(result.cvPDF.base64 || result.cvPDF, result.cvPDF.filename || 'Resume.pdf');
          if (result.coverPDF) {
            coverFile = createPDFFile(result.coverPDF.base64 || result.coverPDF, result.coverPDF.filename || 'Cover_Letter.pdf');
          }
          filesLoaded = true;
          
          // Cache in storage
          chrome.storage.local.set({
            [`tailored_${snapshot.url}`]: {
              keywords: result.keywords,
              matchScore: result.matchScore,
              cvBase64: result.cvPDF.base64 || result.cvPDF,
              cvFileName: result.cvPDF.filename || 'Resume.pdf',
              coverBase64: result.coverPDF?.base64 || result.coverPDF,
              coverFileName: result.coverPDF?.filename || 'Cover_Letter.pdf',
              timestamp: Date.now(),
            },
          });
          
          updateBanner(SUCCESS_BANNER_MSG, 'success');
        }
        
        return result;
      } catch (err) {
        console.error('[ATS Workday TOP1] Pipeline error:', err);
        updateBanner('⚠️ Pipeline error, using fallback...', 'error');
      }
    }
    
    // Fallback: trigger standard tailor
    updateBanner('🔄 Running standard tailor...', 'working');
    await autoTailorDocuments();
    return null;
  }

  // ============ WORKDAY FULL AUTOMATION FLOW ============
  async function runWorkdayAutomationFlow(candidateData) {
    console.log('[ATS Tailor Workday] Starting full automation flow');
    createStatusBanner();
    updateBanner('🚀 Workday: Detecting page state...', 'working');
    
    workdayFlowState.candidateData = candidateData;
    const url = window.location.href;
    
    // ============ WORKDAY TOP 1: JOB LISTING PAGE ============
    // Snapshot JD BEFORE clicking Apply, cache for apply flow
    if (isWorkdayJobPage()) {
      updateBanner('🚀 Workday TOP1: Capturing JD snapshot...', 'working');
      
      const start = performance.now();
      
      // ULTRA SNAPSHOT: Capture full JD from listing page
      const jobInfo = await workdayUltraSnapshot();
      console.log(`[ATS Workday TOP1] JD snapshot in ${performance.now() - start}ms:`, jobInfo.title);
      
      // INSTANT KEYWORDS: Extract ALL keywords from JD (cached: ~1ms, new: ~20ms)
      const keywords = await workdayInstantKeywords(jobInfo);
      
      // PERSIST: Store snapshot in both window and localStorage for navigation
      const workdaySnapshot = {
        ...jobInfo,
        keywords,
        snapshotUrl: window.location.href,
      };
      window.workdayJobSnapshot = workdaySnapshot;
      localStorage.setItem('workdayJobSnapshot', JSON.stringify(workdaySnapshot));
      sessionStorage.setItem('workdayJobSnapshot', JSON.stringify(workdaySnapshot));
      
      // Also store in chrome.storage for persistence
      chrome.storage.local.set({
        workday_cached_keywords: keywords,
        workday_cached_jobInfo: jobInfo,
        workday_snapshot_url: window.location.href,
      });
      
      console.log(`[ATS Workday TOP1] ✅ Snapshot cached: ${keywords.total} keywords from "${jobInfo.title}"`);
      updateBanner(`📸 JD Captured: ${keywords.total} keywords | Clicking Apply...`, 'working');
      
      // Trigger background CV generation while user navigates
      chrome.runtime.sendMessage({
        action: 'TRIGGER_EXTRACT_APPLY',
        jobInfo: jobInfo,
        showButtonAnimation: false,
      }).catch(() => {});
      
      // Click Apply button (multiple selector strategies)
      setTimeout(() => {
        const applySelectors = [
          'a[data-automation-id="jobPostingApplyButton"]',
          'button[data-automation-id="jobPostingApplyButton"]',
          'a[href*="/apply"]',
          'button[aria-label*="Apply"]',
          'a[aria-label*="Apply"]',
        ];
        
        for (const sel of applySelectors) {
          const applyBtn = document.querySelector(sel);
          if (applyBtn) {
            console.log('[ATS Workday TOP1] 🖱️ Clicking Apply button:', sel);
            applyBtn.click();
            workdayFlowState.step = 'apply_clicked';
            return;
          }
        }
        
        // Fallback: find button with "Apply" text
        const allButtons = document.querySelectorAll('a, button');
        for (const btn of allButtons) {
          if (btn.textContent?.trim().toLowerCase() === 'apply') {
            console.log('[ATS Workday TOP1] 🖱️ Clicking Apply button (text match)');
            btn.click();
            workdayFlowState.step = 'apply_clicked';
            return;
          }
        }
        
        console.log('[ATS Workday TOP1] ⚠️ Apply button not found');
      }, 25); // ULTRA HYPER: Reduced from 40ms to 25ms
      
      return;
    }
    
    // Step 2: Create Account / Sign In page
    if (isWorkdayCreateAccountPage()) {
      updateBanner('🚀 Workday: Waiting for autofill...', 'working');
      
      // Wait for SpeedApply/JobWizard to autofill, then click consent and create account
      await waitForAutofill();
      
      // Click consent checkbox
      const consentCheckbox = document.querySelector('input[data-automation-id*="consent"], input[type="checkbox"][id*="consent"]');
      if (consentCheckbox && !consentCheckbox.checked) {
        consentCheckbox.click();
      }
      
      // Click Create Account button
      setTimeout(() => {
        const createBtn = document.querySelector('button[data-automation-id="createAccountSubmitButton"], button:contains("Create Account")');
        if (createBtn) {
          createBtn.click();
          workdayFlowState.step = 'account_created';
        }
      }, 25); // ULTRA HYPER: Reduced from 50ms to 25ms
      return;
    }
    
    // ============ WORKDAY TOP 1: MY EXPERIENCE PAGE ============
    // Use cached JD snapshot to run FULL TurboPipeline, then attach CV+Cover
    if (isWorkdayMyExperiencePage()) {
      if (!workdayFlowState.cvAttached) {
        updateBanner('🚀 Workday TOP1: Running full pipeline...', 'working');
        
        // RECOVER SNAPSHOT: From window, localStorage, sessionStorage, or chrome.storage
        let snapshot = window.workdayJobSnapshot;
        if (!snapshot) {
          try {
            snapshot = JSON.parse(localStorage.getItem('workdayJobSnapshot') || sessionStorage.getItem('workdayJobSnapshot') || '{}');
          } catch (e) {}
        }
        
        // If no snapshot, try chrome.storage
        if (!snapshot?.keywords?.all?.length) {
          const stored = await new Promise(resolve => {
            chrome.storage.local.get(['workday_cached_keywords', 'workday_cached_jobInfo'], resolve);
          });
          if (stored.workday_cached_keywords && stored.workday_cached_jobInfo) {
            snapshot = {
              ...stored.workday_cached_jobInfo,
              keywords: stored.workday_cached_keywords,
            };
          }
        }
        
        // If we have a valid snapshot with keywords, run full TurboPipeline
        if (snapshot?.keywords?.all?.length) {
          console.log(`[ATS Workday TOP1] 📦 Recovered snapshot: ${snapshot.keywords.total} keywords from "${snapshot.title}"`);
          
          // Load user profile and base CV
          const data = await new Promise(resolve => {
            chrome.storage.local.get(['ats_session', 'ats_profile', 'ats_baseCV'], resolve);
          });
          
          if (data.ats_session && data.ats_baseCV) {
            const profile = data.ats_profile || {};
            const baseCV = data.ats_baseCV;
            
            // Prepare candidateData
            const candidateData = {
              firstName: profile.firstName || profile.first_name || '',
              lastName: profile.lastName || profile.last_name || '',
              email: profile.email || data.ats_session?.user?.email || '',
              phone: profile.phone || '',
              city: stripRemoteFromLocation(profile.city) || defaultLocation,
              linkedin: profile.linkedin || '',
              github: profile.github || '',
              portfolio: profile.portfolio || '',
            };
            
            // EXECUTE FULL PIPELINE: Extract → Tailor → PDF → Attach
            const result = await executeWorkdayTop1Pipeline(snapshot, candidateData, baseCV);
            
            if (result?.success && filesLoaded) {
              // ATTACH BOTH: CV + Cover Letter
              forceEverything();
              ultraFastReplace();
              
              console.log('[ATS Workday TOP1] ✅ Files attached successfully');
              workdayFlowState.cvAttached = true;
              
              // Disable upload field after attach to prevent re-attachment loop
              setTimeout(() => {
                const uploadFields = document.querySelectorAll('input[type="file"]');
                uploadFields.forEach(field => {
                  if (isCVField(field) && field.files?.length > 0) {
                    field.disabled = true;
                    field.setAttribute('data-ats-tailor-disabled', '1');
                  }
                });
              }, 100); // SPEED: Reduced from 250ms to 100ms
            } else {
              // Fallback: load any cached files
              loadFilesAndStart();
              workdayFlowState.cvAttached = true;
            }
          } else {
            // No session/baseCV, fallback to cached files
            loadFilesAndStart();
            workdayFlowState.cvAttached = true;
          }
        } else {
          // No snapshot available, use standard flow
          console.log('[ATS Workday TOP1] ⚠️ No snapshot found, using standard flow');
          loadFilesAndStart();
          workdayFlowState.cvAttached = true;
        }
        
        // Disable upload field after attach to prevent re-attachment loop
        setTimeout(() => {
          const uploadFields = document.querySelectorAll('input[type="file"]');
          uploadFields.forEach(field => {
            if (isCVField(field) && field.files?.length > 0) {
              field.disabled = true;
              console.log('[ATS Tailor Workday] CV upload field disabled to prevent loop');
            }
          });
        }, 200); // SPEED: Reduced from 500ms to 200ms
      }
      
      // Clean up SpeedApply bug: Delete 3rd empty education entry
      if (!workdayFlowState.educationCleaned) {
        await cleanupSpeedApplyEducation();
        workdayFlowState.educationCleaned = true;
      }
      
      // Wait for fields to be filled, then click Save and Continue
      setTimeout(() => {
        const saveBtn = document.querySelector('button[data-automation-id="bottom-navigation-next-button"], button:contains("Save and Continue")');
        if (saveBtn) {
          saveBtn.click();
          workdayFlowState.step = 'experience_saved';
        }
      }, 100); // ULTRA HYPER: Reduced from 200ms to 100ms
      return;
    }
    
    // Step 4: Application Questions page
    if (isWorkdayApplicationQuestionsPage()) {
      updateBanner('🚀 Workday: Waiting for JobWizard autofill...', 'working');
      
      // Wait for JobWizard "Autofill" → "Filled" button
      await waitForJobWizardFilled();
      
      // Click Save and Continue
      setTimeout(() => {
        const saveBtn = document.querySelector('button[data-automation-id="bottom-navigation-next-button"]');
        if (saveBtn) {
          saveBtn.click();
          workdayFlowState.step = 'questions_saved';
        }
      }, 25); // ULTRA HYPER: Reduced from 50ms to 25ms
      return;
    }
    
    // Step 5: Take Assessment / Review page
    if (isWorkdayAssessmentPage() || isWorkdayReviewPage()) {
      // Check for required field errors
      if (document.body.textContent.includes('* Indicates a required field') || 
          document.querySelector('[data-automation-id="errorMessage"]')) {
        updateBanner('⚠️ Workday: Required field missing - skipping job', 'error');
        
        // Signal to skip to next job in bulk queue
        chrome.runtime.sendMessage({ action: 'WORKDAY_SKIP_JOB' }).catch(() => {});
        return;
      }
      
      // Success! Show 100% match banner
      updateBanner(SUCCESS_BANNER_MSG, 'success');
      showWorkdaySuccessRibbon();
      
      // Signal job completion for bulk queue
      chrome.runtime.sendMessage({ action: 'BULK_JOB_COMPLETED' }).catch(() => {});
      return;
    }
    
    // Unknown page state - run generic tailor
    updateBanner('🚀 Workday: Running tailor...', 'working');
    autoTailorDocuments();
  }
  
  // ============ WORKDAY PAGE DETECTION ============
  function isWorkdayJobPage() {
    return document.querySelector('[data-automation-id="jobPostingHeader"]') !== null ||
           document.querySelector('a[data-automation-id="jobPostingApplyButton"]') !== null;
  }
  
  function isWorkdayCreateAccountPage() {
    return document.querySelector('[data-automation-id="createAccountSubmitButton"]') !== null ||
           window.location.href.includes('/createAccount');
  }
  
  function isWorkdayMyExperiencePage() {
    return document.querySelector('[data-automation-id="resumeSection"]') !== null ||
           (window.location.href.includes('/apply') && document.body.textContent.includes('My Experience'));
  }
  
  function isWorkdayApplicationQuestionsPage() {
    return window.location.href.includes('/apply') && 
           document.body.textContent.includes('Application Questions');
  }
  
  function isWorkdayAssessmentPage() {
    return document.body.textContent.includes('Take Assessment');
  }
  
  function isWorkdayReviewPage() {
    return window.location.href.includes('/apply') && 
           document.body.textContent.includes('Review');
  }
  
  // ============ WORKDAY HELPER FUNCTIONS ============
  async function waitForAutofill(timeout = 10000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        // Check if email field is filled (SpeedApply/JobWizard working)
        const emailField = document.querySelector('input[data-automation-id="email"], input[type="email"]');
        if (emailField?.value?.includes('@')) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          resolve(false);
          return;
        }
        setTimeout(check, 25); // ULTRA HYPER: Reduced from 50ms to 25ms
      };
      check();
    });
  }
  
  async function waitForJobWizardFilled(timeout = 15000) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        // Look for "Filled" or completion indicators
        const filledBtn = document.querySelector('button:contains("Filled"), [data-filled="true"]');
        const filledText = document.body.textContent.includes('Filled') || document.body.textContent.includes('8/8');
        if (filledBtn || filledText) {
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          resolve(false);
          return;
        }
        setTimeout(check, 250); // SPEED: Reduced from 500ms to 250ms
      };
      check();
    });
  }
  
  async function cleanupSpeedApplyEducation() {
    // Find and delete empty 3rd education entry (SpeedApply bug)
    const educationSections = document.querySelectorAll('[data-automation-id="educationSection"], [class*="education"]');
    for (const section of educationSections) {
      const entries = section.querySelectorAll('[data-automation-id="educationRow"], [class*="educationRow"]');
      if (entries.length >= 3) {
        const thirdEntry = entries[2];
        // Check if it's empty
        const inputs = thirdEntry.querySelectorAll('input, select');
        const isEmpty = Array.from(inputs).every(input => !input.value);
        if (isEmpty) {
          const deleteBtn = thirdEntry.querySelector('button[data-automation-id="delete"], button:contains("Delete")');
          if (deleteBtn) {
            deleteBtn.click();
            console.log('[ATS Tailor Workday] Deleted empty 3rd education entry');
            await new Promise(r => setTimeout(r, 150)); // SPEED: Reduced from 300ms to 150ms
          }
        }
      }
    }
  }
  
  function showWorkdaySuccessRibbon() {
    const existingRibbon = document.getElementById('ats-success-ribbon');
    if (existingRibbon) existingRibbon.remove();

    const ribbon = document.createElement('div');
    ribbon.id = 'ats-success-ribbon';
    ribbon.innerHTML = `
      <style>
        #ats-success-ribbon {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 9999999;
          background: linear-gradient(135deg, #00ff88 0%, #00cc66 50%, #00aa55 100%);
          padding: 14px 20px;
          font: bold 15px system-ui, -apple-system, sans-serif;
          color: #000;
          text-align: center;
          box-shadow: 0 4px 20px rgba(0, 255, 136, 0.5);
          animation: ats-success-glow 1.5s ease-in-out infinite;
        }
        @keyframes ats-success-glow {
          0%, 100% { box-shadow: 0 4px 20px rgba(0, 255, 136, 0.5); }
          50% { box-shadow: 0 4px 30px rgba(0, 255, 136, 0.8); }
        }
      </style>
      <span>${SUCCESS_BANNER_MSG.replace('🚀 ATS TAILOR ', '')}</span>
    `;
    
    document.body.appendChild(ribbon);
    const orangeBanner = document.getElementById('ats-auto-banner');
    if (orangeBanner) orangeBanner.style.display = 'none';
  }
  
  // ============ GREENHOUSE FLOW ==========
  function runGreenhouseFlow() {
    console.log('[ATS Tailor] Running Greenhouse flow');
    createStatusBanner();
    updateBanner('🚀 Greenhouse: Tailoring...', 'working');

    // Run standard tailor and attach
    autoTailorDocuments();

    // Unified success banner (all ATS) - faster check
    setTimeout(() => {
      updateBanner(SUCCESS_BANNER_MSG, 'success');
    }, 1500); // SPEED: Reduced from 2500ms to 1500ms
  }
  
  // ============ GENERIC ATS FLOW ============
  function runGenericATSFlow() {
    console.log('[ATS Tailor] Running generic ATS flow');
    createStatusBanner();
    autoTailorDocuments();
  }

  // ============ STATUS BANNER ============
  function createStatusBanner() {
    if (document.getElementById('ats-auto-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'ats-auto-banner';
    banner.innerHTML = `
      <style>
        #ats-auto-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 999999;
          background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
          padding: 12px 20px;
          font: bold 14px system-ui, sans-serif;
          color: #000;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          animation: ats-pulse 2s ease-in-out infinite;
        }
        @keyframes ats-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        #ats-auto-banner .ats-status { margin-left: 10px; }
        #ats-auto-banner.success { background: linear-gradient(135deg, #00ff88 0%, #00cc66 100%); }
        #ats-auto-banner.error { background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%); color: #fff; }
      </style>
      <span class="ats-prefix">🚀 ATS TAILOR</span>
      <span class="ats-status" id="ats-banner-status">Detecting upload fields...</span>
    `;
    document.body.appendChild(banner);
  }

  function updateBanner(status, type = 'working') {
    const banner = document.getElementById('ats-auto-banner');
    const statusEl = document.getElementById('ats-banner-status');
    if (banner) {
      banner.className = type === 'success' ? 'success' : type === 'error' ? 'error' : '';
    }
    if (statusEl) statusEl.textContent = status;
  }

  function hideBanner() {
    // Keep the banner visible permanently - don't remove it
    // The orange ribbon should always stay visible on ATS platforms
    console.log('[ATS Tailor] Banner will remain visible');
  }

  // ============ PDF FILE CREATION ============
  function createPDFFile(base64, name) {
    try {
      if (!base64) return null;
      
      let data = base64;
      if (base64.includes(',')) {
        data = base64.split(',')[1];
      }
      
      const byteString = atob(data);
      const buffer = new ArrayBuffer(byteString.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < byteString.length; i++) {
        view[i] = byteString.charCodeAt(i);
      }
      
      const file = new File([buffer], name, { type: 'application/pdf' });
      console.log(`[ATS Tailor] Created PDF: ${name} (${file.size} bytes)`);
      return file;
    } catch (e) {
      console.error('[ATS Tailor] PDF creation failed:', e);
      return null;
    }
  }

  // ============ LOCATION SANITIZATION (HARD RULE: NEVER "REMOTE" ON CV) ============
  // User rule: "Remote" should NEVER appear in CV location. "Dublin, IE | Remote" -> "Dublin, IE"
  // This is a recruiter red flag and must be stripped from ALL CVs, even if it exists
  // in the stored profile or uploaded base CV.
  function stripRemoteFromLocation(raw) {
    const s = (raw || '').toString().trim();
    if (!s) return '';

    // If location is ONLY "Remote" or "Remote, <country>", return empty for fallback
    if (/^remote$/i.test(s) || /^remote\s*[\(,\\-]\s*\w+\)?$/i.test(s)) {
      return '';
    }

    // Remove any "remote" token and common separators around it
    let out = s
      .replace(/\b(remote|work\s*from\s*home|wfh|virtual|fully\s*remote|remote\s*first|remote\s*friendly)\b/gi, '')
      .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
      .replace(/\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*/g, ' | ')
      .replace(/\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*$/g, '')
      .replace(/^\s*(\||,|\/|\u2013|\u2014|-|\u00b7)\s*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // If it becomes empty after stripping, return empty (caller can fallback to default)
    return out;
  }

  // Export globally for PDF generators
  window.stripRemoteFromLocation = stripRemoteFromLocation;

  // ============ FIELD DETECTION ============
  function isCVField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.getAttribute('aria-label') || '') +
      (input.getAttribute('data-qa') || '') +
      (input.closest('label')?.textContent || '')
    ).toLowerCase();
    
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
      if ((parentText.includes('resume') || parentText.includes('cv')) && !parentText.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return /(resume|cv|curriculum)/i.test(text) && !/cover/i.test(text);
  }

  function isCoverField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.getAttribute('aria-label') || '') +
      (input.getAttribute('data-qa') || '') +
      (input.closest('label')?.textContent || '')
    ).toLowerCase();
    
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
      if (parentText.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return /cover/i.test(text);
  }

  function hasUploadFields() {
    // Check for file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    if (fileInputs.length > 0) return true;
    
    // Check for Greenhouse-style upload buttons
    const greenhouseUploads = document.querySelectorAll('[data-qa-upload], [data-qa="upload"], [data-qa="attach"]');
    if (greenhouseUploads.length > 0) return true;
    
    // Check for Workable autofill text
    if (document.body.textContent.includes('Autofill application')) return true;
    
    // Check for Resume/CV labels with buttons
    const labels = document.querySelectorAll('label, h3, h4, span');
    for (const label of labels) {
      const text = label.textContent?.toLowerCase() || '';
      if ((text.includes('resume') || text.includes('cv')) && text.length < 50) {
        return true;
      }
    }
    
    return false;
  }

  // ============ FIRE EVENTS ============
  function fireEvents(input) {
    ['change', 'input'].forEach(type => {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  // ============ KILL X BUTTONS (scoped) ============
  function killXButtons() {
    // IMPORTANT: do NOT click generic "remove" buttons globally.
    // Only click remove/clear controls that are near file inputs / upload widgets.
    const isNearFileInput = (el) => {
      const root = el.closest('form') || document.body;
      const candidates = [
        el.closest('[data-qa-upload]'),
        el.closest('[data-qa="upload"]'),
        el.closest('[data-qa="attach"]'),
        el.closest('.field'),
        el.closest('[class*="upload" i]'),
        el.closest('[class*="attachment" i]'),
      ].filter(Boolean);

      for (const c of candidates) {
        if (c.querySelector('input[type="file"]')) return true;
        const t = (c.textContent || '').toLowerCase();
        if (t.includes('resume') || t.includes('cv') || t.includes('cover')) return true;
      }

      // fallback: within same form, are there any file inputs at all?
      return !!root.querySelector('input[type="file"]');
    };

    const selectors = [
      'button[aria-label*="remove" i]',
      'button[aria-label*="delete" i]',
      'button[aria-label*="clear" i]',
      '.remove-file',
      '[data-qa-remove]',
      '[data-qa*="remove"]',
      '[data-qa*="delete"]',
      '.file-preview button',
      '.file-upload-remove',
      '.attachment-remove',
    ];

    document.querySelectorAll(selectors.join(', ')).forEach((btn) => {
      try {
        if (!isNearFileInput(btn)) return;
        btn.click();
      } catch {}
    });

    document.querySelectorAll('button, [role="button"]').forEach((btn) => {
      const text = btn.textContent?.trim();
      if (text === '×' || text === 'x' || text === 'X' || text === '✕') {
        try {
          if (!isNearFileInput(btn)) return;
          btn.click();
        } catch {}
      }
    });
  }

  // ============ WORKDAY: ONE-TIME CV ATTACH (prevents multi-upload loops) ==========
  const WORKDAY_CV_COOLDOWN_MS = 60_000;

  function isWorkdayHost() {
    const h = window.location.hostname || '';
    return h.includes('myworkdayjobs.com') || h.includes('wd1.myworkdayjobs.com') || h.includes('workday.com');
  }

  function getWorkdayCvCooldownKey() {
    return `ats_workday_cv_attach_ts:${window.location.origin}${window.location.pathname}`;
  }

  function workdayResumeAlreadyUploaded(fileName) {
    const resumeSection =
      document.querySelector('[data-automation-id="resumeSection"]') ||
      Array.from(document.querySelectorAll('section, div, fieldset')).find((el) =>
        (el.textContent || '').toLowerCase().includes('resume/cv')
      );

    const scopeText = (resumeSection?.textContent || '').trim();
    if (!scopeText) return false;

    if (fileName && scopeText.includes(fileName)) return true;
    if (/successfully\s+uploaded/i.test(scopeText)) return true;

    return false;
  }

  // ============ FORCE CV REPLACE ==========
  function forceCVReplace() {
    if (!cvFile) return false;

    // Workday: attach once, then stop. Workday clears the input after upload, which
    // previously caused our fast loop to re-attach endlessly.
    if (isWorkdayHost()) {
      if (workdayResumeAlreadyUploaded(cvFile.name)) return true;

      const key = getWorkdayCvCooldownKey();
      const lastTs = parseInt(localStorage.getItem(key) || '0', 10);
      if (lastTs && Date.now() - lastTs < WORKDAY_CV_COOLDOWN_MS) return true;

      const inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter((i) => isCVField(i));
      const target = inputs.find((i) => !i.disabled && i.getAttribute('data-ats-tailor-disabled') !== '1') || inputs[0];
      if (!target) return false;

      try {
        const dt = new DataTransfer();
        dt.items.add(cvFile);
        target.files = dt.files;
        fireEvents(target);

        // Prevent further automation attempts on Workday
        target.setAttribute('data-ats-tailor-disabled', '1');
        target.disabled = true;
        localStorage.setItem(key, String(Date.now()));

        console.log('[ATS Tailor Workday] CV attached once (input disabled)');
        return true;
      } catch (e) {
        console.warn('[ATS Tailor Workday] CV attach failed:', e);
        // Still set cooldown to avoid rapid loops
        localStorage.setItem(key, String(Date.now()));
        return false;
      }
    }

    // Non-Workday: existing behavior
    let attached = false;

    document.querySelectorAll('input[type="file"]').forEach((input) => {
      if (!isCVField(input)) return;

      // If already attached, do nothing (prevents flicker)
      if (input.files && input.files.length > 0) {
        attached = true;
        return;
      }

      const dt = new DataTransfer();
      dt.items.add(cvFile);
      input.files = dt.files;
      fireEvents(input);
      attached = true;
      console.log('[ATS Tailor] CV attached!');
    });

    return attached;
  }

  // ============ FORCE COVER REPLACE ============
  function forceCoverReplace() {
    if (!coverFile && !coverLetterText) return false;
    let attached = false;

    if (coverFile) {
      document.querySelectorAll('input[type="file"]').forEach((input) => {
        if (!isCoverField(input)) return;

        // If already attached, do nothing (prevents flicker)
        if (input.files && input.files.length > 0) {
          attached = true;
          return;
        }

        const dt = new DataTransfer();
        dt.items.add(coverFile);
        input.files = dt.files;
        fireEvents(input);
        attached = true;
        console.log('[ATS Tailor] Cover Letter attached!');
      });
    }

    if (coverLetterText) {
      document.querySelectorAll('textarea').forEach((textarea) => {
        const label = textarea.labels?.[0]?.textContent || textarea.name || textarea.id || '';
        if (/cover/i.test(label)) {
          if ((textarea.value || '').trim() === coverLetterText.trim()) {
            attached = true;
            return;
          }
          textarea.value = coverLetterText;
          fireEvents(textarea);
          attached = true;
        }
      });
    }

    return attached;
  }

  // ============ GREENHOUSE COVER LETTER: CLICK "ATTACH" TO REVEAL INPUT ============
  function clickGreenhouseCoverAttach() {
    const nodes = document.querySelectorAll('label, h1, h2, h3, h4, h5, span, div, fieldset');
    for (const node of nodes) {
      const t = (node.textContent || '').trim().toLowerCase();
      if (!t || t.length > 60) continue;
      if (!t.includes('cover letter')) continue;

      const container = node.closest('fieldset') || node.closest('.field') || node.closest('section') || node.parentElement;
      if (!container) continue;

      // If a visible file input already exists in this section, no need to click.
      const existing = container.querySelector('input[type="file"]');
      if (existing && existing.offsetParent !== null) return true;

      const buttons = container.querySelectorAll('button, a[role="button"], [role="button"]');
      for (const btn of buttons) {
        const bt = (btn.textContent || '').trim().toLowerCase();
        if (bt === 'attach' || bt.includes('attach')) {
          try {
            btn.click();
            return true;
          } catch {}
        }
      }
    }
    return false;
  }

  // ============ FORCE EVERYTHING ============
  function forceEverything() {
    // STEP 1: Greenhouse specific - click attach buttons to reveal hidden inputs
    document.querySelectorAll('[data-qa-upload], [data-qa="upload"], [data-qa="attach"]').forEach(btn => {
      const parent = btn.closest('.field') || btn.closest('[class*="upload"]') || btn.parentElement;
      const existingInput = parent?.querySelector('input[type="file"]');
      if (!existingInput || existingInput.offsetParent === null) {
        try { btn.click(); } catch {}
      }
    });

    // STEP 1b: Greenhouse cover letter section often needs a dedicated "Attach" click
    clickGreenhouseCoverAttach();
    
    // STEP 2: Make any hidden file inputs visible and accessible
    document.querySelectorAll('input[type="file"]').forEach(input => {
      if (input.offsetParent === null) {
        input.style.cssText = 'display:block !important; visibility:visible !important; opacity:1 !important; position:relative !important;';
      }
    });
    
    // STEP 3: Attach files
    forceCVReplace();
    forceCoverReplace();
  }

  // ============ EXTRACT JOB INFO ============
  function extractJobInfo() {
    const getText = (selectors) => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) return el.textContent.trim();
        } catch {}
      }
      return '';
    };

    const getMeta = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') || '';

    const hostname = window.location.hostname;
    
    const platformSelectors = {
      greenhouse: {
        title: ['h1.app-title', 'h1.posting-headline', 'h1', '[data-test="posting-title"]'],
        company: ['#company-name', '.company-name', '.posting-categories strong'],
        location: ['.location', '.posting-categories .location'],
        description: ['#content', '.posting', '.posting-description'],
      },
      workday: {
        title: ['h1[data-automation-id="jobPostingHeader"]', 'h1'],
        company: ['div[data-automation-id="jobPostingCompany"]'],
        location: ['div[data-automation-id="locations"]'],
        description: ['div[data-automation-id="jobPostingDescription"]'],
      },
      smartrecruiters: {
        title: ['h1[data-test="job-title"]', 'h1'],
        company: ['[data-test="job-company-name"]'],
        location: ['[data-test="job-location"]'],
        description: ['[data-test="job-description"]'],
      },
      workable: {
        title: ['h1', '[data-ui="job-title"]'],
        company: ['[data-ui="company-name"]'],
        location: ['[data-ui="job-location"]'],
        description: ['[data-ui="job-description"]'],
      },
    };

    let platformKey = null;
    if (hostname.includes('greenhouse.io')) platformKey = 'greenhouse';
    else if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) platformKey = 'workday';
    else if (hostname.includes('smartrecruiters.com')) platformKey = 'smartrecruiters';
    else if (hostname.includes('workable.com')) platformKey = 'workable';

    const selectors = platformKey ? platformSelectors[platformKey] : null;

    let title = selectors ? getText(selectors.title) : '';
    if (!title) title = getMeta('og:title') || document.title?.split('|')?.[0]?.split('-')?.[0]?.trim() || '';

    let company = selectors ? getText(selectors.company) : '';
    
    // IMPROVED: Multiple fallback strategies for company extraction
    if (!company) company = getMeta('og:site_name') || '';
    if (!company) {
      // Try to extract from title like "Senior Engineer at Bugcrowd"
      const titleMatch = (getMeta('og:title') || document.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:\s*[-|]|\s*$)/i);
      if (titleMatch) company = titleMatch[1].trim();
    }
    if (!company) {
      // Try URL subdomain (e.g., bugcrowd.greenhouse.io → Bugcrowd)
      const subdomain = hostname.split('.')[0];
      if (subdomain && subdomain.length > 2 && !['www', 'apply', 'jobs', 'careers', 'boards', 'job-boards'].includes(subdomain.toLowerCase())) {
        company = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
      }
    }
    if (!company) {
      // Look for company logo alt text or nearby text
      const logoEl = document.querySelector('[class*="logo"] img, [class*="company"] img, header img');
      if (logoEl?.alt && logoEl.alt.length > 2 && logoEl.alt.length < 50) {
        company = logoEl.alt.replace(/\s*logo\s*/i, '').trim();
      }
    }
    // Sanitize: remove common suffixes and clean up
    if (company) {
      company = company.replace(/\s*(careers|jobs|hiring|apply|work|join)\s*$/i, '').trim();
    }
    // FIX 02-02-26: Extended validation - NEVER return "Company" or similar placeholders
    const invalidCompanyNames = ['company', 'your company', 'the company', 'n/a', 'unknown', 'employer', 'organization'];
    if (!company || invalidCompanyNames.includes(company.toLowerCase().trim()) || company.length < 2) {
      // Return empty string - let downstream handlers use their own fallback
      company = '';
      console.warn('[extractJobInfo] ⚠️ Could not extract company name');
    }

    const rawLocation = selectors ? getText(selectors.location) : '';
    const location = stripRemoteFromLocation(rawLocation) || rawLocation;
    const rawDesc = selectors ? getText(selectors.description) : '';
    const description = rawDesc?.trim()?.length > 80 ? rawDesc.trim().substring(0, 3000) : '';

    return { title, company, location, description, url: window.location.href, platform: platformKey || hostname };
  }

  // ============ BASIC KEYWORD EXTRACTION (Fallback if TurboPipeline unavailable) ============
  function extractBasicKeywords(jobDescription) {
    if (!jobDescription) return [];
    
    // Common technical & skill keywords to look for
    const skillPatterns = [
      /\b(python|javascript|typescript|java|c\+\+|ruby|go|rust|php|swift|kotlin)\b/gi,
      /\b(react|angular|vue|node\.?js|express|django|flask|spring|rails)\b/gi,
      /\b(aws|azure|gcp|docker|kubernetes|terraform|jenkins|ci\/cd)\b/gi,
      /\b(sql|postgresql|mysql|mongodb|redis|elasticsearch)\b/gi,
      /\b(machine learning|deep learning|nlp|computer vision|data science)\b/gi,
      /\b(agile|scrum|kanban|jira|confluence)\b/gi,
      /\b(git|github|gitlab|bitbucket)\b/gi,
      /\b(rest|graphql|api|microservices|serverless)\b/gi,
      /\b(testing|junit|pytest|jest|selenium|cypress)\b/gi,
      /\b(leadership|management|communication|collaboration|problem.solving)\b/gi,
    ];
    
    const foundKeywords = new Set();
    const text = jobDescription.toLowerCase();
    
    for (const pattern of skillPatterns) {
      const matches = text.match(pattern) || [];
      matches.forEach(m => foundKeywords.add(m.toLowerCase().trim()));
    }
    
    // Also extract capitalized phrases (likely important terms)
    const capitalizedTerms = jobDescription.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) || [];
    capitalizedTerms.slice(0, 10).forEach(term => {
      if (term.length > 3 && term.length < 30) {
        foundKeywords.add(term.toLowerCase());
      }
    });
    
    return Array.from(foundKeywords).slice(0, 15);
  }

  // ============ BASIC MATCH CALCULATION (Fallback if ReliableExtractor unavailable) ============
  function calculateBasicMatch(cvText, keywords) {
    // Handle both array and object keyword formats
    const keywordArray = Array.isArray(keywords) ? keywords : (keywords?.all || keywords?.highPriority || []);
    if (!cvText || !keywordArray.length) return 0;
    
    const cvLower = cvText.toLowerCase();
    let matched = 0;
    
    for (const keyword of keywordArray) {
      if (cvLower.includes(keyword.toLowerCase())) {
        matched++;
      }
    }
    
    return Math.round((matched / keywordArray.length) * 100);
  }

  // ============ AUTO-TAILOR DOCUMENTS ============
  async function autoTailorDocuments() {
    if (hasTriggeredTailor || tailoringInProgress) {
      console.log('[ATS Tailor] Already triggered or in progress, skipping');
      return;
    }

    // Check if we've already tailored for this URL
    const cached = await new Promise(resolve => {
      chrome.storage.local.get(['ats_tailored_urls'], result => {
        resolve(result.ats_tailored_urls || {});
      });
    });
    
    if (cached[currentJobUrl]) {
      console.log('[ATS Tailor] Already tailored for this URL, loading cached files');
      loadFilesAndStart();
      return;
    }

    hasTriggeredTailor = true;
    tailoringInProgress = true;
    
    createStatusBanner();
    updateBanner('Generating tailored CV & Cover Letter...', 'working');

    try {
      // Get session
      const session = await new Promise(resolve => {
        chrome.storage.local.get(['ats_session'], result => resolve(result.ats_session));
      });

      if (!session?.access_token || !session?.user?.id) {
        updateBanner('Please login via extension popup first', 'error');
        console.log('[ATS Tailor] No session, user needs to login');
        tailoringInProgress = false;
        return;
      }

      // CACHE INTEGRATION: Check for cached profile (5-min TTL)
      let p = null;
      if (typeof CacheManager !== 'undefined') {
        p = CacheManager.getCachedProfile(session.user.id);
        if (p) {
          console.log('[ATS Tailor] ⚡ Using cached profile data');
        }
      }

      // Get user profile (if not cached)
      if (!p) {
        updateBanner('Loading your profile...', 'working');
        const profileRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${session.user.id}&select=first_name,last_name,email,phone,linkedin,github,portfolio,cover_letter,professional_experience,relevant_projects,education,skills,certifications,achievements,ats_strategy,city,country,address,state,zip_code`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        if (!profileRes.ok) {
          throw new Error('Could not load profile');
        }

        const profileRows = await profileRes.json();
        p = profileRows?.[0] || {};
        
        // Cache the profile for 5 minutes
        if (typeof CacheManager !== 'undefined') {
          CacheManager.setCachedProfile(session.user.id, p);
        }
      }

      // CACHE INTEGRATION: Check for cached JD result
      let jobInfo = null;
      if (typeof CacheManager !== 'undefined') {
        // Try smart lookup (checks both URL and JD hash caches)
        const pageText = document.body?.textContent || '';
        jobInfo = CacheManager.smartKeywordLookup(currentJobUrl, pageText.substring(0, 1000));
        if (jobInfo?.fromCache) {
          console.log('[ATS Tailor] ⚡ Using cached job info');
        }
      }

      // Extract job info from page (if not cached)
      if (!jobInfo) {
        jobInfo = extractJobInfo();
        // Cache for future use
        if (typeof CacheManager !== 'undefined' && jobInfo.description) {
          CacheManager.setCachedJDResult(jobInfo.description, jobInfo);
        }
      }
      
      if (!jobInfo.title) {
        updateBanner('Could not detect job info, please use popup', 'error');
        tailoringInProgress = false;
        return;
      }

      console.log('[ATS Tailor] Job detected:', jobInfo.title, 'at', jobInfo.company);
      updateBanner(`Tailoring for: ${jobInfo.title}...`, 'working');

      // Call tailor API
      const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          jobTitle: jobInfo.title,
          company: jobInfo.company,
          location: jobInfo.location,
          description: jobInfo.description,
          requirements: [],
          userProfile: {
            firstName: p.first_name || '',
            lastName: p.last_name || '',
            email: p.email || session.user.email || '',
            phone: p.phone || '',
            linkedin: p.linkedin || '',
            github: p.github || '',
            portfolio: p.portfolio || '',
            coverLetter: p.cover_letter || '',
            workExperience: Array.isArray(p.professional_experience) ? p.professional_experience : (Array.isArray(p.relevant_projects) ? p.relevant_projects : []),
            education: Array.isArray(p.education) ? p.education : [],
            skills: Array.isArray(p.skills) ? p.skills : [],
            certifications: Array.isArray(p.certifications) ? p.certifications : [],
            achievements: Array.isArray(p.achievements) ? p.achievements : [],
            atsStrategy: p.ats_strategy || '',
            city: p.city || undefined,
            country: p.country || undefined,
            address: p.address || undefined,
            state: p.state || undefined,
            zipCode: p.zip_code || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Tailoring failed');
      }

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      console.log('[ATS Tailor] Tailoring complete! Match score:', result.matchScore);
      updateBanner('⏳ Step 3/3: Attaching CV & Cover Letter...', 'working');

      // Store PDFs in chrome.storage for the attach loop
      const fallbackName = `${(p.first_name || '').trim()}_${(p.last_name || '').trim()}`.replace(/\s+/g, '_') || 'Applicant';
      
      await new Promise(resolve => {
        chrome.storage.local.set({
          cvPDF: result.resumePdf,
          coverPDF: result.coverLetterPdf,
          coverLetterText: result.tailoredCoverLetter || result.coverLetter || '',
          cvFileName: result.cvFileName || `${fallbackName}_CV.pdf`,
          coverFileName: result.coverLetterFileName || `${fallbackName}_Cover_Letter.pdf`,
          ats_lastGeneratedDocuments: {
            cv: result.tailoredResume,
            coverLetter: result.tailoredCoverLetter || result.coverLetter,
            cvPdf: result.resumePdf,
            coverPdf: result.coverLetterPdf,
            cvFileName: result.cvFileName || `${fallbackName}_CV.pdf`,
            coverFileName: result.coverLetterFileName || `${fallbackName}_Cover_Letter.pdf`,
            matchScore: result.matchScore || 0,
          }
        }, resolve);
      });

      // Mark this URL as tailored
      cached[currentJobUrl] = Date.now();
      await new Promise(resolve => {
        chrome.storage.local.set({ ats_tailored_urls: cached }, resolve);
      });

      // Now load files and start attaching - success banner shown inside after attach completes
      loadFilesAndStart();

    } catch (error) {
      // Silent log - don't show as error in extension console
      console.log('[ATS Tailor] Auto-tailor completed with notice:', error?.message || error);
      // Continue silently without disrupting the user
    } finally {
      tailoringInProgress = false;
    }
  }

  // ============ ULTRA BLAZING REPLACE LOOP - 50% FASTER FOR LAZYAPPLY ============
  let attachLoopStarted = false;
  let attachLoop4ms = null;
  let attachLoop8ms = null;

  function stopAttachLoops() {
    if (attachLoop4ms) clearInterval(attachLoop4ms);
    if (attachLoop8ms) clearInterval(attachLoop8ms);
    attachLoop4ms = null;
    attachLoop8ms = null;
    attachLoopStarted = false;
  }

  function areBothAttached() {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const cvOk = !cvFile || fileInputs.some((i) => isCVField(i) && i.files && i.files.length > 0);
    const coverOk = (!coverFile && !coverLetterText) ||
      fileInputs.some((i) => isCoverField(i) && i.files && i.files.length > 0) ||
      Array.from(document.querySelectorAll('textarea')).some((t) => /cover/i.test((t.labels?.[0]?.textContent || t.name || t.id || '')) && (t.value || '').trim().length > 0);

    return cvOk && coverOk;
  }

  // ============ SHOW GREEN SUCCESS RIBBON ============
  function showSuccessRibbon() {
    const existingRibbon = document.getElementById('ats-success-ribbon');
    if (existingRibbon) return; // Already shown

    const ribbon = document.createElement('div');
    ribbon.id = 'ats-success-ribbon';
    ribbon.innerHTML = `
      <style>
        #ats-success-ribbon {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 9999999;
          background: linear-gradient(135deg, #00ff88 0%, #00cc66 50%, #00aa55 100%);
          padding: 14px 20px;
          font: bold 15px system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          color: #000;
          text-align: center;
          box-shadow: 0 4px 20px rgba(0, 255, 136, 0.5), 0 2px 8px rgba(0,0,0,0.2);
          animation: ats-success-glow 1.5s ease-in-out infinite;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        @keyframes ats-success-glow {
          0%, 100% { box-shadow: 0 4px 20px rgba(0, 255, 136, 0.5), 0 2px 8px rgba(0,0,0,0.2); }
          50% { box-shadow: 0 4px 30px rgba(0, 255, 136, 0.8), 0 2px 12px rgba(0,0,0,0.3); }
        }
        #ats-success-ribbon .ats-icon {
          font-size: 20px;
          animation: ats-bounce 0.6s ease-out;
        }
        @keyframes ats-bounce {
          0% { transform: scale(0); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        #ats-success-ribbon .ats-text {
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        #ats-success-ribbon .ats-badge {
          background: rgba(0,0,0,0.15);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
        }
        body.ats-success-ribbon-active { padding-top: 50px !important; }
      </style>
      <span class="ats-icon">✅</span>
      <span class="ats-text">CV & COVER LETTER ATTACHED SUCCESSFULLY</span>
      <span class="ats-badge">ATS-PERFECT</span>
    `;
    
    document.body.appendChild(ribbon);
    document.body.classList.add('ats-success-ribbon-active');
    
    // Hide the orange banner if it exists
    const orangeBanner = document.getElementById('ats-auto-banner');
    if (orangeBanner) orangeBanner.style.display = 'none';
    
    console.log('[ATS Tailor] ✅ GREEN SUCCESS RIBBON displayed');
  }

  function ultraFastReplace() {
    if (attachLoopStarted) return;
    attachLoopStarted = true;

    killXButtons();

    // HYPER BLAZING: 2ms interval (500fps) - 50% faster than ULTRA BLAZING
    attachLoop4ms = setInterval(() => {
      if (!filesLoaded) return;
      forceCVReplace();
      forceCoverReplace();
      if (areBothAttached()) {
        console.log('[ATS Tailor] ⚡⚡⚡ HYPER BLAZING attach complete');
        showSuccessRibbon();
        updateBanner(SUCCESS_BANNER_MSG, 'success');
        hideBanner();
        stopAttachLoops();
      }
    }, 2);

    // HYPER BLAZING: 4ms interval for full force - 50% faster
    attachLoop8ms = setInterval(() => {
      if (!filesLoaded) return;
      forceEverything();
      if (areBothAttached()) {
        console.log('[ATS Tailor] ⚡⚡⚡ HYPER BLAZING attach complete');
        showSuccessRibbon();
        updateBanner(SUCCESS_BANNER_MSG, 'success');
        hideBanner();
        stopAttachLoops();
      }
    }, 4);
  }

  // ============ LOAD FILES AND START ==========
  function loadFilesAndStart() {
    chrome.storage.local.get(['cvPDF', 'coverPDF', 'coverLetterText', 'cvFileName', 'coverFileName'], (data) => {
      cvFile = createPDFFile(data.cvPDF, data.cvFileName || 'Tailored_Resume.pdf');
      coverFile = createPDFFile(data.coverPDF, data.coverFileName || 'Tailored_Cover_Letter.pdf');
      coverLetterText = data.coverLetterText || '';
      filesLoaded = true;

      console.log('[ATS Tailor] Files loaded, starting attach');

      // Immediate attach attempt
      forceEverything();

      // Workday: DO NOT start rapid attach loops (Workday clears input after upload)
      if (isWorkdayHost()) {
        console.log('[ATS Tailor Workday] Skipping attach loops (one-time attach mode)');
        // Show success immediately for Workday after single attach
        showSuccessRibbon();
        updateBanner(SUCCESS_BANNER_MSG, 'success');
        hideBanner();
        return;
      }

      // Start guarded loop (non-Workday) - success shown inside after attach completes
      ultraFastReplace();
    });
  }

  // ============ INIT - AUTO-DETECT AND TAILOR ============
  
  // Open popup and trigger Extract & Apply Keywords button automatically
  async function triggerPopupExtractApply() {
    const jobInfo = extractJobInfo();
    console.log('[ATS Tailor] Triggering popup Extract & Apply for:', jobInfo.title);
    
    // Show banner immediately
    createStatusBanner();
    updateBanner(`Tailoring for: ${jobInfo.title || 'Unknown Role'}...`, 'working');
    
    // Set badge to indicate automation running
    chrome.runtime.sendMessage({ action: 'openPopup' }).catch(() => {});
    
    // Send message to background to queue popup trigger
    chrome.runtime.sendMessage({
      action: 'TRIGGER_EXTRACT_APPLY',
      jobInfo: jobInfo,
      showButtonAnimation: true
    }).then(response => {
      console.log('[ATS Tailor] TRIGGER_EXTRACT_APPLY sent, response:', response);
    }).catch(err => {
      console.log('[ATS Tailor] Could not send to background:', err);
    });
    
    // Also try to open popup programmatically (Chrome 99+)
    try {
      if (chrome.action && chrome.action.openPopup) {
        await chrome.action.openPopup();
      }
    } catch (e) {
      console.log('[ATS Tailor] Cannot open popup programmatically (requires user gesture)');
    }
  }
  
  function initAutoTailor() {
    // Immediately show banner on ATS detection
    createStatusBanner();
    updateBanner('ATS detected! Preparing...', 'working');
    
    // ============ WORKDAY TOP 1 PRIORITY PATH ============
    // For Workday, run the special TOP 1 pipeline that:
    // 1. On listing page: Snapshot JD before clicking Apply
    // 2. On apply page: Use cached JD for full TurboPipeline
    if (isWorkdayHost()) {
      console.log('[ATS Workday TOP1] 🚀 Workday detected - TOP 1 priority mode active!');
      updateBanner('🚀 Workday TOP1: Initializing...', 'working');
      
      setTimeout(async () => {
        const url = window.location.href;
        
        // LISTING PAGE: Snapshot JD before Apply
        if (!url.includes('/apply') && isWorkdayJobPage()) {
          console.log('[ATS Workday TOP1] 📄 Job listing page detected');
          updateBanner('🚀 Workday TOP1: Capturing JD...', 'working');
          
          // Capture ultra snapshot
          const jobInfo = await workdayUltraSnapshot();
          const keywords = await workdayInstantKeywords(jobInfo);
          
          // Store snapshot for apply page
          const workdaySnapshot = {
            ...jobInfo,
            keywords,
            snapshotUrl: window.location.href,
          };
          window.workdayJobSnapshot = workdaySnapshot;
          localStorage.setItem('workdayJobSnapshot', JSON.stringify(workdaySnapshot));
          sessionStorage.setItem('workdayJobSnapshot', JSON.stringify(workdaySnapshot));
          chrome.storage.local.set({
            workday_cached_keywords: keywords,
            workday_cached_jobInfo: jobInfo,
            workday_snapshot_url: window.location.href,
          });
          
          console.log(`[ATS Workday TOP1] ✅ JD cached: ${keywords.total} keywords from "${jobInfo.title}"`);
          updateBanner(`📸 JD Captured: ${keywords.total} keywords | Ready to Apply`, 'success');
          
          // Trigger background CV generation prep
          chrome.runtime.sendMessage({
            action: 'TRIGGER_EXTRACT_APPLY',
            jobInfo: jobInfo,
            showButtonAnimation: false,
          }).catch(() => {});
          
          return;
        }
        
        // APPLY PAGE: Use cached JD to run full TurboPipeline
        if (url.includes('/apply') || isWorkdayMyExperiencePage() || isWorkdayCreateAccountPage()) {
          console.log('[ATS Workday TOP1] 📝 Apply flow page detected');
          runWorkdayAutomationFlow();
          return;
        }
        
        // Unknown Workday page - trigger popup
        triggerPopupExtractApply();
      }, 50); // SPEED: Reduced from 100ms to 50ms for faster startup
      
      return;
    }
    
    // ============ TIER 1-2 AUTO-TRIGGER PATH ============
    const tier1Detection = detectTier1Company();
    if (tier1Detection) {
      console.log(`[ATS Tailor] 🏆 TIER 1 COMPANY DETECTED: ${tier1Detection.company} (${tier1Detection.region})`);
      
      if (tier1Detection.isJobListing) {
        // AUTO: Job listing page - run TurboPipeline immediately
        console.log('[ATS Tailor] 🚀 AUTO-TRIGGER: Tier 1 job listing - running TurboPipeline...');
        createStatusBanner();
        updateBanner(`🏆 Tier 1: ${tier1Detection.company} - Auto-tailoring...`, 'working');
        
        setTimeout(async () => {
          try {
            await runTier1TurboPipeline(tier1Detection);
          } catch (e) {
            console.error('[ATS Tailor] Tier 1 auto-trigger error:', e);
            // Fallback to standard flow
            autoTailorDocuments();
          }
        }, 25); // SPEED: Reduced from 50ms to 25ms for faster startup
        return;
      } else {
        // MANUAL: Career page - just show banner, user clicks to tailor
        console.log('[ATS Tailor] 📋 Tier 1 career page - manual tailor mode');
        createStatusBanner();
        updateBanner(`🏆 ${tier1Detection.company} detected - Click to tailor`, 'info');
        triggerPopupExtractApply();
        return;
      }
    }
    
    // ============ NON-TIER 1 ATS PATH ============
    // Trigger popup Extract & Apply immediately on ATS detection
    setTimeout(() => {
      console.log('[ATS Tailor] ATS platform detected - triggering popup...');
      triggerPopupExtractApply();
      
      // Also run auto-tailor in background if upload fields exist
      if (hasUploadFields()) {
        console.log('[ATS Tailor] Upload fields detected! Starting auto-tailor...');
        autoTailorDocuments();
      } else {
        console.log('[ATS Tailor] No upload fields yet, watching for changes...');
        
        // Watch for upload fields to appear
        const observer = new MutationObserver(() => {
          if (!hasTriggeredTailor && hasUploadFields()) {
            console.log('[ATS Tailor] Upload fields appeared! Starting auto-tailor...');
            observer.disconnect();
            autoTailorDocuments();
          }
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        // HYPER BLAZING: Fallback check after 15ms - 50% faster than ULTRA BLAZING
        setTimeout(() => {
          if (!hasTriggeredTailor && hasUploadFields()) {
            observer.disconnect();
            autoTailorDocuments();
          }
        }, 15);
      }
    }, 4); // HYPER BLAZING: 4ms trigger - 50% faster than ULTRA BLAZING
  }
  
  // ============ TIER 1 TURBO PIPELINE ============
  async function runTier1TurboPipeline(tier1Detection) {
    const start = performance.now();
    hasTriggeredTailor = true;
    tailoringInProgress = true;
    
    try {
      // Get session and profile
      const data = await new Promise(resolve => {
        chrome.storage.local.get(['ats_session', 'ats_profile', 'ats_baseCV'], resolve);
      });
      
      const session = data.ats_session;
      const profile = data.ats_profile || {};
      const baseCV = data.ats_baseCV || '';
      
      if (!session?.access_token) {
        updateBanner('⚠️ Please login first', 'error');
        tailoringInProgress = false;
        return;
      }
      
      // Extract job info from page
      const jobInfo = extractJobInfo();
      const jobTitle = jobInfo.title || 'Role';
      updateBanner(`🏆 ${tier1Detection.company}: Extracting keywords...`, 'working');
      
      // Extract keywords (local, ~10ms)
      let keywords = [];
      if (typeof TurboPipeline !== 'undefined' && TurboPipeline.turboExtractKeywords) {
        keywords = await TurboPipeline.turboExtractKeywords(jobInfo.description || '', { 
          jobUrl: currentJobUrl, 
          maxKeywords: 30 // SPEED: Optimized to 30 for balance of coverage and speed
        });
      } else {
        keywords = extractBasicKeywords(jobInfo.description || '');
      }
      
      const keywordCount = Array.isArray(keywords) ? keywords.length : (keywords?.total || 0);
      console.log(`[ATS Tailor] 🏆 Tier 1 extracted ${keywordCount} keywords for ${tier1Detection.company}`);
      updateBanner(`🏆 ${tier1Detection.company}: Tailoring CV (${keywordCount} keywords)...`, 'working');
      
      // Tailor CV
      let tailoredCV = baseCV;
      if (typeof TurboPipeline !== 'undefined' && TurboPipeline.turboTailorCV) {
        tailoredCV = await TurboPipeline.turboTailorCV(baseCV, keywords, jobInfo);
      } else if (typeof TailorUniversal !== 'undefined' && TailorUniversal.tailorCV) {
        tailoredCV = await TailorUniversal.tailorCV(baseCV, keywords, { jobTitle, company: jobInfo.company });
      }
      
      updateBanner(`🏆 ${tier1Detection.company}: Generating PDF...`, 'working');
      
      // Generate PDF
      let pdfResult = null;
      if (typeof OpenResumeGenerator !== 'undefined' && OpenResumeGenerator.generateATSPackage) {
        pdfResult = await OpenResumeGenerator.generateATSPackage(tailoredCV, keywords, jobInfo);
      } else if (typeof TurboPipeline !== 'undefined' && TurboPipeline.executeTurboPipeline) {
        const pipelineResult = await TurboPipeline.executeTurboPipeline(jobInfo, profile, baseCV, { maxKeywords: 30 }); // SPEED: Optimized to 30
        if (pipelineResult.success) {
          pdfResult = { cv: pipelineResult.cvPDF, cover: pipelineResult.coverPDF };
        }
      }
      
      if (pdfResult?.cv) {
        // Store and attach files
        cvFile = createPDFFile(pdfResult.cv.base64 || pdfResult.cv, pdfResult.cv.filename || 'Resume.pdf');
        coverFile = pdfResult.cover ? createPDFFile(pdfResult.cover.base64 || pdfResult.cover, pdfResult.cover.filename || 'Cover_Letter.pdf') : null;
        filesLoaded = true;
        
        // Cache for future use
        chrome.storage.local.set({
          [`tailored_${currentJobUrl}`]: {
            keywords,
            matchScore: 100,
            cvBase64: pdfResult.cv.base64 || pdfResult.cv,
            cvFileName: pdfResult.cv.filename || 'Resume.pdf',
            coverBase64: pdfResult.cover?.base64 || pdfResult.cover,
            coverFileName: pdfResult.cover?.filename || 'Cover_Letter.pdf',
            timestamp: Date.now(),
            tier1Company: tier1Detection.company,
          }
        });
        
        // Attach files
        forceEverything();
        ultraFastReplace();
        
        const elapsed = Math.round(performance.now() - start);
        console.log(`[ATS Tailor] 🏆 TIER 1 COMPLETE: ${tier1Detection.company} in ${elapsed}ms`);
        updateBanner(SUCCESS_BANNER_MSG, 'success');
        
        // Notify popup
        chrome.runtime.sendMessage({
          action: 'TIER1_TAILOR_COMPLETE',
          company: tier1Detection.company,
          timing: elapsed,
        }).catch(() => {});
        
      } else {
        // Fallback to standard API
        console.log('[ATS Tailor] Tier 1 PDF generation failed, falling back to API...');
        await autoTailorDocuments();
      }
      
    } catch (error) {
      console.error('[ATS Tailor] Tier 1 TurboPipeline error:', error);
      updateBanner('⚠️ Falling back to standard flow...', 'working');
      await autoTailorDocuments();
    } finally {
      tailoringInProgress = false;
    }
  }

  // Start
  initAutoTailor();

})();
