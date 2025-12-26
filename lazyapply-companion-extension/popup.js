// LazyApply 2.0 EXTREME - Popup Script

const QUANTUMHIRE_URL = 'https://preview--quantumhire.lovable.app';

document.addEventListener('DOMContentLoaded', async () => {
  await initializePopup();
  setupEventListeners();
});

async function initializePopup() {
  // Load current state
  const storage = await chrome.storage.local.get([
    'enabled', 
    'autoTailor', 
    'showPanel',
    'userProfile', 
    'accessToken',
    'applicationHistory',
    'stats'
  ]);
  
  // Set toggle states
  document.getElementById('enabled-toggle').checked = storage.enabled !== false;
  document.getElementById('auto-tailor-toggle').checked = storage.autoTailor !== false;
  document.getElementById('show-panel-toggle').checked = storage.showPanel !== false;
  
  // Check backend connection
  checkBackendConnection(storage.accessToken);
  
  // Load profile if exists
  if (storage.userProfile) {
    displayProfile(storage.userProfile);
  }
  
  // Load stats
  if (storage.stats) {
    updateStats(storage.stats);
  }
  
  // Load history
  if (storage.applicationHistory) {
    displayHistory(storage.applicationHistory);
  }
  
  // Get live stats from background
  chrome.runtime.sendMessage({ action: 'GET_STATS' }, (response) => {
    if (response?.stats) {
      updateStats(response.stats);
    }
  });
}

function setupEventListeners() {
  // Enable toggle
  document.getElementById('enabled-toggle').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ 
      action: 'SET_ENABLED', 
      enabled: e.target.checked 
    });
  });
  
  // Auto-tailor toggle
  document.getElementById('auto-tailor-toggle').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({ 
      action: 'SET_AUTO_TAILOR', 
      autoTailor: e.target.checked 
    });
    chrome.storage.local.set({ autoTailor: e.target.checked });
  });
  
  // Show panel toggle
  document.getElementById('show-panel-toggle').addEventListener('change', (e) => {
    chrome.storage.local.set({ showPanel: e.target.checked });
    // Notify content scripts
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'TOGGLE_PANEL',
          visible: e.target.checked
        }).catch(() => {});
      });
    });
  });
  
  // Load profile button
  document.getElementById('load-profile-btn').addEventListener('click', loadProfileFromQuantumHire);
  
  // Open dashboard button
  document.getElementById('open-dashboard-btn').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: QUANTUMHIRE_URL });
  });
}

async function checkBackendConnection(token) {
  const statusEl = document.getElementById('backend-status');
  
  try {
    const response = await fetch('https://wntpldomgjutwufphnpg.supabase.co/functions/v1/tailor-application', {
      method: 'OPTIONS'
    });
    
    if (response.ok || response.status === 204) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'status-value connected';
    } else {
      statusEl.textContent = 'Connection error';
      statusEl.className = 'status-value error';
    }
  } catch (error) {
    statusEl.textContent = 'Offline';
    statusEl.className = 'status-value error';
  }
}

async function loadProfileFromQuantumHire() {
  const btn = document.getElementById('load-profile-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Loading...';
  
  try {
    // Try to get profile from QuantumHire storage (if user has extension installed)
    const result = await chrome.storage.local.get(['quantumhire_profile', 'quantumhire_token']);
    
    if (result.quantumhire_profile) {
      await chrome.storage.local.set({ 
        userProfile: result.quantumhire_profile,
        accessToken: result.quantumhire_token || null
      });
      
      chrome.runtime.sendMessage({ 
        action: 'SET_PROFILE', 
        profile: result.quantumhire_profile 
      });
      
      displayProfile(result.quantumhire_profile);
      showToast('Profile loaded successfully!', 'success');
    } else {
      // Open QuantumHire to sync profile
      showToast('Please sync your profile from QuantumHire dashboard', 'info');
      chrome.tabs.create({ url: `${QUANTUMHIRE_URL}/profile` });
    }
  } catch (error) {
    console.error('Failed to load profile:', error);
    showToast('Failed to load profile', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '📥 Load from QuantumHire';
  }
}

function displayProfile(profile) {
  const card = document.getElementById('profile-card');
  
  const skills = profile.skills?.slice(0, 5).map(s => 
    typeof s === 'string' ? s : s.name
  ) || [];
  
  card.innerHTML = `
    <div class="profile-loaded">
      <div class="profile-name">${profile.first_name || ''} ${profile.last_name || 'User'}</div>
      <div class="profile-email">${profile.email || 'No email set'}</div>
      ${skills.length > 0 ? `
        <div class="profile-skills">
          ${skills.map(skill => `<span class="profile-skill">${skill}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function updateStats(stats) {
  document.getElementById('stat-intercepted').textContent = stats.applicationsIntercepted || stats.totalIntercepted || 0;
  document.getElementById('stat-tailored').textContent = stats.documentsGenerated || stats.totalTailored || 0;
  
  const avgScore = stats.atsScoreAverage || stats.averageScore || 0;
  document.getElementById('stat-score').textContent = avgScore > 0 ? `${Math.round(avgScore)}%` : '--%';
}

function displayHistory(history) {
  const listEl = document.getElementById('history-list');
  
  if (!history || history.length === 0) {
    listEl.innerHTML = '<div class="history-empty">No applications yet</div>';
    return;
  }
  
  listEl.innerHTML = history.slice(0, 10).map(item => {
    const scoreClass = item.matchScore >= 80 ? 'high' : item.matchScore >= 60 ? 'medium' : 'low';
    
    return `
      <div class="history-item">
        <div class="history-score ${scoreClass}">${item.matchScore || 0}%</div>
        <div class="history-info">
          <div class="history-title">${item.job?.title || 'Unknown'}</div>
          <div class="history-company">${item.job?.company || 'Unknown'}</div>
        </div>
        <span class="history-platform">${item.platform || 'ATS'}</span>
      </div>
    `;
  }).join('');
}

function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};
    color: white;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    z-index: 9999;
    animation: fadeIn 0.3s ease-out;
  `;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Listen for profile updates from QuantumHire
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.quantumhire_profile) {
      displayProfile(changes.quantumhire_profile.newValue);
    }
    if (changes.applicationHistory) {
      displayHistory(changes.applicationHistory.newValue);
    }
  }
});
