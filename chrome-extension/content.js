// QuantumHire AI - Content Script
// Handles form detection, auto-filling, job extraction on EXTERNAL company job pages (non-Easy Apply)

console.log('QuantumHire AI: Content script loaded');

// Field mapping for common form fields
const FIELD_MAPPINGS = {
  // Name fields
  firstName: ['first_name', 'firstname', 'first-name', 'fname', 'given_name', 'givenname'],
  lastName: ['last_name', 'lastname', 'last-name', 'lname', 'surname', 'family_name', 'familyname'],
  fullName: ['full_name', 'fullname', 'name', 'your_name', 'applicant_name'],
  
  // Contact fields
  email: ['email', 'e-mail', 'email_address', 'emailaddress', 'work_email', 'personal_email'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone_number', 'phonenumber', 'contact_number'],
  
  // Address fields
  address: ['address', 'street', 'street_address', 'address_line_1', 'address1'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region', 'state_province'],
  zipCode: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postalcode'],
  country: ['country', 'nation', 'country_code'],
  
  // Professional fields
  linkedin: ['linkedin', 'linkedin_url', 'linkedin_profile', 'linkedinurl'],
  github: ['github', 'github_url', 'github_profile', 'githuburl'],
  portfolio: ['portfolio', 'website', 'personal_website', 'portfolio_url', 'website_url'],
  
  // Experience fields
  currentCompany: ['current_company', 'currentcompany', 'company', 'employer', 'current_employer'],
  currentTitle: ['current_title', 'currenttitle', 'job_title', 'title', 'position', 'current_position'],
  yearsExperience: ['years_experience', 'experience', 'total_experience', 'years_of_experience'],
  
  // Salary
  salary: ['salary', 'salary_expectation', 'expected_salary', 'desired_salary', 'compensation'],
  
  // Cover letter
  coverLetter: ['cover_letter', 'coverletter', 'cover', 'letter', 'message', 'additional_info'],
};

// ATS-specific selectors for form filling (external company pages)
const ATS_SELECTORS = {
  greenhouse: {
    firstName: '#first_name',
    lastName: '#last_name',
    email: '#email',
    phone: '#phone',
    linkedin: 'input[name*="linkedin"]',
    resume: 'input[type="file"][name*="resume"]',
    coverLetter: 'textarea[name*="cover_letter"]',
  },
  lever: {
    fullName: 'input[name="name"]',
    email: 'input[name="email"]',
    phone: 'input[name="phone"]',
    linkedin: 'input[name="urls[LinkedIn]"]',
    github: 'input[name="urls[GitHub]"]',
    portfolio: 'input[name="urls[Portfolio]"]',
    resume: 'input[type="file"][name="resume"]',
    coverLetter: 'textarea[name="comments"]',
  },
  workday: {
    firstName: 'input[data-automation-id="firstName"]',
    lastName: 'input[data-automation-id="lastName"]',
    email: 'input[data-automation-id="email"]',
    phone: 'input[data-automation-id="phone"]',
    address: 'input[data-automation-id="addressLine1"]',
    city: 'input[data-automation-id="city"]',
    state: 'input[data-automation-id="state"]',
    zipCode: 'input[data-automation-id="postalCode"]',
    country: 'input[data-automation-id="country"]',
  },
  ashby: {
    firstName: 'input[name="firstName"]',
    lastName: 'input[name="lastName"]',
    email: 'input[name="email"]',
    phone: 'input[name="phone"]',
    linkedin: 'input[name="linkedInUrl"]',
  },
  icims: {
    firstName: '#firstName',
    lastName: '#lastName',
    email: '#email',
    phone: '#phone',
  },
  smartrecruiters: {
    firstName: 'input[name="firstName"]',
    lastName: 'input[name="lastName"]',
    email: 'input[name="email"]',
    phone: 'input[name="phone"]',
  },
  jobvite: {
    firstName: 'input[name="firstName"]',
    lastName: 'input[name="lastName"]',
    email: 'input[name="email"]',
    phone: 'input[name="phone"]',
  },
  generic: {
    firstName: 'input[name*="first"], input[id*="first"]',
    lastName: 'input[name*="last"], input[id*="last"]',
    email: 'input[type="email"], input[name*="email"]',
    phone: 'input[type="tel"], input[name*="phone"]',
  },
};

// ATS-specific selectors for JOB EXTRACTION
const JOB_EXTRACTION_SELECTORS = {
  greenhouse: {
    title: '.app-title, h1.heading',
    company: '.company-name, .logo-container img[alt]',
    description: '#content, .job-description, [data-qa="job-description"]',
    location: '.location, .job-location',
  },
  lever: {
    title: '.posting-headline h2, h1.posting-title',
    company: '.main-header-logo img[alt], .posting-headline .sort-by-time',
    description: '.posting-description, .section-wrapper',
    location: '.location, .posting-categories .sort-by-time',
  },
  workday: {
    title: '[data-automation-id="jobPostingHeader"] h1, .job-title',
    company: '[data-automation-id="companyName"], .company-name',
    description: '[data-automation-id="jobPostingDescription"], .job-description',
    location: '[data-automation-id="locations"], .location',
  },
  ashby: {
    title: 'h1, [data-testid="job-title"]',
    company: '.company-name, header img[alt]',
    description: '.job-description, [data-testid="job-description"]',
    location: '.location, [data-testid="job-location"]',
  },
  smartrecruiters: {
    title: 'h1.job-title, .job-header h1',
    company: '.company-name, .job-header .company',
    description: '.job-description, .job-ad-description',
    location: '.job-location, .location',
  },
  generic: {
    title: 'h1, [class*="job-title"], [class*="jobtitle"], [id*="job-title"]',
    company: '[class*="company"], [class*="employer"], [class*="organization"]',
    description: '[class*="job-description"], [class*="description"], [id*="description"], article, main',
    location: '[class*="location"], [class*="job-location"]',
  },
};

// Detect which ATS/company page we're on
function detectATS() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('greenhouse.io') || hostname.includes('boards.greenhouse.io')) return 'greenhouse';
  if (hostname.includes('lever.co') || hostname.includes('jobs.lever.co')) return 'lever';
  if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
  if (hostname.includes('ashbyhq.com')) return 'ashby';
  if (hostname.includes('icims.com')) return 'icims';
  if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (hostname.includes('jobvite.com')) return 'jobvite';
  if (hostname.includes('bamboohr.com')) return 'bamboohr';
  if (hostname.includes('recruitee.com')) return 'recruitee';
  if (hostname.includes('breezy.hr')) return 'breezy';
  if (hostname.includes('jazz.co')) return 'jazz';
  
  return 'generic';
}

// Check if this is a job application page (has form fields)
function isJobApplicationPage() {
  const forms = document.querySelectorAll('form');
  const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]');
  const hasApplyButton = document.querySelector('button[type="submit"], input[type="submit"], button:contains("Apply"), button:contains("Submit")');
  
  return (forms.length > 0 && inputs.length >= 2) || hasApplyButton;
}

// Extract text from element
function extractText(selector) {
  const element = document.querySelector(selector);
  if (!element) return '';
  
  if (element.tagName === 'IMG') {
    return element.alt || '';
  }
  
  return element.innerText?.trim() || element.textContent?.trim() || '';
}

// Extract job details from current page
function extractJobDetails() {
  const ats = detectATS();
  const selectors = JOB_EXTRACTION_SELECTORS[ats] || JOB_EXTRACTION_SELECTORS.generic;
  
  console.log(`QuantumHire AI: Extracting job from ${ats} page`);
  
  let title = '';
  let company = '';
  let description = '';
  let location = '';
  
  // Extract title
  if (selectors.title) {
    const titleSelectors = selectors.title.split(', ');
    for (const sel of titleSelectors) {
      title = extractText(sel);
      if (title) break;
    }
  }
  
  // Extract company
  if (selectors.company) {
    const companySelectors = selectors.company.split(', ');
    for (const sel of companySelectors) {
      company = extractText(sel);
      if (company) break;
    }
  }
  
  // Extract description
  if (selectors.description) {
    const descSelectors = selectors.description.split(', ');
    for (const sel of descSelectors) {
      description = extractText(sel);
      if (description && description.length > 100) break;
    }
  }
  
  // Extract location
  if (selectors.location) {
    const locSelectors = selectors.location.split(', ');
    for (const sel of locSelectors) {
      location = extractText(sel);
      if (location) break;
    }
  }
  
  // Fallback: try to get title from page title
  if (!title) {
    const pageTitle = document.title;
    const match = pageTitle.match(/^(.+?)(?:\s*[-|–]\s*|\s+at\s+)/);
    if (match) {
      title = match[1].trim();
    }
  }
  
  // Fallback: try to get company from page title or URL
  if (!company) {
    const pageTitle = document.title;
    const match = pageTitle.match(/[-|–]\s*(.+?)(?:\s*[-|–]|\s*$)/);
    if (match) {
      company = match[1].trim();
    }
  }
  
  const requirements = extractRequirements(description);
  
  const jobData = {
    title: title || 'Unknown Position',
    company: company || extractCompanyFromUrl(),
    description: description.substring(0, 5000),
    location: location,
    requirements: requirements,
    url: window.location.href,
    ats: ats,
  };
  
  console.log('QuantumHire AI: Extracted job data', jobData);
  return jobData;
}

// Extract company name from URL
function extractCompanyFromUrl() {
  const hostname = window.location.hostname;
  const subdomainMatch = hostname.match(/^([^.]+)\.(greenhouse|lever|ashby)/);
  if (subdomainMatch) {
    return capitalizeWords(subdomainMatch[1].replace(/-/g, ' '));
  }
  
  const pathMatch = window.location.pathname.match(/^\/([^/]+)/);
  if (pathMatch) {
    return capitalizeWords(pathMatch[1].replace(/-/g, ' '));
  }
  
  return hostname.split('.')[0];
}

function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

// Extract requirements from job description
function extractRequirements(description) {
  const requirements = [];
  
  const bulletMatch = description.match(/(?:•|▪|◦|-|\*)\s*(.+?)(?:\n|$)/g);
  if (bulletMatch) {
    bulletMatch.forEach(item => {
      const cleaned = item.replace(/^[•▪◦\-\*]\s*/, '').trim();
      if (cleaned.length > 10 && cleaned.length < 200) {
        requirements.push(cleaned);
      }
    });
  }
  
  return requirements.slice(0, 15);
}

// Find input field by various attributes
function findField(fieldType) {
  const mappings = FIELD_MAPPINGS[fieldType] || [fieldType];
  const ats = detectATS();
  
  // Try ATS-specific selector first
  if (ATS_SELECTORS[ats] && ATS_SELECTORS[ats][fieldType]) {
    const element = document.querySelector(ATS_SELECTORS[ats][fieldType]);
    if (element) return element;
  }
  
  // Try generic selectors
  for (const mapping of mappings) {
    let element = document.getElementById(mapping);
    if (element) return element;
    
    element = document.querySelector(`input[name="${mapping}"], textarea[name="${mapping}"], select[name="${mapping}"]`);
    if (element) return element;
    
    element = document.querySelector(`input[name*="${mapping}"], textarea[name*="${mapping}"]`);
    if (element) return element;
    
    element = document.querySelector(`input[id*="${mapping}"], textarea[id*="${mapping}"]`);
    if (element) return element;
    
    element = document.querySelector(`input[placeholder*="${mapping}" i], textarea[placeholder*="${mapping}" i]`);
    if (element) return element;
    
    element = document.querySelector(`input[aria-label*="${mapping}" i], textarea[aria-label*="${mapping}" i]`);
    if (element) return element;
    
    const label = document.querySelector(`label[for*="${mapping}" i]`);
    if (label && label.htmlFor) {
      element = document.getElementById(label.htmlFor);
      if (element) return element;
    }
  }
  
  return null;
}

// Fill a single field with proper event dispatching
function fillField(element, value) {
  if (!element || !value) return false;
  
  element.focus();
  element.value = '';
  element.value = value;
  
  // Dispatch events to trigger form validation
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  element.blur();
  
  return true;
}

// Main autofill function
async function autofillForm(tailoredData = null) {
  console.log('QuantumHire AI: Starting autofill...');
  
  const data = await chrome.storage.local.get(['userProfile']);
  const profile = data.userProfile;
  
  if (!profile) {
    console.log('QuantumHire AI: No profile found');
    return { success: false, message: 'No profile found. Please connect your account first.' };
  }
  
  console.log('QuantumHire AI: Profile loaded', profile);
  
  let filledCount = 0;
  
  const fieldValues = {
    firstName: profile.first_name,
    lastName: profile.last_name,
    fullName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    zipCode: profile.zip_code,
    country: profile.country,
    linkedin: profile.linkedin,
    github: profile.github,
    portfolio: profile.portfolio,
    currentTitle: profile.work_experience?.[0]?.title,
    currentCompany: profile.work_experience?.[0]?.company,
    yearsExperience: profile.total_experience,
    salary: profile.expected_salary,
    coverLetter: tailoredData?.tailoredCoverLetter || profile.cover_letter,
  };
  
  for (const [fieldType, value] of Object.entries(fieldValues)) {
    if (!value) continue;
    
    const element = findField(fieldType);
    if (element) {
      const filled = fillField(element, value);
      if (filled) {
        filledCount++;
        element.classList.add('quantumhire-filled');
        console.log(`QuantumHire AI: Filled ${fieldType}`);
      }
    }
  }
  
  // Highlight file upload fields
  const resumeInputs = document.querySelectorAll('input[type="file"]');
  resumeInputs.forEach(input => {
    input.classList.add('quantumhire-resume-field');
  });
  
  console.log(`QuantumHire AI: Filled ${filledCount} fields`);
  
  return {
    success: filledCount > 0,
    fieldsCount: filledCount,
    message: filledCount > 0 ? `Successfully filled ${filledCount} fields` : 'No matching form fields found',
  };
}

// Show toast notification
function showToast(message, type = 'success') {
  const existing = document.querySelector('.quantumhire-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `quantumhire-toast ${type}`;
  toast.innerHTML = `
    <span class="quantumhire-toast-icon">${type === 'success' ? '✅' : '❌'}</span>
    <span class="quantumhire-toast-message">${message}</span>
    <button class="quantumhire-toast-close">×</button>
  `;
  
  toast.querySelector('.quantumhire-toast-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 5000);
}

// Create floating action panel for external company job pages
function createFloatingPanel() {
  if (document.getElementById('quantumhire-panel')) return;
  
  const panel = document.createElement('div');
  panel.id = 'quantumhire-panel';
  panel.innerHTML = `
    <div class="quantumhire-panel-header">
      <span>🚀 QuantumHire AI</span>
      <button class="quantumhire-panel-minimize">−</button>
    </div>
    <div class="quantumhire-panel-body">
      <div class="quantumhire-job-preview" id="quantumhire-job-preview">
        <p class="quantumhire-loading">Analyzing job page...</p>
      </div>
      <div class="quantumhire-actions">
        <button id="quantumhire-fill-btn" class="quantumhire-btn primary">
          📝 Auto-Fill Application
        </button>
        <button id="quantumhire-tailor-btn" class="quantumhire-btn secondary">
          ✨ Tailor Resume
        </button>
      </div>
      <div id="quantumhire-tailored-content" class="quantumhire-tailored-content hidden">
        <div class="quantumhire-tabs">
          <button class="quantumhire-tab active" data-tab="resume">Resume</button>
          <button class="quantumhire-tab" data-tab="cover">Cover Letter</button>
        </div>
        <div class="quantumhire-tab-content" id="quantumhire-resume-tab">
          <textarea id="quantumhire-resume" readonly placeholder="Tailored resume will appear here..."></textarea>
          <button class="quantumhire-copy-btn" data-target="quantumhire-resume">📋 Copy</button>
        </div>
        <div class="quantumhire-tab-content hidden" id="quantumhire-cover-tab">
          <textarea id="quantumhire-cover" readonly placeholder="Tailored cover letter will appear here..."></textarea>
          <button class="quantumhire-copy-btn" data-target="quantumhire-cover">📋 Copy</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  addPanelStyles();
  setupPanelEvents(panel);
  
  setTimeout(() => {
    const jobData = extractJobDetails();
    displayJobPreview(jobData);
  }, 500);
}

// Add panel styles
function addPanelStyles() {
  if (document.getElementById('quantumhire-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'quantumhire-styles';
  style.textContent = `
    #quantumhire-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #fff;
      overflow: hidden;
    }
    
    .quantumhire-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.2);
      cursor: move;
    }
    
    .quantumhire-panel-header span {
      font-weight: 600;
      font-size: 14px;
    }
    
    .quantumhire-panel-minimize {
      background: none;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      opacity: 0.7;
    }
    
    .quantumhire-panel-minimize:hover {
      opacity: 1;
    }
    
    .quantumhire-panel-body {
      padding: 16px;
    }
    
    .quantumhire-job-preview {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      font-size: 13px;
    }
    
    .quantumhire-job-title {
      font-weight: 600;
      color: #4ade80;
      margin-bottom: 4px;
    }
    
    .quantumhire-job-company {
      color: #94a3b8;
      font-size: 12px;
    }
    
    .quantumhire-loading {
      color: #94a3b8;
      text-align: center;
    }
    
    .quantumhire-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .quantumhire-btn {
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .quantumhire-btn.primary {
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
      color: #000;
    }
    
    .quantumhire-btn.primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(74, 222, 128, 0.4);
    }
    
    .quantumhire-btn.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .quantumhire-btn.secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    
    .quantumhire-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .quantumhire-tailored-content {
      margin-top: 12px;
    }
    
    .quantumhire-tailored-content.hidden {
      display: none;
    }
    
    .quantumhire-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
    }
    
    .quantumhire-tab {
      flex: 1;
      padding: 8px;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    
    .quantumhire-tab.active {
      background: rgba(74, 222, 128, 0.2);
      color: #4ade80;
    }
    
    .quantumhire-tab-content {
      position: relative;
    }
    
    .quantumhire-tab-content.hidden {
      display: none;
    }
    
    .quantumhire-tab-content textarea {
      width: 100%;
      height: 120px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 10px;
      color: #fff;
      font-size: 11px;
      resize: none;
    }
    
    .quantumhire-copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      cursor: pointer;
    }
    
    .quantumhire-toast {
      position: fixed;
      bottom: 100px;
      right: 20px;
      padding: 12px 20px;
      background: #1a1a2e;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 2147483648;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease;
    }
    
    .quantumhire-toast.success {
      border-left: 3px solid #4ade80;
    }
    
    .quantumhire-toast.error {
      border-left: 3px solid #ef4444;
    }
    
    .quantumhire-toast-message {
      color: #fff;
      font-size: 13px;
    }
    
    .quantumhire-toast-close {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 16px;
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .quantumhire-filled {
      box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.5) !important;
      transition: box-shadow 0.3s;
    }
    
    .quantumhire-resume-field {
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important;
    }
    
    #quantumhire-panel.minimized .quantumhire-panel-body {
      display: none;
    }
  `;
  document.head.appendChild(style);
}

// Display job preview in panel
function displayJobPreview(jobData) {
  const preview = document.getElementById('quantumhire-job-preview');
  if (!preview) return;
  
  if (jobData.title && jobData.title !== 'Unknown Position') {
    preview.innerHTML = `
      <div class="quantumhire-job-title">${jobData.title}</div>
      <div class="quantumhire-job-company">${jobData.company}${jobData.location ? ` • ${jobData.location}` : ''}</div>
    `;
    preview.dataset.job = JSON.stringify(jobData);
  } else {
    preview.innerHTML = `<p class="quantumhire-loading">No job details found on this page</p>`;
  }
}

// Setup panel event listeners
function setupPanelEvents(panel) {
  // Minimize toggle
  panel.querySelector('.quantumhire-panel-minimize').addEventListener('click', () => {
    panel.classList.toggle('minimized');
    const btn = panel.querySelector('.quantumhire-panel-minimize');
    btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  
  // Auto-fill button
  const fillBtn = panel.querySelector('#quantumhire-fill-btn');
  fillBtn?.addEventListener('click', async () => {
    fillBtn.disabled = true;
    fillBtn.textContent = '⏳ Filling...';
    
    const result = await autofillForm();
    showToast(result.message, result.success ? 'success' : 'error');
    
    fillBtn.disabled = false;
    fillBtn.textContent = '📝 Auto-Fill Application';
  });
  
  // Tailor button
  const tailorBtn = panel.querySelector('#quantumhire-tailor-btn');
  tailorBtn?.addEventListener('click', async () => {
    const preview = document.getElementById('quantumhire-job-preview');
    const jobData = preview?.dataset.job ? JSON.parse(preview.dataset.job) : null;
    
    if (!jobData) {
      showToast('No job detected', 'error');
      return;
    }
    
    tailorBtn.disabled = true;
    tailorBtn.textContent = '⏳ Tailoring...';
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getTailoredApplication',
        job: jobData,
      });
      
      if (response.error) throw new Error(response.error);
      
      const tailoredContent = document.getElementById('quantumhire-tailored-content');
      tailoredContent.classList.remove('hidden');
      
      document.getElementById('quantumhire-resume').value = response.tailoredResume || '';
      document.getElementById('quantumhire-cover').value = response.tailoredCoverLetter || '';
      
      showToast('Application tailored!', 'success');
    } catch (error) {
      showToast(error.message || 'Failed to tailor', 'error');
    } finally {
      tailorBtn.disabled = false;
      tailorBtn.textContent = '✨ Tailor Resume';
    }
  });
  
  // Tab switching
  panel.querySelectorAll('.quantumhire-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.quantumhire-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      document.getElementById('quantumhire-resume-tab').classList.toggle('hidden', tabName !== 'resume');
      document.getElementById('quantumhire-cover-tab').classList.toggle('hidden', tabName !== 'cover');
    });
  });
  
  // Copy buttons
  panel.querySelectorAll('.quantumhire-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const textarea = document.getElementById(btn.dataset.target);
      navigator.clipboard.writeText(textarea.value);
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy', 2000);
    });
  });
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('QuantumHire AI: Received message', message);
  
  if (message.action === 'autofill') {
    autofillForm(message.tailoredData).then(sendResponse);
    return true;
  }
  
  if (message.action === 'extractJob') {
    const jobData = extractJobDetails();
    sendResponse(jobData);
    return true;
  }
  
  if (message.action === 'showPanel') {
    createFloatingPanel();
    sendResponse({ success: true });
    return true;
  }
});

// Initialize: Show panel on external job pages (not LinkedIn/Indeed)
function initialize() {
  const hostname = window.location.hostname;
  
  // Skip LinkedIn and Indeed - we don't inject on job boards
  if (hostname.includes('linkedin.com') || hostname.includes('indeed.com')) {
    console.log('QuantumHire AI: Skipping job board page');
    return;
  }
  
  // On external company ATS pages, show the floating panel
  const ats = detectATS();
  if (ats !== 'generic' || isJobApplicationPage()) {
    console.log('QuantumHire AI: Detected job application page, showing panel');
    setTimeout(createFloatingPanel, 1000);
  }
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
