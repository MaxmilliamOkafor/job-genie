// QuantumHire AI - Popup Script
// Enhanced UI with combined Tailor + Auto-fill + Add to Queue functionality

// DOM Elements
const notConnectedSection = document.getElementById('not-connected');
const connectedSection = document.getElementById('connected');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const refreshBtn = document.getElementById('refresh-btn');
const applyNowBtn = document.getElementById('apply-now-btn');
const addQueueBtn = document.getElementById('add-queue-btn');
const progressSection = document.getElementById('progress-section');
const resultsSection = document.getElementById('results-section');
const jobCard = document.getElementById('job-card');
const jobDetails = document.getElementById('job-details');
const atsBadge = document.getElementById('ats-badge');
const statusMessage = document.getElementById('status-message');
const queueStatus = document.getElementById('queue-status');
const queueCountEl = document.getElementById('queue-count');

// Credentials elements
const credentialsToggle = document.getElementById('credentials-toggle');
const credentialsBody = document.getElementById('credentials-body');
const atsEmailInput = document.getElementById('ats-email');
const atsPasswordInput = document.getElementById('ats-password');
const saveCredentialsBtn = document.getElementById('save-credentials-btn');
const clearCredentialsBtn = document.getElementById('clear-credentials-btn');
const autofillToggle = document.getElementById('autofill-toggle');

// Default ATS credentials (will be saved to local storage on first load)
const DEFAULT_ATS_EMAIL = 'Maxokafordev@gmail.com';
const DEFAULT_ATS_PASSWORD = 'May19315park@';

// Config
const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';
const DASHBOARD_URL = 'https://lovable.dev/projects/47ce3fc9-a939-41ad-bf41-c4c34dc10c2b';

let currentJob = null;
let userProfile = null;
let jobQueue = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeDefaults();
  loadConnection();
  loadCredentials();
  loadJobQueue();
  loadAutofillSetting();
  setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  // Login form
  if (loginForm) {
    loginForm.addEventListener('submit', handleConnect);
  }
  
  // Disconnect and refresh
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', handleDisconnect);
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshProfile);
  }
  
  // Apply and queue buttons
  if (applyNowBtn) {
    applyNowBtn.addEventListener('click', handleApplyWithAI);
  }
  if (addQueueBtn) {
    addQueueBtn.addEventListener('click', handleAddToQueue);
  }
  
  // Auto-fill toggle
  if (autofillToggle) {
    autofillToggle.addEventListener('change', handleAutofillToggle);
  }
  
  // Credentials toggle (expand/collapse)
  if (credentialsToggle) {
    credentialsToggle.addEventListener('click', () => {
      credentialsBody.classList.toggle('hidden');
      const arrow = credentialsToggle.querySelector('.toggle-arrow');
      if (arrow) {
        arrow.textContent = credentialsBody.classList.contains('hidden') ? '▼' : '▲';
      }
    });
  }
  
  // Credentials save/clear
  if (saveCredentialsBtn) {
    saveCredentialsBtn.addEventListener('click', saveCredentials);
  }
  if (clearCredentialsBtn) {
    clearCredentialsBtn.addEventListener('click', clearCredentials);
  }
  
  // Password visibility toggle
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = atsPasswordInput.type === 'password' ? 'text' : 'password';
      atsPasswordInput.type = type;
      togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }
  
  // Tab switching
  document.querySelectorAll('.content-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Copy buttons
  document.getElementById('copy-resume-btn')?.addEventListener('click', () => copyToClipboard('tailored-resume'));
  document.getElementById('copy-cover-btn')?.addEventListener('click', () => copyToClipboard('tailored-cover'));
  
  // Download buttons
  document.getElementById('download-resume-btn')?.addEventListener('click', () => downloadAsPDF('resume'));
  document.getElementById('download-cover-btn')?.addEventListener('click', () => downloadAsPDF('cover'));
  
  // Quick actions
  document.getElementById('open-dashboard-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: DASHBOARD_URL });
  });
  
  document.getElementById('view-queue-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: `${DASHBOARD_URL}?tab=queue` });
  });
}

// Initialize default values on first load
async function initializeDefaults() {
  const data = await chrome.storage.local.get(['atsCredentials', 'credentialsInitialized']);
  
  // Set default credentials on first load only
  if (!data.credentialsInitialized) {
    await chrome.storage.local.set({
      atsCredentials: {
        email: DEFAULT_ATS_EMAIL,
        password: DEFAULT_ATS_PASSWORD
      },
      credentialsInitialized: true,
      autofillEnabled: true
    });
    console.log('QuantumHire AI: Default credentials initialized');
  }
}

// Load auto-fill setting
async function loadAutofillSetting() {
  const data = await chrome.storage.local.get(['autofillEnabled']);
  const enabled = data.autofillEnabled !== false; // Default to true
  autofillToggle.checked = enabled;
  updateAutofillUI(enabled);
}

// Handle auto-fill toggle
async function handleAutofillToggle() {
  const enabled = autofillToggle.checked;
  await chrome.storage.local.set({ autofillEnabled: enabled });
  updateAutofillUI(enabled);
  showStatus(enabled ? 'Auto-fill enabled' : 'Auto-fill disabled', 'info');
}

// Update UI based on auto-fill setting
function updateAutofillUI(enabled) {
  const toggleLabel = document.querySelector('.toggle-label');
  if (toggleLabel) {
    toggleLabel.textContent = enabled ? '⚡ Auto-Fill Enabled' : '⚡ Auto-Fill Disabled';
  }
}

// Show status message
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 4000);
}

// Load saved connection
async function loadConnection() {
  const data = await chrome.storage.local.get(['userProfile', 'accessToken', 'refreshToken']);
  
  if (data.accessToken && data.userProfile) {
    userProfile = data.userProfile;
    showConnectedState(userProfile);
    detectCurrentJob();
  } else {
    showNotConnectedState();
  }
}

// Load ATS credentials
async function loadCredentials() {
  const data = await chrome.storage.local.get(['atsCredentials']);
  if (data.atsCredentials) {
    atsEmailInput.value = data.atsCredentials.email || '';
    atsPasswordInput.value = data.atsCredentials.password || '';
  }
}

// Save ATS credentials
async function saveCredentials() {
  const email = atsEmailInput.value.trim();
  const password = atsPasswordInput.value;
  
  await chrome.storage.local.set({
    atsCredentials: { email, password }
  });
  
  showStatus('ATS credentials saved locally', 'success');
}

// Clear ATS credentials
async function clearCredentials() {
  await chrome.storage.local.remove(['atsCredentials']);
  atsEmailInput.value = '';
  atsPasswordInput.value = '';
  showStatus('ATS credentials cleared', 'info');
}

// Load job queue
async function loadJobQueue() {
  const data = await chrome.storage.local.get(['jobQueue']);
  jobQueue = data.jobQueue || [];
  updateQueueDisplay();
}

// Update queue display
function updateQueueDisplay() {
  queueCountEl.textContent = jobQueue.length;
  queueStatus.classList.toggle('hidden', jobQueue.length === 0);
}

// Show connected state
function showConnectedState(profile) {
  notConnectedSection.classList.add('hidden');
  connectedSection.classList.remove('hidden');
  
  // Update profile display
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User';
  document.getElementById('profile-name').textContent = name;
  document.getElementById('profile-email').textContent = profile.email || '';
  
  // Avatar initials
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('avatar').textContent = initials || 'U';
  
  // Stats
  const skills = profile.skills || [];
  document.getElementById('skills-count').textContent = Array.isArray(skills) ? skills.length : 0;
  document.getElementById('exp-years').textContent = profile.total_experience || '0';
  document.getElementById('certs-count').textContent = (profile.certifications || []).length;
}

// Show not connected state
function showNotConnectedState() {
  notConnectedSection.classList.remove('hidden');
  connectedSection.classList.add('hidden');
}

// Handle connect
async function handleConnect(e) {
  e.preventDefault();
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) {
    showStatus('Please enter email and password', 'error');
    return;
  }
  
  connectBtn.disabled = true;
  connectBtn.innerHTML = '<span class="btn-icon">⏳</span> Connecting...';
  
  try {
    // Authenticate with Supabase
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ email, password }),
    });
    
    if (!authResponse.ok) {
      throw new Error('Invalid credentials');
    }
    
    const authData = await authResponse.json();
    
    // Fetch profile
    const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${authData.user.id}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${authData.access_token}`,
      },
    });
    
    const profiles = await profileResponse.json();
    const profile = profiles[0] || { email: authData.user.email };
    
    // Save to storage
    await chrome.storage.local.set({
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
      userProfile: profile,
      userId: authData.user.id,
    });
    
    userProfile = profile;
    showConnectedState(profile);
    detectCurrentJob();
    showStatus('Connected successfully!', 'success');
    
  } catch (error) {
    console.error('Connection error:', error);
    showStatus(error.message || 'Failed to connect', 'error');
  } finally {
    connectBtn.disabled = false;
    connectBtn.innerHTML = '<span class="btn-icon">🚀</span> Connect Account';
  }
}

// Handle disconnect
async function handleDisconnect() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userProfile', 'userId']);
  userProfile = null;
  currentJob = null;
  showNotConnectedState();
  showStatus('Disconnected', 'info');
}

// Refresh profile
async function refreshProfile() {
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="btn-icon">⏳</span> Refreshing...';
  
  try {
    const data = await chrome.storage.local.get(['accessToken', 'userId']);
    
    if (!data.accessToken) {
      throw new Error('Not authenticated');
    }
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${data.userId}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${data.accessToken}`,
      },
    });
    
    const profiles = await response.json();
    const profile = profiles[0];
    
    if (profile) {
      await chrome.storage.local.set({ userProfile: profile });
      userProfile = profile;
      showConnectedState(profile);
      showStatus('Profile refreshed!', 'success');
    }
  } catch (error) {
    console.error('Refresh error:', error);
    showStatus('Failed to refresh profile', 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<span class="btn-icon">🔄</span> Refresh Profile';
  }
}

// Detect ATS from URL
function detectATS(url) {
  if (!url) return 'Unknown';
  
  const atsMap = {
    'greenhouse.io': 'Greenhouse',
    'lever.co': 'Lever',
    'workday.com': 'Workday',
    'myworkdayjobs.com': 'Workday',
    'ashbyhq.com': 'Ashby',
    'icims.com': 'iCIMS',
    'smartrecruiters.com': 'SmartRecruiters',
    'jobvite.com': 'Jobvite',
    'bamboohr.com': 'BambooHR',
    'recruitee.com': 'Recruitee',
    'breezy.hr': 'Breezy',
  };
  
  for (const [domain, name] of Object.entries(atsMap)) {
    if (url.includes(domain)) return name;
  }
  
  return 'ATS';
}

// Detect current job on page
async function detectCurrentJob() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      updateJobCard(null);
      return;
    }
    
    // Detect ATS type
    const atsType = detectATS(tab.url);
    atsBadge.textContent = atsType;
    
    // Skip job boards - only work on company ATS pages
    if (tab.url?.includes('linkedin.com') || tab.url?.includes('indeed.com')) {
      jobDetails.innerHTML = '<span class="no-job">Open a company job page to apply</span>';
      applyNowBtn.disabled = true;
      addQueueBtn.disabled = true;
      return;
    }
    
    // Send message to content script to extract job
    chrome.tabs.sendMessage(tab.id, { action: 'extractJob' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        jobDetails.innerHTML = '<span class="no-job">No job detected on this page</span>';
        applyNowBtn.disabled = true;
        addQueueBtn.disabled = true;
        return;
      }
      
      currentJob = response;
      updateJobCard(response);
    });
    
  } catch (error) {
    console.error('Job detection error:', error);
    jobDetails.innerHTML = '<span class="no-job">Unable to detect job</span>';
    applyNowBtn.disabled = true;
    addQueueBtn.disabled = true;
  }
}

// Update job card display
function updateJobCard(job) {
  if (!job || job.title === 'Unknown Position') {
    jobDetails.innerHTML = '<span class="no-job">No job detected on this page</span>';
    applyNowBtn.disabled = true;
    addQueueBtn.disabled = true;
    return;
  }
  
  jobDetails.innerHTML = `
    <div class="job-title">${job.title}</div>
    <div class="job-company">${job.company}</div>
    ${job.location ? `<div class="job-location">📍 ${job.location}</div>` : ''}
  `;
  
  applyNowBtn.disabled = false;
  addQueueBtn.disabled = false;
}

// Handle Add to Queue
async function handleAddToQueue() {
  if (!currentJob) {
    showStatus('No job detected', 'error');
    return;
  }
  
  // Check if already in queue
  const exists = jobQueue.some(j => j.url === currentJob.url);
  if (exists) {
    showStatus('Job already in queue', 'info');
    return;
  }
  
  // Add to queue with timestamp
  const queueItem = {
    ...currentJob,
    addedAt: new Date().toISOString(),
    status: 'queued'
  };
  
  jobQueue.push(queueItem);
  await chrome.storage.local.set({ jobQueue });
  
  updateQueueDisplay();
  showStatus(`Added "${currentJob.title}" to queue!`, 'success');
  
  // Also save to Supabase if connected
  try {
    const data = await chrome.storage.local.get(['accessToken', 'userId']);
    if (data.accessToken && data.userId) {
      await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${data.accessToken}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: data.userId,
          title: currentJob.title,
          company: currentJob.company,
          location: currentJob.location || '',
          url: currentJob.url,
          description: currentJob.description?.substring(0, 5000) || '',
          requirements: currentJob.requirements || [],
          platform: currentJob.ats || 'Unknown',
          status: 'pending'
        })
      });
    }
  } catch (err) {
    console.log('Failed to sync to cloud, but saved locally');
  }
}

// Main action: Apply with AI (Tailor + Auto-fill combined)
async function handleApplyWithAI() {
  if (!currentJob || !userProfile) {
    showStatus('No job detected or profile not loaded', 'error');
    return;
  }
  
  // Show progress section
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  applyNowBtn.disabled = true;
  applyNowBtn.querySelector('.action-title').textContent = 'Processing...';
  
  try {
    // Step 1: Extracting job details
    updateProgress(1, 25);
    await delay(500);
    
    // Step 2: Analyzing ATS keywords
    updateProgress(2, 50);
    await delay(300);
    
    // Step 3: Tailoring resume & cover letter
    updateProgress(3, 75);
    
    const data = await chrome.storage.local.get(['accessToken']);
    
    // Call the tailor-application edge function
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.accessToken}`,
      },
      body: JSON.stringify({
        jobTitle: currentJob.title,
        company: currentJob.company,
        description: currentJob.description || '',
        requirements: currentJob.requirements || [],
        location: currentJob.location || '',
        userProfile: {
          firstName: userProfile.first_name,
          lastName: userProfile.last_name,
          email: userProfile.email,
          phone: userProfile.phone,
          linkedin: userProfile.linkedin,
          github: userProfile.github,
          portfolio: userProfile.portfolio,
          coverLetter: userProfile.cover_letter || '',
          workExperience: userProfile.work_experience || [],
          education: userProfile.education || [],
          skills: userProfile.skills || [],
          certifications: userProfile.certifications || [],
          achievements: userProfile.achievements || [],
          atsStrategy: userProfile.ats_strategy || 'Match keywords exactly from job description',
          city: userProfile.city,
          country: userProfile.country,
        },
        includeReferral: false,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Step 4: Auto-filling application (only if enabled)
    updateProgress(4, 90);
    
    // Check if auto-fill is enabled
    const settingsData = await chrome.storage.local.get(['autofillEnabled', 'atsCredentials']);
    const autofillEnabled = settingsData.autofillEnabled !== false;
    
    if (autofillEnabled) {
      // Send autofill command to content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'autofill',
          tailoredData: result,
          atsCredentials: settingsData.atsCredentials || null
        });
      }
    }
    
    // Complete progress
    updateProgress(4, 100);
    await delay(500);
    
    // Show results
    displayResults(result);
    const statusMsg = autofillEnabled 
      ? 'Application tailored and form filled!' 
      : 'Application tailored! (Auto-fill disabled)';
    showStatus(statusMsg, 'success');
    
  } catch (error) {
    console.error('Apply error:', error);
    showStatus(error.message || 'Failed to process application', 'error');
    progressSection.classList.add('hidden');
  } finally {
    applyNowBtn.disabled = false;
    applyNowBtn.querySelector('.action-title').textContent = 'Apply with AI';
  }
}

// Update progress display
function updateProgress(step, percent) {
  document.getElementById('progress-fill').style.width = `${percent}%`;
  
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step-${i}`);
    stepEl.classList.remove('active', 'complete');
    
    if (i < step) {
      stepEl.classList.add('complete');
    } else if (i === step) {
      stepEl.classList.add('active');
    }
  }
}

// Display results
function displayResults(result) {
  progressSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  
  // Update match score
  const score = result.matchScore || 0;
  document.getElementById('match-circle').setAttribute('stroke-dasharray', `${score}, 100`);
  document.getElementById('match-score-text').textContent = `${score}%`;
  
  // Update keywords matched
  const keywordsMatched = result.keywordsMatched || [];
  document.getElementById('keywords-matched').textContent = `${keywordsMatched.length} keywords matched`;
  
  // Display keyword tags
  const keywordsList = document.getElementById('keywords-list');
  keywordsList.innerHTML = '';
  
  keywordsMatched.slice(0, 10).forEach(keyword => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.textContent = keyword;
    keywordsList.appendChild(tag);
  });
  
  // Display missing keywords if available
  const keywordsMissing = result.keywordsMissing || [];
  keywordsMissing.slice(0, 5).forEach(keyword => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag missing';
    tag.textContent = keyword;
    keywordsList.appendChild(tag);
  });
  
  // Display tailored content
  document.getElementById('tailored-resume').value = result.tailoredResume || '';
  document.getElementById('tailored-cover').value = result.tailoredCoverLetter || '';
  
  // Display suggestions
  const suggestions = result.suggestedImprovements || [];
  const suggestionsList = document.getElementById('suggestions-list');
  suggestionsList.innerHTML = '';
  
  if (suggestions.length > 0) {
    document.getElementById('suggestions-section').classList.remove('hidden');
    suggestions.forEach(suggestion => {
      const li = document.createElement('li');
      li.textContent = suggestion;
      suggestionsList.appendChild(li);
    });
  } else {
    document.getElementById('suggestions-section').classList.add('hidden');
  }
}

// Switch content tabs
function switchTab(tabName) {
  document.querySelectorAll('.content-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  document.getElementById('resume-pane').classList.toggle('active', tabName === 'resume');
  document.getElementById('cover-pane').classList.toggle('active', tabName !== 'resume');
}

// Copy to clipboard
async function copyToClipboard(elementId) {
  const textarea = document.getElementById(elementId);
  const btn = document.getElementById(`copy-${elementId.includes('resume') ? 'resume' : 'cover'}-btn`);
  
  try {
    await navigator.clipboard.writeText(textarea.value);
    btn.innerHTML = '<span class="btn-icon">✅</span> Copied!';
    setTimeout(() => {
      btn.innerHTML = '<span class="btn-icon">📋</span> Copy';
    }, 2000);
  } catch (error) {
    showStatus('Failed to copy', 'error');
  }
}

// Download as PDF (opens in new tab for printing)
function downloadAsPDF(type) {
  const content = type === 'resume' 
    ? document.getElementById('tailored-resume').value 
    : document.getElementById('tailored-cover').value;
  
  if (!content) {
    showStatus('No content to download', 'error');
    return;
  }
  
  // Create a printable HTML page
  const title = type === 'resume' ? 'Tailored Resume' : 'Cover Letter';
  const fileName = type === 'resume' 
    ? `${userProfile?.first_name || 'User'}_Resume_${currentJob?.company || 'Job'}.pdf`
    : `${userProfile?.first_name || 'User'}_CoverLetter_${currentJob?.company || 'Job'}.pdf`;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body {
          font-family: 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.5;
          max-width: 8.5in;
          margin: 0.5in auto;
          padding: 0 0.5in;
          color: #000;
        }
        h1, h2, h3 { font-weight: bold; margin: 0.5em 0; }
        h1 { font-size: 16pt; text-align: center; }
        h2 { font-size: 12pt; border-bottom: 1px solid #000; padding-bottom: 2px; }
        h3 { font-size: 11pt; }
        p { margin: 0.5em 0; }
        ul { margin: 0.5em 0; padding-left: 1.5em; }
        li { margin: 0.25em 0; }
        @media print {
          body { margin: 0; padding: 0.5in; }
        }
      </style>
    </head>
    <body>
      <pre style="white-space: pre-wrap; font-family: inherit;">${content}</pre>
      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
  
  showStatus(`Opening ${title} for printing/PDF`, 'info');
}

// Utility: delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
