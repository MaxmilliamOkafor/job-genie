// QuantumHire AI - Background Service Worker
// Handles authentication and API calls for non-Easy Apply job applications

console.log('QuantumHire AI: Background service worker started');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('QuantumHire AI: Extension installed');
    
    // Set default settings with Supabase credentials
    chrome.storage.local.set({
      autoDetect: true,
      supabaseUrl: 'https://wntpldomgjutwufphnpg.supabase.co',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM',
    });
  }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('QuantumHire AI: Received message', message);
  
  if (message.action === 'getProfile') {
    chrome.storage.local.get(['userProfile'], (data) => {
      sendResponse(data.userProfile || null);
    });
    return true;
  }
  
  if (message.action === 'getTailoredApplication') {
    getTailoredApplication(message.job).then(sendResponse).catch(err => {
      console.error('QuantumHire AI: Tailor error', err);
      sendResponse({ error: err.message });
    });
    return true;
  }
  
  if (message.action === 'extractJob') {
    // Forward to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'extractJob' }, sendResponse);
      } else {
        sendResponse({ error: 'No active tab' });
      }
    });
    return true;
  }
  
  if (message.action === 'batchApplyToJob') {
    handleBatchApplyToJob(message.url, message.tailoredData, message.atsCredentials)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Get tailored application from edge function
async function getTailoredApplication(job) {
  console.log('QuantumHire AI: Getting tailored application for', job.title, 'at', job.company);
  
  const data = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'accessToken', 'userProfile']);
  
  if (!data.userProfile) {
    throw new Error('No profile found. Please connect your account first.');
  }
  
  if (!data.supabaseUrl || !data.supabaseKey) {
    throw new Error('Not configured. Please reconnect your account.');
  }
  
  console.log('QuantumHire AI: Calling tailor-application function...');
  
  const response = await fetch(`${data.supabaseUrl}/functions/v1/tailor-application`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': data.supabaseKey,
      'Authorization': `Bearer ${data.accessToken || data.supabaseKey}`,
    },
    body: JSON.stringify({
      jobTitle: job.title,
      company: job.company,
      description: job.description || '',
      requirements: job.requirements || [],
      userProfile: data.userProfile,
      includeReferral: false,
    }),
  });
  
  console.log('QuantumHire AI: Response status', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('QuantumHire AI: API error', response.status, errorText);
    
    if (response.status === 401) {
      throw new Error('Authentication failed. Please reconnect your account.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('AI usage limit reached.');
    }
    
    throw new Error(`API error: ${response.status}`);
  }
  
  const result = await response.json();
  console.log('QuantumHire AI: Received tailored application', result);
  
  return result;
}

// Refresh access token periodically
async function refreshAccessToken() {
  const data = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'refreshToken']);
  
  if (!data.refreshToken) return;
  
  try {
    const response = await fetch(`${data.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': data.supabaseKey,
      },
      body: JSON.stringify({ refresh_token: data.refreshToken }),
    });
    
    if (response.ok) {
      const authData = await response.json();
      await chrome.storage.local.set({
        accessToken: authData.access_token,
        refreshToken: authData.refresh_token,
      });
      console.log('QuantumHire AI: Token refreshed successfully');
    } else {
      console.log('QuantumHire AI: Token refresh failed', response.status);
    }
  } catch (error) {
    console.error('QuantumHire AI: Token refresh error', error);
  }
}

// Refresh token every 50 minutes
setInterval(refreshAccessToken, 50 * 60 * 1000);

// Also refresh on startup
chrome.runtime.onStartup.addListener(refreshAccessToken);

// ============= BATCH APPLY FUNCTIONS =============

// Handle batch apply to a single job
async function handleBatchApplyToJob(url, tailoredData, atsCredentials) {
  console.log('QuantumHire AI: Batch applying to', url);
  
  return new Promise((resolve) => {
    // Create a new tab with the job URL
    chrome.tabs.create({ url: url, active: false }, (tab) => {
      const tabId = tab.id;
      
      // Listen for tab to finish loading
      const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          
          // Wait a bit for dynamic content to load
          setTimeout(() => {
            // Send autofill message to the tab
            chrome.tabs.sendMessage(tabId, {
              action: 'autofill',
              tailoredData: tailoredData,
              atsCredentials: atsCredentials,
              batchMode: true
            }, (response) => {
              // Close the tab after a delay
              setTimeout(() => {
                chrome.tabs.remove(tabId).catch(() => {});
              }, 3000);
              
              if (chrome.runtime.lastError) {
                console.log('QuantumHire AI: Autofill message error', chrome.runtime.lastError);
                resolve({ success: false, error: 'Could not communicate with page' });
              } else {
                resolve({ success: true, response: response });
              }
            });
          }, 2000);
        }
      };
      
      chrome.tabs.onUpdated.addListener(onUpdated);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(tabId).catch(() => {});
        resolve({ success: false, error: 'Page load timeout' });
      }, 30000);
    });
  });
}
