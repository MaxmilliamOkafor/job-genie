// LazyApply 2.0 EXTREME - Content Script
// Detects LazyApply activity and injects ATS-tailored content

console.log('🚀 LazyApply 2.0 EXTREME loaded on:', window.location.hostname);

let isEnabled = true;
let currentJobData = null;
let floatingPanel = null;
let lastTailoredData = null;

// Job data extraction patterns for different platforms
const EXTRACTORS = {
  linkedin: {
    title: () => document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24')?.innerText?.trim(),
    company: () => document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a.ember-view.t-black.t-normal')?.innerText?.trim(),
    location: () => document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet')?.innerText?.trim(),
    description: () => document.querySelector('.jobs-description__content, .jobs-box__html-content, #job-details')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[data-test-modal-id="easy-apply-modal"], .jobs-easy-apply-modal')
  },
  
  indeed: {
    title: () => document.querySelector('h1.jobsearch-JobInfoHeader-title, .jobsearch-JobInfoHeader-title-container h1')?.innerText?.trim(),
    company: () => document.querySelector('[data-company-name="true"], .jobsearch-InlineCompanyRating-companyHeader a')?.innerText?.trim(),
    location: () => document.querySelector('[data-testid="job-location"], .jobsearch-JobInfoHeader-subtitle > div:last-child')?.innerText?.trim(),
    description: () => document.querySelector('#jobDescriptionText, .jobsearch-jobDescriptionText')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('#ia-container, .jobsearch-ViewJobButtons-container')
  },
  
  glassdoor: {
    title: () => document.querySelector('[data-test="job-title"], .job-title')?.innerText?.trim(),
    company: () => document.querySelector('[data-test="employer-name"], .employer-name')?.innerText?.trim(),
    location: () => document.querySelector('[data-test="job-location"], .location')?.innerText?.trim(),
    description: () => document.querySelector('[data-test="job-description"], .job-description')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[data-test="apply-button"]')
  },
  
  greenhouse: {
    title: () => document.querySelector('.app-title, h1.heading')?.innerText?.trim(),
    company: () => document.querySelector('.company-name, .logo-wrapper img')?.alt || document.title.split(' at ')[1]?.split(' - ')[0],
    location: () => document.querySelector('.location, .body--metadata')?.innerText?.trim(),
    description: () => document.querySelector('#content, .job-description')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('#application-form, form#application')
  },
  
  lever: {
    title: () => document.querySelector('.posting-headline h2, .posting-title')?.innerText?.trim(),
    company: () => document.querySelector('.posting-headline .company-name, .main-header-logo img')?.alt || '',
    location: () => document.querySelector('.posting-categories .location, .posting-category:has(.sort-by-location)')?.innerText?.trim(),
    description: () => document.querySelector('.posting-page-section-content, [data-qa="job-description"]')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('.application-form, #application-form')
  },
  
  workday: {
    title: () => document.querySelector('[data-automation-id="jobPostingHeader"], h1')?.innerText?.trim(),
    company: () => document.querySelector('[data-automation-id="company-name"]')?.innerText?.trim() || document.title.split(' - ')[1],
    location: () => document.querySelector('[data-automation-id="locations"]')?.innerText?.trim(),
    description: () => document.querySelector('[data-automation-id="jobPostingDescription"]')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[data-automation-id="applyButton"], [data-automation-id="apply"]')
  },
  
  // Generic fallback
  generic: {
    title: () => document.querySelector('h1, .job-title, [class*="title"]')?.innerText?.trim(),
    company: () => document.querySelector('.company, [class*="company"]')?.innerText?.trim(),
    location: () => document.querySelector('.location, [class*="location"]')?.innerText?.trim(),
    description: () => document.querySelector('.description, [class*="description"], main')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('form[action*="apply"], button[class*="apply"]')
  }
};

// Detect current platform
function detectPlatform() {
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes('linkedin')) return 'linkedin';
  if (hostname.includes('indeed')) return 'indeed';
  if (hostname.includes('glassdoor')) return 'glassdoor';
  if (hostname.includes('greenhouse')) return 'greenhouse';
  if (hostname.includes('lever')) return 'lever';
  if (hostname.includes('workday') || hostname.includes('myworkdayjobs')) return 'workday';
  if (hostname.includes('ashby')) return 'ashby';
  if (hostname.includes('smartrecruiters')) return 'smartrecruiters';
  if (hostname.includes('icims')) return 'icims';
  if (hostname.includes('jobvite')) return 'jobvite';
  if (hostname.includes('bamboohr')) return 'bamboohr';
  
  return 'generic';
}

// Extract job data from current page
function extractJobData() {
  const platform = detectPlatform();
  const extractor = EXTRACTORS[platform] || EXTRACTORS.generic;
  
  const data = {
    title: extractor.title() || '',
    company: extractor.company() || '',
    location: extractor.location() || '',
    description: extractor.description() || '',
    url: window.location.href,
    platform: platform,
    requirements: extractRequirements(extractor.description() || ''),
    extractedAt: new Date().toISOString()
  };
  
  console.log('📋 Extracted job data:', data.title, 'at', data.company);
  return data;
}

// Extract requirements from description
function extractRequirements(description) {
  const requirements = [];
  const lines = description.split('\n');
  
  let inRequirementsSection = false;
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('requirement') || lowerLine.includes('qualification') || lowerLine.includes('must have')) {
      inRequirementsSection = true;
      continue;
    }
    
    if (inRequirementsSection && line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().match(/^\d+\./)) {
      requirements.push(line.trim().replace(/^[•\-\d+\.]\s*/, ''));
    }
    
    if (lowerLine.includes('nice to have') || lowerLine.includes('benefits') || lowerLine.includes('about us')) {
      inRequirementsSection = false;
    }
  }
  
  return requirements.slice(0, 15);
}

// Create floating control panel
function createFloatingPanel() {
  if (floatingPanel) return;
  
  floatingPanel = document.createElement('div');
  floatingPanel.id = 'lazyapply-extreme-panel';
  floatingPanel.innerHTML = `
    <div class="lae-header">
      <span class="lae-logo">⚡</span>
      <span class="lae-title">LazyApply 2.0 EXTREME</span>
      <button class="lae-minimize">−</button>
    </div>
    <div class="lae-content">
      <div class="lae-status">
        <span class="lae-status-dot"></span>
        <span class="lae-status-text">Ready to enhance</span>
      </div>
      <div class="lae-job-info">
        <div class="lae-job-title">-</div>
        <div class="lae-job-company">-</div>
      </div>
      <div class="lae-score-container" style="display: none;">
        <div class="lae-score-label">ATS Match Score</div>
        <div class="lae-score-value">--%</div>
        <div class="lae-score-bar">
          <div class="lae-score-fill"></div>
        </div>
      </div>
      <div class="lae-actions">
        <button class="lae-btn lae-btn-primary" id="lae-tailor-btn">
          🎯 Tailor Now
        </button>
        <button class="lae-btn lae-btn-secondary" id="lae-copy-resume-btn" style="display: none;">
          📄 Copy Resume
        </button>
        <button class="lae-btn lae-btn-secondary" id="lae-copy-cover-btn" style="display: none;">
          ✉️ Copy Cover Letter
        </button>
      </div>
      <div class="lae-stats">
        <span>Session: <strong id="lae-session-count">0</strong> tailored</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(floatingPanel);
  
  // Event listeners
  floatingPanel.querySelector('.lae-minimize').addEventListener('click', togglePanel);
  floatingPanel.querySelector('#lae-tailor-btn').addEventListener('click', handleTailorClick);
  floatingPanel.querySelector('#lae-copy-resume-btn').addEventListener('click', () => copyToClipboard('resume'));
  floatingPanel.querySelector('#lae-copy-cover-btn').addEventListener('click', () => copyToClipboard('cover'));
  
  // Make draggable
  makeDraggable(floatingPanel);
  
  // Update with current job
  updatePanelWithJobData();
}

// Toggle panel minimized state
function togglePanel() {
  floatingPanel.classList.toggle('lae-minimized');
}

// Make element draggable
function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  element.querySelector('.lae-header').onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + 'px';
    element.style.left = (element.offsetLeft - pos1) + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
  
  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Update panel with current job data
function updatePanelWithJobData() {
  currentJobData = extractJobData();
  
  if (floatingPanel) {
    floatingPanel.querySelector('.lae-job-title').textContent = currentJobData.title || 'Unknown Position';
    floatingPanel.querySelector('.lae-job-company').textContent = currentJobData.company || 'Unknown Company';
    
    if (currentJobData.title) {
      floatingPanel.querySelector('.lae-status-text').textContent = 'Job detected - Ready to tailor';
      floatingPanel.querySelector('.lae-status-dot').classList.add('active');
    }
  }
}

// Handle tailor button click
async function handleTailorClick() {
  if (!currentJobData?.title) {
    showNotification('No job detected on this page', 'error');
    return;
  }
  
  const btn = floatingPanel.querySelector('#lae-tailor-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Tailoring...';
  
  updateStatus('Generating ATS-optimized documents...', 'loading');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'TAILOR_APPLICATION',
      jobData: currentJobData
    });
    
    if (response.success) {
      lastTailoredData = response.data;
      showTailoredResults(response.data);
      updateSessionCount();
    } else {
      throw new Error(response.error || 'Tailoring failed');
    }
  } catch (error) {
    console.error('Tailoring error:', error);
    showNotification(error.message, 'error');
    updateStatus('Error - Click to retry', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🎯 Tailor Now';
  }
}

// Show tailored results
function showTailoredResults(data) {
  const scoreContainer = floatingPanel.querySelector('.lae-score-container');
  const scoreValue = floatingPanel.querySelector('.lae-score-value');
  const scoreFill = floatingPanel.querySelector('.lae-score-fill');
  const copyResumeBtn = floatingPanel.querySelector('#lae-copy-resume-btn');
  const copyCoverBtn = floatingPanel.querySelector('#lae-copy-cover-btn');
  
  scoreContainer.style.display = 'block';
  scoreValue.textContent = `${data.matchScore || 0}%`;
  scoreFill.style.width = `${data.matchScore || 0}%`;
  
  // Color based on score
  if (data.matchScore >= 80) {
    scoreFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
  } else if (data.matchScore >= 60) {
    scoreFill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
  } else {
    scoreFill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
  }
  
  copyResumeBtn.style.display = data.tailoredResume ? 'block' : 'none';
  copyCoverBtn.style.display = data.coverLetter ? 'block' : 'none';
  
  updateStatus(`ATS Score: ${data.matchScore}% - Ready to apply!`, 'success');
  showNotification(`ATS Score: ${data.matchScore}% - Documents ready!`, 'success');
}

// Copy to clipboard
function copyToClipboard(type) {
  if (!lastTailoredData) return;
  
  const content = type === 'resume' ? lastTailoredData.tailoredResume : lastTailoredData.coverLetter;
  
  if (content) {
    navigator.clipboard.writeText(content).then(() => {
      showNotification(`${type === 'resume' ? 'Resume' : 'Cover letter'} copied!`, 'success');
    });
  }
}

// Update status display
function updateStatus(message, type) {
  if (!floatingPanel) return;
  
  const statusText = floatingPanel.querySelector('.lae-status-text');
  const statusDot = floatingPanel.querySelector('.lae-status-dot');
  
  statusText.textContent = message;
  statusDot.className = 'lae-status-dot ' + type;
}

// Update session count
function updateSessionCount() {
  chrome.runtime.sendMessage({ action: 'GET_STATS' }, (response) => {
    if (response?.stats) {
      const countEl = floatingPanel.querySelector('#lae-session-count');
      if (countEl) {
        countEl.textContent = response.stats.documentsGenerated || 0;
      }
    }
  });
}

// Show notification toast
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `lae-toast lae-toast-${type}`;
  toast.innerHTML = `
    <span class="lae-toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span class="lae-toast-message">${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('lae-toast-show'), 10);
  setTimeout(() => {
    toast.classList.remove('lae-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Detect LazyApply activity (watch for their UI elements)
function watchForLazyApply() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Look for LazyApply's signature elements
          if (node.id?.includes('lazyapply') || 
              node.className?.includes('lazyapply') ||
              node.querySelector?.('[id*="lazyapply"], [class*="lazyapply"]')) {
            console.log('🔍 LazyApply activity detected!');
            handleLazyApplyDetected();
          }
        }
      }
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// Handle LazyApply detection
function handleLazyApplyDetected() {
  currentJobData = extractJobData();
  
  if (currentJobData.title) {
    chrome.runtime.sendMessage({
      action: 'LAZYAPPLY_DETECTED',
      jobData: currentJobData
    });
    
    updatePanelWithJobData();
  }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'STATE_UPDATE':
      isEnabled = message.state.enabled;
      if (!isEnabled && floatingPanel) {
        floatingPanel.style.display = 'none';
      } else if (isEnabled && floatingPanel) {
        floatingPanel.style.display = 'block';
      }
      break;
      
    case 'TAILORING_STATUS':
      if (message.status === 'started') {
        updateStatus(message.message, 'loading');
      } else if (message.status === 'complete') {
        lastTailoredData = message.data;
        showTailoredResults(message.data);
      } else if (message.status === 'error') {
        updateStatus(message.message, 'error');
        showNotification(message.message, 'error');
      }
      break;
      
    case 'INJECT_TAILORED_DATA':
      lastTailoredData = message.data;
      showTailoredResults(message.data);
      autoFillIfPossible(message.data);
      break;
  }
  
  sendResponse({ success: true });
  return true;
});

// Auto-fill application fields if possible
function autoFillIfPossible(data) {
  // LinkedIn Easy Apply
  const linkedInTextarea = document.querySelector('[data-test-text-entity-list-form-component] textarea');
  if (linkedInTextarea && data.coverLetter) {
    linkedInTextarea.value = data.coverLetter;
    linkedInTextarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  // Generic cover letter field
  const coverLetterField = document.querySelector('textarea[name*="cover"], textarea[id*="cover"], [data-field="cover_letter"] textarea');
  if (coverLetterField && data.coverLetter) {
    coverLetterField.value = data.coverLetter;
    coverLetterField.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// Initialize
function init() {
  // Wait for page to stabilize
  setTimeout(() => {
    createFloatingPanel();
    watchForLazyApply();
    
    // Re-extract on URL changes (SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(updatePanelWithJobData, 1000);
      }
    }).observe(document, { subtree: true, childList: true });
    
  }, 1500);
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
