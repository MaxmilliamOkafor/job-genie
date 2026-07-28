// ATS Tailored CV & Cover Letter - Background Service Worker
// Handles extension lifecycle, Workday full flow coordination, Bulk CSV automation, and Auto-Trigger for ATS

console.log('[ATS Tailor] Background service worker started');

// ============ AUTO-TRIGGER ATS DETECTION ============
// ATS Platform Detection Map - EXCLUDED: Lever, Ashby, Rippling, LinkedIn, Indeed
// v3.3: EXPANDED with 50+ additional platforms for maximum coverage
const ATS_PLATFORMS = {
  // Workday ecosystem
  'workday.com': 'Workday',
  'myworkdayjobs.com': 'Workday',
  'wd1.myworkdayjobs.com': 'Workday',
  'wd2.myworkdayjobs.com': 'Workday',
  'wd3.myworkdayjobs.com': 'Workday',
  'wd5.myworkdayjobs.com': 'Workday',
  // Greenhouse ecosystem
  'greenhouse.io': 'Greenhouse',
  'job-boards.greenhouse.io': 'Greenhouse',
  'boards.greenhouse.io': 'Greenhouse',
  'embed.greenhouse.io': 'Greenhouse',
  // iCIMS
  'icims.com': 'iCIMS',
  'jobs.icims.com': 'iCIMS',
  'careers.icims.com': 'iCIMS',
  // Major standalone ATS
  'smartrecruiters.com': 'SmartRecruiters',
  'jobs.smartrecruiters.com': 'SmartRecruiters',
  'jobvite.com': 'Jobvite',
  'app.jobvite.com': 'Jobvite',
  'hire.jobvite.com': 'Jobvite',
  'bamboohr.com': 'BambooHR',
  'recruitee.com': 'Recruitee',
  'breezy.hr': 'Breezy',
  'app.breezy.hr': 'Breezy',
  'taleo.net': 'Oracle Taleo',
  'tbe.taleo.net': 'Oracle Taleo',
  'chk.tbe.taleo.net': 'Oracle Taleo',
  'apply.workable.com': 'Workable',
  'workable.com': 'Workable',
  'jobs.workable.com': 'Workable',
  'recruiting.ultipro.com': 'UltiPro',
  'recruiting2.ultipro.com': 'UltiPro',
  'teamtailor.com': 'Teamtailor',
  'bullhorn.com': 'Bullhorn',
  'bullhornstaffing.com': 'Bullhorn',
  // v3.3 expanded ATS coverage
  'pinpointhq.com': 'Pinpoint',
  'jobs.pinpointhq.com': 'Pinpoint',
  'jobadder.com': 'JobAdder',
  'jazzhr.com': 'JazzHR',
  'applytojob.com': 'JazzHR',
  'app.jazzhr.com': 'JazzHR',
  'recruiterbox.com': 'RecruiterBox',
  'hirebridge.com': 'HireBridge',
  'silkroad.com': 'SilkRoad',
  'kenexa.com': 'IBM Kenexa',
  'brassring.com': 'IBM BrassRing',
  'sjobs.brassring.com': 'IBM BrassRing',
  'workforcenow.adp.com': 'ADP',
  'myworkforce.adp.com': 'ADP',
  'successfactors.com': 'SAP SuccessFactors',
  'jobs.sap.com': 'SAP SuccessFactors',
  'career.successfactors.eu': 'SAP SuccessFactors',
  'cornerstoneondemand.com': 'Cornerstone',
  'csod.com': 'Cornerstone',
  'peopleclick.com': 'PeopleClick',
  'ukg.com': 'UKG',
  'jobs.ukg.com': 'UKG',
  'recruiting.paylocity.com': 'Paylocity',
  'ceipal.com': 'Ceipal',
  'zohorecruit.com': 'Zoho Recruit',
  'jobs.personio.com': 'Personio',
  'jobs.personio.de': 'Personio',
  'factorialhr.com': 'Factorial',
  'jobs.gem.com': 'Gem',
  'peoplehr.com': 'PeopleHR',
  'app.hibob.com': 'Bob',
  'oraclecloud.com': 'Oracle HCM',
  'fa.oraclecloud.com': 'Oracle HCM',
  'jobs.oracle.com': 'Oracle',
  'careers.oracle.com': 'Oracle',
  // Tier-1 direct career sites
  'amazon.jobs': 'Amazon Jobs',
  'careers.google.com': 'Google Careers',
  'careers.microsoft.com': 'Microsoft Careers',
  'careers.meta.com': 'Meta Careers',
  'jobs.apple.com': 'Apple Careers',
  'careers.netflix.com': 'Netflix Careers',
  'jobs.netflix.com': 'Netflix Careers',
  'openai.com/careers': 'OpenAI Careers',
  'anthropic.com/careers': 'Anthropic Careers',
  'stripe.com/jobs': 'Stripe Careers',
  'careers.ibm.com': 'IBM Careers',
  'careers.accenture.com': 'Accenture Careers',
  'careers.deloitte.com': 'Deloitte Careers',
  'careers.pwc.com': 'PwC Careers',
  'jobs.jpmorgan.com': 'JPMorgan Careers',
  'jobs.gs.com': 'Goldman Sachs Careers',
  'careers.morganstanley.com': 'Morgan Stanley Careers'
};

// Thank you page URL patterns to SKIP
const THANK_YOU_URL_PATTERNS = [
  '/thank-you', '/thankyou', '/thanks', 
  '/application-submitted', '/application-complete', '/application-success',
  '/submitted', '/success', '/confirmation', '/confirmed',
  '/complete', '/applied', '/finished'
];

// Track processed tabs to avoid duplicate triggers (capped to prevent memory leak)
const processedTabs = new Set();
const MAX_PROCESSED_TABS = 100;

// Track thank you pages to skip (capped)
const thankYouPages = new Set();
const MAX_THANK_YOU_PAGES = 200;

function cappedAddProcessedTab(tabId) {
  if (processedTabs.size >= MAX_PROCESSED_TABS) {
    processedTabs.delete(processedTabs.values().next().value);
  }
  processedTabs.add(tabId);
}

function cappedAddThankYouPage(url) {
  if (thankYouPages.size >= MAX_THANK_YOU_PAGES) {
    thankYouPages.delete(thankYouPages.values().next().value);
  }
  thankYouPages.add(url);
}

// Check if URL is a thank you page
function isThankYouPageUrl(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  
  for (const pattern of THANK_YOU_URL_PATTERNS) {
    if (urlLower.includes(pattern)) {
      return true;
    }
  }
  return false;
}

// Detect if URL matches an ATS platform (EXCLUDED platforms ignored)
function detectATSPlatform(url) {
  if (!url) return null;
  const urlLower = url.toLowerCase();
  
  // Skip thank you pages
  if (isThankYouPageUrl(urlLower)) {
    console.log('[ATS Tailor] 🛑 Skipping Thank You page:', url);
    return null;
  }
  
  // Excluded platforms - never auto-trigger
  if (urlLower.includes('lever.co') || urlLower.includes('ashbyhq.com') || 
      urlLower.includes('rippling.com') || urlLower.includes('linkedin.com') || 
      urlLower.includes('indeed.com')) {
    return null;
  }

  for (const [domain, platform] of Object.entries(ATS_PLATFORMS)) {
    if (urlLower.includes(domain)) {
      return platform;
    }
  }
  return null;
}

// Check if auto-trigger is enabled
async function isAutoTriggerEnabled() {
  try {
    const data = await chrome.storage.local.get(['autoTriggerEnabled']);
    return data.autoTriggerEnabled !== false; // Default enabled
  } catch (error) {
    console.error('[ATS Tailor] Error checking auto-trigger setting:', error);
    return true; // Default enabled
  }
}

// Main auto-trigger handler
async function handleAutoTrigger(tabId, url) {
  try {
    // Check if already processed this tab
    if (processedTabs.has(tabId)) {
      console.log('[ATS Tailor] Tab already processed, skipping:', tabId);
      return;
    }

    // Check if auto-trigger is enabled
    const enabled = await isAutoTriggerEnabled();
    if (!enabled) {
      console.log('[ATS Tailor] Auto-trigger disabled in settings');
      return;
    }

    // Detect ATS platform (EXCLUDED: Lever, Ashby, Rippling, LinkedIn, Indeed)
    const platform = detectATSPlatform(url);
    if (!platform) {
      console.log('[ATS Tailor] No supported ATS platform detected:', url);
      return;
    }

    console.log(`[ATS Tailor] ⚡ ATS Platform detected: ${platform} on tab ${tabId}`);
    
    // Mark as processed immediately to prevent duplicate triggers
    cappedAddProcessedTab(tabId);

    // Wait for content script to be ready (2 seconds delay)
    await delay(2000);

    // Send auto-trigger message to content script
    chrome.tabs.sendMessage(
      tabId,
      {
        action: 'AUTO_TRIGGER_EXTRACT_APPLY',
        platform: platform,
        url: url
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[ATS Tailor] Content script not ready:', chrome.runtime.lastError.message);
          // Remove from processed tabs so it can retry on next load
          processedTabs.delete(tabId);
        } else if (response && response.success) {
          console.log(`[ATS Tailor] ✅ Auto-trigger successful on ${platform}`);
          
          // Set badge to indicate auto-trigger is running
          chrome.action.setBadgeText({ text: '⚡', tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId });
          
          // Remove from processed tabs after 5 minutes (allow re-trigger on page refresh)
          setTimeout(() => processedTabs.delete(tabId), 300000);
        } else {
          // Remove from processed so it can retry
          processedTabs.delete(tabId);
        }
      }
    );
  } catch (error) {
    console.error('[ATS Tailor] Auto-trigger error:', error);
    processedTabs.delete(tabId);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Listen for tab updates - Auto-trigger when ATS page loads
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleAutoTrigger(tabId, tab.url);
  }
});

// Listen for tab activation - Auto-trigger when switching to ATS tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && tab.status === 'complete') {
      handleAutoTrigger(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.error('[ATS Tailor] Tab activation error:', error);
  }
});

// Clean up processed tabs when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  processedTabs.delete(tabId);
});

console.log('[ATS Tailor] Background script ready - Auto-trigger ACTIVE (Workday, Greenhouse, iCIMS, SmartRecruiters, etc.)');

// Bulk CSV queue state
let bulkQueue = [];
let currentBulkTabId = null;
let bulkProgress = { completed: 0, total: 0, currentJob: '', isPaused: false, isStopped: false };

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ATS Tailor] Extension installed - setting defaults');
    chrome.storage.local.set({
      workday_auto_enabled: true,
      autoTriggerEnabled: true
    });
  } else if (details.reason === 'update') {
    console.log('[ATS Tailor] Extension updated to version', chrome.runtime.getManifest().version);
    chrome.storage.local.get(['workday_auto_enabled', 'autoTriggerEnabled'], (result) => {
      if (result.workday_auto_enabled === undefined) {
        chrome.storage.local.set({ workday_auto_enabled: true });
      }
      if (result.autoTriggerEnabled === undefined) {
        chrome.storage.local.set({ autoTriggerEnabled: true });
      }
    });
  }
});

// Update bulk progress in storage for popup sync
function updateBulkProgressStorage() {
  chrome.storage.local.set({ bulkProgress });
}

// Process next job in bulk queue
async function processNextBulkJob() {
  if (bulkProgress.isStopped || bulkProgress.isPaused) {
    console.log('[ATS Tailor Bulk] Queue paused/stopped');
    return;
  }
  
  if (bulkQueue.length === 0) {
    console.log('[ATS Tailor Bulk] Queue complete!');
    bulkProgress.currentJob = 'Complete!';
    updateBulkProgressStorage();
    
    // Close bulk tab if exists
    if (currentBulkTabId) {
      try { chrome.tabs.remove(currentBulkTabId); } catch {}
      currentBulkTabId = null;
    }
    return;
  }
  
  const job = bulkQueue.shift();
  bulkProgress.currentJob = job.url;
  updateBulkProgressStorage();
  
  console.log('[ATS Tailor Bulk] Processing:', job.url);
  
  try {
    // Create or navigate to tab
    if (currentBulkTabId) {
      await chrome.tabs.update(currentBulkTabId, { url: job.url });
    } else {
      const tab = await chrome.tabs.create({ url: job.url, active: false });
      currentBulkTabId = tab.id;
    }
    
    // Wait for tab to load, then trigger automation
    const onTabUpdated = (tabId, changeInfo) => {
      if (tabId === currentBulkTabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
        
        // Wait 2s for page JS to initialize, then trigger automation
        setTimeout(() => {
          chrome.tabs.sendMessage(currentBulkTabId, { 
            action: 'TRIGGER_BULK_AUTOMATION',
            jobUrl: job.url
          }).catch(err => {
            console.log('[ATS Tailor Bulk] Could not message tab:', err);
            // Move to next job on error
            bulkProgress.completed++;
            updateBulkProgressStorage();
            processNextBulkJob();
          });
        }, 2000);
      }
    };
    
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    
  } catch (err) {
    console.error('[ATS Tailor Bulk] Error processing job:', err);
    bulkProgress.completed++;
    updateBulkProgressStorage();
    processNextBulkJob();
  }
}

// Keep service worker alive and handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'keepAlive') {
    sendResponse({ status: 'alive' });
    return true;
  }
  
  // Reset processed tab for re-triggering
  if (message.action === 'resetProcessedTab' && message.tabId) {
    processedTabs.delete(message.tabId);
    sendResponse({ success: true });
    return true;
  }
  
  // Toggle auto-trigger setting
  if (message.action === 'SET_AUTO_TRIGGER') {
    chrome.storage.local.set({ autoTriggerEnabled: message.enabled });
    console.log('[ATS Tailor] Auto-trigger setting changed to:', message.enabled);
    sendResponse({ success: true });
    return true;
  }
  
  // Open the extension popup when automation starts
  if (message.action === 'openPopup') {
    chrome.action.setBadgeText({ text: '⚙️' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    sendResponse({ status: 'badge_set' });
    return true;
  }
  
  // Clear badge when automation completes
  if (message.action === 'clearBadge') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ status: 'badge_cleared' });
    return true;
  }

  // Handle Workday full flow trigger from popup
  if (message.action === 'TRIGGER_WORKDAY_FLOW') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'START_WORKDAY_FLOW',
          candidateData: message.candidateData
        });
      }
    });
    sendResponse({ status: 'triggered' });
    return true;
  }

  // Handle ATS Tailor autofill (from Workday flow completion)
  if (message.action === 'ATS_TAILOR_AUTOFILL') {
    console.log('[ATS Tailor] Received autofill request for platform:', message.platform);
    chrome.storage.local.set({
      pending_autofill: {
        platform: message.platform,
        candidate: message.candidate,
        jobData: message.jobData,
        timestamp: Date.now()
      }
    });
    sendResponse({ status: 'queued' });
    return true;
  }

  // Handle Workday credentials update
  if (message.action === 'UPDATE_WORKDAY_CREDENTIALS') {
    chrome.storage.local.set({
      workday_email: message.email,
      workday_password: message.password,
      workday_verify_password: message.verifyPassword || message.password
    });
    sendResponse({ status: 'updated' });
    return true;
  }
  
  // Handle TRIGGER_EXTRACT_APPLY from content script - forward to popup or queue
  if (message.action === 'TRIGGER_EXTRACT_APPLY') {
    console.log('[ATS Tailor Background] Received TRIGGER_EXTRACT_APPLY, forwarding to popup');
    
    chrome.action.setBadgeText({ text: '⚡' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    
    chrome.storage.local.set({
      pending_extract_apply: {
        jobInfo: message.jobInfo,
        timestamp: Date.now(),
        triggeredFromAutomation: true,
        showButtonAnimation: message.showButtonAnimation !== false
      }
    });
    
    chrome.runtime.sendMessage({
      action: 'POPUP_TRIGGER_EXTRACT_APPLY',
      jobInfo: message.jobInfo,
      showButtonAnimation: message.showButtonAnimation !== false
    }).catch(() => {
      console.log('[ATS Tailor Background] Popup not open, stored pending trigger');
    });
    
    sendResponse({ status: 'queued' });
    return true;
  }
  
  // Handle completion from popup to clear badge
  if (message.action === 'EXTRACT_APPLY_COMPLETE') {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    sendResponse({ status: 'acknowledged' });
    return true;
  }
  
  // ============ BULK CSV AUTOMATION HANDLERS ============
  
  // Start bulk CSV automation
  if (message.action === 'START_BULK_CSV_AUTOMATION') {
    console.log('[ATS Tailor Bulk] Starting bulk automation with', message.jobs?.length, 'jobs');
    bulkQueue = message.jobs || [];
    bulkProgress = { 
      completed: 0, 
      total: bulkQueue.length, 
      currentJob: 'Starting...', 
      isPaused: false, 
      isStopped: false 
    };
    updateBulkProgressStorage();
    processNextBulkJob();
    sendResponse({ status: 'started' });
    return true;
  }
  
  // Pause bulk automation
  if (message.action === 'PAUSE_BULK_AUTOMATION') {
    bulkProgress.isPaused = true;
    updateBulkProgressStorage();
    sendResponse({ status: 'paused' });
    return true;
  }
  
  // Resume bulk automation
  if (message.action === 'RESUME_BULK_AUTOMATION') {
    bulkProgress.isPaused = false;
    updateBulkProgressStorage();
    processNextBulkJob();
    sendResponse({ status: 'resumed' });
    return true;
  }
  
  // Stop bulk automation
  if (message.action === 'STOP_BULK_AUTOMATION') {
    bulkProgress.isStopped = true;
    bulkQueue = [];
    updateBulkProgressStorage();
    if (currentBulkTabId) {
      try { chrome.tabs.remove(currentBulkTabId); } catch (e) {
        console.warn('[ATS Tailor Bulk] Could not close tab:', e.message);
      }
      currentBulkTabId = null;
    }
    sendResponse({ status: 'stopped' });
    return true;
  }
  
  // Job completed - move to next
  if (message.action === 'BULK_JOB_COMPLETED') {
    console.log('[ATS Tailor Bulk] Job completed:', message.jobUrl || bulkProgress.currentJob);
    bulkProgress.completed++;
    updateBulkProgressStorage();
    
    // Wait before next job (Workday uses completion signal, others use timeout)
    setTimeout(() => {
      processNextBulkJob();
    }, message.delay || 1000);
    
    sendResponse({ status: 'next' });
    return true;
  }
  
  // Workday skip job (required field error on assessment)
  if (message.action === 'WORKDAY_SKIP_JOB') {
    console.log('[ATS Tailor Bulk] Skipping job due to required field error');
    bulkProgress.completed++;
    updateBulkProgressStorage();
    processNextBulkJob();
    sendResponse({ status: 'skipped' });
    return true;
  }
  
  // Get bulk progress
  if (message.action === 'GET_BULK_PROGRESS') {
    sendResponse({ progress: bulkProgress });
    return true;
  }
  
  // ============ LAZYAPPLY INTEGRATION HANDLERS ============
  
  // External automation tools (LazyApply) can check if extension is ready
  if (message.action === 'CHECK_EXTENSION_READY') {
    sendResponse({ 
      ready: true, 
      version: chrome.runtime.getManifest().version,
      name: 'ATS PERFECTION',
      capabilities: ['tailor', 'attach', 'autofill', 'workday', 'greenhouse']
    });
    return true;
  }
  
  // LazyApply can trigger automation on active tab
  if (message.action === 'LAZYAPPLY_START_AUTOMATION') {
    console.log('[ATS Tailor] 🚀 LazyApply automation trigger received');
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          // Clear badge
          chrome.action.setBadgeText({ text: '⚡', tabId: tab.id });
          chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId: tab.id });
          
          // Trigger automation on content script
          chrome.tabs.sendMessage(tab.id, {
            action: 'LAZYAPPLY_TRIGGER',
            source: 'background',
            timestamp: Date.now()
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[ATS Tailor] LazyApply trigger failed:', chrome.runtime.lastError.message);
              sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ status: response?.status || 'triggered' });
            }
          });
        } else {
          sendResponse({ status: 'error', error: 'No active tab' });
        }
      } catch (e) {
        sendResponse({ status: 'error', error: e.message });
      }
    })();
    return true;
  }
  
  // Get automation status for current tab
  if (message.action === 'GET_AUTOMATION_STATUS') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { action: 'CHECK_READY_STATUS' }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({ status: 'unknown', error: chrome.runtime.lastError.message });
            } else {
              sendResponse(response || { status: 'unknown' });
            }
          });
        } else {
          sendResponse({ status: 'unknown', error: 'No active tab' });
        }
      } catch (e) {
        sendResponse({ status: 'error', error: e.message });
      }
    })();
    return true;
  }
  
  // Signal that automation completed (from popup)
  if (message.action === 'AUTOMATION_COMPLETE_SIGNAL') {
    console.log('[ATS Tailor] 📡 Automation complete signal from popup');
    
    // Update badge to success
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
          chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: tab.id });
          
          // Clear badge after 5 seconds
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => {});
          }, 5000);
          
          // Mark as processed
          cappedAddProcessedTab(tab.id);
        }
      } catch (e) {}
    })();
    
    sendResponse({ status: 'acknowledged' });
    return true;
  }
  
  // Listen for new job page detection from content script - FORCE NEW AUTOMATION
  if (message.action === 'NEW_JOB_PAGE_DETECTED') {
    console.log('[ATS Tailor] 🔄 New job page detected:', message.url, message.forceNew ? '(FORCED)' : '');
    
    // Clear processed status for ALL tabs with this URL
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url === message.url || message.forceNew) {
            processedTabs.delete(tab.id);
            
            // Update badge to indicate ready for new automation
            chrome.action.setBadgeText({ text: '🔄', tabId: tab.id }).catch(() => {});
            chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId: tab.id }).catch(() => {});
            
            // Clear badge after 2 seconds
            setTimeout(() => {
              chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => {});
            }, 2000);
          }
        }
        
        // Also clear from thank you pages set
        thankYouPages.delete(message.url);
        
      } catch (e) {
        console.error('[ATS Tailor] Error clearing processed tabs:', e);
      }
    })();
    
    sendResponse({ status: 'acknowledged', forceNew: message.forceNew });
    return true;
  }
  
  // Handle thank you page detection - SKIP AUTOMATION
  if (message.action === 'THANK_YOU_PAGE_DETECTED') {
    console.log('[ATS Tailor] 🛑 Thank You page detected, marking as processed:', message.url);
    
    // Add to thank you pages set to prevent re-processing
    cappedAddThankYouPage(message.url);

    // Mark sender tab as processed
    if (sender.tab?.id) {
      cappedAddProcessedTab(sender.tab.id);
      
      // Update badge to indicate skipped
      chrome.action.setBadgeText({ text: '⏭️', tabId: sender.tab.id }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ color: '#6b7280', tabId: sender.tab.id }).catch(() => {});
      
      // Clear badge after 3 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: sender.tab.id }).catch(() => {});
      }, 3000);
    }
    
    sendResponse({ status: 'skipped', reason: 'thank_you_page' });
    return true;
  }
  
  // Force reset for external automation tools
  if (message.action === 'FORCE_RESET_FOR_NEW_JOB') {
    console.log('[ATS Tailor] 🔄 Force reset requested from external tool');
    
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          processedTabs.delete(tab.id);
          
          // Notify content script to reset
          chrome.tabs.sendMessage(tab.id, {
            action: 'AUTOMATION_RESET_COMPLETE',
            source: 'background',
            timestamp: Date.now()
          }).catch((e) => {
            console.warn('[ATS Tailor] Reset message failed (content script may not be loaded):', e.message);
          });
        }
      } catch (e) {
        console.warn('[ATS Tailor] Force reset error:', e.message);
      }
    })();
    
    sendResponse({ status: 'reset_triggered' });
    return true;
  }

  // ============ AI PAGE AUTOFILL INJECTION (Jobright v1.5.4 engine) ============
  if (message.action === 'JG_AUTOFILL_INJECT') {
    const tabId = sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: 'no-tab' });
      return true;
    }
    injectAutofillEngine(tabId)
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
});

// ===================================================================
// AI Page Autofill engine (Jobright v1.5.4 Ultimate Edition) integration
// -------------------------------------------------------------------
// All vendor files live under /autofill-engine. We register them as
// dynamic content scripts only when the user's `autofill_enabled`
// preference is true, and provide an on-demand injector for Run Now.
// ===================================================================

const AUTOFILL_SCRIPT_ID = 'jg-autofill-engine-v1_5_4';
const AUTOFILL_STYLE_ID = 'jg-autofill-engine-v1_5_4-css';
const AUTOFILL_VENDOR_FILES = [
  'autofill-engine/jg-gate.js',
  'autofill-engine/ua-enhancement.js',
  'autofill-engine/constants.js',
  'autofill-engine/filler.js',
  'autofill-engine/contents.js',
];
const AUTOFILL_VENDOR_CSS = [
  'autofill-engine/inter.css',
  'autofill-engine/contents.css',
];

// Hosts where the 7.5 MB vendor bundle would crash heavy SPAs.  Mirror of
// the EXCLUDE_MATCHES list used for static registration.
const AUTOFILL_DENYLIST_HOSTS = [
  'hiring.cafe', 'linkedin.com', 'indeed.com', 'glassdoor.com',
  'levels.fyi', 'teamblind.com', 'otta.com', 'welcometothejungle.com',
  'angel.co', 'wellfound.com', 'jobright.ai',
  'chat.openai.com', 'chatgpt.com', 'claude.ai',
];

function _isAutofillBlockedUrl(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return AUTOFILL_DENYLIST_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch (e) {
    return true;
  }
}

async function injectAutofillEngine(tabId) {
  // Defense-in-depth: even when called via Run Now / toggle ON, refuse
  // to inject the multi-MB vendor bundle into job-aggregator SPAs that
  // have no forms to fill and crash under the memory load.
  let tabUrl = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    tabUrl = tab?.url || '';
  } catch (e) {}
  if (_isAutofillBlockedUrl(tabUrl)) {
    console.warn('[JG-Autofill] Skipping inject for denied host:', tabUrl);
    return { injected: false, reason: 'denied-host', url: tabUrl };
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId, allFrames: true },
      files: AUTOFILL_VENDOR_CSS,
    });
  } catch (e) {
    console.warn('[JG-Autofill] CSS insert failed:', e.message);
  }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files: AUTOFILL_VENDOR_FILES,
    world: 'ISOLATED',
  });
  return { injected: true };
}

async function registerAutofillContentScripts() {
  // Match list: only actual ATS application hosts where forms exist to fill.
  // Loading the 7.5 MB vendor bundle on every page (`<all_urls>`) was
  // crashing job-aggregator SPAs (hiring.cafe, etc.) under memory pressure.
  const ATS_MATCHES = [
    'https://*.greenhouse.io/*',
    'https://*.workday.com/*',
    'https://*.myworkdayjobs.com/*',
    'https://*.smartrecruiters.com/*',
    'https://*.bullhornstaffing.com/*',
    'https://*.bullhorn.com/*',
    'https://*.teamtailor.com/*',
    'https://*.workable.com/*',
    'https://*.icims.com/*',
    'https://*.oracle.com/*',
    'https://*.oraclecloud.com/*',
    'https://*.taleo.net/*',
    'https://*.jobvite.com/*',
    'https://*.bamboohr.com/*',
    'https://*.recruitee.com/*',
    'https://*.jazzhr.com/*',
    'https://*.lever.co/*',
    'https://*.ashbyhq.com/*',
    'https://*.successfactors.com/*',
    'https://*.brassring.com/*',
    'https://*.adp.com/*',
    'https://*.csod.com/*',
    'https://*.ukg.com/*',
    'https://*.paylocity.com/*',
    'https://*.zohorecruit.com/*',
    'https://*.personio.com/*',
    'https://*.metacareers.com/*',
    'https://*.netflix.net/*',
    // career sub-paths on major employers
    'https://*.google.com/about/careers/*',
    'https://*.meta.com/careers/*',
    'https://*.amazon.com/jobs/*',
    'https://*.microsoft.com/en-us/jobs/*',
    'https://*.apple.com/careers/*',
    'https://*.salesforce.com/company/careers/*',
    'https://*.stripe.com/jobs/*',
    'https://*.tiktok.com/careers/*',
    // Generic apply-page heuristic: many ATS embed under /apply or /job paths.
    // We can't safely match these without overmatching, so keep the host list
    // explicit instead.
  ];
  // Sites that look like job aggregators and that the vendor MUST NOT load
  // on (heavy SPAs, no application forms, or the vendor's own product).
  const EXCLUDE_MATCHES = [
    'https://hiring.cafe/*',
    'https://*.hiring.cafe/*',
    'https://*.linkedin.com/*',
    'https://*.indeed.com/*',
    'https://*.glassdoor.com/*',
    'https://*.levels.fyi/*',
    'https://*.teamblind.com/*',
    'https://*.otta.com/*',
    'https://*.welcometothejungle.com/*',
    'https://*.angel.co/*',
    'https://*.wellfound.com/*',
    'https://*.jobright.ai/*',
    'https://*.google.com/search*',
    'https://*.bing.com/search*',
    'https://chat.openai.com/*',
    'https://chatgpt.com/*',
    'https://claude.ai/*',
  ];

  const scriptDef = {
    id: AUTOFILL_SCRIPT_ID,
    js: AUTOFILL_VENDOR_FILES,
    css: AUTOFILL_VENDOR_CSS,
    matches: ATS_MATCHES,
    excludeMatches: EXCLUDE_MATCHES,
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true,
  };

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [AUTOFILL_SCRIPT_ID],
    });
    if (existing && existing.length) {
      await chrome.scripting.updateContentScripts([scriptDef]);
    } else {
      await chrome.scripting.registerContentScripts([scriptDef]);
    }
    console.log('[JG-Autofill] Vendor content scripts registered');
  } catch (e) {
    console.warn('[JG-Autofill] register failed:', e.message);
  }
}

async function unregisterAutofillContentScripts() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [AUTOFILL_SCRIPT_ID] });
    console.log('[JG-Autofill] Vendor content scripts unregistered');
  } catch (e) {
    // Ignore: already not registered.
  }
}

// ===================================================================
// Native Indeed autofill (lightweight, separate from the heavy vendor).
// Indeed is denylisted for the 7.5 MB vendor bundle because it crashes
// Indeed's SPA -- so we register a small dedicated filler there instead,
// gated on the SAME `autofill_enabled` toggle. It self-checks the toggle
// at runtime too, so it can never fire while the toggle is off.
// ===================================================================
const INDEED_SCRIPT_ID = 'jg-indeed-autofill';
const LINKEDIN_SCRIPT_ID = 'jg-linkedin-autofill';

// Both site fillers share autofill-core.js (field intelligence) and must
// load it FIRST -- content-script file order is guaranteed by Chrome.
async function _registerSiteFiller(id, files, matches, allFrames) {
  const scriptDef = {
    id,
    js: ['autofill-core.js'].concat(files),
    matches,
    runAt: 'document_idle',
    allFrames: !!allFrames,
    persistAcrossSessions: true,
  };
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing && existing.length) await chrome.scripting.updateContentScripts([scriptDef]);
    else await chrome.scripting.registerContentScripts([scriptDef]);
    console.log('[JG-Autofill] registered:', id);
  } catch (e) {
    console.warn('[JG-Autofill] register failed for ' + id + ':', e.message);
  }
}

async function _unregisterSiteFiller(id) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
    console.log('[JG-Autofill] unregistered:', id);
  } catch (e) {
    // Ignore: already not registered.
  }
}

// Indeed rides the MASTER autofill toggle.
const registerIndeedAutofill = () => _registerSiteFiller(
  INDEED_SCRIPT_ID, ['indeed-autofill.js'],
  ['https://*.indeed.com/*', 'https://smartapply.indeed.com/*'],
  true                       // apply form renders inside an iframe
);
const unregisterIndeedAutofill = () => _unregisterSiteFiller(INDEED_SCRIPT_ID);

// LinkedIn Easy Apply has its OWN dedicated toggle, so it can run without
// pulling in the heavy vendor engine (which is denylisted on linkedin.com
// because it crashes the SPA).
const registerLinkedInAutofill = () => _registerSiteFiller(
  LINKEDIN_SCRIPT_ID, ['linkedin-autofill.js'],
  ['https://*.linkedin.com/*'],
  false
);
const unregisterLinkedInAutofill = () => _unregisterSiteFiller(LINKEDIN_SCRIPT_ID);

// ===================================================================
// SINGLE-AUTHORITY TOGGLE SYNC (the fix for "the toggle messes up").
// -------------------------------------------------------------------
// register/unregister are async. Firing them directly from rapid
// storage.onChanged events raced: on->off->on could apply out of order
// and leave the engine registered while the toggle reads OFF (or the
// reverse). We now funnel EVERY trigger through one promise-chained lock
// that, each turn, reads the LIVE toggle value and drives the registered
// state to match it. Last write always wins; state can never desync.
// ===================================================================
let _syncChain = Promise.resolve();
let _syncPending = false;

function syncAutofillRegistrationFromStorage() {
  // Coalesce bursts: if a sync is already queued behind the running one,
  // don't stack more -- the queued run will read the latest value anyway.
  if (_syncPending) return _syncChain;
  _syncPending = true;
  _syncChain = _syncChain.then(async () => {
    _syncPending = false;
    let enabled = false;
    let linkedinEnabled = false;
    try {
      const r = await new Promise((resolve) =>
        chrome.storage.local.get(['autofill_enabled', 'linkedin_autofill_enabled'], resolve)
      );
      enabled = r && r.autofill_enabled === true;
      linkedinEnabled = r && r.linkedin_autofill_enabled === true;
    } catch (e) {}
    try {
      // Master toggle: vendor engine + Indeed filler.
      if (enabled) {
        await registerAutofillContentScripts();
        await registerIndeedAutofill();
      } else {
        await unregisterAutofillContentScripts();
        await unregisterIndeedAutofill();
      }
      // LinkedIn Easy Apply: independent toggle.
      if (linkedinEnabled) await registerLinkedInAutofill();
      else await unregisterLinkedInAutofill();

      console.log('[JG-Autofill] Toggle sync applied: autofill =', enabled, '| linkedin =', linkedinEnabled);
    } catch (e) {
      console.warn('[JG-Autofill] Toggle sync error:', e && e.message);
    }
  }).catch(() => { _syncPending = false; });
  return _syncChain;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.autofill_enabled && !changes.linkedin_autofill_enabled) return;
  // Always re-derive from live state -- never trust the event's newValue
  // in isolation (it can arrive out of order under rapid toggling).
  syncAutofillRegistrationFromStorage();
});

chrome.runtime.onStartup.addListener(syncAutofillRegistrationFromStorage);
chrome.runtime.onInstalled.addListener(syncAutofillRegistrationFromStorage);

// Also sync at service-worker load so manual Chrome reloads pick up the state.
syncAutofillRegistrationFromStorage();
