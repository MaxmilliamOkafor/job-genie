// ATS Tailored CV & Cover Letter - Background Service Worker
// Handles extension lifecycle, Workday full flow coordination, Bulk CSV automation, and Auto-Trigger for ATS

console.log('[ATS Tailor] Background service worker started');

// ============ AUTO-TRIGGER ATS DETECTION ============
// ATS Platform Detection Map - EXCLUDED: Lever, Ashby, Rippling, LinkedIn, Indeed
const ATS_PLATFORMS = {
  'workday.com': 'Workday',
  'myworkdayjobs.com': 'Workday',
  'greenhouse.io': 'Greenhouse',
  'job-boards.greenhouse.io': 'Greenhouse',
  'boards.greenhouse.io': 'Greenhouse',
  'icims.com': 'iCIMS',
  'smartrecruiters.com': 'SmartRecruiters',
  'jobvite.com': 'Jobvite',
  'bamboohr.com': 'BambooHR',
  'recruitee.com': 'Recruitee',
  'breezy.hr': 'Breezy',
  'taleo.net': 'Oracle Taleo',
  'apply.workable.com': 'Workable',
  'workable.com': 'Workable',
  'recruiting.ultipro.com': 'UltiPro',
  'teamtailor.com': 'Teamtailor',
  'bullhorn.com': 'Bullhorn',
  'bullhornstaffing.com': 'Bullhorn'
};

// Track processed tabs to avoid duplicate triggers
const processedTabs = new Set();

// Detect if URL matches an ATS platform (EXCLUDED platforms ignored)
function detectATSPlatform(url) {
  if (!url) return null;
  const urlLower = url.toLowerCase();
  
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
    processedTabs.add(tabId);

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
      workday_email: 'Maxokafordev@gmail.com',
      workday_password: 'May19315park@',
      workday_verify_password: 'May19315park@',
      workday_auto_enabled: true,
      autoTriggerEnabled: true // Auto-trigger enabled by default
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
      try { chrome.tabs.remove(currentBulkTabId); } catch {}
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
});
