// JobRefer.ai Extension - Popup Script

const API_BASE_URL = 'https://jobrefer.ai/api';
const WEB_APP_URL = 'https://jobrefer.ai';

// State
let currentUser = null;
let currentJobData = null;
let capturedJobs = [];

// DOM Elements
const elements = {
  loginSection: document.getElementById('loginSection'),
  mainSection: document.getElementById('mainSection'),
  userStatus: document.getElementById('userStatus'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  loginBtn: document.getElementById('loginBtn'),
  googleLoginBtn: document.getElementById('googleLoginBtn'),
  tokenInput: document.getElementById('tokenInput'),
  syncTokenBtn: document.getElementById('syncTokenBtn'),
  signupLink: document.getElementById('signupLink'),
  logoutBtn: document.getElementById('logoutBtn'),
  pageStatus: document.getElementById('pageStatus'),
  jobCapture: document.getElementById('jobCapture'),
  alreadyCaptured: document.getElementById('alreadyCaptured'),
  notJobPage: document.getElementById('notJobPage'),
  jobTitle: document.getElementById('jobTitle'),
  companyName: document.getElementById('companyName'),
  jobUrl: document.getElementById('jobUrl'),
  recruiterName: document.getElementById('recruiterName'),
  recruiterLinkedin: document.getElementById('recruiterLinkedin'),
  autoDetectSection: document.getElementById('autoDetectSection'),
  detectStatus: document.getElementById('detectStatus'),
  captureBtn: document.getElementById('captureBtn'),
  captureAndSendBtn: document.getElementById('captureAndSendBtn'),
  sendFromCapturedBtn: document.getElementById('sendFromCapturedBtn'),
  viewInDashboardBtn: document.getElementById('viewInDashboardBtn'),
  jobStatusValue: document.getElementById('jobStatusValue'),
  recentJobsList: document.getElementById('recentJobsList'),
  jobCount: document.getElementById('jobCount'),
  statPending: document.getElementById('statPending'),
  statSent: document.getElementById('statSent'),
  statToday: document.getElementById('statToday'),
  openDashboard: document.getElementById('openDashboard'),
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toastMessage'),
  // Usage elements
  usageSection: document.getElementById('usageSection'),
  planBadge: document.getElementById('planBadge'),
  usageStatus: document.getElementById('usageStatus'),
  usageBar: document.getElementById('usageBar'),
  usageText: document.getElementById('usageText')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  setupEventListeners();
  setupFormPersistence();
  await restoreFormData();
});

// Setup form persistence - save form data when user types
function setupFormPersistence() {
  const formFields = [
    { element: elements.recruiterName, key: 'recruiterName' },
    { element: elements.recruiterLinkedin, key: 'recruiterLinkedin' },
    { element: elements.jobTitle, key: 'jobTitle' },
    { element: elements.companyName, key: 'companyName' },
    { element: elements.jobUrl, key: 'jobUrl' }
  ];
  
  formFields.forEach(({ element, key }) => {
    if (element) {
      element.addEventListener('input', () => {
        saveFormField(key, element.value);
      });
    }
  });
}

// Save individual form field to storage
async function saveFormField(key, value) {
  const data = await getFormData();
  data[key] = value;
  data.lastUpdated = Date.now();
  return new Promise((resolve) => {
    chrome.storage.local.set({ formData: data }, resolve);
  });
}

// Get all form data from storage
async function getFormData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['formData'], (result) => {
      resolve(result.formData || {});
    });
  });
}

// Restore form data from storage
async function restoreFormData() {
  const data = await getFormData();
  
  // Only restore if data exists and is recent (within 30 minutes)
  if (!data.lastUpdated) return;
  
  const thirtyMinutes = 30 * 60 * 1000;
  if (Date.now() - data.lastUpdated > thirtyMinutes) {
    // Clear stale data
    await clearFormData();
    return;
  }
  
  // Restore values if fields are empty (don't overwrite auto-detected data)
  if (elements.recruiterName && !elements.recruiterName.value && data.recruiterName) {
    elements.recruiterName.value = data.recruiterName;
  }
  if (elements.recruiterLinkedin && !elements.recruiterLinkedin.value && data.recruiterLinkedin) {
    elements.recruiterLinkedin.value = data.recruiterLinkedin;
  }
  // Note: Don't restore jobTitle, companyName, jobUrl as these are auto-detected from the page
}

// Clear form data from storage
async function clearFormData() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['formData'], resolve);
  });
}

// Check authentication status
async function checkAuth() {
  const token = await getStoredToken();
  
  if (token) {
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        currentUser = await response.json();
        showMainSection();
        await loadCurrentPage();
        await loadRecentJobs();
        await loadStats();
      } else {
        await clearStoredToken();
        showLoginSection();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      showLoginSection();
    }
  } else {
    showLoginSection();
  }
}

// Setup event listeners
function setupEventListeners() {
  // Email/Password Login
  elements.loginBtn.addEventListener('click', handleLogin);
  elements.passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  // Google Login - redirects to web app
  elements.googleLoginBtn.addEventListener('click', handleGoogleLogin);
  
  // Token Sync
  elements.syncTokenBtn.addEventListener('click', handleTokenSync);
  elements.tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTokenSync();
  });
  
  // Signup link
  elements.signupLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${WEB_APP_URL}/auth` });
  });
  
  // Logout
  elements.logoutBtn.addEventListener('click', handleLogout);
  
  // Capture buttons
  elements.captureBtn.addEventListener('click', () => handleCapture(false));
  elements.captureAndSendBtn.addEventListener('click', () => handleCapture(true));
  elements.sendFromCapturedBtn.addEventListener('click', handleSendOutreach);
  
  // View in dashboard
  elements.viewInDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `${WEB_APP_URL}/jobs` });
  });
  
  // Open dashboard
  elements.openDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${WEB_APP_URL}/dashboard` });
  });
}

// Handle Google Login - Opens web app for authentication
async function handleGoogleLogin() {
  elements.googleLoginBtn.disabled = true;
  elements.googleLoginBtn.innerHTML = '<span class="loading"></span> Opening...';
  
  try {
    // Open the web app login page with extension=true parameter
    // The web app will show a token after successful login
    const loginUrl = `${WEB_APP_URL}/auth?extension=true`;
    
    // Open login page in new tab
    chrome.tabs.create({ url: loginUrl }, (tab) => {
      showToast('Complete login in the opened tab, then copy the token', 'info');
    });
    
  } catch (error) {
    console.error('Google login error:', error);
    showToast('Failed to open login page', 'error');
  } finally {
    elements.googleLoginBtn.disabled = false;
    elements.googleLoginBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      Login via Web App
    `;
  }
}

// Handle Token Sync - paste token from web app
async function handleTokenSync() {
  const token = elements.tokenInput.value.trim();
  
  if (!token) {
    showToast('Please paste your token from the web app', 'error');
    return;
  }
  
  elements.syncTokenBtn.disabled = true;
  elements.syncTokenBtn.innerHTML = '<span class="loading"></span>';
  
  try {
    // Verify the token by calling the profile API
    const response = await fetch(`${API_BASE_URL}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      await storeToken(token);
      showToast('Token synced successfully!', 'success');
      elements.tokenInput.value = '';
      await checkAuth();
    } else {
      showToast('Invalid or expired token. Please get a new one.', 'error');
    }
  } catch (error) {
    showToast('Failed to verify token. Check your connection.', 'error');
  } finally {
    elements.syncTokenBtn.disabled = false;
    elements.syncTokenBtn.textContent = '🔗 Sync Token';
  }
}

// Handle login
async function handleLogin() {
  const email = elements.emailInput.value.trim();
  const password = elements.passwordInput.value;
  
  if (!email || !password) {
    showToast('Please enter email and password', 'error');
    return;
  }
  
  elements.loginBtn.disabled = true;
  elements.loginBtn.innerHTML = '<span class="loading"></span>';
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      await storeToken(data.access_token);
      showToast('Login successful!', 'success');
      await checkAuth();
    } else {
      const error = await response.json();
      showToast(error.detail || 'Login failed', 'error');
    }
  } catch (error) {
    showToast('Connection error', 'error');
  } finally {
    elements.loginBtn.disabled = false;
    elements.loginBtn.textContent = 'Login';
  }
}

// Handle logout
async function handleLogout() {
  await clearStoredToken();
  currentUser = null;
  showLoginSection();
  showToast('Logged out');
}

// Load current page data
async function loadCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url;
    
    if (url.includes('linkedin.com/jobs/')) {
      elements.pageStatus.textContent = '✅ LinkedIn job page detected';
      
      // Extract job data from page
      const jobData = await extractJobData(tab.id);
      
      if (jobData) {
        currentJobData = jobData;
        
        // Check if already captured
        const existingJob = await checkIfJobExists(jobData.jobUrl);
        
        if (existingJob) {
          showAlreadyCaptured(existingJob);
        } else {
          showJobCapture(jobData);
        }
      } else {
        elements.pageStatus.textContent = '⚠️ Could not extract job details';
        showNotJobPage();
      }
    } else {
      elements.pageStatus.textContent = '📍 Not on a LinkedIn job page';
      showNotJobPage();
    }
  } catch (error) {
    console.error('Error loading page:', error);
    elements.pageStatus.textContent = '❌ Error loading page data';
    showNotJobPage();
  }
}

// Extract job data from LinkedIn page
async function extractJobData(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Helper to get text from multiple possible selectors
        function getTextFromSelectors(selectors) {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && el.textContent?.trim()) {
              return el.textContent.trim();
            }
          }
          return '';
        }
        
        // Helper to get href from multiple possible selectors
        function getHrefFromSelectors(selectors) {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
              const href = el.href || el.getAttribute('href');
              if (href) return href;
            }
          }
          return '';
        }
        
        // Job Title selectors (most specific to least)
        const jobTitleSelectors = [
          '.job-details-jobs-unified-top-card__job-title h1',
          '.job-details-jobs-unified-top-card__job-title a',
          '.job-details-jobs-unified-top-card__job-title',
          '.jobs-unified-top-card__job-title',
          '.t-24.job-details-jobs-unified-top-card__job-title',
          'h1.t-24',
          'h1.job-title',
          '.jobs-details__main-content h1',
          '.job-view-layout h1',
          'h1[class*="job-title"]',
          '.artdeco-entity-lockup__title',
          '[data-job-id] h1',
          '.jobs-search__job-details h1'
        ];
        
        // Company Name selectors
        const companyNameSelectors = [
          '.job-details-jobs-unified-top-card__company-name a',
          '.job-details-jobs-unified-top-card__company-name',
          '.jobs-unified-top-card__company-name a',
          '.jobs-unified-top-card__company-name',
          '.jobs-unified-top-card__subtitle-primary-grouping a',
          '.job-details-jobs-unified-top-card__primary-description-container a',
          '.artdeco-entity-lockup__subtitle',
          '[data-job-id] .company-name',
          '.jobs-details__main-content .company-name',
          'a[data-tracking-control-name="public_jobs_topcard-org-name"]'
        ];
        
        // Job Description selectors
        const jobDescriptionSelectors = [
          '.jobs-description__content',
          '.jobs-description-content__text',
          '.jobs-box__html-content',
          '#job-details',
          '.job-details-jobs-unified-top-card__job-description',
          '.jobs-description',
          '[class*="description__text"]',
          '.jobs-details__main-content [class*="description"]'
        ];
        
        // Hiring Manager/Recruiter selectors
        const recruiterNameSelectors = [
          '.jobs-poster__name',
          '.hirer-card__hirer-information .artdeco-entity-lockup__title',
          '.job-details-jobs-unified-top-card__hiring-manager-name',
          '.hiring-team-card__hiring-manager-name',
          '.artdeco-entity-lockup__title.ember-view',
          '[data-test-id="hiring-team-card"] .artdeco-entity-lockup__title',
          '.jobs-poster .artdeco-entity-lockup__title'
        ];
        
        const recruiterLinkSelectors = [
          '.jobs-poster__name a',
          '.hirer-card__hirer-information a[href*="/in/"]',
          '.job-details-jobs-unified-top-card__hiring-manager a',
          '[data-test-id="hiring-team-card"] a[href*="/in/"]',
          '.jobs-poster a[href*="/in/"]',
          '.hiring-team-card a[href*="/in/"]',
          'a[href*="/in/"][data-tracking-control-name*="hirer"]'
        ];
        
        const jobTitle = getTextFromSelectors(jobTitleSelectors);
        const companyName = getTextFromSelectors(companyNameSelectors);
        const jobDescription = getTextFromSelectors(jobDescriptionSelectors);
        const posterName = getTextFromSelectors(recruiterNameSelectors);
        const posterLinkedin = getHrefFromSelectors(recruiterLinkSelectors);
        const jobUrl = window.location.href.split('?')[0];
        
        console.log('JobRefer - Extracted:', { jobTitle, companyName, posterName, posterLinkedin });
        
        return {
          jobTitle,
          companyName,
          jobUrl,
          jobDescription: jobDescription.substring(0, 2000),
          posterName,
          posterLinkedin
        };
      }
    });
    
    return results[0]?.result;
  } catch (error) {
    console.error('Error extracting job data:', error);
    return null;
  }
}

// Check if job already exists
async function checkIfJobExists(jobUrl) {
  const token = await getStoredToken();
  
  try {
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const jobs = await response.json();
      return jobs.find(job => job.linkedin_url === jobUrl || job.linkedin_url.includes(jobUrl.split('/jobs/view/')[1]?.split('/')[0]));
    }
  } catch (error) {
    console.error('Error checking existing jobs:', error);
  }
  
  return null;
}

// Show job capture form
function showJobCapture(jobData) {
  elements.jobCapture.classList.remove('hidden');
  elements.alreadyCaptured.classList.add('hidden');
  elements.notJobPage.classList.add('hidden');
  
  elements.jobTitle.value = jobData.jobTitle;
  elements.companyName.value = jobData.companyName;
  elements.jobUrl.value = jobData.jobUrl;
  
  // Handle recruiter info
  if (jobData.posterName) {
    elements.autoDetectSection.className = 'auto-detect success';
    elements.detectStatus.textContent = '✅ Recruiter auto-detected!';
    elements.recruiterName.value = jobData.posterName;
    elements.recruiterLinkedin.value = jobData.posterLinkedin || '';
  } else {
    elements.autoDetectSection.className = 'auto-detect manual';
    elements.detectStatus.textContent = '✏️ Enter recruiter details manually';
    elements.recruiterName.value = '';
    elements.recruiterLinkedin.value = '';
  }
}

// Show already captured state
function showAlreadyCaptured(job) {
  elements.jobCapture.classList.add('hidden');
  elements.alreadyCaptured.classList.remove('hidden');
  elements.notJobPage.classList.add('hidden');
  
  elements.jobStatusValue.textContent = job.status.charAt(0).toUpperCase() + job.status.slice(1);
  currentJobData = { ...currentJobData, jobId: job.id || job._id };
  
  // Disable send button if already sent
  if (job.status === 'sent') {
    elements.sendFromCapturedBtn.disabled = true;
    elements.sendFromCapturedBtn.textContent = '✅ Already Sent';
  } else {
    elements.sendFromCapturedBtn.disabled = false;
    elements.sendFromCapturedBtn.innerHTML = '<span class="btn-icon">📧</span> Send Outreach';
  }
}

// Show not job page state
function showNotJobPage() {
  elements.jobCapture.classList.add('hidden');
  elements.alreadyCaptured.classList.add('hidden');
  elements.notJobPage.classList.remove('hidden');
}

// Handle job capture
async function handleCapture(sendImmediately) {
  const recruiterName = elements.recruiterName.value.trim();
  const recruiterLinkedin = elements.recruiterLinkedin.value.trim();
  
  if (!recruiterLinkedin) {
    showToast('Please enter recruiter LinkedIn URL', 'error');
    return;
  }
  
  const btn = sendImmediately ? elements.captureAndSendBtn : elements.captureBtn;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span>';
  
  const token = await getStoredToken();
  
  try {
    // Send ALL extracted data to backend
    const captureResponse = await fetch(`${API_BASE_URL}/jobs/quick-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        job_url: currentJobData.jobUrl || '',
        recruiter_linkedin: recruiterLinkedin,
        job_title: currentJobData.jobTitle || '',
        company_name: currentJobData.companyName || '',
        job_description: currentJobData.jobDescription || '',
        recruiter_name: recruiterName || ''
      })
    });
    
    const responseData = await captureResponse.json();
    
    if (!captureResponse.ok) {
      throw new Error(responseData.detail || 'Failed to capture job');
    }
    
    if (!responseData.success) {
      throw new Error(responseData.message || 'Failed to capture job');
    }
    
    // Job captured successfully - get job ID from response
    const jobId = responseData.id || responseData.job_id || responseData.job?.id;
    
    if (!jobId) {
      throw new Error('Job created but no ID returned');
    }
    
    // Show success with email status
    if (responseData.email_found) {
      showToast('Job captured with recruiter email! ✅', 'success');
    } else {
      showToast('Job captured! (Email not found - can retry in dashboard)', 'success');
    }
    
    // If send immediately AND email was found, send outreach
    if (sendImmediately) {
      if (responseData.email_found) {
        await sendOutreachEmail(jobId);
      } else {
        showToast('Cannot send - recruiter email not found', 'error');
      }
    }
    
    // Clear form data after successful capture
    await clearFormData();
    
    // Refresh UI
    await loadCurrentPage();
    await loadRecentJobs();
    await loadStats();
    
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.disabled = false;
    if (sendImmediately) {
      btn.innerHTML = '<span class="btn-icon">📧</span> Capture & Send';
    } else {
      btn.innerHTML = '<span class="btn-icon">📥</span> Capture Job';
    }
  }
}

// Handle send outreach from already captured job
async function handleSendOutreach() {
  if (!currentJobData?.jobId) {
    showToast('Job ID not found', 'error');
    return;
  }
  
  elements.sendFromCapturedBtn.disabled = true;
  elements.sendFromCapturedBtn.innerHTML = '<span class="loading"></span>';
  
  try {
    await sendOutreachEmail(currentJobData.jobId);
    await loadCurrentPage();
    await loadRecentJobs();
    await loadStats();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.sendFromCapturedBtn.disabled = false;
    elements.sendFromCapturedBtn.innerHTML = '<span class="btn-icon">📧</span> Send Outreach';
  }
}

// Send outreach email
async function sendOutreachEmail(jobId) {
  const token = await getStoredToken();
  
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/send-outreach`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to send outreach');
  }
  
  showToast('Outreach email sent! 🎉', 'success');
  return await response.json();
}

// Load recent jobs
async function loadRecentJobs() {
  const token = await getStoredToken();
  
  try {
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const jobs = await response.json();
      capturedJobs = jobs.slice(0, 5); // Get 5 most recent
      renderRecentJobs();
    }
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

// Render recent jobs list
function renderRecentJobs() {
  elements.jobCount.textContent = `(${capturedJobs.length})`;
  
  if (capturedJobs.length === 0) {
    elements.recentJobsList.innerHTML = '<p class="empty-list">No jobs captured yet</p>';
    return;
  }
  
  elements.recentJobsList.innerHTML = capturedJobs.map(job => `
    <div class="job-item" data-url="${job.linkedin_url}">
      <div class="job-item-info">
        <div class="job-item-title">${job.job_title || 'Unknown Title'}</div>
        <div class="job-item-company">${job.company_name || 'Unknown Company'}</div>
      </div>
      <span class="job-item-status ${job.status}">${job.status}</span>
    </div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.job-item').forEach(item => {
    item.addEventListener('click', () => {
      chrome.tabs.create({ url: item.dataset.url });
    });
  });
}

// Load stats
async function loadStats() {
  const token = await getStoredToken();
  
  try {
    const response = await fetch(`${API_BASE_URL}/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const stats = await response.json();
      // Map API response fields correctly
      elements.statPending.textContent = stats.pending_applications || 0;
      elements.statSent.textContent = stats.sent_applications || 0;
      elements.statToday.textContent = stats.sent_today || stats.jobs_today || 0;
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load usage/subscription status
async function loadUsage() {
  const token = await getStoredToken();
  
  try {
    const response = await fetch(`${API_BASE_URL}/subscription/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const sub = await response.json();
      
      // Update plan badge
      elements.planBadge.textContent = sub.plan_name || 'Free Plan';
      
      if (sub.is_unlimited) {
        // Unlimited plan
        elements.usageStatus.textContent = '✓ Unlimited';
        elements.usageStatus.className = 'usage-status';
        elements.usageBar.style.width = '100%';
        elements.usageBar.className = 'usage-bar';
        elements.usageText.textContent = 'Unlimited emails available';
      } else {
        // Limited plan - show usage
        const used = sub.emails_used_today || 0;
        const limit = sub.emails_per_day || 0;
        const remaining = sub.emails_remaining_today || 0;
        const percentage = limit > 0 ? (used / limit) * 100 : 0;
        
        // Update status
        if (remaining <= 0) {
          elements.usageStatus.textContent = '✗ Limit reached';
          elements.usageStatus.className = 'usage-status danger';
          elements.usageBar.className = 'usage-bar danger';
        } else if (percentage >= 80) {
          elements.usageStatus.textContent = `${remaining} left`;
          elements.usageStatus.className = 'usage-status warning';
          elements.usageBar.className = 'usage-bar warning';
        } else {
          elements.usageStatus.textContent = `${remaining} remaining`;
          elements.usageStatus.className = 'usage-status';
          elements.usageBar.className = 'usage-bar';
        }
        
        elements.usageBar.style.width = `${Math.min(percentage, 100)}%`;
        elements.usageText.textContent = `${used} / ${limit} emails sent today`;
        
        // Disable send buttons if limit reached
        if (remaining <= 0) {
          elements.captureAndSendBtn.disabled = true;
          elements.captureAndSendBtn.title = 'Daily limit reached';
        }
      }
    }
  } catch (error) {
    console.error('Error loading usage:', error);
    elements.usageText.textContent = 'Unable to load usage';
  }
}

// UI Helpers
function showLoginSection() {
  elements.loginSection.classList.remove('hidden');
  elements.mainSection.classList.add('hidden');
  elements.logoutBtn.classList.add('hidden');
  elements.userStatus.innerHTML = '<span class="status-dot offline"></span><span class="status-text">Not logged in</span>';
}

function showMainSection() {
  elements.loginSection.classList.add('hidden');
  elements.mainSection.classList.remove('hidden');
  elements.logoutBtn.classList.remove('hidden');
  elements.userStatus.innerHTML = `<span class="status-dot online"></span><span class="status-text">${currentUser.email}</span>`;
  // Load usage stats
  loadUsage();
}

function showToast(message, type = 'info') {
  elements.toastMessage.textContent = message;
  elements.toast.className = `toast ${type}`;
  elements.toast.classList.remove('hidden');
  
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

// Storage helpers
async function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], (result) => {
      resolve(result.token);
    });
  });
}

async function storeToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ token }, resolve);
  });
}

async function clearStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['token'], resolve);
  });
}

// Listen for messages from web app (for token sync)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === 'syncToken' && request.token) {
    storeToken(request.token).then(() => {
      sendResponse({ success: true });
      // Refresh auth state
      checkAuth();
    });
    return true;
  }
});
