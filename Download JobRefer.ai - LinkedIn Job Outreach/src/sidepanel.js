// JobRefer.ai Side Panel Script
// Version 3.2 - Auto-refresh via background relay

// Get API URL from storage or use default
let API_BASE_URL = 'https://jobrefer.ai/api';
let WEB_APP_URL = 'https://jobrefer.ai';
let isInitialized = false;
let syncCheckInterval = null;
let lastKnownJobId = ''; // Track job ID (not URL) to detect job changes
let isLoadingJob = false;
let forceRefresh = false; // Flag to force refresh even if same job

// Initialize API URL from storage
async function initializeApiUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['api_base_url', 'web_app_url'], (result) => {
      if (result.api_base_url) {
        API_BASE_URL = result.api_base_url;
      }
      if (result.web_app_url) {
        WEB_APP_URL = result.web_app_url;
      }
      isInitialized = true;
      resolve();
    });
  });
}

async function ensureInitialized() {
  if (!isInitialized) {
    await initializeApiUrl();
  }
}

// State
let isAuthenticated = false;
let currentJobData = null;
let existingJobId = null;
let recruiterCount = 0;

// DOM Elements
const elements = {
  loginSection: null,
  mainSection: null,
  jobCapture: null,
  notJobPage: null,
  capturedJobInfo: null,
  syncingState: null,
  countdownScreen: null,
  countdownNumber: null,
  countdownText: null,
  countdownBar: null,
  refreshBtn: null,
  refreshJobBtn: null,
  loginViaDashboardBtn: null,
  captureBtn: null,
  captureAndSendBtn: null,
  addRecruiterBtn: null,
  recaptureBtn: null,
  recaptureAndSendBtn: null,
  logoutBtn: null,
  recruiterInputs: null,
  userStatus: null,
  pageStatus: null,
  jobTitle: null,
  companyName: null,
  duplicateWarning: null,
  recentJobsList: null,
  statPending: null,
  statSent: null,
  statToday: null,
  planBadge: null,
  usageText: null,
  usageBar: null,
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApiUrl();
  initElements();
  setupEventListeners();
  await checkAuth();
});

function initElements() {
  elements.loginSection = document.getElementById('loginSection');
  elements.mainSection = document.getElementById('mainSection');
  elements.jobCapture = document.getElementById('jobCapture');
  elements.notJobPage = document.getElementById('notJobPage');
  elements.capturedJobInfo = document.getElementById('capturedJobInfo');
  elements.syncingState = document.getElementById('syncingState');
  elements.countdownScreen = document.getElementById('countdownScreen');
  elements.countdownNumber = document.getElementById('countdownNumber');
  elements.countdownText = document.getElementById('countdownText');
  elements.countdownBar = document.getElementById('countdownBar');
  elements.refreshBtn = document.getElementById('refreshBtn');
  elements.refreshJobBtn = document.getElementById('refreshJobBtn');
  elements.loginViaDashboardBtn = document.getElementById('loginViaDashboardBtn');
  elements.captureBtn = document.getElementById('captureBtn');
  elements.captureAndSendBtn = document.getElementById('captureAndSendBtn');
  elements.addRecruiterBtn = document.getElementById('addRecruiterBtn');
  elements.recaptureBtn = document.getElementById('recaptureBtn');
  elements.recaptureAndSendBtn = document.getElementById('recaptureAndSendBtn');
  elements.logoutBtn = document.getElementById('logoutBtn');
  elements.viewExistingBtn = document.getElementById('viewExistingBtn');
  elements.sendExistingBtn = document.getElementById('sendExistingBtn');
  elements.viewDashboardBtn = document.getElementById('viewDashboardBtn');
  elements.recruiterInputs = document.getElementById('recruiterInputs');
  elements.userStatus = document.getElementById('userStatus');
  elements.pageStatus = document.getElementById('pageStatus');
  elements.jobTitle = document.getElementById('jobTitle');
  elements.companyName = document.getElementById('companyName');
  elements.duplicateWarning = document.getElementById('duplicateWarning');
  elements.recentJobsList = document.getElementById('recentJobsList');
  elements.jobCount = document.getElementById('jobCount');
  elements.statPending = document.getElementById('statPending');
  elements.statSent = document.getElementById('statSent');
  elements.statToday = document.getElementById('statToday');
  elements.planBadge = document.getElementById('planBadge');
  elements.usageText = document.getElementById('usageText');
  elements.usageBar = document.getElementById('usageBar');
}

function setupEventListeners() {
  // Login
  elements.loginViaDashboardBtn?.addEventListener('click', loginViaDashboard);
  elements.logoutBtn?.addEventListener('click', logout);
  
  // Refresh - FORCE reload
  elements.refreshBtn?.addEventListener('click', () => {
    console.log('Refresh button clicked');
    forceRefresh = true;
    manualRefresh();
  });
  elements.refreshJobBtn?.addEventListener('click', () => {
    console.log('Refresh job button clicked');
    forceRefresh = true;
    manualRefresh();
  });
  
  // Capture
  elements.captureBtn?.addEventListener('click', () => captureJob(false));
  elements.captureAndSendBtn?.addEventListener('click', () => captureJob(true));
  elements.recaptureBtn?.addEventListener('click', () => captureJob(false, true));
  elements.recaptureAndSendBtn?.addEventListener('click', () => captureJob(true, true));
  
  // Add recruiter
  elements.addRecruiterBtn?.addEventListener('click', addRecruiterInput);
  
  // Existing job actions
  elements.viewExistingBtn?.addEventListener('click', viewExistingJob);
  elements.sendExistingBtn?.addEventListener('click', sendExistingJob);
  elements.viewDashboardBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: `${WEB_APP_URL}/jobs` });
  });
  
  // Listen for messages from content script (via background relay) or background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Sidepanel received message:', request);
    
    if (request.action === 'jobChanged') {
      console.log('Job changed! Job ID:', request.jobId, 'Last known:', lastKnownJobId);
      
      // Always trigger refresh when we get jobChanged (don't block on same ID check)
      // The content script already verified it's a new job
      if (request.jobId) {
        lastKnownJobId = request.jobId;
        forceRefresh = true; // Force refresh even if ID matches
        loadJobWithCountdown();
      }
    }
    
    sendResponse({ received: true });
    return true;
  });
  
  // Listen for tab updates (URL changes) - backup detection
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active && tab.url?.includes('linkedin.com/jobs/')) {
      const newJobId = extractJobId(tab.url);
      console.log('Tab URL updated, job ID:', newJobId);
      if (newJobId && newJobId !== lastKnownJobId) {
        lastKnownJobId = newJobId;
        loadJobWithCountdown();
      }
    }
  });
  
  // Listen for tab activation (switching tabs)
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url?.includes('linkedin.com/jobs/')) {
        const newJobId = extractJobId(tab.url);
        console.log('Tab activated, job ID:', newJobId);
        // Don't auto-reload if same job, but check if we need to reload
        if (newJobId && newJobId !== lastKnownJobId) {
          lastKnownJobId = newJobId;
          loadJobWithCountdown();
        }
      }
    } catch (e) {
      console.log('Tab activation error:', e);
    }
  });
  
  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.token) {
      if (changes.token.newValue) {
        console.log('Token synced from website!');
        stopSyncCheck();
        checkAuth();
      }
    }
  });
}

// Extract job ID from LinkedIn URL
function extractJobId(url) {
  if (!url) return null;
  
  // Match: currentJobId=123456 OR /jobs/view/123456
  const patterns = [
    /currentJobId=(\d+)/,
    /\/jobs\/view\/(\d+)/,
    /\/jobs\/(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Manual refresh - always force reload
async function manualRefresh() {
  if (!isAuthenticated) return;
  
  showToast('Refreshing...', 'info');
  
  // Reset state to force reload
  lastKnownJobId = '';
  currentJobData = null;
  forceRefresh = true;
  
  await Promise.all([loadStats(), loadRecentJobs()]);
  await loadJobWithCountdown();
  
  forceRefresh = false;
  showToast('Refreshed!', 'success');
}

// Load job with countdown
async function loadJobWithCountdown() {
  console.log('loadJobWithCountdown called, isAuthenticated:', isAuthenticated, 'isLoadingJob:', isLoadingJob);
  
  if (!isAuthenticated) {
    console.log('Not authenticated, skipping');
    return;
  }
  
  if (isLoadingJob && !forceRefresh) {
    console.log('Already loading, skipping');
    return;
  }
  
  isLoadingJob = true;
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab:', tab?.url);
    
    if (!tab?.url?.includes('linkedin.com/jobs/')) {
      elements.pageStatus.innerHTML = '<span class="status-icon">📍</span><span class="status-text">Not on a LinkedIn job page</span>';
      elements.notJobPage?.classList.remove('hidden');
      elements.jobCapture?.classList.add('hidden');
      isLoadingJob = false;
      return;
    }
    
    const newJobId = extractJobId(tab.url);
    console.log('New job ID:', newJobId, 'Last known:', lastKnownJobId, 'Force:', forceRefresh);
    
    // Skip if same job (unless force refresh)
    if (!forceRefresh && newJobId && newJobId === lastKnownJobId && currentJobData) {
      console.log('Same job, keeping existing data');
      elements.notJobPage?.classList.add('hidden');
      elements.jobCapture?.classList.remove('hidden');
      isLoadingJob = false;
      return;
    }
    
    // Show countdown
    showCountdown();
    
    // Inject content script first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content.js']
      });
      console.log('Content script injected');
    } catch (e) {
      console.log('Content script injection:', e.message);
    }
    
    // Small delay to ensure content script is ready
    await sleep(200);
    
    // =============================================
    // PARALLEL: Countdown + Data Extraction
    // =============================================
    
    // Start data extraction (runs in background)
    const dataPromise = fetchJobDataWithRetry(tab.id);
    
    // Run countdown animation (visual) - runs in parallel with extraction
    await runCountdownAnimation();
    
    // By now, data should be ready - await the result
    const jobData = await dataPromise;
    
    // =============================================
    // END PARALLEL
    // =============================================
    
    // Hide countdown
    hideCountdown();
    
    // Update state
    lastKnownJobId = newJobId;
    
    if (jobData && jobData.jobTitle) {
      currentJobData = jobData;
      displayJobData(currentJobData);
      await checkDuplicateJob(currentJobData.jobUrl);
      
      // Check recruiters
      const recruiters = jobData.recruiters || [];
      if (recruiters.length > 0) {
        elements.pageStatus.innerHTML = `<span class="status-icon">✅</span><span class="status-text">Found ${recruiters.length} recruiter${recruiters.length > 1 ? 's' : ''}</span>`;
      } else if (jobData.posterLinkedin || jobData.posterName) {
        elements.pageStatus.innerHTML = '<span class="status-icon">✅</span><span class="status-text">Job detected</span>';
      } else {
        elements.pageStatus.innerHTML = '<span class="status-icon">⚠️</span><span class="status-text">Job loaded (no recruiter found)</span>';
      }
    } else {
      elements.pageStatus.innerHTML = '<span class="status-icon">⚠️</span><span class="status-text">Could not load job. Click Refresh.</span>';
      elements.notJobPage?.classList.add('hidden');
      elements.jobCapture?.classList.remove('hidden');
      clearRecruiterInputs();
      if (elements.jobTitle) elements.jobTitle.textContent = 'Unknown Position';
      if (elements.companyName) elements.companyName.textContent = 'Unknown Company';
    }
    
  } catch (error) {
    console.error('Error in loadJobWithCountdown:', error);
    hideCountdown();
    elements.pageStatus.innerHTML = '<span class="status-icon">❌</span><span class="status-text">Error loading job</span>';
  } finally {
    isLoadingJob = false;
    forceRefresh = false;
  }
}

// Fetch job data with multiple retry attempts during countdown
async function fetchJobDataWithRetry(tabId) {
  let jobData = null;
  const maxAttempts = 4;
  const delayBetweenAttempts = 600; // 600ms between attempts
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Fetching job data - attempt ${attempt}/${maxAttempts}`);
      const response = await chrome.tabs.sendMessage(tabId, { action: 'getJobData' });
      
      if (response?.success && response.data) {
        jobData = response.data;
        console.log(`Got job data on attempt ${attempt}:`, jobData.jobTitle);
        
        // If we got a valid title, we're done
        if (jobData.jobTitle && jobData.jobTitle !== 'Unknown Position') {
          return jobData;
        }
      }
    } catch (e) {
      console.log(`Attempt ${attempt} failed:`, e.message);
    }
    
    // Wait before next attempt (except on last attempt)
    if (attempt < maxAttempts) {
      await sleep(delayBetweenAttempts);
    }
  }
  
  // Return whatever we got (even if incomplete)
  return jobData;
}

// Run the countdown animation (visual only)
async function runCountdownAnimation() {
  updateCountdown(3, 'Detecting job page...', 33);
  await sleep(800);
  
  updateCountdown(2, 'Loading job details...', 66);
  await sleep(800);
  
  updateCountdown(1, 'Finding recruiter info...', 90);
  await sleep(800);
  
  updateCountdown('✓', 'Ready!', 100);
  await sleep(200);
}

function showCountdown() {
  elements.countdownScreen?.classList.remove('hidden');
  elements.jobCapture?.classList.add('hidden');
  elements.notJobPage?.classList.add('hidden');
  elements.capturedJobInfo?.classList.add('hidden');
}

function hideCountdown() {
  elements.countdownScreen?.classList.add('hidden');
  elements.jobCapture?.classList.remove('hidden');
}

function updateCountdown(number, text, progress) {
  if (elements.countdownNumber) {
    elements.countdownNumber.textContent = number;
    elements.countdownNumber.style.animation = 'none';
    elements.countdownNumber.offsetHeight;
    elements.countdownNumber.style.animation = 'countPop 0.3s ease-out';
  }
  if (elements.countdownText) {
    elements.countdownText.textContent = text;
  }
  if (elements.countdownBar) {
    elements.countdownBar.style.width = `${progress}%`;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Login
function loginViaDashboard() {
  showSyncingState();
  chrome.tabs.create({ url: `${WEB_APP_URL}/auth?extension=true` });
  startSyncCheck();
}

function showSyncingState() {
  const loginCard = elements.loginSection?.querySelector('.login-card');
  const heroSection = loginCard?.querySelector('.login-hero');
  const loginBtn = elements.loginViaDashboardBtn;
  const loginHint = loginCard?.querySelector('.login-hint');
  
  if (heroSection) heroSection.classList.add('hidden');
  if (loginBtn) loginBtn.classList.add('hidden');
  if (loginHint) loginHint.classList.add('hidden');
  if (elements.syncingState) elements.syncingState.classList.remove('hidden');
}

function hideSyncingState() {
  const loginCard = elements.loginSection?.querySelector('.login-card');
  const heroSection = loginCard?.querySelector('.login-hero');
  const loginBtn = elements.loginViaDashboardBtn;
  const loginHint = loginCard?.querySelector('.login-hint');
  
  if (heroSection) heroSection.classList.remove('hidden');
  if (loginBtn) loginBtn.classList.remove('hidden');
  if (loginHint) loginHint.classList.remove('hidden');
  if (elements.syncingState) elements.syncingState.classList.add('hidden');
}

function startSyncCheck() {
  stopSyncCheck();
  
  let attempts = 0;
  const maxAttempts = 120;
  
  syncCheckInterval = setInterval(async () => {
    attempts++;
    
    const result = await chrome.storage.local.get(['token']);
    if (result.token) {
      console.log('Token found after sync check');
      stopSyncCheck();
      await checkAuth();
      return;
    }
    
    if (attempts >= maxAttempts) {
      console.log('Sync check timed out');
      stopSyncCheck();
      hideSyncingState();
      showToast('Login timed out. Please try again.', 'error');
    }
  }, 1000);
}

function stopSyncCheck() {
  if (syncCheckInterval) {
    clearInterval(syncCheckInterval);
    syncCheckInterval = null;
  }
}

async function checkAuth() {
  await ensureInitialized();
  
  try {
    const result = await chrome.storage.local.get(['token']);
    
    if (result.token) {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${result.token}` }
      });
      
      if (response.ok) {
        isAuthenticated = true;
        hideSyncingState();
        showMainSection();
        updateUserStatus(true);
        showToast('Connected!', 'success');
        await Promise.all([loadStats(), loadRecentJobs()]);
        forceRefresh = true;
        await loadJobWithCountdown();
      } else {
        console.log('Auth failed, status:', response.status);
        hideSyncingState();
        showLoginSection();
        updateUserStatus(false);
      }
    } else {
      hideSyncingState();
      showLoginSection();
      updateUserStatus(false);
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    hideSyncingState();
    showLoginSection();
    updateUserStatus(false);
  }
}

async function logout() {
  await chrome.storage.local.remove(['token']);
  isAuthenticated = false;
  showLoginSection();
  updateUserStatus(false);
  showToast('Logged out', 'success');
}

function showLoginSection() {
  elements.loginSection?.classList.remove('hidden');
  elements.mainSection?.classList.add('hidden');
  elements.logoutBtn?.classList.add('hidden');
}

function showMainSection() {
  elements.loginSection?.classList.add('hidden');
  elements.mainSection?.classList.remove('hidden');
  elements.logoutBtn?.classList.remove('hidden');
}

function updateUserStatus(online) {
  const dot = elements.userStatus?.querySelector('.status-dot');
  if (dot) {
    dot.classList.toggle('online', online);
    dot.classList.toggle('offline', !online);
  }
}

function displayJobData(data) {
  elements.notJobPage?.classList.add('hidden');
  elements.jobCapture?.classList.remove('hidden');
  elements.capturedJobInfo?.classList.add('hidden');
  
  elements.jobTitle.textContent = data.jobTitle || 'Unknown Position';
  elements.companyName.textContent = data.companyName || 'Unknown Company';
  
  // Clear all existing recruiter inputs
  if (elements.recruiterInputs) {
    elements.recruiterInputs.innerHTML = '';
  }
  recruiterCount = 0;
  
  // Check if we have multiple recruiters (new format)
  const recruiters = data.recruiters || [];
  
  if (recruiters.length > 0) {
    recruiters.forEach((recruiter, index) => {
      addRecruiterInputWithData(recruiter.linkedin, recruiter.name, recruiter.type);
    });
  } else if (data.posterLinkedin || data.posterName) {
    addRecruiterInputWithData(data.posterLinkedin, data.posterName, 'contact');
  } else {
    addRecruiterInputWithData('', '', 'contact');
  }
  
  resetDuplicateState();
}

function addRecruiterInputWithData(linkedin, name, type) {
  recruiterCount++;
  const container = elements.recruiterInputs;
  if (!container) return;
  
  let badge = '';
  if (type === 'job_poster') {
    badge = '<span class="recruiter-badge poster">Job Poster</span>';
  } else if (type === 'connection') {
    badge = '<span class="recruiter-badge connection">Connection</span>';
  }
  
  const newItem = document.createElement('div');
  newItem.className = 'recruiter-input-item';
  newItem.dataset.index = recruiterCount - 1;
  newItem.innerHTML = `
    <div class="recruiter-header">
      <span class="recruiter-number">👤 Recruiter ${recruiterCount}</span>
      ${badge}
      ${recruiterCount > 1 ? '<button class="remove-recruiter-btn" onclick="this.closest(\'.recruiter-input-item\').remove()">✕</button>' : ''}
    </div>
    <input type="text" class="input recruiter-linkedin" placeholder="LinkedIn URL" value="${escapeHtml(linkedin || '')}" data-index="${recruiterCount - 1}">
    <input type="text" class="input recruiter-name" placeholder="Name" value="${escapeHtml(name || '')}" data-index="${recruiterCount - 1}">
  `;
  
  container.appendChild(newItem);
}

function addRecruiterInput() {
  addRecruiterInputWithData('', '', 'contact');
}

function clearRecruiterInputs() {
  if (elements.recruiterInputs) {
    elements.recruiterInputs.innerHTML = '';
  }
  recruiterCount = 0;
  addRecruiterInputWithData('', '', 'contact');
}

function resetDuplicateState() {
  existingJobId = null;
  elements.duplicateWarning?.classList.add('hidden');
  const recaptureActions = document.getElementById('recaptureActions');
  const normalActions = document.getElementById('normalActions');
  
  if (recaptureActions) recaptureActions.classList.add('hidden');
  if (normalActions) normalActions.classList.remove('hidden');
}

function normalizeJobUrl(url) {
  if (!url || url.trim() === '') return null;
  
  const jobIdMatch = url.match(/\/jobs\/(?:view\/)?(\d+)/);
  if (jobIdMatch && jobIdMatch[1]) {
    return jobIdMatch[1];
  }
  
  return null;
}

async function checkDuplicateJob(jobUrl) {
  if (!jobUrl) {
    resetDuplicateState();
    return;
  }
  
  const normalizedCurrentUrl = normalizeJobUrl(jobUrl);
  if (!normalizedCurrentUrl) {
    resetDuplicateState();
    return;
  }
  
  try {
    const token = await getStoredToken();
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const jobs = await response.json();
      
      const existing = jobs.find(j => {
        const normalizedExistingUrl = normalizeJobUrl(j.linkedin_url);
        return normalizedExistingUrl && normalizedExistingUrl === normalizedCurrentUrl;
      });
      
      if (existing) {
        existingJobId = existing.id;
        elements.duplicateWarning?.classList.remove('hidden');
        
        const recaptureActions = document.getElementById('recaptureActions');
        const normalActions = document.getElementById('normalActions');
        if (recaptureActions) recaptureActions.classList.remove('hidden');
        if (normalActions) normalActions.classList.add('hidden');
        
        document.getElementById('capturedStatus').textContent = existing.status;
        document.getElementById('capturedStatus').className = `value badge ${existing.status}`;
        document.getElementById('capturedRecruiter').textContent = existing.job_poster_name || 'Unknown';
      } else {
        resetDuplicateState();
      }
    }
  } catch (error) {
    console.error('Failed to check duplicate:', error);
    resetDuplicateState();
  }
}

async function captureJob(sendImmediately, forceRecapture = false) {
  await ensureInitialized();
  
  if (!currentJobData) {
    showToast('No job data detected. Click Refresh.', 'error');
    return;
  }
  
  const recruiterLinkedins = [];
  const recruiterNames = [];
  
  const linkedinInputs = elements.recruiterInputs?.querySelectorAll('.recruiter-linkedin');
  const nameInputs = elements.recruiterInputs?.querySelectorAll('.recruiter-name');
  
  linkedinInputs?.forEach((input, index) => {
    const linkedin = input.value.trim();
    const name = nameInputs[index]?.value?.trim() || '';
    
    if (linkedin) {
      if (!linkedin.includes('linkedin.com/in/')) {
        showToast(`Invalid LinkedIn URL: ${linkedin}`, 'error');
        return;
      }
      recruiterLinkedins.push(linkedin);
      recruiterNames.push(name);
    }
  });
  
  if (recruiterLinkedins.length === 0) {
    showToast('Please enter at least one recruiter LinkedIn URL', 'error');
    return;
  }
  
  setButtonsDisabled(true);
  showToast('Capturing job...', 'info');
  
  try {
    const token = await getStoredToken();
    
    if (forceRecapture && existingJobId) {
      await fetch(`${API_BASE_URL}/jobs/${existingJobId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
    
    const response = await fetch(`${API_BASE_URL}/jobs/quick-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        job_url: currentJobData.jobUrl,
        recruiter_linkedin: recruiterLinkedins[0],
        recruiter_linkedins: recruiterLinkedins,
        recruiter_names: recruiterNames,
        job_title: currentJobData.jobTitle,
        company_name: currentJobData.companyName,
        job_description: currentJobData.jobDescription,
        recruiter_name: recruiterNames[0] || currentJobData.posterName,
        recruiter_location: currentJobData.recruiterLocation
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      const jobId = data.job_id || data.id;
      
      if (data.credits_exhausted) {
        showToast('Job captured! But email lookup credits exhausted.', 'error');
      } else if (sendImmediately && data.email_found && jobId) {
        showToast('Job captured! Sending email...', 'info');
        await sendOutreach(jobId);
      } else if (data.email_found) {
        showToast(`Job captured! Found ${data.recruiters_count || 1} recruiter(s).`, 'success');
      } else {
        showToast('Job captured! Professional email not found - add work email manually.', 'success');
      }
      
      await Promise.all([loadStats(), loadRecentJobs()]);
      await checkDuplicateJob(currentJobData.jobUrl);
    } else {
      showToast(data.message || 'Failed to capture job', 'error');
    }
  } catch (error) {
    showToast('Network error. Please try again.', 'error');
    console.error('Capture error:', error);
  } finally {
    setButtonsDisabled(false);
  }
}

async function sendOutreach(jobId) {
  try {
    const token = await getStoredToken();
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/send-outreach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Email sent successfully! 🎉', 'success');
      await loadStats();
    } else {
      showToast(data.detail || 'Failed to send email', 'error');
    }
  } catch (error) {
    showToast('Failed to send email', 'error');
    console.error('Send error:', error);
  }
}

function viewExistingJob() {
  elements.jobCapture?.classList.add('hidden');
  elements.capturedJobInfo?.classList.remove('hidden');
}

async function sendExistingJob() {
  if (!existingJobId) {
    showToast('No existing job found', 'error');
    return;
  }
  
  setButtonsDisabled(true);
  showToast('Sending email...', 'info');
  
  await sendOutreach(existingJobId);
  
  setButtonsDisabled(false);
}

function setButtonsDisabled(disabled) {
  elements.captureBtn?.toggleAttribute('disabled', disabled);
  elements.captureAndSendBtn?.toggleAttribute('disabled', disabled);
  elements.recaptureBtn?.toggleAttribute('disabled', disabled);
  elements.recaptureAndSendBtn?.toggleAttribute('disabled', disabled);
  elements.sendExistingBtn?.toggleAttribute('disabled', disabled);
}

async function loadStats() {
  try {
    const token = await getStoredToken();
    if (!token) return;
    
    const response = await fetch(`${API_BASE_URL}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const stats = await response.json();
      
      elements.statPending.textContent = stats.pending_applications || 0;
      elements.statSent.textContent = stats.sent_applications || 0;
      elements.statToday.textContent = stats.jobs_today || 0;
      
      const used = stats.emails_sent_today || 0;
      const limit = stats.daily_limit || 3;
      const plan = stats.plan || 'free';
      const isUnlimited = stats.is_unlimited || limit === -1;
      
      elements.planBadge.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
      
      if (isUnlimited) {
        elements.usageText.textContent = `${used} emails today (Unlimited)`;
        elements.usageBar.style.width = '100%';
        elements.usageBar.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
      } else {
        elements.usageText.textContent = `${used}/${limit} emails today`;
        elements.usageBar.style.width = `${Math.min((used / limit) * 100, 100)}%`;
        elements.usageBar.style.background = 'linear-gradient(90deg, #6366f1, #8b5cf6)';
      }
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

async function loadRecentJobs() {
  try {
    const token = await getStoredToken();
    if (!token) return;
    
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const jobs = await response.json();
      
      elements.jobCount.textContent = jobs.length;
      
      if (jobs.length > 0) {
        elements.recentJobsList.innerHTML = jobs.slice(0, 5).map(job => `
          <div class="job-list-item">
            <div class="job-list-info">
              <div class="job-list-title">${escapeHtml(job.job_title || 'Unknown')}</div>
              <div class="job-list-company">${escapeHtml(job.company_name || 'Unknown')}</div>
            </div>
            <span class="job-list-status ${job.status === 'sent' ? 'sent' : 'pending'}">
              ${job.status === 'sent' ? '✓ Sent' : job.status}
            </span>
          </div>
        `).join('');
      } else {
        elements.recentJobsList.innerHTML = '<p class="empty-text">No jobs captured yet</p>';
      }
    }
  } catch (error) {
    console.error('Failed to load recent jobs:', error);
  }
}

async function getStoredToken() {
  const result = await chrome.storage.local.get(['token']);
  return result.token;
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  
  toast.className = `toast ${type}`;
  toastMessage.textContent = message;
  toast.classList.remove('hidden');
  
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
