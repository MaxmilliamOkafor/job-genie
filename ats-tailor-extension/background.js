// ATS Tailored CV & Cover Letter - Background Service Worker
// Minimal background script - just handles extension lifecycle

console.log('[ATS Tailor] Background service worker started');

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ATS Tailor] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[ATS Tailor] Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Keep service worker alive
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'keepAlive') {
    sendResponse({ status: 'alive' });
    return true;
  }
});
