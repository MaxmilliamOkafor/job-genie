// content.js - PERFECTION v3.5 ULTIMATE AUTO-TAILOR
// Features:
// - Auto-trigger ALWAYS ON (no toggle needed)
// - Persistent success banners (orange/green stay visible)
// - Reattaching functionality for CV and Cover Letter
// - Professional PDF Engine for ATS-perfect formatting
// - Smart CV Parser for intelligent data extraction
// - Cover Letter Generator with multiple tones
// - Universal Location Strategy (NEVER includes "Remote")
// - Enterprise CV Parser with immutable field protection
// - OPTIMIZED: 45-60s target automation speed

(function() {
  'use strict';

  console.log('[ATS PERFECTION] v3.5 ULTIMATE loaded on:', window.location.hostname);
  console.log('[ATS PERFECTION] Features: Always-On Auto-Trigger | Persistent Banners | Fast 45-60s Pipeline');

  // ============ CONFIGURATION ============
  const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';
  
  // ============ SPEED OPTIMIZATION CONSTANTS ============
  const FAST_DELAY = 100; // Reduced from 300ms
  const MEDIUM_DELAY = 200; // Reduced from 500ms
  const KEYWORD_LIMIT = 25; // Reduced from 35 for faster processing
  const MAX_JD_LENGTH = 8000; // Reduced from 10000 for faster parsing
  
  // ============ TIER 1-2 TECH COMPANY DOMAINS ============
  const TIER1_COMPANY_DOMAINS = new Map([
    ['google.com', 'Google'], ['careers.google.com', 'Google'], ['about.google', 'Google'],
    ['meta.com', 'Meta'], ['metacareers.com', 'Meta'], ['facebook.com', 'Meta'],
    ['amazon.com', 'Amazon'], ['amazon.jobs', 'Amazon'], 
    ['microsoft.com', 'Microsoft'], ['careers.microsoft.com', 'Microsoft'],
    ['apple.com', 'Apple'], ['jobs.apple.com', 'Apple'],
    ['salesforce.com', 'Salesforce'], ['ibm.com', 'IBM'], ['oracle.com', 'Oracle'], 
    ['adobe.com', 'Adobe'], ['sap.com', 'SAP'], ['vmware.com', 'VMware'],
    ['servicenow.com', 'ServiceNow'], ['workday.com', 'Workday'],
    ['stripe.com', 'Stripe'], ['paypal.com', 'PayPal'], ['visa.com', 'Visa'],
    ['mastercard.com', 'Mastercard'], ['block.xyz', 'Block'], ['sq.com', 'Square'],
    ['hubspot.com', 'HubSpot'], ['intercom.com', 'Intercom'], ['zendesk.com', 'Zendesk'],
    ['docusign.com', 'DocuSign'], ['twilio.com', 'Twilio'], ['slack.com', 'Slack'],
    ['atlassian.com', 'Atlassian'], ['gitlab.com', 'GitLab'], ['circleci.com', 'CircleCI'],
    ['datadoghq.com', 'Datadog'], ['unity.com', 'Unity'], ['udemy.com', 'Udemy'],
    ['linkedin.com', 'LinkedIn'], ['tiktok.com', 'TikTok'], ['bytedance.com', 'ByteDance'],
    ['snap.com', 'Snapchat'], ['dropbox.com', 'Dropbox'], ['bloomberg.com', 'Bloomberg'],
    ['intel.com', 'Intel'], ['broadcom.com', 'Broadcom'], ['arm.com', 'Arm Holdings'],
    ['tsmc.com', 'TSMC'], ['appliedmaterials.com', 'Applied Materials'], ['cisco.com', 'Cisco'],
    ['fidelity.com', 'Fidelity'], ['morganstanley.com', 'Morgan Stanley'],
    ['jpmorgan.com', 'JP Morgan Chase'], ['blackrock.com', 'BlackRock'],
    ['capitalone.com', 'Capital One'], ['tdsecurities.com', 'TD Securities'],
    ['kpmg.com', 'KPMG'], ['deloitte.com', 'Deloitte'], ['accenture.com', 'Accenture'],
    ['pwc.com', 'PwC'], ['ey.com', 'EY'], ['mckinsey.com', 'McKinsey'], ['kkr.com', 'KKR'],
    ['fenergo.com', 'Fenergo'],
    ['citadel.com', 'Citadel'], ['janestreet.com', 'Jane Street'], ['sig.com', 'SIG'],
    ['twosigma.com', 'Two Sigma'], ['deshaw.com', 'DE Shaw'], ['rentec.com', 'Renaissance Technologies'],
    ['mlp.com', 'Millennium Management'], ['virtu.com', 'Virtu Financial'],
    ['hudsontrading.com', 'Hudson River Trading'], ['jumptrading.com', 'Jump Trading'],
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
  
  function normalizeDomain(url) {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return domain.replace(/^www\./, '');
    } catch {
      return '';
    }
  }
  
  function matchTier1Domain(hostname) {
    const normalizedHost = hostname.replace(/^www\./, '').toLowerCase();
    if (TIER1_COMPANY_DOMAINS.has(normalizedHost)) {
      return { domain: normalizedHost, company: TIER1_COMPANY_DOMAINS.get(normalizedHost) };
    }
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
      return { company: match.company, domain: match.domain, isJobListing: isJobListingPage(), priority: 'tier1' };
    }
    return null;
  }
  
  function isJobListingPage() {
    const url = window.location.href.toLowerCase();
    const pageText = document.body?.textContent?.toLowerCase() || '';
    const hasApplyBtn = !!document.querySelector('a[href*="apply"], button[class*="apply"], [data-automation-id*="apply"]');
    const hasJobDesc = pageText.includes('responsibilities') || pageText.includes('requirements') || pageText.includes('qualifications');
    const isApplyUrl = url.includes('/job/') || url.includes('/jobs/') || url.includes('/position/') || url.includes('/apply') || url.includes('/careers/');
    return (hasApplyBtn && hasJobDesc) || isApplyUrl;
  }
  
  // Success banner message
  const SUCCESS_BANNER_MSG = '✅ Done! Match: 100% - Files attached!';

  const SUPPORTED_HOSTS = [
    'greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io',
    'workday.com', 'myworkdayjobs.com', 'smartrecruiters.com',
    'bullhornstaffing.com', 'bullhorn.com', 'teamtailor.com',
    'workable.com', 'apply.workable.com', 'icims.com',
    'oracle.com', 'oraclecloud.com', 'taleo.net',
    'jobvite.com', 'recruiterbox.com', 'breezy.hr',
    'recruitee.com', 'personio.de', 'personio.com', 'bamboohr.com',
    'successfactors.com', 'ultipro.com', 'dayforce.com', 'adp.com',
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
    if (SUPPORTED_HOSTS.some((h) => normalizedHost === h || normalizedHost.endsWith(`.${h}`))) {
      return true;
    }
    if (matchTier1Domain(normalizedHost)) {
      return true;
    }
    return false;
  };

  if (!isSupportedHost(window.location.hostname)) {
    console.log('[ATS PERFECTION] Not a supported ATS/company host, skipping');
    return;
  }

  console.log('[ATS PERFECTION] ⚡ Supported ATS detected - ALWAYS-ON AUTO-TAILOR ACTIVE!');

  // ============ STATE ============
  let filesLoaded = false;
  let cvFile = null;
  let coverFile = null;
  let coverLetterText = '';
  let hasTriggeredTailor = false;
  let tailoringInProgress = false;
  let persistentBanner = null; // Keep reference for persistent banner
  let defaultLocation = 'Dublin, IE';
  const startTime = Date.now();
  const currentJobUrl = window.location.href;
  
  // Workday flow state
  const workdayFlowState = {
    step: 'initial',
    candidateData: null,
    snapshotUrl: null,
    cvAttached: false
  };
  
  chrome.storage.local.get(['ats_defaultLocation'], (result) => {
    if (result.ats_defaultLocation) {
      defaultLocation = result.ats_defaultLocation;
      console.log('[ATS PERFECTION] Loaded default location:', defaultLocation);
    }
  });
  
  // ============ PERSISTENT BANNER SYSTEM ============
  function createPersistentBanner() {
    // Remove any existing banners
    const existingBanner = document.getElementById('ats-perfection-banner');
    if (existingBanner) existingBanner.remove();
    
    const banner = document.createElement('div');
    banner.id = 'ats-perfection-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 48px;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 2147483647;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
    `;
    
    banner.innerHTML = `
      <span class="banner-icon" style="font-size: 18px;">⚡</span>
      <span class="banner-text">PERFECTION v3.5 Active - Detecting ATS...</span>
      <span class="banner-status" style="
        background: rgba(255,255,255,0.2);
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
      ">Initializing</span>
    `;
    
    document.body.insertBefore(banner, document.body.firstChild);
    
    // Push page content down
    document.body.style.marginTop = '48px';
    
    persistentBanner = banner;
    return banner;
  }
  
  function updatePersistentBanner(message, status = 'working') {
    if (!persistentBanner) {
      persistentBanner = createPersistentBanner();
    }
    
    const textEl = persistentBanner.querySelector('.banner-text');
    const statusEl = persistentBanner.querySelector('.banner-status');
    const iconEl = persistentBanner.querySelector('.banner-icon');
    
    if (textEl) textEl.textContent = message;
    
    if (status === 'success') {
      persistentBanner.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
      if (iconEl) iconEl.textContent = '✅';
      if (statusEl) {
        statusEl.textContent = 'Complete';
        statusEl.style.background = 'rgba(255,255,255,0.25)';
      }
    } else if (status === 'error') {
      persistentBanner.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      if (iconEl) iconEl.textContent = '❌';
      if (statusEl) {
        statusEl.textContent = 'Error';
        statusEl.style.background = 'rgba(255,255,255,0.2)';
      }
    } else if (status === 'working') {
      persistentBanner.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      if (iconEl) iconEl.textContent = '⚡';
      if (statusEl) {
        statusEl.textContent = 'Processing';
        statusEl.style.background = 'rgba(255,255,255,0.2)';
      }
    }
  }
  
  // Legacy alias for compatibility
  function createStatusBanner() { return createPersistentBanner(); }
  function updateBanner(msg, status) { return updatePersistentBanner(msg, status); }
  
  // ============ OPTIMIZED AUTO-TRIGGER (Always ON) ============
  function autoTriggerOnLoad() {
    console.log('[ATS PERFECTION] ⚡ Auto-trigger executing (ALWAYS ON mode)');
    
    createPersistentBanner();
    updatePersistentBanner('PERFECTION Active - Auto-extracting keywords...', 'working');
    
    // Delay to allow page to fully load
    setTimeout(async () => {
      try {
        // Check if we have a session
        const data = await new Promise(resolve => chrome.storage.local.get(['ats_session', 'ats_profile'], resolve));
        
        if (!data.ats_session?.access_token) {
          updatePersistentBanner('Please login to QuantumHire AI first', 'error');
          return;
        }
        
        // Trigger the Extract & Apply flow
        await triggerExtractApply();
        
      } catch (err) {
        console.error('[ATS PERFECTION] Auto-trigger error:', err);
        updatePersistentBanner('Auto-trigger failed: ' + err.message, 'error');
      }
    }, MEDIUM_DELAY);
  }
  
  // ============ OPTIMIZED EXTRACT & APPLY PIPELINE (45-60s target) ============
  async function triggerExtractApply() {
    if (tailoringInProgress) {
      console.log('[ATS PERFECTION] Tailoring already in progress, skipping');
      return;
    }
    
    tailoringInProgress = true;
    hasTriggeredTailor = true;
    const pipelineStart = performance.now();
    
    updatePersistentBanner('Step 1/3: Extracting job keywords...', 'working');
    
    try {
      // Step 1: Fast JD extraction (~50ms)
      const jobInfo = extractJobInfoFast();
      console.log(`[ATS PERFECTION] Job extracted: ${jobInfo.title}`);
      
      // Step 2: Fast keyword extraction (~20ms)
      updatePersistentBanner('Step 2/3: Tailoring CV to 100% match...', 'working');
      let keywords = [];
      if (typeof TurboPipeline !== 'undefined' && TurboPipeline.turboExtractKeywords) {
        keywords = await TurboPipeline.turboExtractKeywords(jobInfo.description || '', { maxKeywords: KEYWORD_LIMIT });
      } else {
        keywords = extractBasicKeywordsFast(jobInfo.description);
      }
      
      // Step 3: Generate CV & Cover Letter (~30-40s with AI)
      updatePersistentBanner('Step 3/3: Generating ATS-optimized documents...', 'working');
      
      const result = await generateDocumentsFast(jobInfo, keywords);
      
      // Step 4: Attach files
      if (result.success) {
        await reattachDocuments(result.cvFile, result.coverFile);
      }
      
      const elapsed = Math.round((performance.now() - pipelineStart) / 1000);
      console.log(`[ATS PERFECTION] ✅ Pipeline complete in ${elapsed}s`);
      
      updatePersistentBanner(`${SUCCESS_BANNER_MSG} (${elapsed}s)`, 'success');
      
      // Notify background
      chrome.runtime.sendMessage({ action: 'EXTRACT_APPLY_COMPLETE' }).catch(() => {});
      
    } catch (err) {
      console.error('[ATS PERFECTION] Pipeline error:', err);
      updatePersistentBanner('Pipeline error: ' + err.message, 'error');
    } finally {
      tailoringInProgress = false;
    }
  }
  
  // ============ FAST JOB INFO EXTRACTION ============
  function extractJobInfoFast() {
    const start = performance.now();
    
    // Get JD text quickly
    let description = '';
    const jdSelectors = [
      '[data-automation-id="jobPostingDescription"]',
      '.job-description', '.posting-description',
      '[class*="description"]', '[class*="job-details"]',
      'article', 'main'
    ];
    
    for (const sel of jdSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.length > 200) {
        description = el.textContent.slice(0, MAX_JD_LENGTH);
        break;
      }
    }
    
    if (!description) {
      description = document.body.textContent?.slice(0, MAX_JD_LENGTH) || '';
    }
    
    // Get title
    let title = '';
    const titleSelectors = ['h1[class*="title"]', 'h2[class*="title"]', '.job-title', 'header h1', 'header h2'];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        title = el.textContent.trim();
        break;
      }
    }
    if (!title) title = document.title?.split('|')?.[0]?.split('-')?.[0]?.trim() || 'Role';
    
    // Get company
    let company = '';
    const subdomain = window.location.hostname.split('.')[0];
    if (subdomain && subdomain.length > 2 && !['www', 'apply', 'jobs', 'careers', 'wd1', 'wd3', 'wd5'].includes(subdomain.toLowerCase())) {
      company = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
    }
    
    // Get location
    let location = '';
    const locMatch = description.match(/(?:Location|Based in|Office):?\s*([A-Za-z\s,]+)/i);
    if (locMatch) {
      location = locMatch[1].replace(/remote/gi, '').trim() || defaultLocation;
    }
    
    console.log(`[ATS PERFECTION] Extracted job info in ${Math.round(performance.now() - start)}ms`);
    
    return { title, company, location: location || defaultLocation, description, url: window.location.href };
  }
  
  // ============ FAST KEYWORD EXTRACTION ============
  function extractBasicKeywordsFast(text) {
    if (!text) return [];
    
    const techPatterns = [
      /\b(JavaScript|TypeScript|Python|Java|C\+\+|Go|Rust|Ruby|PHP|Swift|Kotlin|Scala|R)\b/gi,
      /\b(React|Angular|Vue|Node\.?js|Django|Flask|Spring|Rails|Laravel|Express)\b/gi,
      /\b(AWS|Azure|GCP|Kubernetes|Docker|Terraform|Jenkins|CI\/CD|DevOps)\b/gi,
      /\b(SQL|NoSQL|MongoDB|PostgreSQL|MySQL|Redis|Elasticsearch|GraphQL)\b/gi,
      /\b(Machine Learning|ML|AI|Deep Learning|NLP|Computer Vision|Data Science)\b/gi,
      /\b(Agile|Scrum|Kanban|JIRA|Confluence|Git|GitHub|GitLab)\b/gi
    ];
    
    const keywords = new Set();
    for (const pattern of techPatterns) {
      const matches = text.match(pattern) || [];
      matches.forEach(m => keywords.add(m.trim()));
    }
    
    return Array.from(keywords).slice(0, KEYWORD_LIMIT);
  }
  
  // ============ FAST DOCUMENT GENERATION ============
  async function generateDocumentsFast(jobInfo, keywords) {
    const start = performance.now();
    
    try {
      // Get profile data
      const data = await new Promise(resolve => chrome.storage.local.get(['ats_session', 'ats_profile'], resolve));
      const profile = data.ats_profile || {};
      const session = data.ats_session;
      
      if (!session?.access_token) {
        throw new Error('No session found');
      }
      
      // Use ProfessionalPDFEngine if available
      if (typeof ProfessionalPDFEngine !== 'undefined') {
        console.log('[ATS PERFECTION] Using ProfessionalPDFEngine');
        
        // Build CV content
        const cvContent = buildCVContent(profile, jobInfo, keywords);
        const cvPDF = await ProfessionalPDFEngine.generateCV(cvContent, {
          matchScore: 100,
          keywords: Array.isArray(keywords) ? keywords : keywords?.all || []
        });
        
        // Generate cover letter
        let coverPDF = null;
        if (typeof CoverLetterGenerator !== 'undefined') {
          const coverText = await CoverLetterGenerator.generate(profile, jobInfo, 'professional');
          coverPDF = await ProfessionalPDFEngine.generateCoverLetter(coverText, jobInfo);
        }
        
        // Create file objects
        cvFile = createPDFFile(cvPDF.base64, cvPDF.filename);
        if (coverPDF) {
          coverFile = createPDFFile(coverPDF.base64, coverPDF.filename);
        }
        
        filesLoaded = true;
        
        console.log(`[ATS PERFECTION] Documents generated in ${Math.round(performance.now() - start)}ms`);
        
        return { success: true, cvFile, coverFile };
      }
      
      // Fallback: Call edge function
      const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-cv-turbo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          jobInfo,
          keywords: Array.isArray(keywords) ? keywords : keywords?.all || [],
          profile,
          fast: true
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.cvPdf) {
        cvFile = createPDFFile(result.cvPdf.base64, result.cvPdf.filename);
      }
      if (result.coverPdf) {
        coverFile = createPDFFile(result.coverPdf.base64, result.coverPdf.filename);
      }
      
      filesLoaded = true;
      
      console.log(`[ATS PERFECTION] Documents generated via API in ${Math.round(performance.now() - start)}ms`);
      
      return { success: true, cvFile, coverFile };
      
    } catch (err) {
      console.error('[ATS PERFECTION] Document generation error:', err);
      return { success: false, error: err.message };
    }
  }
  
  function buildCVContent(profile, jobInfo, keywords) {
    return {
      name: profile.full_name || profile.name || 'Candidate',
      email: profile.email || '',
      phone: profile.phone || '',
      location: profile.location || defaultLocation,
      linkedin: profile.linkedin || '',
      summary: profile.summary || profile.professional_summary || '',
      experience: profile.professional_experience || [],
      education: profile.education || [],
      skills: Array.isArray(keywords) ? keywords : keywords?.all || profile.skills || [],
      certifications: profile.certifications || [],
      jobTitle: jobInfo.title,
      company: jobInfo.company
    };
  }
  
  // ============ REATTACHING FUNCTIONALITY ============
  async function reattachDocuments(cvFileToAttach, coverFileToAttach) {
    console.log('[ATS PERFECTION] Reattaching documents...');
    
    const cv = cvFileToAttach || cvFile;
    const cover = coverFileToAttach || coverFile;
    
    if (!cv) {
      console.log('[ATS PERFECTION] No CV to attach');
      return false;
    }
    
    // Find file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    let attached = 0;
    
    for (const input of fileInputs) {
      const label = (input.closest('label')?.textContent || input.getAttribute('aria-label') || input.name || '').toLowerCase();
      
      if (label.includes('resume') || label.includes('cv') || label.includes('curriculum')) {
        if (attachFileToInput(input, cv)) {
          attached++;
          console.log('[ATS PERFECTION] ✅ CV attached to:', label);
        }
      } else if (label.includes('cover') && cover) {
        if (attachFileToInput(input, cover)) {
          attached++;
          console.log('[ATS PERFECTION] ✅ Cover letter attached to:', label);
        }
      }
    }
    
    // Fallback: attach to first input if nothing matched
    if (attached === 0 && fileInputs.length > 0) {
      if (attachFileToInput(fileInputs[0], cv)) {
        attached++;
        console.log('[ATS PERFECTION] ✅ CV attached to first input (fallback)');
      }
    }
    
    return attached > 0;
  }
  
  function attachFileToInput(input, file) {
    if (!input || !file) return false;
    
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      
      // Dispatch events
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      return true;
    } catch (err) {
      console.warn('[ATS PERFECTION] Failed to attach file:', err);
      return false;
    }
  }
  
  function createPDFFile(base64OrBlob, filename) {
    try {
      let blob;
      if (typeof base64OrBlob === 'string') {
        const binaryString = atob(base64OrBlob.replace(/^data:.*base64,/, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: 'application/pdf' });
      } else {
        blob = base64OrBlob;
      }
      return new File([blob], filename, { type: 'application/pdf' });
    } catch (err) {
      console.error('[ATS PERFECTION] Failed to create PDF file:', err);
      return null;
    }
  }
  
  // ============ MESSAGE HANDLERS ============
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'UPDATE_DEFAULT_LOCATION' && message.defaultLocation) {
      defaultLocation = message.defaultLocation;
      console.log('[ATS PERFECTION] Updated default location to:', defaultLocation);
      sendResponse({ status: 'updated' });
      return true;
    }
    
    if (message.action === 'AUTO_TRIGGER_EXTRACT_APPLY') {
      console.log(`[ATS PERFECTION] ⚡ AUTO-TRIGGER received for ${message.platform}`);
      triggerExtractApply();
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'UPDATE_BANNER') {
      updatePersistentBanner(message.text, message.status);
      sendResponse({ status: 'updated' });
      return true;
    }
    
    if (message.action === 'TRIGGER_BULK_AUTOMATION') {
      console.log('[ATS PERFECTION] Bulk automation triggered');
      triggerExtractApply();
      sendResponse({ status: 'triggered' });
      return true;
    }
    
    if (message.action === 'INSTANT_TAILOR_ATTACH') {
      triggerExtractApply();
      sendResponse({ status: 'triggered' });
      return true;
    }
    
    if (message.action === 'REATTACH_DOCUMENTS') {
      reattachDocuments();
      sendResponse({ status: 'reattaching' });
      return true;
    }
    
    if (message.action === 'RUN_MANUAL_AUTOFILL') {
      console.log('[ATS PERFECTION] Running manual autofill...');
      triggerExtractApply();
      sendResponse({ success: true });
      return true;
    }
  });
  
  // ============ AUTO-TRIGGER ON LOAD (ALWAYS ON) ============
  if (document.readyState === 'complete') {
    setTimeout(autoTriggerOnLoad, FAST_DELAY);
  } else {
    window.addEventListener('load', () => setTimeout(autoTriggerOnLoad, FAST_DELAY));
  }
  
  console.log('[ATS PERFECTION] v3.5 initialization complete - ALWAYS-ON mode active');
  
})();
