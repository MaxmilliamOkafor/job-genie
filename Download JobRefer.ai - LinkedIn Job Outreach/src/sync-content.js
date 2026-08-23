// JobRefer.ai Extension - Sync Content Script
// Runs on jobrefer.ai to auto-sync authentication

(function() {
  'use strict';
  
  console.log('JobRefer Extension: Sync script loaded');
  
  // Check if we're on a page after login with extension flag
  const urlParams = new URLSearchParams(window.location.search);
  const isExtensionLogin = urlParams.get('extension') === 'true';
  
  // Function to get token from localStorage
  function getTokenFromStorage() {
    try {
      const token = localStorage.getItem('token');
      if (token) return token;
      
      const altToken = localStorage.getItem('jobrefer_token');
      if (altToken) return altToken;
      
      return null;
    } catch (e) {
      console.error('JobRefer Extension: Error reading token', e);
      return null;
    }
  }
  
  // Function to sync token with extension
  function syncTokenWithExtension(token) {
    if (!token) return;
    
    console.log('JobRefer Extension: Syncing token...');
    
    chrome.runtime.sendMessage({ action: 'syncToken', token: token }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('JobRefer Extension: Could not sync (extension might not be active)');
        return;
      }
      
      if (response && response.success) {
        console.log('JobRefer Extension: Token synced successfully!');
        showSyncNotification();
      }
    });
  }
  
  // Show a success notification on the page
  function showSyncNotification() {
    // Remove existing notification
    const existing = document.getElementById('jobrefer-sync-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'jobrefer-sync-notification';
    notification.innerHTML = `
      <style>
        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        #jobrefer-sync-notification {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 20px 32px;
          border-radius: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 20px 60px rgba(16, 185, 129, 0.4);
          z-index: 999999;
          animation: slideInUp 0.4s ease-out;
          text-align: center;
          max-width: 400px;
        }
        #jobrefer-sync-notification .sync-icon {
          font-size: 32px;
          margin-bottom: 8px;
          animation: pulse 1s ease-in-out 2;
        }
        #jobrefer-sync-notification .sync-title {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        #jobrefer-sync-notification .sync-message {
          font-size: 14px;
          opacity: 0.9;
          margin-bottom: 12px;
        }
        #jobrefer-sync-notification .sync-action {
          display: inline-block;
          background: rgba(255,255,255,0.2);
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.2s;
        }
        #jobrefer-sync-notification .sync-action:hover {
          background: rgba(255,255,255,0.3);
        }
      </style>
      <div class="sync-icon">✅</div>
      <div class="sync-title">Extension Connected!</div>
      <div class="sync-message">Go to LinkedIn to start capturing jobs</div>
      <a href="https://www.linkedin.com/jobs/" target="_blank" class="sync-action">
        Open LinkedIn Jobs →
      </a>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      notification.style.animation = 'slideInUp 0.3s ease-out reverse forwards';
      setTimeout(() => notification.remove(), 300);
    }, 10000);
  }
  
  // Watch for token changes in localStorage
  function watchForToken() {
    let lastToken = getTokenFromStorage();
    
    // If we already have a token and came from extension login, sync immediately
    if (lastToken && isExtensionLogin) {
      setTimeout(() => syncTokenWithExtension(lastToken), 1000);
    }
    
    // Also watch for storage changes
    window.addEventListener('storage', (e) => {
      if ((e.key === 'token' || e.key === 'jobrefer_token') && e.newValue) {
        syncTokenWithExtension(e.newValue);
      }
    });
    
    // Poll for token (for React state updates that don't trigger storage events)
    let attempts = 0;
    const maxAttempts = 60; // Try for 60 seconds
    
    const checkInterval = setInterval(() => {
      const currentToken = getTokenFromStorage();
      attempts++;
      
      if (currentToken && currentToken !== lastToken) {
        lastToken = currentToken;
        syncTokenWithExtension(currentToken);
        clearInterval(checkInterval);
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
      }
    }, 1000);
  }
  
  // Check if user just logged in
  function checkLoginState() {
    const path = window.location.pathname;
    const isDashboard = path.includes('/dashboard');
    const isProfile = path.includes('/profile');
    const isJobs = path.includes('/jobs');
    const isGoogleCallback = path.includes('/google-callback');
    
    // If we're on authenticated pages and came from extension login, try to sync
    if ((isDashboard || isProfile || isJobs || isGoogleCallback) && isExtensionLogin) {
      const token = getTokenFromStorage();
      if (token) {
        syncTokenWithExtension(token);
      }
    }
  }
  
  // Initialize
  function init() {
    setTimeout(() => {
      checkLoginState();
      watchForToken();
    }, 500);
  }
  
  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Also run when navigating (SPA)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(checkLoginState, 500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
})();
