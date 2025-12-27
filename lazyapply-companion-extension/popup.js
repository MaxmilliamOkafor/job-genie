// LazyApply 2.0 EXTREME - Enhanced Popup with Full Boolean Search
// Mirrors QuantumHire Jobs page functionality

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';
const QUANTUMHIRE_URL = 'https://preview--quantumhire.lovable.app';

const SAMPLE_KEYWORDS = `Technology, Data Scientist, Data Engineer, Technical, Product Analyst, Data Analyst, Business Analyst, Machine Learning Engineer, UX/UI Designer, Full Stack Developer, Customer Service, Customer Success Architect, Solution Engineer, Project Manager, Support, Software Development, Data Science, Data Analysis, Cloud Computing, Cybersecurity`;

let allJobs = [];
let filteredJobs = [];
let selectedJobs = new Set();
let jobQueue = [];
let currentFilter = 'all';
let isApplying = false;
let currentApplyIndex = 0;

// Stats
const stats = {
  searched: 0,
  queued: 0,
  tailored: 0,
  applied: 0
};

document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
  setupEventListeners();
  setupTabNavigation();
});

async function initializePopup() {
  const storage = await chrome.storage.local.get([
    'enabled', 'autoTailor', 'showPanel', 'autoQueue', 'workdayMultiPage',
    'userProfile', 'accessToken', 'jobQueue', 'lastBooleanSearch',
    'stats', 'tailorOnApply', 'attachDocuments'
  ]);
  
  // Check auth state first
  updateAuthUI(storage.accessToken, storage.userProfile);
  
  // Set toggle states
  document.getElementById('enabled-toggle').checked = storage.enabled !== false;
  const autoTailorToggle = document.getElementById('auto-tailor-toggle');
  const showPanelToggle = document.getElementById('show-panel-toggle');
  const autoQueueToggle = document.getElementById('auto-queue-toggle');
  const workdayToggle = document.getElementById('workday-multipage-toggle');
  
  if (autoTailorToggle) autoTailorToggle.checked = storage.autoTailor !== false;
  if (showPanelToggle) showPanelToggle.checked = storage.showPanel !== false;
  if (autoQueueToggle) autoQueueToggle.checked = storage.autoQueue || false;
  if (workdayToggle) workdayToggle.checked = storage.workdayMultiPage !== false;
  
  document.getElementById('tailor-on-apply').checked = storage.tailorOnApply !== false;
  document.getElementById('attach-documents').checked = storage.attachDocuments || false;
  
  // Restore search
  if (storage.lastBooleanSearch) {
    document.getElementById('boolean-search-input').value = storage.lastBooleanSearch;
    updateKeywordCount(storage.lastBooleanSearch);
  }
  
  // Load stats
  if (storage.stats) {
    Object.assign(stats, storage.stats);
    updateStatsDisplay();
  }
  
  // Load queue
  jobQueue = storage.jobQueue || [];
  updateQueueDisplay();
  
  // Load jobs if authenticated
  if (storage.accessToken) {
    await fetchJobsFromDatabase();
  }
}

function updateAuthUI(token, profile) {
  const authSection = document.getElementById('auth-section');
  const loggedInSection = document.getElementById('loggedin-section');
  
  if (token) {
    authSection.style.display = 'none';
    loggedInSection.style.display = 'block';
    if (profile) {
      displayProfile(profile);
    }
  } else {
    authSection.style.display = 'block';
    loggedInSection.style.display = 'none';
  }
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
  // Boolean Search
  document.getElementById('boolean-search-btn').addEventListener('click', performBooleanSearch);
  document.getElementById('boolean-search-input').addEventListener('input', (e) => {
    updateKeywordCount(e.target.value);
  });
  document.getElementById('load-sample-btn').addEventListener('click', loadSampleKeywords);
  document.getElementById('clear-keywords-btn')?.addEventListener('click', clearKeywords);
  
  // Example chips
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('boolean-search-input').value = chip.dataset.query;
      updateKeywordCount(chip.dataset.query);
    });
  });
  
  // Job filters
  document.getElementById('job-search-input').addEventListener('input', filterJobsList);
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      filterJobsList();
    });
  });
  
  // Bulk actions
  document.getElementById('select-all-btn').addEventListener('click', toggleSelectAll);
  document.getElementById('add-selected-btn').addEventListener('click', addSelectedToQueue);
  
  // Queue actions
  document.getElementById('start-apply-btn').addEventListener('click', startApplyingFromQueue);
  document.getElementById('send-to-lazyapply-btn').addEventListener('click', copyUrlsToClipboard);
  document.getElementById('clear-queue-btn').addEventListener('click', clearQueue);
  document.getElementById('manual-add-btn').addEventListener('click', addManualUrl);
  
  // Queue settings
  document.getElementById('tailor-on-apply').addEventListener('change', (e) => {
    chrome.storage.local.set({ tailorOnApply: e.target.checked });
  });
  document.getElementById('attach-documents').addEventListener('change', (e) => {
    chrome.storage.local.set({ attachDocuments: e.target.checked });
  });
  
  // Settings toggles - with null checks
  document.getElementById('enabled-toggle').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ action: 'SET_ENABLED', enabled: e.target.checked });
  });
  
  const autoTailorToggle = document.getElementById('auto-tailor-toggle');
  const showPanelToggle = document.getElementById('show-panel-toggle');
  const autoQueueToggle = document.getElementById('auto-queue-toggle');
  const workdayToggle = document.getElementById('workday-multipage-toggle');
  
  if (autoTailorToggle) {
    autoTailorToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ autoTailor: e.target.checked });
    });
  }
  if (showPanelToggle) {
    showPanelToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ showPanel: e.target.checked });
    });
  }
  if (autoQueueToggle) {
    autoQueueToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ autoQueue: e.target.checked });
    });
  }
  if (workdayToggle) {
    workdayToggle.addEventListener('change', (e) => {
      chrome.storage.local.set({ workdayMultiPage: e.target.checked });
    });
  }
  
  // Auth form
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('signup-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${QUANTUMHIRE_URL}/auth` });
  });
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('refresh-profile-btn').addEventListener('click', refreshProfile);
  
  // Password toggle
  const togglePasswordBtn = document.getElementById('toggle-password');
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const passwordInput = document.getElementById('auth-password');
      const eyeIcon = togglePasswordBtn.querySelector('.eye-icon');
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.textContent = '🙈';
        togglePasswordBtn.title = 'Hide password';
      } else {
        passwordInput.type = 'password';
        eyeIcon.textContent = '👁️';
        togglePasswordBtn.title = 'Show password';
      }
    });
  }
  
  document.getElementById('open-dashboard-btn').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: QUANTUMHIRE_URL });
  });
  
  // Enter key for search
  document.getElementById('boolean-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performBooleanSearch();
    }
  });
}

// =========================
// Boolean Search Functions
// =========================

function updateKeywordCount(input) {
  const keywords = parseKeywords(input);
  const countEl = document.getElementById('keyword-count');
  if (keywords.length > 0) {
    countEl.textContent = `${keywords.length} keyword${keywords.length !== 1 ? 's' : ''}`;
    countEl.style.display = 'inline';
  } else {
    countEl.style.display = 'none';
  }
  
  // Show active keywords section
  const activeSection = document.getElementById('active-keywords');
  const keywordsList = document.getElementById('keywords-list');
  
  if (keywords.length > 0 && keywords.length <= 20) {
    activeSection.style.display = 'block';
    keywordsList.innerHTML = keywords.map(k => 
      `<span class="keyword-tag">${escapeHtml(k)}<button class="keyword-remove" data-keyword="${escapeHtml(k)}">×</button></span>`
    ).join('');
    
    // Add remove handlers
    keywordsList.querySelectorAll('.keyword-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeKeyword(btn.dataset.keyword);
      });
    });
  } else {
    activeSection.style.display = 'none';
  }
}

function parseKeywords(input) {
  const normalized = input.replace(/["""]/g, '').replace(/\s+/g, ' ').trim();
  return normalized.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

function removeKeyword(keyword) {
  const input = document.getElementById('boolean-search-input');
  const keywords = parseKeywords(input.value).filter(k => k !== keyword);
  input.value = keywords.join(', ');
  updateKeywordCount(input.value);
}

function loadSampleKeywords() {
  document.getElementById('boolean-search-input').value = SAMPLE_KEYWORDS;
  updateKeywordCount(SAMPLE_KEYWORDS);
  showToast('Sample keywords loaded!', 'success');
}

function clearKeywords() {
  document.getElementById('boolean-search-input').value = '';
  updateKeywordCount('');
}

async function performBooleanSearch() {
  const input = document.getElementById('boolean-search-input').value.trim();
  const location = document.getElementById('location-filter').value;
  const dateFilter = document.getElementById('date-filter').value;
  
  if (!input) {
    showToast('Please enter keywords', 'error');
    return;
  }
  
  // Check for authentication first
  const storage = await chrome.storage.local.get(['accessToken', 'userProfile']);
  
  if (!storage.accessToken) {
    showToast('Please load your profile from QuantumHire first', 'error');
    // Switch to settings tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="settings"]').classList.add('active');
    document.getElementById('tab-settings').classList.add('active');
    return;
  }
  
  // Save search
  chrome.storage.local.set({ lastBooleanSearch: input });
  
  const btn = document.getElementById('boolean-search-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Searching...';
  
  // Switch to Jobs tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="jobs"]').classList.add('active');
  document.getElementById('tab-jobs').classList.add('active');
  
  showJobsLoading();
  
  try {
    // Build query with location
    let query = input;
    if (location) {
      query += ` ${location}`;
    }
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/search-jobs-google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${storage.accessToken}`
      },
      body: JSON.stringify({ 
        keywords: query,
        dateFilter: dateFilter
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        // Token expired - need to re-authenticate
        chrome.storage.local.remove(['accessToken']);
        showToast('Session expired. Please reload your profile from QuantumHire.', 'error');
        document.getElementById('backend-status').textContent = 'Session expired';
        document.getElementById('backend-status').className = 'status-badge error';
        throw new Error('Session expired');
      }
      throw new Error(errorData.error || `Search failed (${response.status})`);
    }
    
    const data = await response.json();
    
    if (data.success && data.jobs?.length > 0) {
      allJobs = data.jobs;
      stats.searched = allJobs.length;
      updateStatsDisplay();
      saveStats();
      filterJobsList();
      showToast(`Found ${data.jobs.length} jobs!`, 'success');
      
      // Auto-queue high match if enabled
      const autoQueueEnabled = (await chrome.storage.local.get(['autoQueue'])).autoQueue;
      if (autoQueueEnabled) {
        autoQueueHighMatch();
      }
    } else if (data.jobs?.length === 0) {
      showToast('No jobs found. Try different keywords.', 'info');
      allJobs = [];
      filterJobsList();
    } else {
      throw new Error(data.error || 'Search failed');
    }
  } catch (error) {
    console.error('Search error:', error);
    showToast(error.message || 'Search failed. Check your connection.', 'error');
    showJobsError(error.message || 'Search failed. Try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔍 Search Jobs';
  }
}

function autoQueueHighMatch() {
  const highMatchJobs = allJobs.filter(j => (j.match_score || 0) >= 85);
  if (highMatchJobs.length > 0) {
    highMatchJobs.forEach(job => {
      if (!jobQueue.some(q => q.id === job.id)) {
        jobQueue.push(createQueueItem(job));
      }
    });
    saveQueue();
    updateQueueDisplay();
    showToast(`Auto-queued ${highMatchJobs.length} high-match jobs!`, 'success');
  }
}

// =========================
// Jobs List Functions
// =========================

async function fetchJobsFromDatabase() {
  const storage = await chrome.storage.local.get(['accessToken']);
  
  // If no token, show helpful message
  if (!storage.accessToken) {
    document.getElementById('jobs-list').innerHTML = `
      <div class="jobs-empty">
        <span>🔐 Not connected</span>
        <span class="jobs-empty-hint">Go to Settings tab and click "Load Profile" to connect to QuantumHire</span>
      </div>
    `;
    return;
  }
  
  showJobsLoading();
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/jobs?select=*&order=created_at.desc&limit=200`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${storage.accessToken}`
      }
    });
    
    if (response.ok) {
      allJobs = await response.json();
      stats.searched = allJobs.length;
      updateStatsDisplay();
      filterJobsList();
    } else if (response.status === 401) {
      await chrome.storage.local.remove(['accessToken']);
      document.getElementById('jobs-list').innerHTML = `
        <div class="jobs-empty">
          <span>⚠️ Session expired</span>
          <span class="jobs-empty-hint">Go to Settings tab and reload your profile</span>
        </div>
      `;
    } else {
      throw new Error('Failed to fetch jobs');
    }
  } catch (error) {
    console.error('Error fetching jobs:', error);
    showJobsError('Failed to load jobs');
  }
}

function filterJobsList() {
  const searchTerm = document.getElementById('job-search-input').value.toLowerCase();
  
  filteredJobs = allJobs.filter(job => {
    // Text filter
    const matchesSearch = !searchTerm || 
      (job.title?.toLowerCase().includes(searchTerm)) ||
      (job.company?.toLowerCase().includes(searchTerm)) ||
      (job.location?.toLowerCase().includes(searchTerm));
    
    // Category filter
    let matchesFilter = true;
    switch (currentFilter) {
      case 'remote':
        matchesFilter = (job.location || '').toLowerCase().includes('remote');
        break;
      case 'high-match':
        matchesFilter = (job.match_score || 0) >= 80;
        break;
      case 'new':
        const today = new Date().toDateString();
        matchesFilter = new Date(job.created_at).toDateString() === today;
        break;
      case 'pending':
        matchesFilter = job.status === 'pending';
        break;
    }
    
    return matchesSearch && matchesFilter;
  });
  
  renderJobsList();
}

function renderJobsList() {
  const container = document.getElementById('jobs-list');
  
  document.getElementById('jobs-count').textContent = `${filteredJobs.length} jobs`;
  
  if (filteredJobs.length === 0) {
    container.innerHTML = `
      <div class="jobs-empty">
        <span>No jobs found</span>
        <span class="jobs-empty-hint">Try a different search or filter</span>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredJobs.slice(0, 100).map(job => {
    const isSelected = selectedJobs.has(job.id);
    const isQueued = jobQueue.some(q => q.id === job.id || q.url === job.url);
    const scoreClass = (job.match_score || 0) >= 80 ? 'high' : (job.match_score || 0) >= 60 ? 'medium' : 'low';
    const platformClass = getPlatformClass(job.platform || job.url);
    
    return `
      <div class="job-card ${isSelected ? 'selected' : ''} ${isQueued ? 'queued' : ''}" data-job-id="${job.id}">
        <div class="job-select">
          <input type="checkbox" class="job-checkbox" ${isSelected ? 'checked' : ''} ${isQueued ? 'disabled' : ''}>
        </div>
        <div class="job-content">
          <div class="job-title">${escapeHtml(job.title || 'Unknown Position')}</div>
          <div class="job-company">${escapeHtml(job.company || 'Unknown Company')}</div>
          <div class="job-meta">
            <span class="job-location">📍 ${escapeHtml(truncate(job.location || 'Unknown', 20))}</span>
            ${job.platform ? `<span class="job-platform ${platformClass}">${escapeHtml(job.platform)}</span>` : ''}
          </div>
        </div>
        <div class="job-actions">
          <div class="job-score ${scoreClass}">${job.match_score || 0}%</div>
          ${isQueued ? '<span class="queued-badge">✓</span>' : `<button class="btn-add-queue" title="Add to queue">+</button>`}
        </div>
      </div>
    `;
  }).join('');
  
  // Event listeners
  container.querySelectorAll('.job-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const jobId = e.target.closest('.job-card').dataset.jobId;
      toggleJobSelection(jobId);
    });
  });
  
  container.querySelectorAll('.btn-add-queue').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
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

function getPlatformClass(platformOrUrl) {
  const platform = (platformOrUrl || '').toLowerCase();
  if (platform.includes('greenhouse') || platform.includes('lever') || 
      platform.includes('ashby') || platform.includes('rippling')) {
    return 'lazyapply-supported';
  }
  return '';
}

function toggleJobSelection(jobId) {
  if (selectedJobs.has(jobId)) {
    selectedJobs.delete(jobId);
  } else {
    selectedJobs.add(jobId);
  }
  renderJobsList();
}

function toggleSelectAll() {
  const selectableJobs = filteredJobs.filter(j => !jobQueue.some(q => q.id === j.id));
  
  if (selectedJobs.size === selectableJobs.length) {
    selectedJobs.clear();
  } else {
    selectableJobs.forEach(j => selectedJobs.add(j.id));
  }
  renderJobsList();
}

function updateBulkActionState() {
  const btn = document.getElementById('add-selected-btn');
  const count = document.getElementById('selected-count');
  btn.disabled = selectedJobs.size === 0;
  count.textContent = selectedJobs.size;
}

// =========================
// Queue Functions
// =========================

function createQueueItem(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    platform: detectPlatformFromUrl(job.url || job.platform),
    match_score: job.match_score,
    addedAt: new Date().toISOString(),
    status: 'pending',
    tailored: false
  };
}

function detectPlatformFromUrl(urlOrPlatform) {
  const str = (urlOrPlatform || '').toLowerCase();
  if (str.includes('greenhouse')) return 'Greenhouse';
  if (str.includes('lever')) return 'Lever';
  if (str.includes('ashby')) return 'Ashby';
  if (str.includes('rippling')) return 'Rippling';
  if (str.includes('workday') || str.includes('myworkdayjobs')) return 'Workday';
  if (str.includes('icims')) return 'iCIMS';
  if (str.includes('workable')) return 'Workable';
  if (str.includes('smartrecruiters')) return 'SmartRecruiters';
  if (str.includes('linkedin')) return 'LinkedIn';
  if (str.includes('indeed')) return 'Indeed';
  if (str.includes('glassdoor')) return 'Glassdoor';
  return 'Other';
}

function addJobToQueue(jobId) {
  const job = allJobs.find(j => j.id === jobId);
  if (!job) return;
  
  if (!jobQueue.some(q => q.id === job.id)) {
    jobQueue.push(createQueueItem(job));
    stats.queued++;
    updateStatsDisplay();
    saveStats();
    saveQueue();
    showToast('Added to queue!', 'success');
  }
  renderJobsList();
  updateQueueDisplay();
}

function addSelectedToQueue() {
  let addedCount = 0;
  selectedJobs.forEach(jobId => {
    const job = allJobs.find(j => j.id === jobId);
    if (job && !jobQueue.some(q => q.id === job.id)) {
      jobQueue.push(createQueueItem(job));
      addedCount++;
    }
  });
  
  stats.queued += addedCount;
  updateStatsDisplay();
  saveStats();
  saveQueue();
  showToast(`Added ${addedCount} jobs to queue!`, 'success');
  selectedJobs.clear();
  renderJobsList();
  updateQueueDisplay();
  
  // Switch to queue tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="queue"]').classList.add('active');
  document.getElementById('tab-queue').classList.add('active');
}

function addManualUrl() {
  const input = document.getElementById('manual-url-input');
  const url = input.value.trim();
  
  if (!url) return;
  
  try {
    new URL(url);
    
    if (!jobQueue.some(q => q.url === url)) {
      const platform = detectPlatformFromUrl(url);
      jobQueue.push({
        id: `manual-${Date.now()}`,
        title: 'Manual Job',
        company: new URL(url).hostname.replace('www.', ''),
        url: url,
        platform: platform,
        addedAt: new Date().toISOString(),
        status: 'pending'
      });
      stats.queued++;
      updateStatsDisplay();
      saveStats();
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
  
  countEl.textContent = `${jobQueue.length} jobs`;
  
  if (jobQueue.length === 0) {
    container.innerHTML = `
      <div class="queue-empty">
        <span class="queue-empty-icon">📋</span>
        <span>No jobs in queue</span>
        <span class="queue-empty-hint">Search for jobs and add them here</span>
      </div>
    `;
    return;
  }
  
  container.innerHTML = jobQueue.map((job, index) => {
    const platformClass = getPlatformClass(job.platform);
    const statusClass = job.status === 'applied' ? 'applied' : job.status === 'tailored' ? 'tailored' : '';
    
    return `
      <div class="queue-item ${statusClass}" data-index="${index}">
        <div class="queue-item-content">
          <div class="queue-item-title">${escapeHtml(truncate(job.title || 'Unknown', 35))}</div>
          <div class="queue-item-meta">
            <span class="queue-item-company">${escapeHtml(job.company || 'Unknown')}</span>
            <span class="queue-item-platform ${platformClass}">${job.platform || 'Unknown'}</span>
          </div>
        </div>
        <div class="queue-item-actions">
          ${job.match_score ? `<span class="queue-item-score">${job.match_score}%</span>` : ''}
          ${job.tailored ? '<span class="tailored-badge">✓ Tailored</span>' : ''}
          <button class="btn-open-job" title="Open job">↗</button>
          <button class="btn-remove-queue" title="Remove">×</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Event listeners
  container.querySelectorAll('.btn-remove-queue').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.closest('.queue-item').dataset.index);
      jobQueue.splice(index, 1);
      saveQueue();
      updateQueueDisplay();
      renderJobsList();
    });
  });
  
  container.querySelectorAll('.btn-open-job').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.closest('.queue-item').dataset.index);
      if (jobQueue[index]?.url) {
        chrome.tabs.create({ url: jobQueue[index].url });
      }
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
    renderJobsList();
    showToast('Queue cleared', 'info');
  }
}

async function copyUrlsToClipboard() {
  if (jobQueue.length === 0) {
    showToast('No jobs in queue', 'info');
    return;
  }
  
  const urls = jobQueue.map(j => j.url).filter(Boolean);
  await navigator.clipboard.writeText(urls.join('\n'));
  showToast(`${urls.length} URLs copied! Paste in LazyApply.`, 'success');
}

// =========================
// Apply Functions
// =========================

async function startApplyingFromQueue() {
  if (jobQueue.length === 0) {
    showToast('No jobs in queue', 'info');
    return;
  }
  
  const btn = document.getElementById('start-apply-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Starting...';
  
  const tailorEnabled = document.getElementById('tailor-on-apply').checked;
  const attachEnabled = document.getElementById('attach-documents').checked;
  
  try {
    // Get first pending job
    const pendingJob = jobQueue.find(j => j.status === 'pending');
    if (!pendingJob) {
      showToast('All jobs processed!', 'success');
      return;
    }
    
    // If tailoring is enabled, tailor first
    if (tailorEnabled && !pendingJob.tailored) {
      showToast('Tailoring documents...', 'info');
      
      const tailorResult = await chrome.runtime.sendMessage({
        action: 'TAILOR_FOR_QUEUE',
        job: pendingJob
      });
      
      if (tailorResult.success) {
        pendingJob.tailored = true;
        pendingJob.tailoredData = tailorResult.data;
        stats.tailored++;
        updateStatsDisplay();
        saveStats();
        saveQueue();
        showToast(`Tailored! ATS Score: ${tailorResult.data.matchScore}%`, 'success');
      }
    }
    
    // Open the job in a new tab
    if (pendingJob.url) {
      // Store the tailored data for the content script to use
      await chrome.storage.local.set({ 
        currentApplyJob: pendingJob,
        attachDocuments: attachEnabled
      });
      
      chrome.tabs.create({ url: pendingJob.url, active: true });
      
      // Mark as in progress
      pendingJob.status = 'applying';
      saveQueue();
      updateQueueDisplay();
    }
    
  } catch (error) {
    console.error('Apply error:', error);
    showToast('Error starting application', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🚀 Start Applying';
  }
}

// =========================
// Profile & Backend
// =========================

// =========================
// Authentication
// =========================

async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('login-btn');
  const errorEl = document.getElementById('auth-error');
  
  if (!email || !password) {
    showAuthError('Please enter email and password');
    return;
  }
  
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '⏳ Signing in...';
  errorEl.style.display = 'none';
  
  try {
    // Call Supabase auth directly
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Handle specific error cases
      const errorMsg = data.error_description || data.msg || data.error || 'Login failed';
      if (errorMsg.toLowerCase().includes('invalid') || errorMsg.toLowerCase().includes('credentials')) {
        throw new Error('Invalid email or password. Please check your credentials.');
      } else if (errorMsg.toLowerCase().includes('email not confirmed')) {
        throw new Error('Please confirm your email first.');
      } else {
        throw new Error(errorMsg);
      }
    }
    
    // Save token and user
    await chrome.storage.local.set({ 
      accessToken: data.access_token,
      refreshToken: data.refresh_token
    });
    
    // Fetch profile
    const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${data.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (profileResponse.ok) {
      const profiles = await profileResponse.json();
      if (profiles.length > 0) {
        await chrome.storage.local.set({ userProfile: profiles[0] });
        displayProfile(profiles[0]);
      }
    }
    
    // Update UI
    updateAuthUI(data.access_token, null);
    showToast('Signed in successfully!', 'success');
    
    // Load jobs
    await fetchJobsFromDatabase();
    
  } catch (error) {
    console.error('Login error:', error);
    showAuthError(error.message || 'Login failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function showAuthError(message) {
  const errorEl = document.getElementById('auth-error');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

async function handleLogout() {
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'userProfile']);
  updateAuthUI(null, null);
  allJobs = [];
  filterJobsList();
  showToast('Signed out', 'info');
}

async function refreshProfile() {
  const storage = await chrome.storage.local.get(['accessToken']);
  
  if (!storage.accessToken) {
    showToast('Please sign in first', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${storage.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const profiles = await response.json();
      if (profiles.length > 0) {
        await chrome.storage.local.set({ userProfile: profiles[0] });
        displayProfile(profiles[0]);
        showToast('Profile refreshed!', 'success');
      }
    } else if (response.status === 401) {
      await handleLogout();
      showToast('Session expired. Please sign in again.', 'error');
    }
  } catch (error) {
    showToast('Failed to refresh profile', 'error');
  }
}

function displayProfile(profile) {
  const card = document.getElementById('profile-card');
  card.innerHTML = `
    <div class="profile-loaded">
      <div class="profile-avatar">${(profile.first_name?.[0] || '?').toUpperCase()}</div>
      <div class="profile-info">
        <div class="profile-name">${escapeHtml(profile.first_name || '')} ${escapeHtml(profile.last_name || '')}</div>
        <div class="profile-email">${escapeHtml(profile.email || '')}</div>
      </div>
    </div>
  `;
}

// =========================
// Stats
// =========================

function updateStatsDisplay() {
  document.getElementById('stat-searched').textContent = stats.searched;
  document.getElementById('stat-queued').textContent = stats.queued;
  document.getElementById('stat-tailored').textContent = stats.tailored;
  document.getElementById('stat-applied').textContent = stats.applied;
}

function saveStats() {
  chrome.storage.local.set({ stats });
}

// =========================
// Utilities
// =========================

function showJobsLoading() {
  document.getElementById('jobs-list').innerHTML = `
    <div class="jobs-loading">
      <div class="spinner"></div>
      <span>Searching for jobs...</span>
    </div>
  `;
}

function showJobsError(message) {
  document.getElementById('jobs-list').innerHTML = `
    <div class="jobs-error">
      <span>❌ ${escapeHtml(message)}</span>
    </div>
  `;
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}