// ATS PERFECTION v3.5 - Background Service Worker
// Features:
// - Auto-trigger ALWAYS ON (no settings check needed)
// - Faster detection and triggering
// - Enhanced Workday and bulk automation support

console.log('[ATS PERFECTION] v3.5 Background service worker started');

// ============ AUTO-TRIGGER ATS DETECTION (ALWAYS ON) ============
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
  'bullhornstaffing.com': 'Bullhorn',
  'oraclecloud.com': 'Oracle',
  'successfactors.com': 'SAP SuccessFactors'
};

// Track processed tabs
const processedTabs = new Set();

// Detect ATS platform (EXCLUDED: Lever, Ashby, Rippling, LinkedIn, Indeed)
function detectATSPlatform(url) {
  if (!url) return null;
  const urlLower = url.toLowerCase();
  
  // Excluded platforms
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

// ALWAYS ON - No settings check needed
async function handleAutoTrigger(tabId, url) {
  try {
    if (processedTabs.has(tabId)) {
      return;
    }

    const platform = detectATSPlatform(url);
    if (!platform) {
      return;
    }

    console.log(`[ATS PERFECTION] ⚡ ATS detected: ${platform} on tab ${tabId}`);
    processedTabs.add(tabId);

    // Faster delay (1 second instead of 2)
    await delay(1000);

    chrome.tabs.sendMessage(
      tabId,
      {
        action: 'AUTO_TRIGGER_EXTRACT_APPLY',
        platform: platform,
        url: url
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[ATS PERFECTION] Content script not ready:', chrome.runtime.lastError.message);
          processedTabs.delete(tabId);
        } else if (response?.success) {
          console.log(`[ATS PERFECTION] ✅ Auto-trigger successful on ${platform}`);
          chrome.action.setBadgeText({ text: '⚡', tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
          setTimeout(() => processedTabs.delete(tabId), 300000);
        } else {
          processedTabs.delete(tabId);
        }
      }
    );
  } catch (error) {
    console.error('[ATS PERFECTION] Auto-trigger error:', error);
    processedTabs.delete(tabId);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Tab update listener
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleAutoTrigger(tabId, tab.url);
  }
});

// Tab activation listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && tab.status === 'complete') {
      handleAutoTrigger(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.error('[ATS PERFECTION] Tab activation error:', error);
  }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  processedTabs.delete(tabId);
});

console.log('[ATS PERFECTION] Background ready - ALWAYS-ON Auto-trigger ACTIVE');

// Bulk queue state
let bulkQueue = [];
let currentBulkTabId = null;
let bulkProgress = { completed: 0, total: 0, currentJob: '', isPaused: false, isStopped: false };

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ATS PERFECTION] Extension installed');
    chrome.storage.local.set({
      workday_auto_enabled: true,
      autoTriggerEnabled: true // Always true
    });
  }
});

function updateBulkProgressStorage() {
  chrome.storage.local.set({ bulkProgress });
}

async function processNextBulkJob() {
  if (bulkProgress.isStopped || bulkProgress.isPaused) {
    return;
  }
  
  if (bulkQueue.length === 0) {
    bulkProgress.currentJob = 'Complete!';
    updateBulkProgressStorage();
    if (currentBulkTabId) {
      try { chrome.tabs.remove(currentBulkTabId); } catch {}
      currentBulkTabId = null;
    }
    return;
  }
  
  const job = bulkQueue.shift();
  bulkProgress.currentJob = job.url;
  updateBulkProgressStorage();
  
  try {
    if (currentBulkTabId) {
      await chrome.tabs.update(currentBulkTabId, { url: job.url });
    } else {
      const tab = await chrome.tabs.create({ url: job.url, active: false });
      currentBulkTabId = tab.id;
    }
    
    const onTabUpdated = (tabId, changeInfo) => {
      if (tabId === currentBulkTabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onTabUpdated);
        setTimeout(() => {
          chrome.tabs.sendMessage(currentBulkTabId, { 
            action: 'TRIGGER_BULK_AUTOMATION',
            jobUrl: job.url
          }).catch(() => {
            bulkProgress.completed++;
            updateBulkProgressStorage();
            processNextBulkJob();
          });
        }, 1500);
      }
    };
    
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    
  } catch (err) {
    bulkProgress.completed++;
    updateBulkProgressStorage();
    processNextBulkJob();
  }
}

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'keepAlive') {
    sendResponse({ status: 'alive' });
    return true;
  }
  
  if (message.action === 'resetProcessedTab' && message.tabId) {
    processedTabs.delete(message.tabId);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'openPopup') {
    chrome.action.setBadgeText({ text: '⚙️' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    sendResponse({ status: 'badge_set' });
    return true;
  }
  
  if (message.action === 'clearBadge') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ status: 'badge_cleared' });
    return true;
  }

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

  if (message.action === 'TRIGGER_EXTRACT_APPLY') {
    chrome.action.setBadgeText({ text: '⚡' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    
    chrome.storage.local.set({
      pending_extract_apply: {
        jobInfo: message.jobInfo,
        timestamp: Date.now(),
        triggeredFromAutomation: true
      }
    });
    
    sendResponse({ status: 'queued' });
    return true;
  }
  
  if (message.action === 'EXTRACT_APPLY_COMPLETE') {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    sendResponse({ status: 'acknowledged' });
    return true;
  }
  
  // Bulk automation handlers
  if (message.action === 'START_BULK_CSV_AUTOMATION') {
    bulkQueue = message.jobs || [];
    bulkProgress = { completed: 0, total: bulkQueue.length, currentJob: 'Starting...', isPaused: false, isStopped: false };
    updateBulkProgressStorage();
    processNextBulkJob();
    sendResponse({ status: 'started' });
    return true;
  }
  
  if (message.action === 'PAUSE_BULK_AUTOMATION') {
    bulkProgress.isPaused = true;
    updateBulkProgressStorage();
    sendResponse({ status: 'paused' });
    return true;
  }
  
  if (message.action === 'RESUME_BULK_AUTOMATION') {
    bulkProgress.isPaused = false;
    updateBulkProgressStorage();
    processNextBulkJob();
    sendResponse({ status: 'resumed' });
    return true;
  }
  
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
  
  if (message.action === 'BULK_JOB_COMPLETED') {
    bulkProgress.completed++;
    updateBulkProgressStorage();
    setTimeout(() => processNextBulkJob(), message.delay || 1000);
    sendResponse({ status: 'next' });
    return true;
  }
  
  if (message.action === 'GET_BULK_PROGRESS') {
    sendResponse({ progress: bulkProgress });
    return true;
  }
});
