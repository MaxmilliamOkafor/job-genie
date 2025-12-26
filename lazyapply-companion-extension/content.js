// LazyApply 2.0 EXTREME - Enhanced Content Script
// Multi-ATS support with Workday multi-page handling

console.log('🚀 LazyApply 2.0 EXTREME loaded on:', window.location.hostname);

let isEnabled = true;
let currentJobData = null;
let floatingPanel = null;
let lastTailoredData = null;
let workdayCurrentPage = null;

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
    title: () => document.querySelector('[data-automation-id="jobPostingHeader"], [data-automation-id="headerTitle"], h1')?.innerText?.trim(),
    company: () => document.querySelector('[data-automation-id="company-name"]')?.innerText?.trim() || extractCompanyFromUrl(),
    location: () => document.querySelector('[data-automation-id="locations"], [data-automation-id="location"]')?.innerText?.trim(),
    description: () => document.querySelector('[data-automation-id="jobPostingDescription"], [data-automation-id="description"]')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[data-automation-id="applyButton"], [data-automation-id="apply"], [data-automation-id="navigationRegion"]'),
    currentPage: () => detectWorkdayPage()
  },
  
  icims: {
    title: () => document.querySelector('.iCIMS_JobTitle, .title, h1')?.innerText?.trim(),
    company: () => document.querySelector('.iCIMS_Company, .company')?.innerText?.trim(),
    location: () => document.querySelector('.iCIMS_JobLocation, .location')?.innerText?.trim(),
    description: () => document.querySelector('.iCIMS_JobDescription, .description')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('.iCIMS_Apply, [id*="apply"]')
  },
  
  smartrecruiters: {
    title: () => document.querySelector('h1.job-title, .job-title')?.innerText?.trim(),
    company: () => document.querySelector('.company-name')?.innerText?.trim(),
    location: () => document.querySelector('.job-location')?.innerText?.trim(),
    description: () => document.querySelector('.job-description')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[class*="apply"]')
  },
  
  workable: {
    title: () => document.querySelector('h1[data-ui="job-title"], h1')?.innerText?.trim(),
    company: () => document.querySelector('[data-ui="company-name"]')?.innerText?.trim(),
    location: () => document.querySelector('[data-ui="job-location"]')?.innerText?.trim(),
    description: () => document.querySelector('[data-ui="job-description"]')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[data-ui="apply-button"]')
  },
  
  ashby: {
    title: () => document.querySelector('h1')?.innerText?.trim(),
    company: () => document.title.split(' - ')[1] || '',
    location: () => document.querySelector('[class*="location"]')?.innerText?.trim(),
    description: () => document.querySelector('[class*="description"], main')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('form')
  },
  
  // Additional Tier-1 ATS Extractors
  successfactors: {
    title: () => document.querySelector('.jobTitle, h1[class*="title"]')?.innerText?.trim(),
    company: () => document.querySelector('.company-name, [class*="company"]')?.innerText?.trim(),
    location: () => document.querySelector('.location, [class*="location"]')?.innerText?.trim(),
    description: () => document.querySelector('.job-description, [class*="description"]')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('form[action*="apply"], [class*="apply-button"]')
  },
  
  taleo: {
    title: () => document.querySelector('.titlefield, h1.requisitionTitle')?.innerText?.trim(),
    company: () => document.querySelector('.headertext')?.innerText?.trim() || document.title.split(' - ')[1],
    location: () => document.querySelector('[id*="location"], .contentlinepanel')?.innerText?.trim(),
    description: () => document.querySelector('.contentlinepanel, .jobdescription')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[id*="applybutton"], .applybutton')
  },
  
  brassring: {
    title: () => document.querySelector('.jobTitle, h1')?.innerText?.trim(),
    company: () => document.title.split(' - ')[1] || '',
    location: () => document.querySelector('.location')?.innerText?.trim(),
    description: () => document.querySelector('.jobDescription')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[class*="apply"]')
  },
  
  bamboohr: {
    title: () => document.querySelector('.ResAts__listing-header__title, h1')?.innerText?.trim(),
    company: () => document.querySelector('.ResAts__header__logo img')?.alt || '',
    location: () => document.querySelector('.ResAts__listing-header__location')?.innerText?.trim(),
    description: () => document.querySelector('.ResAts__listing-body')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('.ResAts__apply-btn')
  },
  
  paylocity: {
    title: () => document.querySelector('h1.job-title, h1')?.innerText?.trim(),
    company: () => document.querySelector('.company-name')?.innerText?.trim(),
    location: () => document.querySelector('.job-location')?.innerText?.trim(),
    description: () => document.querySelector('.job-description')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[class*="apply"]')
  },
  
  jobvite: {
    title: () => document.querySelector('.jv-header h1, h1')?.innerText?.trim(),
    company: () => document.querySelector('.jv-company-name')?.innerText?.trim(),
    location: () => document.querySelector('.jv-job-detail-meta')?.innerText?.trim(),
    description: () => document.querySelector('.jv-job-detail-description')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('.jv-apply-button, [class*="apply"]')
  },
  
  wellfound: {
    title: () => document.querySelector('h1')?.innerText?.trim(),
    company: () => document.querySelector('[class*="company-name"], h2')?.innerText?.trim(),
    location: () => document.querySelector('[class*="location"]')?.innerText?.trim(),
    description: () => document.querySelector('[class*="description"], main')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[class*="apply"]')
  },
  
  ycombinator: {
    title: () => document.querySelector('h1')?.innerText?.trim(),
    company: () => document.querySelector('.company-name, h2 a')?.innerText?.trim(),
    location: () => document.querySelector('.job-location, [class*="location"]')?.innerText?.trim(),
    description: () => document.querySelector('.job-description, main')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('[class*="apply"], form')
  },
  
  // Generic fallback (enhanced)
  generic: {
    title: () => document.querySelector('h1, .job-title, [class*="title"], [data-testid*="title"]')?.innerText?.trim(),
    company: () => document.querySelector('.company, [class*="company"], [data-testid*="company"]')?.innerText?.trim(),
    location: () => document.querySelector('.location, [class*="location"], [data-testid*="location"]')?.innerText?.trim(),
    description: () => document.querySelector('.description, [class*="description"], [data-testid*="description"], main, article')?.innerText?.trim(),
    isApplicationPage: () => !!document.querySelector('form[action*="apply"], button[class*="apply"], [class*="apply-button"], a[href*="apply"]')
  }
};

// Extract company from Workday URL
function extractCompanyFromUrl() {
  const url = window.location.href;
  const match = url.match(/https?:\/\/([^.]+)\.(wd\d+\.)?myworkdayjobs\.com/);
  if (match) {
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  return document.title.split(' - ')[1] || '';
}

// Detect current Workday application page
function detectWorkdayPage() {
  const url = window.location.href;
  const pageIndicators = document.querySelectorAll('[data-automation-id="navigationRegion"] li, .wd-ProgressBar-segment');
  
  if (url.includes('/apply/') || url.includes('/form/')) {
    // Check for specific page indicators
    if (document.querySelector('[data-automation-id="resumeSection"], [data-automation-id="resume"]')) {
      return 'resume';
    }
    if (document.querySelector('[data-automation-id="contactInformation"], [data-automation-id="legalNameSection"]')) {
      return 'personal-info';
    }
    if (document.querySelector('[data-automation-id="workExperience"]')) {
      return 'experience';
    }
    if (document.querySelector('[data-automation-id="education"]')) {
      return 'education';
    }
    if (document.querySelector('[data-automation-id="voluntaryDisclosures"], [data-automation-id="selfIdentification"]')) {
      return 'disclosures';
    }
    if (document.querySelector('[data-automation-id="review"]')) {
      return 'review';
    }
  }
  return 'overview';
}

// Detect current platform - Extended for 60+ ATS
function detectPlatform() {
  const hostname = window.location.hostname.toLowerCase();
  const url = window.location.href.toLowerCase();
  
  // Tier 1: Premium ATS
  if (hostname.includes('greenhouse')) return 'greenhouse';
  if (hostname.includes('lever')) return 'lever';
  if (hostname.includes('ashby')) return 'ashby';
  if (hostname.includes('rippling')) return 'rippling';
  if (hostname.includes('workday') || hostname.includes('myworkdayjobs')) return 'workday';
  if (hostname.includes('icims')) return 'icims';
  if (hostname.includes('workable')) return 'workable';
  if (hostname.includes('smartrecruiters')) return 'smartrecruiters';
  if (hostname.includes('taleo')) return 'taleo';
  if (hostname.includes('successfactors')) return 'successfactors';
  if (hostname.includes('bamboohr')) return 'bamboohr';
  if (hostname.includes('jobvite')) return 'jobvite';
  if (hostname.includes('brassring')) return 'brassring';
  if (hostname.includes('paylocity')) return 'paylocity';
  if (hostname.includes('paycom')) return 'paycom';
  if (hostname.includes('ultipro')) return 'ultipro';
  if (hostname.includes('adp')) return 'adp';
  
  // Tier 2: Major Job Boards
  if (hostname.includes('linkedin')) return 'linkedin';
  if (hostname.includes('indeed')) return 'indeed';
  if (hostname.includes('glassdoor')) return 'glassdoor';
  if (hostname.includes('dice')) return 'dice';
  if (hostname.includes('monster')) return 'monster';
  if (hostname.includes('ziprecruiter')) return 'ziprecruiter';
  if (hostname.includes('careerbuilder')) return 'careerbuilder';
  if (hostname.includes('simplyhired')) return 'simplyhired';
  
  // Tier 3: Startup/Tech Focused
  if (hostname.includes('wellfound') || hostname.includes('angel.co')) return 'wellfound';
  if (hostname.includes('builtin')) return 'builtin';
  if (hostname.includes('otta')) return 'otta';
  if (hostname.includes('ycombinator') || hostname.includes('workatastartup')) return 'ycombinator';
  if (hostname.includes('triplebyte')) return 'triplebyte';
  if (hostname.includes('hired.com')) return 'hired';
  if (hostname.includes('cord.co')) return 'cord';
  
  // Tier 4: International/Regional
  if (hostname.includes('usajobs.gov')) return 'usajobs';
  if (hostname.includes('seek.com')) return 'seek';
  if (hostname.includes('reed.co.uk')) return 'reed';
  if (hostname.includes('totaljobs')) return 'totaljobs';
  if (hostname.includes('cwjobs')) return 'cwjobs';
  if (hostname.includes('xing')) return 'xing';
  if (hostname.includes('stepstone')) return 'stepstone';
  if (hostname.includes('naukri')) return 'naukri';
  
  // Tier 5: Mid-Market ATS
  if (hostname.includes('breezy')) return 'breezy';
  if (hostname.includes('jazz')) return 'jazz';
  if (hostname.includes('personio')) return 'personio';
  if (hostname.includes('teamtailor')) return 'teamtailor';
  if (hostname.includes('recruitee')) return 'recruitee';
  if (hostname.includes('applytojob')) return 'applytojob';
  if (hostname.includes('fountain')) return 'fountain';
  if (hostname.includes('pinpointhq')) return 'pinpoint';
  if (hostname.includes('homerun')) return 'homerun';
  if (hostname.includes('comeet')) return 'comeet';
  if (hostname.includes('freshteam')) return 'freshteam';
  if (hostname.includes('zoho') && url.includes('recruit')) return 'zoho_recruit';
  if (hostname.includes('bullhorn')) return 'bullhorn';
  if (hostname.includes('avature')) return 'avature';
  if (hostname.includes('cornerstone')) return 'cornerstone';
  if (hostname.includes('dayforcehcm')) return 'dayforce';
  if (hostname.includes('apploi')) return 'apploi';
  if (hostname.includes('clearcompany')) return 'clearcompany';
  
  // Tier 6: Remote/Specialized
  if (hostname.includes('remoteok')) return 'remoteok';
  if (hostname.includes('weworkremotely')) return 'weworkremotely';
  if (hostname.includes('flexjobs')) return 'flexjobs';
  if (hostname.includes('remote.co')) return 'remote';
  if (hostname.includes('himalayas')) return 'himalayas';
  if (hostname.includes('arc.dev')) return 'arc';
  if (hostname.includes('toptal')) return 'toptal';
  if (hostname.includes('turing.com')) return 'turing';
  if (hostname.includes('andela')) return 'andela';
  
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
  
  // Add Workday page info if applicable
  if (platform === 'workday' && extractor.currentPage) {
    data.workdayPage = extractor.currentPage();
  }
  
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
    
    if (inRequirementsSection && (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().match(/^\d+\./))) {
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
      <span class="lae-title">EXTREME</span>
      <button class="lae-minimize">−</button>
    </div>
    <div class="lae-content">
      <div class="lae-status">
        <span class="lae-status-dot"></span>
        <span class="lae-status-text">Ready</span>
      </div>
      <div class="lae-job-info">
        <div class="lae-job-title">-</div>
        <div class="lae-job-company">-</div>
      </div>
      <div class="lae-score-container" style="display: none;">
        <div class="lae-score-label">ATS Match</div>
        <div class="lae-score-value">--%</div>
        <div class="lae-score-bar">
          <div class="lae-score-fill"></div>
        </div>
      </div>
      <div class="lae-actions">
        <button class="lae-btn lae-btn-primary" id="lae-tailor-btn">
          🎯 Tailor
        </button>
        <button class="lae-btn lae-btn-secondary" id="lae-attach-btn" style="display: none;">
          📎 Attach
        </button>
      </div>
      <div class="lae-copy-actions" style="display: none;">
        <button class="lae-btn-small" id="lae-copy-resume-btn">📄 Resume</button>
        <button class="lae-btn-small" id="lae-copy-cover-btn">✉️ Cover</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(floatingPanel);
  
  // Event listeners
  floatingPanel.querySelector('.lae-minimize').addEventListener('click', togglePanel);
  floatingPanel.querySelector('#lae-tailor-btn').addEventListener('click', handleTailorClick);
  floatingPanel.querySelector('#lae-attach-btn')?.addEventListener('click', handleAttachClick);
  floatingPanel.querySelector('#lae-copy-resume-btn')?.addEventListener('click', () => copyToClipboard('resume'));
  floatingPanel.querySelector('#lae-copy-cover-btn')?.addEventListener('click', () => copyToClipboard('cover'));
  
  // Make draggable
  makeDraggable(floatingPanel);
  
  // Update with current job
  updatePanelWithJobData();
  
  // Check for current apply job from queue
  checkForQueuedJob();
}

// Check if we're on a job from the queue
async function checkForQueuedJob() {
  chrome.runtime.sendMessage({ action: 'GET_CURRENT_JOB' }, (response) => {
    if (response?.job && response.job.url === window.location.href) {
      console.log('🎯 This job is from the queue!');
      
      if (response.job.tailoredData) {
        lastTailoredData = response.job.tailoredData;
        showTailoredResults(response.job.tailoredData);
        
        if (response.attachDocuments) {
          // Auto-attach if enabled
          setTimeout(() => handleAttachClick(), 1000);
        }
      }
    }
  });
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
    floatingPanel.querySelector('.lae-job-title').textContent = truncate(currentJobData.title || 'Unknown Position', 30);
    floatingPanel.querySelector('.lae-job-company').textContent = truncate(currentJobData.company || 'Unknown Company', 25);
    
    if (currentJobData.title) {
      floatingPanel.querySelector('.lae-status-text').textContent = 'Job detected';
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
  btn.innerHTML = '⏳ ...';
  
  updateStatus('Tailoring...', 'loading');
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'TAILOR_APPLICATION',
      jobData: currentJobData
    });
    
    if (response.success) {
      lastTailoredData = response.data;
      showTailoredResults(response.data);
    } else {
      throw new Error(response.error || 'Tailoring failed');
    }
  } catch (error) {
    console.error('Tailoring error:', error);
    showNotification(error.message, 'error');
    updateStatus('Error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🎯 Tailor';
  }
}

// Handle attach button click
function handleAttachClick() {
  if (!lastTailoredData) {
    showNotification('No tailored data available', 'error');
    return;
  }
  
  const platform = detectPlatform();
  
  switch (platform) {
    case 'workday':
      attachToWorkday(lastTailoredData);
      break;
    case 'greenhouse':
      attachToGreenhouse(lastTailoredData);
      break;
    case 'lever':
      attachToLever(lastTailoredData);
      break;
    default:
      autoFillIfPossible(lastTailoredData);
  }
}

// Attach to Workday (multi-page aware)
function attachToWorkday(data) {
  const currentPage = detectWorkdayPage();
  console.log('📄 Workday page:', currentPage);
  
  switch (currentPage) {
    case 'resume':
      // Look for file upload or text field
      const resumeUpload = document.querySelector('[data-automation-id="resumeUpload"], input[type="file"]');
      if (resumeUpload) {
        // Can't programmatically set file input, show notification
        showNotification('Resume ready - paste or upload manually', 'info');
        navigator.clipboard.writeText(data.tailoredResume || '');
      }
      break;
      
    case 'personal-info':
      // Fill contact info if available
      fillWorkdayPersonalInfo(data);
      break;
      
    default:
      // Try to fill cover letter field
      const coverField = document.querySelector('textarea[data-automation-id*="cover"], textarea[name*="cover"]');
      if (coverField && data.coverLetter) {
        coverField.value = data.coverLetter;
        coverField.dispatchEvent(new Event('input', { bubbles: true }));
        showNotification('Cover letter filled!', 'success');
      }
  }
}

// Fill Workday personal info
function fillWorkdayPersonalInfo(data) {
  // This would use the profile data to fill form fields
  showNotification('Personal info should be auto-filled by LazyApply', 'info');
}

// Attach to Greenhouse
function attachToGreenhouse(data) {
  const coverField = document.querySelector('#cover_letter, textarea[name*="cover"]');
  if (coverField && data.coverLetter) {
    coverField.value = data.coverLetter;
    coverField.dispatchEvent(new Event('input', { bubbles: true }));
    showNotification('Cover letter attached!', 'success');
  }
}

// Attach to Lever
function attachToLever(data) {
  const coverField = document.querySelector('[name="comments"], textarea[placeholder*="cover"]');
  if (coverField && data.coverLetter) {
    coverField.value = data.coverLetter;
    coverField.dispatchEvent(new Event('input', { bubbles: true }));
    showNotification('Cover letter attached!', 'success');
  }
}

// Show tailored results
function showTailoredResults(data) {
  const scoreContainer = floatingPanel.querySelector('.lae-score-container');
  const scoreValue = floatingPanel.querySelector('.lae-score-value');
  const scoreFill = floatingPanel.querySelector('.lae-score-fill');
  const attachBtn = floatingPanel.querySelector('#lae-attach-btn');
  const copyActions = floatingPanel.querySelector('.lae-copy-actions');
  
  scoreContainer.style.display = 'block';
  scoreValue.textContent = `${data.matchScore || 0}%`;
  scoreFill.style.width = `${data.matchScore || 0}%`;
  
  if (data.matchScore >= 80) {
    scoreFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
  } else if (data.matchScore >= 60) {
    scoreFill.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
  } else {
    scoreFill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
  }
  
  attachBtn.style.display = 'block';
  copyActions.style.display = 'flex';
  
  updateStatus(`Score: ${data.matchScore}%`, 'success');
  showNotification(`ATS Score: ${data.matchScore}%`, 'success');
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

// Show notification toast
function showNotification(message, type = 'info') {
  const existing = document.querySelector('.lae-toast');
  if (existing) existing.remove();
  
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

// Truncate string
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// Detect LazyApply activity
function watchForLazyApply() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.id?.includes('lazyapply') || 
              node.className?.includes?.('lazyapply') ||
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

// Watch for Workday page changes
function watchForWorkdayNavigation() {
  if (!window.location.hostname.includes('workday') && !window.location.hostname.includes('myworkdayjobs')) {
    return;
  }
  
  let lastPage = detectWorkdayPage();
  
  const observer = new MutationObserver(() => {
    const currentPage = detectWorkdayPage();
    if (currentPage !== lastPage) {
      console.log('📄 Workday page changed:', lastPage, '->', currentPage);
      lastPage = currentPage;
      
      chrome.runtime.sendMessage({
        action: 'WORKDAY_PAGE_CHANGED',
        pageData: { pageType: currentPage }
      });
      
      updatePanelWithJobData();
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// Auto-fill application fields if possible
function autoFillIfPossible(data) {
  // LinkedIn Easy Apply
  const linkedInTextarea = document.querySelector('[data-test-text-entity-list-form-component] textarea, textarea[name*="cover"]');
  if (linkedInTextarea && data.coverLetter) {
    linkedInTextarea.value = data.coverLetter;
    linkedInTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    showNotification('Cover letter filled!', 'success');
    return;
  }
  
  // Generic cover letter field
  const coverLetterField = document.querySelector(
    'textarea[name*="cover"], textarea[id*="cover"], ' +
    'textarea[placeholder*="cover" i], textarea[placeholder*="letter" i], ' +
    '[data-field="cover_letter"] textarea'
  );
  if (coverLetterField && data.coverLetter) {
    coverLetterField.value = data.coverLetter;
    coverLetterField.dispatchEvent(new Event('input', { bubbles: true }));
    showNotification('Cover letter filled!', 'success');
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
      
    case 'WORKDAY_FILL_PAGE':
      if (message.tailoredData) {
        lastTailoredData = message.tailoredData;
        attachToWorkday(message.tailoredData);
      }
      break;
  }
  
  sendResponse({ success: true });
  return true;
});

// Initialize
function init() {
  setTimeout(() => {
    chrome.storage.local.get(['showPanel'], (data) => {
      if (data.showPanel !== false) {
        createFloatingPanel();
      }
    });
    
    watchForLazyApply();
    watchForWorkdayNavigation();
    
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

// Start
init();