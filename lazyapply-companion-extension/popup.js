// LazyApply 2.0 EXTREME - Popup Script with Live Jobs

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const QUANTUMHIRE_URL = 'https://preview--quantumhire.lovable.app';

let allJobs = [];
let selectedJobs = new Set();
let jobQueue = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
  setupEventListeners();
  setupTabNavigation();
});

async function initializePopup() {
  // Load saved state
  const storage = await chrome.storage.local.get([
    'enabled', 'autoTailor', 'showPanel', 'autoQueue',
    'userProfile', 'accessToken', 'jobQueue', 'lastKeywords', 'lastLocation'
  ]);
  
  // Set toggle states
  document.getElementById('enabled-toggle').checked = storage.enabled !== false;
  document.getElementById('auto-tailor-toggle').checked = storage.autoTailor !== false;
  document.getElementById('show-panel-toggle').checked = storage.showPanel !== false;
  document.getElementById('auto-queue-toggle').checked = storage.autoQueue || false;
  
  // Restore search inputs
  if (storage.lastKeywords) document.getElementById('keyword-input').value = storage.lastKeywords;
  if (storage.lastLocation) document.getElementById('location-input').value = storage.lastLocation;
  
  // Load queue
  jobQueue = storage.jobQueue || [];
  updateQueueDisplay();
  
  // Check backend
  checkBackendConnection(storage.accessToken);
  
  // Load profile if exists
  if (storage.userProfile) {
    displayProfile(storage.userProfile);
  }
  
  // Load jobs from database
  await fetchJobsFromDatabase();
  
  // Get live stats
  chrome.runtime.sendMessage({ action: 'GET_STATS' }, (response) => {
    if (response?.stats) updateStats(response.stats);
  });
}

function setupTabNavigation() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function setupEventListeners() {
  // Search jobs
  document.getElementById('search-jobs-btn').addEventListener('click', searchJobs);
  document.getElementById('refresh-jobs-btn').addEventListener('click', () => fetchJobsFromDatabase());
  
  // Quick filters
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderJobs();
    });
  });
  
  // Bulk actions
  document.getElementById('select-all-btn').addEventListener('click', toggleSelectAll);
  document.getElementById('add-selected-btn').addEventListener('click', addSelectedToQueue);
  
  // Queue actions
  document.getElementById('send-to-lazyapply-btn').addEventListener('click', pushToLazyApply);
  document.getElementById('clear-queue-btn').addEventListener('click', clearQueue);
  document.getElementById('manual-add-btn').addEventListener('click', addManualUrl);
  
  // Settings toggles
  document.getElementById('enabled-toggle').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ action: 'SET_ENABLED', enabled: e.target.checked });
  });
  
  document.getElementById('auto-tailor-toggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ autoTailor: e.target.checked });
  });
  
  document.getElementById('show-panel-toggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ showPanel: e.target.checked });
  });
  
  document.getElementById('auto-queue-toggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ autoQueue: e.target.checked });
  });
  
  document.getElementById('load-profile-btn').addEventListener('click', loadProfileFromQuantumHire);
  document.getElementById('open-dashboard-btn').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: QUANTUMHIRE_URL });
  });
  
  // Enter key for search
  document.getElementById('keyword-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchJobs();
  });
  document.getElementById('location-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchJobs();
  });
}

// Fetch jobs from QuantumHire database
async function fetchJobsFromDatabase() {
  showJobsLoading();
  
  try {
    const storage = await chrome.storage.local.get(['accessToken']);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jobs?select=*&order=created_at.desc&limit=100`, {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM',
        'Content-Type': 'application/json',
        ...(storage.accessToken ? { 'Authorization': `Bearer ${storage.accessToken}` } : {})
      }
    });
    
    if (response.ok) {
      allJobs = await response.json();
      renderJobs();
      showToast(`Loaded ${allJobs.length} jobs`, 'success');
    } else {
      throw new Error('Failed to fetch jobs');
    }
  } catch (error) {
    console.error('Error fetching jobs:', error);
    showJobsError('Failed to load jobs');
  }
}

// Search for new jobs via edge function
async function searchJobs() {
  const keywords = document.getElementById('keyword-input').value.trim();
  const location = document.getElementById('location-input').value.trim();
  
  if (!keywords) {
    showToast('Please enter keywords', 'error');
    return;
  }
  
  // Save search params
  chrome.storage.local.set({ lastKeywords: keywords, lastLocation: location });
  
  const btn = document.getElementById('search-jobs-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Searching...';
  showJobsLoading();
  
  try {
    const query = location ? `${keywords} ${location}` : keywords;
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/search-jobs-google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM'
      },
      body: JSON.stringify({ keywords: query })
    });
    
    const data = await response.json();
    
    if (data.jobs && data.jobs.length > 0) {
      allJobs = data.jobs;
      renderJobs();
      showToast(`Found ${data.jobs.length} new jobs!`, 'success');
    } else {
      showToast('No jobs found. Try different keywords.', 'info');
      renderJobs();
    }
  } catch (error) {
    console.error('Search error:', error);
    showToast('Search failed. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔍 Search Jobs';
  }
}

// Render jobs list
function renderJobs() {
  const container = document.getElementById('jobs-list');
  const filteredJobs = filterJobs(allJobs);
  
  document.getElementById('jobs-count').textContent = `${filteredJobs.length} jobs`;
  
  if (filteredJobs.length === 0) {
    container.innerHTML = '<div class="jobs-empty">No jobs found. Try searching!</div>';
    return;
  }
  
  container.innerHTML = filteredJobs.map(job => {
    const isSelected = selectedJobs.has(job.id);
    const isQueued = jobQueue.some(q => q.id === job.id || q.url === job.url);
    const scoreClass = (job.match_score || 0) >= 80 ? 'high' : (job.match_score || 0) >= 60 ? 'medium' : 'low';
    
    return `
      <div class="job-card ${isSelected ? 'selected' : ''} ${isQueued ? 'queued' : ''}" data-job-id="${job.id}">
        <div class="job-select">
          <input type="checkbox" class="job-checkbox" ${isSelected ? 'checked' : ''} ${isQueued ? 'disabled' : ''}>
        </div>
        <div class="job-content">
          <div class="job-title">${escapeHtml(job.title || 'Unknown Position')}</div>
          <div class="job-company">${escapeHtml(job.company || 'Unknown Company')}</div>
          <div class="job-meta">
            <span class="job-location">📍 ${escapeHtml(job.location || 'Unknown')}</span>
            ${job.platform ? `<span class="job-platform">${escapeHtml(job.platform)}</span>` : ''}
          </div>
        </div>
        <div class="job-actions">
          <div class="job-score ${scoreClass}">${job.match_score || 0}%</div>
          ${isQueued ? '<span class="queued-badge">Queued</span>' : `<button class="btn-add-queue" title="Add to queue">+</button>`}
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners
  container.querySelectorAll('.job-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const jobId = e.target.closest('.job-card').dataset.jobId;
      toggleJobSelection(jobId);
    });
  });
  
  container.querySelectorAll('.btn-add-queue').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const jobId = e.target.closest('.job-card').dataset.jobId;
      addJobToQueue(jobId);
    });
  });
  
  container.querySelectorAll('.job-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('job-checkbox') || e.target.classList.contains('btn-add-queue')) return;
      const job = allJobs.find(j => j.id === card.dataset.jobId);
      if (job?.url) chrome.tabs.create({ url: job.url });
    });
  });
  
  updateBulkActionState();
}

function filterJobs(jobs) {
  switch (currentFilter) {
    case 'remote':
      return jobs.filter(j => (j.location || '').toLowerCase().includes('remote'));
    case 'high-match':
      return jobs.filter(j => (j.match_score || 0) >= 80);
    case 'new':
      const today = new Date().toDateString();
      return jobs.filter(j => new Date(j.created_at).toDateString() === today);
    default:
      return jobs;
  }
}

function toggleJobSelection(jobId) {
  if (selectedJobs.has(jobId)) {
    selectedJobs.delete(jobId);
  } else {
    selectedJobs.add(jobId);
  }
  renderJobs();
}

function toggleSelectAll() {
  const filteredJobs = filterJobs(allJobs);
  const selectableJobs = filteredJobs.filter(j => !jobQueue.some(q => q.id === j.id));
  
  if (selectedJobs.size === selectableJobs.length) {
    selectedJobs.clear();
  } else {
    selectableJobs.forEach(j => selectedJobs.add(j.id));
  }
  renderJobs();
}

function updateBulkActionState() {
  const btn = document.getElementById('add-selected-btn');
  btn.disabled = selectedJobs.size === 0;
  btn.innerHTML = selectedJobs.size > 0 ? `➕ Add ${selectedJobs.size} to Queue` : '➕ Add to Queue';
}

function addJobToQueue(jobId) {
  const job = allJobs.find(j => j.id === jobId);
  if (!job) return;
  
  if (!jobQueue.some(q => q.id === job.id)) {
    jobQueue.push({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      platform: job.platform,
      match_score: job.match_score,
      addedAt: new Date().toISOString()
    });
    saveQueue();
    showToast('Added to queue!', 'success');
  }
  renderJobs();
  updateQueueDisplay();
}

function addSelectedToQueue() {
  selectedJobs.forEach(jobId => {
    const job = allJobs.find(j => j.id === jobId);
    if (job && !jobQueue.some(q => q.id === job.id)) {
      jobQueue.push({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        platform: job.platform,
        match_score: job.match_score,
        addedAt: new Date().toISOString()
      });
    }
  });
  
  saveQueue();
  showToast(`Added ${selectedJobs.size} jobs to queue!`, 'success');
  selectedJobs.clear();
  renderJobs();
  updateQueueDisplay();
}

function addManualUrl() {
  const input = document.getElementById('manual-url-input');
  const url = input.value.trim();
  
  if (!url) return;
  
  try {
    new URL(url);
    
    if (!jobQueue.some(q => q.url === url)) {
      jobQueue.push({
        id: `manual-${Date.now()}`,
        title: 'Manual Job',
        company: new URL(url).hostname,
        url: url,
        addedAt: new Date().toISOString()
      });
      saveQueue();
      updateQueueDisplay();
      input.value = '';
      showToast('URL added to queue!', 'success');
    } else {
      showToast('URL already in queue', 'info');
    }
  } catch {
    showToast('Invalid URL', 'error');
  }
}

function updateQueueDisplay() {
  const container = document.getElementById('queue-list');
  const countEl = document.getElementById('queue-count');
  
  countEl.textContent = `${jobQueue.length} jobs queued`;
  
  if (jobQueue.length === 0) {
    container.innerHTML = '<div class="queue-empty">No jobs in queue. Add some from Live Jobs!</div>';
    return;
  }
  
  container.innerHTML = jobQueue.map((job, index) => `
    <div class="queue-item" data-index="${index}">
      <div class="queue-item-content">
        <div class="queue-item-title">${escapeHtml(job.title || 'Unknown')}</div>
        <div class="queue-item-company">${escapeHtml(job.company || 'Unknown')}</div>
      </div>
      <div class="queue-item-actions">
        ${job.match_score ? `<span class="queue-item-score">${job.match_score}%</span>` : ''}
        <button class="btn-remove-queue" title="Remove">×</button>
      </div>
    </div>
  `).join('');
  
  container.querySelectorAll('.btn-remove-queue').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('.queue-item').dataset.index);
      jobQueue.splice(index, 1);
      saveQueue();
      updateQueueDisplay();
      renderJobs();
    });
  });
}

function saveQueue() {
  chrome.storage.local.set({ jobQueue });
}

function clearQueue() {
  if (confirm('Clear all jobs from queue?')) {
    jobQueue = [];
    saveQueue();
    updateQueueDisplay();
    renderJobs();
    showToast('Queue cleared', 'info');
  }
}

// Push jobs to LazyApply's queue
async function pushToLazyApply() {
  if (jobQueue.length === 0) {
    showToast('No jobs in queue', 'info');
    return;
  }
  
  const btn = document.getElementById('send-to-lazyapply-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Pushing...';
  
  try {
    // Method 1: Try to inject into LazyApply's chrome.storage
    const lazyApplyQueueKey = 'lazyapply_job_queue'; // Common key pattern
    const urls = jobQueue.map(j => j.url).filter(Boolean);
    
    // Store in multiple formats LazyApply might use
    await chrome.storage.local.set({
      [lazyApplyQueueKey]: urls,
      'jobQueue': urls,
      'pendingJobs': urls,
      'lazyapply_urls': urls,
      // Also store full job data
      'lazyapply_jobs': jobQueue.map(j => ({
        url: j.url,
        title: j.title,
        company: j.company,
        status: 'pending'
      }))
    });
    
    // Method 2: Open LazyApply with jobs in URL params (some versions support this)
    // Create a tab with the job URLs
    const jobUrlsParam = encodeURIComponent(urls.join(','));
    
    // Try to find LazyApply extension
    chrome.management?.getAll?.((extensions) => {
      const lazyApply = extensions?.find(ext => 
        ext.name.toLowerCase().includes('lazyapply') || 
        ext.name.toLowerCase().includes('lazy apply')
      );
      
      if (lazyApply) {
        console.log('LazyApply found:', lazyApply.id);
        // Try to message LazyApply directly
        chrome.runtime.sendMessage(lazyApply.id, {
          action: 'ADD_JOBS',
          jobs: urls
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('Could not message LazyApply directly');
          }
        });
      }
    });
    
    // Method 3: Copy URLs to clipboard for manual paste
    const urlList = urls.join('\n');
    await navigator.clipboard.writeText(urlList);
    
    showToast(`${urls.length} job URLs copied! Paste in LazyApply or they're in storage.`, 'success');
    
    // Open first job to start
    if (urls[0]) {
      chrome.tabs.create({ url: urls[0] });
    }
    
  } catch (error) {
    console.error('Push error:', error);
    showToast('Error pushing to LazyApply', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🚀 Push to LazyApply';
  }
}

// Utility functions
function showJobsLoading() {
  document.getElementById('jobs-list').innerHTML = `
    <div class="jobs-loading">
      <div class="spinner"></div>
      <span>Loading jobs...</span>
    </div>
  `;
}

function showJobsError(message) {
  document.getElementById('jobs-list').innerHTML = `
    <div class="jobs-error">${message}</div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function checkBackendConnection(token) {
  const statusEl = document.getElementById('backend-status');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { 'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM' }
    });
    statusEl.textContent = response.ok ? 'Connected' : 'Error';
    statusEl.className = 'status-value ' + (response.ok ? 'connected' : 'error');
  } catch {
    statusEl.textContent = 'Offline';
    statusEl.className = 'status-value error';
  }
}

async function loadProfileFromQuantumHire() {
  const btn = document.getElementById('load-profile-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Loading...';
  
  try {
    const result = await chrome.storage.local.get(['quantumhire_profile', 'quantumhire_token']);
    if (result.quantumhire_profile) {
      await chrome.storage.local.set({ 
        userProfile: result.quantumhire_profile,
        accessToken: result.quantumhire_token 
      });
      displayProfile(result.quantumhire_profile);
      showToast('Profile loaded!', 'success');
    } else {
      showToast('Open QuantumHire to sync profile', 'info');
      chrome.tabs.create({ url: `${QUANTUMHIRE_URL}/profile` });
    }
  } catch (error) {
    showToast('Failed to load profile', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '📥 Load from QuantumHire';
  }
}

function displayProfile(profile) {
  const card = document.getElementById('profile-card');
  const skills = profile.skills?.slice(0, 4).map(s => typeof s === 'string' ? s : s.name) || [];
  
  card.innerHTML = `
    <div class="profile-loaded">
      <div class="profile-name">${profile.first_name || ''} ${profile.last_name || 'User'}</div>
      <div class="profile-email">${profile.email || ''}</div>
      ${skills.length ? `<div class="profile-skills">${skills.map(s => `<span class="profile-skill">${s}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function updateStats(stats) {
  document.getElementById('stat-intercepted').textContent = stats.applicationsIntercepted || 0;
  document.getElementById('stat-tailored').textContent = stats.documentsGenerated || 0;
  document.getElementById('stat-score').textContent = stats.atsScoreAverage > 0 ? `${Math.round(stats.atsScoreAverage)}%` : '--%';
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
