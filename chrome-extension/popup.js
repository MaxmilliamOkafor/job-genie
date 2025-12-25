// DOM Elements
const notConnectedSection = document.getElementById('not-connected');
const connectedSection = document.getElementById('connected');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const autofillBtn = document.getElementById('autofill-btn');
const refreshBtn = document.getElementById('refresh-btn');
const statusMessage = document.getElementById('status-message');
const userName = document.getElementById('user-name');
const profileSummary = document.getElementById('profile-summary');
const openAppLink = document.getElementById('open-app');

// Show status message
function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 3000);
}

// Load saved connection
async function loadConnection() {
  const data = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'userProfile', 'accessToken']);
  
  if (data.supabaseUrl && data.supabaseKey && data.accessToken && data.userProfile) {
    showConnectedState(data.userProfile);
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
    <p><strong>Experience:</strong> ${profile.total_experience || 'Not set'}</p>
  `;
}

// Show not connected state
function showNotConnectedState() {
  notConnectedSection.classList.remove('hidden');
  connectedSection.classList.add('hidden');
  
  // Pre-fill with saved Supabase URL if available
  chrome.storage.local.get(['supabaseUrl', 'supabaseKey'], (data) => {
    if (data.supabaseUrl) {
      document.getElementById('supabase-url').value = data.supabaseUrl;
    }
    if (data.supabaseKey) {
      document.getElementById('supabase-key').value = data.supabaseKey;
    }
  });
}

// Connect to Supabase
async function connect() {
  const supabaseUrl = document.getElementById('supabase-url').value.trim();
  const supabaseKey = document.getElementById('supabase-key').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const password = document.getElementById('user-password').value;
  
  if (!supabaseUrl || !supabaseKey || !email || !password) {
    showStatus('Please fill in all fields', 'error');
    return;
  }
  
  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;
  
  try {
    // Sign in to Supabase
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ email, password }),
    });
    
    if (!authResponse.ok) {
      const error = await authResponse.json();
      throw new Error(error.error_description || error.message || 'Authentication failed');
    }
    
    const authData = await authResponse.json();
    
    // Fetch user profile
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${authData.user.id}&select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${authData.access_token}`,
      },
    });
    
    if (!profileResponse.ok) {
      throw new Error('Failed to fetch profile');
    }
    
    const profiles = await profileResponse.json();
    const profile = profiles[0] || { email: authData.user.email };
    
    // Save to storage
    await chrome.storage.local.set({
      supabaseUrl,
      supabaseKey,
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
      userId: authData.user.id,
      userProfile: profile,
    });
    
    showStatus('Connected successfully!', 'success');
    showConnectedState(profile);
    
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
  refreshBtn.textContent = '🔄 Refreshing...';
  refreshBtn.disabled = true;
  
  try {
    const data = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'accessToken', 'userId']);
    
    const profileResponse = await fetch(`${data.supabaseUrl}/rest/v1/profiles?user_id=eq.${data.userId}&select=*`, {
      headers: {
        'apikey': data.supabaseKey,
        'Authorization': `Bearer ${data.accessToken}`,
      },
    });
    
    if (!profileResponse.ok) {
      throw new Error('Failed to fetch profile');
    }
    
    const profiles = await profileResponse.json();
    const profile = profiles[0] || {};
    
    await chrome.storage.local.set({ userProfile: profile });
    showConnectedState(profile);
    showStatus('Profile refreshed!', 'success');
    
  } catch (error) {
    console.error('Refresh error:', error);
    showStatus('Failed to refresh profile', 'error');
  } finally {
    refreshBtn.textContent = '🔄 Refresh Profile';
    refreshBtn.disabled = false;
  }
}

// Trigger autofill on current page
async function triggerAutofill() {
  autofillBtn.textContent = '✨ Filling...';
  autofillBtn.disabled = true;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'autofill' });
    
    if (response && response.success) {
      showStatus(`Filled ${response.fieldsCount} fields!`, 'success');
    } else {
      showStatus(response?.message || 'No form fields found', 'error');
    }
  } catch (error) {
    console.error('Autofill error:', error);
    showStatus('Could not autofill - make sure you\'re on a job application page', 'error');
  } finally {
    autofillBtn.textContent = '✨ Auto-Fill This Page';
    autofillBtn.disabled = false;
  }
}

// Open app dashboard
openAppLink.addEventListener('click', async (e) => {
  e.preventDefault();
  const data = await chrome.storage.local.get(['supabaseUrl']);
  // Extract project URL from Supabase URL and open the app
  // For now, just open a placeholder - user should update this
  chrome.tabs.create({ url: 'https://preview--autoapply-ai-nexus.lovable.app/' });
});

// Event listeners
connectBtn.addEventListener('click', connect);
disconnectBtn.addEventListener('click', disconnect);
autofillBtn.addEventListener('click', triggerAutofill);
refreshBtn.addEventListener('click', refreshProfile);

// Initialize
loadConnection();
