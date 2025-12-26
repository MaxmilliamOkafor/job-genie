// QuantumHire AI - Popup Script (Simplified & Reliable)

// Config
const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';
const DASHBOARD_URL = 'https://lovable.dev/projects/47ce3fc9-a939-41ad-bf41-c4c34dc10c2b';

// Default ATS credentials
const DEFAULT_ATS_EMAIL = 'Maxokafordev@gmail.com';
const DEFAULT_ATS_PASSWORD = 'May19315park@';

// State
let currentJob = null;
let userProfile = null;
let jobQueue = [];
let batchProcessing = false;
let batchCancelled = false;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('QuantumHire: Initializing...');
  
  // Initialize defaults first
  await initializeDefaults();
  
  // Load data
  await loadConnection();
  await loadCredentials();
  await loadJobQueue();
  await loadAutofillSetting();
  
  // Setup all event listeners
  setupEventListeners();
  
  console.log('QuantumHire: Ready!');
}

// Initialize default values on first load
async function initializeDefaults() {
  try {
    const data = await chrome.storage.local.get(['credentialsInitialized']);
    
    if (!data.credentialsInitialized) {
      await chrome.storage.local.set({
        atsCredentials: {
          email: DEFAULT_ATS_EMAIL,
          password: DEFAULT_ATS_PASSWORD
        },
        credentialsInitialized: true,
        autofillEnabled: true
      });
      console.log('QuantumHire: Default credentials initialized');
    }
  } catch (e) {
    console.error('Init defaults error:', e);
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleConnect);
  }
  
  // Disconnect button
  const disconnectBtn = document.getElementById('disconnect-btn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', handleDisconnect);
  }
  
  // Refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshProfile);
  }
  
  // Apply now button
  const applyNowBtn = document.getElementById('apply-now-btn');
  if (applyNowBtn) {
    applyNowBtn.addEventListener('click', handleApplyWithAI);
  }
  
  // Add to queue button
  const addQueueBtn = document.getElementById('add-queue-btn');
  if (addQueueBtn) {
    addQueueBtn.addEventListener('click', handleAddToQueue);
  }
  
  // Batch apply button
  const batchApplyBtn = document.getElementById('batch-apply-btn');
  if (batchApplyBtn) {
    batchApplyBtn.addEventListener('click', handleBatchApply);
  }
  
  // Cancel batch button
  const cancelBatchBtn = document.getElementById('cancel-batch-btn');
  if (cancelBatchBtn) {
    cancelBatchBtn.addEventListener('click', cancelBatchApply);
  }
  
  // Auto-fill toggle
  const autofillToggle = document.getElementById('autofill-toggle');
  if (autofillToggle) {
    autofillToggle.addEventListener('change', handleAutofillToggle);
  }
  
  // Credentials toggle (expand/collapse)
  const credentialsToggle = document.getElementById('credentials-toggle');
  const credentialsBody = document.getElementById('credentials-body');
  if (credentialsToggle && credentialsBody) {
    credentialsToggle.addEventListener('click', () => {
      credentialsBody.classList.toggle('hidden');
      const arrow = credentialsToggle.querySelector('.toggle-arrow');
      if (arrow) {
        arrow.textContent = credentialsBody.classList.contains('hidden') ? '▼' : '▲';
      }
    });
  }
  
  // Save credentials button
  const saveCredentialsBtn = document.getElementById('save-credentials-btn');
  if (saveCredentialsBtn) {
    saveCredentialsBtn.addEventListener('click', saveCredentials);
  }
  
  // Clear credentials button
  const clearCredentialsBtn = document.getElementById('clear-credentials-btn');
  if (clearCredentialsBtn) {
    clearCredentialsBtn.addEventListener('click', clearCredentials);
  }
  
  // Password visibility toggle
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  const atsPasswordInput = document.getElementById('ats-password');
  if (togglePasswordBtn && atsPasswordInput) {
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
  const copyResumeBtn = document.getElementById('copy-resume-btn');
  if (copyResumeBtn) {
    copyResumeBtn.addEventListener('click', () => copyToClipboard('tailored-resume'));
  }
  
  const copyCoverBtn = document.getElementById('copy-cover-btn');
  if (copyCoverBtn) {
    copyCoverBtn.addEventListener('click', () => copyToClipboard('tailored-cover'));
  }
  
  // Download buttons
  const downloadResumeBtn = document.getElementById('download-resume-btn');
  if (downloadResumeBtn) {
    downloadResumeBtn.addEventListener('click', () => downloadAsPDF('resume'));
  }
  
  const downloadCoverBtn = document.getElementById('download-cover-btn');
  if (downloadCoverBtn) {
    downloadCoverBtn.addEventListener('click', () => downloadAsPDF('cover'));
  }
  
  // Dashboard button
  const openDashboardBtn = document.getElementById('open-dashboard-btn');
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: DASHBOARD_URL });
    });
  }
  
  // View queue button
  const viewQueueBtn = document.getElementById('view-queue-btn');
  if (viewQueueBtn) {
    viewQueueBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: `${DASHBOARD_URL}?tab=queue` });
    });
  }
}

// Load saved connection
async function loadConnection() {
  try {
    const data = await chrome.storage.local.get(['userProfile', 'accessToken']);
    
    if (data.accessToken && data.userProfile) {
      userProfile = data.userProfile;
      showConnectedState(userProfile);
      detectCurrentJob();
    } else {
      showNotConnectedState();
    }
  } catch (e) {
    console.error('Load connection error:', e);
    showNotConnectedState();
  }
}

// Load ATS credentials
async function loadCredentials() {
  try {
    const data = await chrome.storage.local.get(['atsCredentials']);
    const atsEmailInput = document.getElementById('ats-email');
    const atsPasswordInput = document.getElementById('ats-password');
    
    if (data.atsCredentials && atsEmailInput && atsPasswordInput) {
      atsEmailInput.value = data.atsCredentials.email || '';
      atsPasswordInput.value = data.atsCredentials.password || '';
    }
  } catch (e) {
    console.error('Load credentials error:', e);
  }
}

// Load job queue
async function loadJobQueue() {
  try {
    const data = await chrome.storage.local.get(['jobQueue']);
    jobQueue = data.jobQueue || [];
    updateQueueDisplay();
  } catch (e) {
    console.error('Load queue error:', e);
  }
}

// Load auto-fill setting
async function loadAutofillSetting() {
  try {
    const data = await chrome.storage.local.get(['autofillEnabled']);
    const enabled = data.autofillEnabled !== false;
    const autofillToggle = document.getElementById('autofill-toggle');
    if (autofillToggle) {
      autofillToggle.checked = enabled;
    }
    updateAutofillUI(enabled);
  } catch (e) {
    console.error('Load autofill setting error:', e);
  }
}

// Handle auto-fill toggle
async function handleAutofillToggle() {
  const autofillToggle = document.getElementById('autofill-toggle');
  const enabled = autofillToggle ? autofillToggle.checked : true;
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
  const statusMessage = document.getElementById('status-message');
  if (!statusMessage) return;
  
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 4000);
}

// Show connected state
function showConnectedState(profile) {
  const notConnectedSection = document.getElementById('not-connected');
  const connectedSection = document.getElementById('connected');
  
  if (notConnectedSection) notConnectedSection.classList.add('hidden');
  if (connectedSection) connectedSection.classList.remove('hidden');
  
  // Update profile display
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User';
  
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const avatar = document.getElementById('avatar');
  
  if (profileName) profileName.textContent = name;
  if (profileEmail) profileEmail.textContent = profile.email || '';
  
  // Avatar initials
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (avatar) avatar.textContent = initials || 'U';
  
  // Stats
  const skills = profile.skills || [];
  const skillsCount = document.getElementById('skills-count');
  const expYears = document.getElementById('exp-years');
  const certsCount = document.getElementById('certs-count');
  
  if (skillsCount) skillsCount.textContent = Array.isArray(skills) ? skills.length : 0;
  if (expYears) expYears.textContent = profile.total_experience || '0';
  if (certsCount) certsCount.textContent = (profile.certifications || []).length;
}

// Show not connected state
function showNotConnectedState() {
  const notConnectedSection = document.getElementById('not-connected');
  const connectedSection = document.getElementById('connected');
  
  if (notConnectedSection) notConnectedSection.classList.remove('hidden');
  if (connectedSection) connectedSection.classList.add('hidden');
}

// Handle connect
async function handleConnect(e) {
  e.preventDefault();
  
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const connectBtn = document.getElementById('connect-btn');
  
  const email = emailInput?.value?.trim();
  const password = passwordInput?.value;
  
  if (!email || !password) {
    showStatus('Please enter email and password', 'error');
    return;
  }
  
  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.innerHTML = '<span class="btn-icon">⏳</span> Connecting...';
  }
  
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
    if (connectBtn) {
      connectBtn.disabled = false;
      connectBtn.innerHTML = '<span class="btn-icon">🚀</span> Connect Account';
    }
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
  const refreshBtn = document.getElementById('refresh-btn');
  
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span class="btn-icon">⏳</span> Refreshing...';
  }
  
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
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span class="btn-icon">🔄</span> Refresh Profile';
    }
  }
}

// Save ATS credentials
async function saveCredentials() {
  const atsEmailInput = document.getElementById('ats-email');
  const atsPasswordInput = document.getElementById('ats-password');
  
  const email = atsEmailInput?.value?.trim() || '';
  const password = atsPasswordInput?.value || '';
  
  await chrome.storage.local.set({
    atsCredentials: { email, password }
  });
  
  showStatus('ATS credentials saved locally', 'success');
}

// Clear ATS credentials
async function clearCredentials() {
  await chrome.storage.local.remove(['atsCredentials']);
  
  const atsEmailInput = document.getElementById('ats-email');
  const atsPasswordInput = document.getElementById('ats-password');
  
  if (atsEmailInput) atsEmailInput.value = '';
  if (atsPasswordInput) atsPasswordInput.value = '';
  
  showStatus('ATS credentials cleared', 'info');
}

// Update queue display
function updateQueueDisplay() {
  const queueCountEl = document.getElementById('queue-count');
  const queueStatus = document.getElementById('queue-status');
  
  if (queueCountEl) queueCountEl.textContent = jobQueue.length;
  if (queueStatus) queueStatus.classList.toggle('hidden', jobQueue.length === 0);
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
  const jobDetails = document.getElementById('job-details');
  const atsBadge = document.getElementById('ats-badge');
  const applyNowBtn = document.getElementById('apply-now-btn');
  const addQueueBtn = document.getElementById('add-queue-btn');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      if (jobDetails) jobDetails.innerHTML = '<span class="no-job">No job detected</span>';
      if (applyNowBtn) applyNowBtn.disabled = true;
      if (addQueueBtn) addQueueBtn.disabled = true;
      return;
    }
    
    // Detect ATS type
    const atsType = detectATS(tab.url);
    if (atsBadge) atsBadge.textContent = atsType;
    
    // Skip job boards
    if (tab.url?.includes('linkedin.com') || tab.url?.includes('indeed.com')) {
      if (jobDetails) jobDetails.innerHTML = '<span class="no-job">Open a company job page to apply</span>';
      if (applyNowBtn) applyNowBtn.disabled = true;
      if (addQueueBtn) addQueueBtn.disabled = true;
      return;
    }
    
    // Send message to content script to extract job
    chrome.tabs.sendMessage(tab.id, { action: 'extractJob' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        if (jobDetails) jobDetails.innerHTML = '<span class="no-job">No job detected on this page</span>';
        if (applyNowBtn) applyNowBtn.disabled = true;
        if (addQueueBtn) addQueueBtn.disabled = true;
        return;
      }
      
      currentJob = response;
      updateJobCard(response);
    });
    
  } catch (error) {
    console.error('Job detection error:', error);
    if (jobDetails) jobDetails.innerHTML = '<span class="no-job">Unable to detect job</span>';
    if (applyNowBtn) applyNowBtn.disabled = true;
    if (addQueueBtn) addQueueBtn.disabled = true;
  }
}

// Update job card display
function updateJobCard(job) {
  const jobDetails = document.getElementById('job-details');
  const applyNowBtn = document.getElementById('apply-now-btn');
  const addQueueBtn = document.getElementById('add-queue-btn');
  
  if (!job || job.title === 'Unknown Position') {
    if (jobDetails) jobDetails.innerHTML = '<span class="no-job">No job detected on this page</span>';
    if (applyNowBtn) applyNowBtn.disabled = true;
    if (addQueueBtn) addQueueBtn.disabled = true;
    return;
  }
  
  if (jobDetails) {
    jobDetails.innerHTML = `
      <div class="job-title">${job.title}</div>
      <div class="job-company">${job.company}</div>
      ${job.location ? `<div class="job-location">📍 ${job.location}</div>` : ''}
    `;
  }
  
  if (applyNowBtn) applyNowBtn.disabled = false;
  if (addQueueBtn) addQueueBtn.disabled = false;
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
  
  // Add to queue
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

// Main action: Apply with AI
async function handleApplyWithAI() {
  const progressSection = document.getElementById('progress-section');
  const resultsSection = document.getElementById('results-section');
  const applyNowBtn = document.getElementById('apply-now-btn');
  
  if (!currentJob || !userProfile) {
    showStatus('No job detected or profile not loaded', 'error');
    return;
  }
  
  // Show progress section
  if (progressSection) progressSection.classList.remove('hidden');
  if (resultsSection) resultsSection.classList.add('hidden');
  
  if (applyNowBtn) {
    applyNowBtn.disabled = true;
    const actionTitle = applyNowBtn.querySelector('.action-title');
    if (actionTitle) actionTitle.textContent = 'Processing...';
  }
  
  try {
    // Step 1: Extracting job details
    updateProgress(1, 25);
    showStatus('Extracting job details...', 'info');
    await delay(300);
    
    // Step 2: Analyzing ATS keywords
    updateProgress(2, 50);
    showStatus('Analyzing ATS keywords...', 'info');
    await delay(200);
    
    // Step 3: Tailoring resume & cover letter
    updateProgress(3, 70);
    showStatus('Tailoring resume & cover letter with AI...', 'info');
    
    const data = await chrome.storage.local.get(['accessToken']);
    
    if (!data.accessToken) {
      throw new Error('Not authenticated. Please reconnect your account.');
    }
    
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
          state: userProfile.state,
          country: userProfile.country,
          address: userProfile.address,
          zipCode: userProfile.zip_code,
        },
        includeReferral: false,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Session expired. Please reconnect your account.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait and try again.');
      }
      if (response.status === 402) {
        throw new Error('AI credits exhausted. Please add more credits.');
      }
      throw new Error(errorData.error || `Request failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log('QuantumHire: Tailored application received', { matchScore: result.matchScore });
    
    // Step 4: Generate PDFs and Auto-fill
    updateProgress(4, 85);
    showStatus('Generating PDFs & auto-filling...', 'info');
    
    // Check if auto-fill is enabled
    const settingsData = await chrome.storage.local.get(['autofillEnabled', 'atsCredentials']);
    const autofillEnabled = settingsData.autofillEnabled !== false;
    
    if (autofillEnabled) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          // Send autofill message with tailored data - the content script will handle PDF generation
          await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'autofill',
              tailoredData: result,
              atsCredentials: settingsData.atsCredentials || null,
              options: { generatePdfs: true }
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('Autofill communication error:', chrome.runtime.lastError);
                reject(new Error('Could not communicate with page. Please refresh and try again.'));
              } else {
                console.log('QuantumHire: Autofill response', response);
                resolve(response);
              }
            });
          });
        } catch (autofillError) {
          console.warn('Autofill error (non-fatal):', autofillError);
          // Don't throw - we still have the tailored content
        }
      }
    }
    
    // Complete progress
    updateProgress(4, 100);
    await delay(400);
    
    // Show results
    displayResults(result);
    const statusMsg = autofillEnabled 
      ? '✅ Application tailored and form filled!' 
      : '✅ Application tailored! (Auto-fill disabled)';
    showStatus(statusMsg, 'success');
    
  } catch (error) {
    console.error('Apply error:', error);
    showStatus(`❌ ${error.message || 'Failed to process application'}`, 'error');
    if (progressSection) progressSection.classList.add('hidden');
  } finally {
    if (applyNowBtn) {
      applyNowBtn.disabled = false;
      const actionTitle = applyNowBtn.querySelector('.action-title');
      if (actionTitle) actionTitle.textContent = 'Apply with AI';
    }
  }
}

// Update progress display
function updateProgress(step, percent) {
  const progressFill = document.getElementById('progress-fill');
  if (progressFill) progressFill.style.width = `${percent}%`;
  
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step-${i}`);
    if (stepEl) {
      stepEl.classList.remove('active', 'complete');
      
      if (i < step) {
        stepEl.classList.add('complete');
      } else if (i === step) {
        stepEl.classList.add('active');
      }
    }
  }
}

// Display results
function displayResults(result) {
  const progressSection = document.getElementById('progress-section');
  const resultsSection = document.getElementById('results-section');
  
  if (progressSection) progressSection.classList.add('hidden');
  if (resultsSection) resultsSection.classList.remove('hidden');
  
  // Update match score
  const score = result.matchScore || 0;
  const matchCircle = document.getElementById('match-circle');
  const matchScoreText = document.getElementById('match-score-text');
  
  if (matchCircle) matchCircle.setAttribute('stroke-dasharray', `${score}, 100`);
  if (matchScoreText) matchScoreText.textContent = `${score}%`;
  
  // Update keywords matched
  const keywordsMatched = result.keywordsMatched || [];
  const keywordsMatchedEl = document.getElementById('keywords-matched');
  if (keywordsMatchedEl) keywordsMatchedEl.textContent = `${keywordsMatched.length} keywords matched`;
  
  // Display keyword tags
  const keywordsList = document.getElementById('keywords-list');
  if (keywordsList) {
    keywordsList.innerHTML = '';
    
    keywordsMatched.slice(0, 10).forEach(keyword => {
      const tag = document.createElement('span');
      tag.className = 'keyword-tag';
      tag.textContent = keyword;
      keywordsList.appendChild(tag);
    });
    
    const keywordsMissing = result.keywordsMissing || [];
    keywordsMissing.slice(0, 5).forEach(keyword => {
      const tag = document.createElement('span');
      tag.className = 'keyword-tag missing';
      tag.textContent = keyword;
      keywordsList.appendChild(tag);
    });
  }
  
  // Display tailored content
  const tailoredResume = document.getElementById('tailored-resume');
  const tailoredCover = document.getElementById('tailored-cover');
  
  if (tailoredResume) tailoredResume.value = result.tailoredResume || '';
  if (tailoredCover) tailoredCover.value = result.tailoredCoverLetter || '';
  
  // Display suggestions
  const suggestions = result.suggestedImprovements || [];
  const suggestionsSection = document.getElementById('suggestions-section');
  const suggestionsList = document.getElementById('suggestions-list');
  
  if (suggestionsList) suggestionsList.innerHTML = '';
  
  if (suggestions.length > 0 && suggestionsSection && suggestionsList) {
    suggestionsSection.classList.remove('hidden');
    suggestions.forEach(suggestion => {
      const li = document.createElement('li');
      li.textContent = suggestion;
      suggestionsList.appendChild(li);
    });
  } else if (suggestionsSection) {
    suggestionsSection.classList.add('hidden');
  }
}

// Switch content tabs
function switchTab(tabName) {
  document.querySelectorAll('.content-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  const resumePane = document.getElementById('resume-pane');
  const coverPane = document.getElementById('cover-pane');
  
  if (resumePane) resumePane.classList.toggle('active', tabName === 'resume');
  if (coverPane) coverPane.classList.toggle('active', tabName !== 'resume');
}

// Copy to clipboard
async function copyToClipboard(elementId) {
  const textarea = document.getElementById(elementId);
  const btnId = elementId.includes('resume') ? 'copy-resume-btn' : 'copy-cover-btn';
  const btn = document.getElementById(btnId);
  
  try {
    await navigator.clipboard.writeText(textarea?.value || '');
    if (btn) {
      btn.innerHTML = '<span class="btn-icon">✅</span> Copied!';
      setTimeout(() => {
        btn.innerHTML = '<span class="btn-icon">📋</span> Copy';
      }, 2000);
    }
  } catch (error) {
    showStatus('Failed to copy', 'error');
  }
}

// Download as PDF - improved with actual PDF generation
async function downloadAsPDF(type) {
  const content = type === 'resume' 
    ? document.getElementById('tailored-resume')?.value 
    : document.getElementById('tailored-cover')?.value;
  
  if (!content) {
    showStatus('No content to download', 'error');
    return;
  }
  
  const btn = document.getElementById(type === 'resume' ? 'download-resume-btn' : 'download-cover-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
  }
  
  try {
    const firstName = (userProfile?.first_name || 'User').replace(/\s+/g, '');
    const lastName = (userProfile?.last_name || '').replace(/\s+/g, '');
    const companyName = (currentJob?.company || 'Company').replace(/[^a-zA-Z0-9]/g, '');
    const fileType = type === 'resume' ? 'CV' : 'CoverLetter';
    const fileName = `${firstName}${lastName}_${companyName}_${fileType}.pdf`;
    
    // Call the PDF generation endpoint
    const data = await chrome.storage.local.get(['accessToken']);
    
    const requestBody = {
      type: type === 'resume' ? 'resume' : 'cover_letter',
      personalInfo: {
        name: `${userProfile?.first_name || ''} ${userProfile?.last_name || ''}`.trim() || 'Applicant',
        email: userProfile?.email || '',
        phone: userProfile?.phone || '',
        location: currentJob?.location || userProfile?.city || '',
        linkedin: userProfile?.linkedin || '',
        github: userProfile?.github || '',
        portfolio: userProfile?.portfolio || ''
      },
      fileName: fileName
    };
    
    if (type === 'resume') {
      requestBody.summary = content.substring(0, 500);
      requestBody.experience = userProfile?.work_experience || [];
      requestBody.education = userProfile?.education || [];
      requestBody.skills = { primary: (userProfile?.skills || []).map(s => s.name || s) };
      requestBody.certifications = userProfile?.certifications || [];
    } else {
      requestBody.coverLetter = {
        recipientCompany: currentJob?.company || 'Company',
        jobTitle: currentJob?.title || 'Position',
        paragraphs: content.split(/\n\n+/).filter(p => p.trim().length > 20)
      };
    }
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': data.accessToken ? `Bearer ${data.accessToken}` : undefined
      },
      body: JSON.stringify(requestBody)
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.pdf) {
        // Create download link
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${result.pdf}`;
        link.download = result.fileName || fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showStatus(`✅ Downloaded: ${result.fileName}`, 'success');
        return;
      }
    }
    
    // Fallback to print-based PDF
    console.log('QuantumHire: Falling back to print-based PDF');
    const title = type === 'resume' ? 'Tailored Resume' : 'Cover Letter';
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
        <script>window.onload = function() { window.print(); };<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
    showStatus(`Opening ${title} for printing/PDF`, 'info');
    
  } catch (error) {
    console.error('PDF download error:', error);
    showStatus('Failed to generate PDF', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">⬇️</span> Download PDF';
    }
  }
}

// Utility: delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============= BATCH AUTO-APPLY FUNCTIONS =============

async function handleBatchApply() {
  if (jobQueue.length === 0) {
    showStatus('No jobs in queue to process', 'error');
    return;
  }
  
  if (!userProfile) {
    showStatus('Profile not loaded. Please refresh.', 'error');
    return;
  }
  
  if (batchProcessing) {
    showStatus('Batch processing already in progress', 'info');
    return;
  }
  
  batchProcessing = true;
  batchCancelled = false;
  
  const batchSection = document.getElementById('batch-progress-section');
  const batchTotal = document.getElementById('batch-total');
  const batchCurrent = document.getElementById('batch-current');
  const batchProgressFill = document.getElementById('batch-progress-fill');
  const batchJobTitle = document.getElementById('batch-job-title');
  const batchLog = document.getElementById('batch-log');
  
  if (batchSection) batchSection.classList.remove('hidden');
  if (batchTotal) batchTotal.textContent = jobQueue.length;
  if (batchCurrent) batchCurrent.textContent = '0';
  if (batchProgressFill) batchProgressFill.style.width = '0%';
  if (batchLog) batchLog.innerHTML = '';
  
  addBatchLog('Starting batch auto-apply...', 'processing');
  
  const totalJobs = jobQueue.length;
  let processed = 0;
  let successful = 0;
  let failed = 0;
  
  for (let i = 0; i < jobQueue.length; i++) {
    if (batchCancelled) {
      addBatchLog('Batch cancelled by user', 'error');
      break;
    }
    
    const job = jobQueue[i];
    processed++;
    
    if (batchCurrent) batchCurrent.textContent = processed;
    if (batchProgressFill) batchProgressFill.style.width = `${(processed / totalJobs) * 100}%`;
    if (batchJobTitle) batchJobTitle.textContent = `${job.title} at ${job.company}`;
    
    addBatchLog(`Processing: ${job.title} at ${job.company}...`, 'processing');
    
    try {
      const result = await processBatchJob(job);
      
      if (result.success) {
        successful++;
        addBatchLog(`✓ ${job.company}: Applied successfully!`, 'success');
        job.status = 'applied';
        job.appliedAt = new Date().toISOString();
      } else {
        failed++;
        addBatchLog(`✗ ${job.company}: ${result.error || 'Failed'}`, 'error');
        job.status = 'failed';
        job.error = result.error;
      }
    } catch (error) {
      failed++;
      addBatchLog(`✗ ${job.company}: ${error.message}`, 'error');
      job.status = 'failed';
      job.error = error.message;
    }
    
    await chrome.storage.local.set({ jobQueue });
    
    if (i < jobQueue.length - 1 && !batchCancelled) {
      await delay(2000);
    }
  }
  
  batchProcessing = false;
  
  jobQueue = jobQueue.filter(j => j.status !== 'applied');
  await chrome.storage.local.set({ jobQueue });
  updateQueueDisplay();
  
  const summary = `Batch complete: ${successful} applied, ${failed} failed`;
  addBatchLog(summary, successful > 0 ? 'success' : 'error');
  showStatus(summary, successful > 0 ? 'success' : 'error');
  
  setTimeout(() => {
    if (!batchProcessing && batchSection) {
      batchSection.classList.add('hidden');
    }
  }, 5000);
}

function cancelBatchApply() {
  batchCancelled = true;
  batchProcessing = false;
  showStatus('Cancelling batch...', 'info');
}

async function processBatchJob(job) {
  try {
    const data = await chrome.storage.local.get(['accessToken', 'autofillEnabled', 'atsCredentials']);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.accessToken}`,
      },
      body: JSON.stringify({
        jobTitle: job.title,
        company: job.company,
        description: job.description || '',
        requirements: job.requirements || [],
        location: job.location || '',
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
      throw new Error(errorData.error || `API error: ${response.status}`);
    }
    
    const tailoredData = await response.json();
    
    if (job.url && data.autofillEnabled !== false) {
      return await openTabAndApply(job.url, tailoredData, data.atsCredentials);
    } else {
      return { success: true, message: 'Tailored (no auto-fill)' };
    }
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function openTabAndApply(url, tailoredData, atsCredentials) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      action: 'batchApplyToJob',
      url: url,
      tailoredData: tailoredData,
      atsCredentials: atsCredentials
    }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: true });
      }
    });
  });
}

function addBatchLog(message, type = 'info') {
  const batchLog = document.getElementById('batch-log');
  if (!batchLog) return;
  
  const logItem = document.createElement('div');
  logItem.className = `batch-log-item ${type}`;
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  logItem.innerHTML = `<span class="log-time">${time}</span> <span>${message}</span>`;
  
  batchLog.insertBefore(logItem, batchLog.firstChild);
  
  while (batchLog.children.length > 20) {
    batchLog.removeChild(batchLog.lastChild);
  }
}
