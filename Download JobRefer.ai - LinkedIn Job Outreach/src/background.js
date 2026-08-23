// JobRefer.ai Extension - Background Service Worker
// Version 3.2 - Message relay for auto-refresh

// Get API URL from storage or use default
let API_BASE_URL = 'https://jobrefer.ai/api';

// Initialize API URL from storage
chrome.storage.local.get(['api_base_url'], (result) => {
  if (result.api_base_url) {
    API_BASE_URL = result.api_base_url;
  }
});

// Function to update API URL (called when syncing token from web app)
function setApiBaseUrl(url) {
  API_BASE_URL = url;
  chrome.storage.local.set({ api_base_url: url });
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Enable side panel for all tabs
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // RELAY: Forward jobChanged from content script to all extension pages (including sidepanel)
  if (request.action === 'jobChanged') {
    console.log('Background: Relaying jobChanged message', request.jobId);
    
    // Broadcast to all extension pages (sidepanel will receive this)
    chrome.runtime.sendMessage({
      action: 'jobChanged',
      jobId: request.jobId,
      url: request.url,
      fromBackground: true
    }).catch(() => {
      // Sidepanel might not be open, that's ok
    });
    
    sendResponse({ received: true });
    return true;
  }
  
  if (request.action === 'captureJob') {
    captureJob(request.data).then(sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'sendOutreach') {
    sendOutreach(request.jobId).then(sendResponse);
    return true;
  }
  
  if (request.action === 'checkAuth') {
    checkAuthentication().then(sendResponse);
    return true;
  }
  
  if (request.action === 'syncToken') {
    syncToken(request.token).then(sendResponse);
    return true;
  }
});

// Sync token from web app
async function syncToken(token) {
  if (!token) {
    return { success: false, error: 'No token provided' };
  }
  
  try {
    // Verify the token first
    const response = await fetch(`${API_BASE_URL}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      // Token is valid, store it
      await new Promise((resolve) => {
        chrome.storage.local.set({ token: token }, resolve);
      });
      
      console.log('JobRefer: Token synced successfully');
      return { success: true };
    } else {
      return { success: false, error: 'Invalid token' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Capture job via API
async function captureJob(data) {
  try {
    const token = await getStoredToken();
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    
    const response = await fetch(`${API_BASE_URL}/jobs/quick-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        job_url: data.jobUrl || '',
        recruiter_linkedin: data.recruiterLinkedin || '',
        job_title: data.jobTitle || '',
        company_name: data.companyName || '',
        job_description: data.jobDescription || '',
        recruiter_name: data.recruiterName || '',
        recruiter_location: data.recruiterLocation || ''  // For timezone estimation
      })
    });
    
    const responseData = await response.json();
    
    if (response.ok && responseData.success) {
      return { 
        success: true, 
        id: responseData.id || responseData.job_id,
        job_id: responseData.job_id,
        job: responseData.job,
        email_found: responseData.email_found,
        message: responseData.message
      };
    } else {
      return { 
        success: false, 
        error: responseData.detail || responseData.message || 'Failed to capture job' 
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Send outreach email
async function sendOutreach(jobId) {
  try {
    const token = await getStoredToken();
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/send-outreach`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      return { success: true, result };
    } else {
      const error = await response.json();
      return { success: false, error: error.detail || 'Failed to send outreach' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Check authentication status
async function checkAuthentication() {
  try {
    const token = await getStoredToken();
    if (!token) {
      return { authenticated: false };
    }
    
    const response = await fetch(`${API_BASE_URL}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const user = await response.json();
      return { authenticated: true, user };
    } else {
      return { authenticated: false };
    }
  } catch (error) {
    return { authenticated: false, error: error.message };
  }
}

// Get stored token
async function getStoredToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], (result) => {
      resolve(result.token);
    });
  });
}

// Handle extension icon click badge
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('linkedin.com/jobs/')) {
    // Show badge on LinkedIn job pages
    chrome.action.setBadgeText({ text: '!', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
