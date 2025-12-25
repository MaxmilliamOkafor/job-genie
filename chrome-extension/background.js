// AutoApply AI - Background Service Worker

console.log('AutoApply AI: Background service worker started');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AutoApply AI: Extension installed');
    
    // Set default settings with your Supabase credentials
    chrome.storage.local.set({
      autoDetect: true,
      supabaseUrl: 'https://wntpldomgjutwufphnpg.supabase.co',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM',
    });
  }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('AutoApply AI: Received message', message);
  
  if (message.action === 'getProfile') {
    chrome.storage.local.get(['userProfile'], (data) => {
      sendResponse(data.userProfile || null);
    });
    return true;
  }
  
  if (message.action === 'getTailoredApplication') {
    getTailoredApplication(message.job).then(sendResponse).catch(err => {
      console.error('AutoApply AI: Tailor error', err);
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
});

// Get tailored application from edge function
async function getTailoredApplication(job) {
  console.log('AutoApply AI: Getting tailored application for', job.title, 'at', job.company);
  
  const data = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'accessToken', 'userProfile']);
  
  if (!data.userProfile) {
    throw new Error('No profile found. Please connect your account first.');
  }
  
  if (!data.supabaseUrl || !data.supabaseKey) {
    throw new Error('Supabase not configured. Please reconnect your account.');
  }
  
  console.log('AutoApply AI: Calling tailor-application function...');
  
  const response = await fetch(`${data.supabaseUrl}/functions/v1/tailor-application`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': data.supabaseKey,
      // Use access token if available, otherwise just use anon key
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
  
  console.log('AutoApply AI: Response status', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('AutoApply AI: API error', response.status, errorText);
    
    if (response.status === 401) {
      throw new Error('Authentication failed. Please reconnect your account.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('AI usage limit reached. Please add credits.');
    }
    
    throw new Error(`API error: ${response.status}`);
  }
  
  const result = await response.json();
  console.log('AutoApply AI: Received tailored application', result);
  
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
      console.log('AutoApply AI: Token refreshed successfully');
    } else {
      console.log('AutoApply AI: Token refresh failed', response.status);
    }
  } catch (error) {
    console.error('AutoApply AI: Token refresh error', error);
  }
}

// Refresh token every 50 minutes
setInterval(refreshAccessToken, 50 * 60 * 1000);

// Also refresh on startup
chrome.runtime.onStartup.addListener(refreshAccessToken);
