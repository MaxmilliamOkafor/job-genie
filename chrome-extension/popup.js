// QuantumHire AI - Popup Script

// DOM Elements
const notConnectedSection = document.getElementById('not-connected');
const connectedSection = document.getElementById('connected');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const autofillBtn = document.getElementById('autofill-btn');
const refreshBtn = document.getElementById('refresh-btn');
const tailorBtn = document.getElementById('tailor-btn');
const addToQueueBtn = document.getElementById('add-to-queue-btn');
const statusMessage = document.getElementById('status-message');
const userName = document.getElementById('user-name');
const profileSummary = document.getElementById('profile-summary');
const currentJob = document.getElementById('current-job');
const tailoredResult = document.getElementById('tailored-result');
const queueStatus = document.getElementById('queue-status');
const queueCount = document.getElementById('queue-count');
const openAppLink = document.getElementById('open-app');
const viewQueueBtn = document.getElementById('view-queue-btn');

// Supabase config
const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

// Show status message
function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  setTimeout(() => statusMessage.classList.add('hidden'), 3000);
}

// Load saved connection
async function loadConnection() {
  const data = await chrome.storage.local.get(['accessToken', 'userProfile', 'jobQueue']);
  
  if (data.accessToken && data.userProfile) {
    showConnectedState(data.userProfile);
    detectCurrentJob();
    updateQueueCount(data.jobQueue || []);
  } else {
    showNotConnectedState();
  }
}

// Show connected state
function showConnectedState(profile) {
  notConnectedSection.classList.add('hidden');
  connectedSection.classList.remove('hidden');
  
  userName.textContent = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'User';
  
  profileSummary.innerHTML = `
    <p><strong>Email:</strong> ${profile.email || 'Not set'}</p>
    <p><strong>Phone:</strong> ${profile.phone || 'Not set'}</p>
    <p><strong>Location:</strong> ${[profile.city, profile.state, profile.country].filter(Boolean).join(', ') || 'Not set'}</p>
  `;
}

// Show not connected state
function showNotConnectedState() {
  notConnectedSection.classList.remove('hidden');
  connectedSection.classList.add('hidden');
}

// Update queue count
function updateQueueCount(queue) {
  if (queue && queue.length > 0) {
    queueStatus.classList.remove('hidden');
    queueCount.textContent = queue.length;
  } else {
    queueStatus.classList.add('hidden');
  }
}

// Detect ATS platform
function detectATS(url) {
  if (url.includes('greenhouse.io')) return { name: 'Greenhouse', icon: '🌿' };
  if (url.includes('lever.co')) return { name: 'Lever', icon: '🔧' };
  if (url.includes('workday.com') || url.includes('myworkdayjobs.com')) return { name: 'Workday', icon: '📊' };
  if (url.includes('ashbyhq.com')) return { name: 'Ashby', icon: '💼' };
  if (url.includes('smartrecruiters.com')) return { name: 'SmartRecruiters', icon: '🎯' };
  if (url.includes('icims.com')) return { name: 'iCIMS', icon: '📋' };
  if (url.includes('linkedin.com')) return { name: 'LinkedIn', icon: '💼' };
  if (url.includes('workable.com')) return { name: 'Workable', icon: '⚙️' };
  return null;
}

// Detect current job on page
async function detectCurrentJob() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const ats = detectATS(tab.url || '');
    
    if (!ats) {
      currentJob.innerHTML = `
        <p class="not-job-page">📄 Navigate to a job application page to tailor your resume.</p>
        <p class="ats-hint">Supported: Greenhouse, Lever, Workday, Ashby, SmartRecruiters, iCIMS, LinkedIn</p>
      `;
      tailorBtn.disabled = true;
      addToQueueBtn.disabled = true;
      return;
    }
    
    // Try to extract job info from the page
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractJob' });
    
    if (response && response.title) {
      currentJob.innerHTML = `
        <div class="ats-badge">${ats.icon} ${ats.name}</div>
        <p class="job-title">${response.title}</p>
        <p class="job-company">${response.company}</p>
        ${response.location ? `<p class="job-location">📍 ${response.location}</p>` : ''}
      `;
      currentJob.dataset.job = JSON.stringify({ ...response, url: tab.url, ats: ats.name });
      tailorBtn.disabled = false;
      addToQueueBtn.disabled = false;
    } else {
      currentJob.innerHTML = `
        <div class="ats-badge">${ats.icon} ${ats.name}</div>
        <p class="not-job-page">Could not detect job details. Try refreshing.</p>
      `;
      currentJob.dataset.job = JSON.stringify({ url: tab.url, ats: ats.name });
      tailorBtn.disabled = true;
      addToQueueBtn.disabled = false;
    }
  } catch (error) {
    console.error('Job detection error:', error);
    currentJob.innerHTML = `
      <p class="not-job-page">📄 Navigate to a job application page to tailor your resume.</p>
    `;
    tailorBtn.disabled = true;
    addToQueueBtn.disabled = true;
  }
}

// Add to queue
async function addToQueue() {
  const jobData = currentJob.dataset.job ? JSON.parse(currentJob.dataset.job) : null;
  
  if (!jobData || !jobData.url) {
    showStatus('No job URL detected', 'error');
    return;
  }
  
  const data = await chrome.storage.local.get(['jobQueue']);
  const queue = data.jobQueue || [];
  
  // Check for duplicates
  if (queue.some(j => j.url === jobData.url)) {
    showStatus('Job already in queue', 'warning');
    return;
  }
  
  queue.push({
    id: Date.now().toString(),
    url: jobData.url,
    title: jobData.title || 'Unknown',
    company: jobData.company || 'Unknown',
    ats: jobData.ats,
    addedAt: new Date().toISOString(),
  });
  
  await chrome.storage.local.set({ jobQueue: queue });
  updateQueueCount(queue);
  showStatus('Added to queue!', 'success');
}

// Connect to Supabase
async function connect() {
  const email = document.getElementById('user-email').value.trim();
  const password = document.getElementById('user-password').value;
  
  if (!email || !password) {
    showStatus('Please enter email and password', 'error');
    return;
  }
  
  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;
  
  try {
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({ email, password }),
    });
    
    if (!authResponse.ok) {
      const error = await authResponse.json();
      throw new Error(error.error_description || error.message || 'Invalid credentials');
    }
    
    const authData = await authResponse.json();
    
    const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${authData.user.id}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${authData.access_token}`,
      },
    });
    
    if (!profileResponse.ok) throw new Error('Failed to fetch profile');
    
    const profiles = await profileResponse.json();
    const profile = profiles[0] || { email: authData.user.email };
    
    await chrome.storage.local.set({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
      userId: authData.user.id,
      userProfile: profile,
    });
    
    showStatus('Connected!', 'success');
    showConnectedState(profile);
    detectCurrentJob();
    
  } catch (error) {
    console.error('Connection error:', error);
    showStatus(error.message || 'Failed to connect', 'error');
  } finally {
    connectBtn.textContent = 'Connect Account';
    connectBtn.disabled = false;
  }
}

// Disconnect
async function disconnect() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userId', 'userProfile']);
  showStatus('Disconnected', 'success');
  showNotConnectedState();
}

// Refresh profile
async function refreshProfile() {
  refreshBtn.textContent = '🔄 ...';
  refreshBtn.disabled = true;
  
  try {
    const data = await chrome.storage.local.get(['accessToken', 'userId']);
    
    const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${data.userId}&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${data.accessToken}`,
      },
    });
    
    if (!profileResponse.ok) throw new Error('Failed to fetch profile');
    
    const profiles = await profileResponse.json();
    const profile = profiles[0] || {};
    
    await chrome.storage.local.set({ userProfile: profile });
    showConnectedState(profile);
    showStatus('Profile refreshed!', 'success');
    
  } catch (error) {
    console.error('Refresh error:', error);
    showStatus('Failed to refresh', 'error');
  } finally {
    refreshBtn.textContent = '🔄 Refresh';
    refreshBtn.disabled = false;
  }
}

// Trigger autofill
async function triggerAutofill() {
  autofillBtn.textContent = '⏳ ...';
  autofillBtn.disabled = true;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'autofill' });
    
    if (response && response.success) {
      showStatus(`Filled ${response.fieldsCount} fields!`, 'success');
    } else {
      showStatus(response?.message || 'No fields found', 'error');
    }
  } catch (error) {
    console.error('Autofill error:', error);
    showStatus('Make sure you\'re on a job application page', 'error');
  } finally {
    autofillBtn.textContent = '📝 Auto-Fill';
    autofillBtn.disabled = false;
  }
}

// Tailor resume for job
async function tailorForJob() {
  const jobData = currentJob.dataset.job ? JSON.parse(currentJob.dataset.job) : null;
  
  if (!jobData) {
    showStatus('No job detected', 'error');
    return;
  }
  
  tailorBtn.textContent = '⏳ Tailoring...';
  tailorBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getTailoredApplication',
      job: jobData,
    });
    
    if (response.error) throw new Error(response.error);
    
    tailoredResult.classList.remove('hidden');
    
    document.getElementById('resume-text').value = response.tailoredResume || 'No resume generated';
    document.getElementById('cover-text').value = response.tailoredCoverLetter || 'No cover letter generated';
    
    if (response.matchScore) {
      document.getElementById('match-score-value').textContent = response.matchScore;
    }
    
    showStatus('Application tailored!', 'success');
    
  } catch (error) {
    console.error('Tailor error:', error);
    showStatus(error.message || 'Failed to tailor', 'error');
  } finally {
    tailorBtn.textContent = '✨ Tailor for This Job';
    tailorBtn.disabled = false;
  }
}

// Open app dashboard
openAppLink.addEventListener('click', async (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://preview--autoapply-ai-nexus.lovable.app/jobs' });
});

// View queue in app
viewQueueBtn?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://preview--autoapply-ai-nexus.lovable.app/jobs' });
});

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const tabName = tab.dataset.tab;
    document.getElementById('resume-content').classList.toggle('hidden', tabName !== 'resume');
    document.getElementById('cover-content').classList.toggle('hidden', tabName !== 'cover');
  });
});

// Copy buttons
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const textarea = document.getElementById(targetId);
    navigator.clipboard.writeText(textarea.value);
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy', 2000);
  });
});

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
autofillBtn.addEventListener('click', triggerAutofill);
refreshBtn.addEventListener('click', refreshProfile);
tailorBtn.addEventListener('click', tailorForJob);
addToQueueBtn?.addEventListener('click', addToQueue);

// Initialize
loadConnection();
