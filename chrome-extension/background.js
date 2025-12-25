// AutoApply AI - Background Service Worker

console.log('AutoApply AI: Background service worker started');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AutoApply AI: Extension installed');
    
    // Set default settings
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
    // Call the tailor-application edge function
    getTailoredApplication(message.job).then(sendResponse);
    return true;
  }
});

// Get tailored application from edge function
async function getTailoredApplication(job) {
  try {
    const data = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'accessToken', 'userProfile']);
    
    if (!data.userProfile) {
      return { error: 'No profile found' };
    }
    
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
        description: job.description,
        requirements: job.requirements || [],
        userProfile: data.userProfile,
        includeReferral: false,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('AutoApply AI: Tailor API error', error);
      return { error: 'Failed to tailor application' };
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('AutoApply AI: Error getting tailored application', error);
    return { error: error.message };
  }
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
      console.log('AutoApply AI: Token refreshed');
    }
  } catch (error) {
    console.error('AutoApply AI: Token refresh failed', error);
  }
}

// Refresh token every 50 minutes
setInterval(refreshAccessToken, 50 * 60 * 1000);
