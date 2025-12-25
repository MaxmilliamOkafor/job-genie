// QuantumHire AI - Content Script
// Handles form detection, auto-filling, job extraction, and queue management on job application pages

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

// ATS-specific selectors for form filling
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
  linkedin: {
    phone: 'input[id*="phone"]',
    email: 'input[id*="email"]',
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
  linkedin: {
    title: '.job-details-jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title',
    company: '.job-details-jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name',
    description: '.jobs-description__content, .jobs-box__html-content',
    location: '.job-details-jobs-unified-top-card__primary-description-container .tvm__text, .jobs-unified-top-card__bullet',
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

// Detect which ATS we're on
function detectATS() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('greenhouse.io') || hostname.includes('boards.greenhouse.io')) return 'greenhouse';
  if (hostname.includes('lever.co') || hostname.includes('jobs.lever.co')) return 'lever';
  if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
  if (hostname.includes('ashbyhq.com')) return 'ashby';
  if (hostname.includes('icims.com')) return 'icims';
  if (hostname.includes('linkedin.com')) return 'linkedin';
  if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (hostname.includes('jobvite.com')) return 'jobvite';
  
  return 'generic';
}

// Extract text from element
function extractText(selector) {
  const element = document.querySelector(selector);
  if (!element) return '';
  
  // For images, get alt text
  if (element.tagName === 'IMG') {
    return element.alt || '';
  }
  
  return element.innerText?.trim() || element.textContent?.trim() || '';
}

// Extract job details from current page
function extractJobDetails() {
  const ats = detectATS();
  const selectors = JOB_EXTRACTION_SELECTORS[ats] || JOB_EXTRACTION_SELECTORS.generic;
  
  console.log(`AutoApply AI: Extracting job from ${ats} ATS`);
  
  // Try multiple selectors for each field
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
    // Common patterns: "Job Title - Company | ATS" or "Job Title at Company"
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
  
  // Extract requirements from description
  const requirements = extractRequirements(description);
  
  const jobData = {
    title: title || 'Unknown Position',
    company: company || extractCompanyFromUrl(),
    description: description.substring(0, 5000), // Limit description length
    location: location,
    requirements: requirements,
    url: window.location.href,
    ats: ats,
  };
  
  console.log('AutoApply AI: Extracted job data', jobData);
  return jobData;
}

// Extract company name from URL
function extractCompanyFromUrl() {
  const hostname = window.location.hostname;
  // Pattern: company.greenhouse.io, jobs.lever.co/company
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

// Capitalize words
function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

// Extract requirements from job description
function extractRequirements(description) {
  const requirements = [];
  
  // Common requirement patterns
  const patterns = [
    /(?:requirements?|qualifications?|what you.ll need|what we.re looking for|must have|required skills?)[\s:]*\n?([\s\S]*?)(?:\n\n|$)/i,
    /(?:•|▪|◦|-|\*)\s*(.+?)(?:\n|$)/g,
  ];
  
  // Look for bullet points
  const bulletMatch = description.match(/(?:•|▪|◦|-|\*)\s*(.+?)(?:\n|$)/g);
  if (bulletMatch) {
    bulletMatch.forEach(item => {
      const cleaned = item.replace(/^[•▪◦\-\*]\s*/, '').trim();
      if (cleaned.length > 10 && cleaned.length < 200) {
        requirements.push(cleaned);
      }
    });
  }
  
  return requirements.slice(0, 15); // Limit to 15 requirements
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

// Fill a single field
function fillField(element, value) {
  if (!element || !value) return false;
  
  element.focus();
  element.value = '';
  element.value = value;
  
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  element.blur();
  
  return true;
}

// Main autofill function
async function autofillForm(tailoredData = null) {
  console.log('AutoApply AI: Starting autofill...');
  
  const data = await chrome.storage.local.get(['userProfile']);
  const profile = data.userProfile;
  
  if (!profile) {
    console.log('AutoApply AI: No profile found');
    return { success: false, message: 'No profile found. Please connect your account first.' };
  }
  
  console.log('AutoApply AI: Profile loaded', profile);
  
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
    // Use tailored cover letter if available
    coverLetter: tailoredData?.tailoredCoverLetter || profile.cover_letter,
  };
  
  for (const [fieldType, value] of Object.entries(fieldValues)) {
    if (!value) continue;
    
    const element = findField(fieldType);
    if (element) {
      const filled = fillField(element, value);
      if (filled) {
        filledCount++;
        element.classList.add('autoapply-filled');
        console.log(`AutoApply AI: Filled ${fieldType}`);
      }
    }
  }
  
  // Highlight file upload fields
  const resumeInputs = document.querySelectorAll('input[type="file"]');
  resumeInputs.forEach(input => {
    input.classList.add('autoapply-resume-field');
  });
  
  console.log(`AutoApply AI: Filled ${filledCount} fields`);
  
  return {
    success: filledCount > 0,
    fieldsCount: filledCount,
    message: filledCount > 0 ? `Successfully filled ${filledCount} fields` : 'No matching form fields found',
  };
}

// Show toast notification
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.autoapply-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `autoapply-toast ${type}`;
  toast.innerHTML = `
    <span class="autoapply-toast-icon">${type === 'success' ? '✅' : '❌'}</span>
    <span class="autoapply-toast-message">${message}</span>
    <button class="autoapply-toast-close">×</button>
  `;
  
  toast.querySelector('.autoapply-toast-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 5000);
}

// Create floating action panel
function createFloatingPanel() {
  if (document.getElementById('autoapply-ai-panel')) return;
  
  const panel = document.createElement('div');
  panel.id = 'autoapply-ai-panel';
  panel.innerHTML = `
    <div class="autoapply-panel-header">
      <span>🚀 AutoApply AI</span>
      <button class="autoapply-panel-minimize">−</button>
    </div>
    <div class="autoapply-panel-body">
      <div class="autoapply-job-preview" id="autoapply-job-preview">
        <p class="autoapply-loading">Analyzing job...</p>
      </div>
      <div class="autoapply-actions">
        <button id="autoapply-tailor-btn" class="autoapply-btn primary">
          ✨ Tailor Resume & Cover Letter
        </button>
        <button id="autoapply-fill-btn" class="autoapply-btn secondary">
          📝 Auto-Fill Form
        </button>
      </div>
      <div id="autoapply-tailored-content" class="autoapply-tailored-content hidden">
        <div class="autoapply-tabs">
          <button class="autoapply-tab active" data-tab="resume">Resume</button>
          <button class="autoapply-tab" data-tab="cover">Cover Letter</button>
        </div>
        <div class="autoapply-tab-content" id="autoapply-resume-tab">
          <textarea id="autoapply-resume" readonly placeholder="Tailored resume will appear here..."></textarea>
          <button class="autoapply-copy-btn" data-target="autoapply-resume">📋 Copy</button>
        </div>
        <div class="autoapply-tab-content hidden" id="autoapply-cover-tab">
          <textarea id="autoapply-cover" readonly placeholder="Tailored cover letter will appear here..."></textarea>
          <button class="autoapply-copy-btn" data-target="autoapply-cover">📋 Copy</button>
        </div>
        <div class="autoapply-match-score hidden" id="autoapply-match-score">
          Match Score: <strong>--</strong>%
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Add styles
  addPanelStyles();
  
  // Setup event listeners
  setupPanelEvents(panel);
  
  // Extract and display job info
  setTimeout(() => {
    const jobData = extractJobDetails();
    displayJobPreview(jobData);
  }, 500);
}

// Add panel styles
function addPanelStyles() {
  if (document.getElementById('autoapply-panel-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'autoapply-panel-styles';
  styles.textContent = `
    #autoapply-ai-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 340px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e4e4e7;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    
    #autoapply-ai-panel.minimized .autoapply-panel-body {
      display: none;
    }
    
    .autoapply-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      cursor: move;
      font-weight: 600;
      font-size: 14px;
    }
    
    .autoapply-panel-minimize {
      background: none;
      border: none;
      color: #a1a1aa;
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
    }
    
    .autoapply-panel-minimize:hover {
      color: #fff;
    }
    
    .autoapply-panel-body {
      padding: 16px;
    }
    
    .autoapply-job-preview {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    
    .autoapply-job-preview h3 {
      margin: 0 0 4px 0;
      font-size: 14px;
      color: #fff;
    }
    
    .autoapply-job-preview p {
      margin: 2px 0;
      color: #a1a1aa;
    }
    
    .autoapply-loading {
      color: #8b5cf6;
      animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .autoapply-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .autoapply-btn {
      width: 100%;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .autoapply-btn.primary {
      background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      color: #fff;
    }
    
    .autoapply-btn.primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
    }
    
    .autoapply-btn.primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .autoapply-btn.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #e4e4e7;
    }
    
    .autoapply-btn.secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    
    .autoapply-tailored-content {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 12px;
    }
    
    .autoapply-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
    }
    
    .autoapply-tab {
      flex: 1;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: none;
      color: #a1a1aa;
      font-size: 12px;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s;
    }
    
    .autoapply-tab.active {
      background: rgba(139, 92, 246, 0.2);
      color: #8b5cf6;
    }
    
    .autoapply-tab-content {
      position: relative;
    }
    
    .autoapply-tab-content textarea {
      width: 100%;
      height: 150px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px;
      color: #e4e4e7;
      font-size: 11px;
      font-family: inherit;
      resize: none;
    }
    
    .autoapply-copy-btn {
      position: absolute;
      bottom: 8px;
      right: 8px;
      padding: 4px 8px;
      background: rgba(139, 92, 246, 0.3);
      border: none;
      border-radius: 4px;
      color: #8b5cf6;
      font-size: 11px;
      cursor: pointer;
    }
    
    .autoapply-copy-btn:hover {
      background: rgba(139, 92, 246, 0.5);
    }
    
    .autoapply-match-score {
      text-align: center;
      padding: 8px;
      background: rgba(34, 197, 94, 0.1);
      border-radius: 6px;
      margin-top: 8px;
      font-size: 12px;
    }
    
    .autoapply-match-score strong {
      color: #22c55e;
      font-size: 16px;
    }
    
    .hidden {
      display: none !important;
    }
    
    .autoapply-filled {
      border-color: #8b5cf6 !important;
      box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2) !important;
    }
    
    .autoapply-resume-field {
      border: 3px dashed #8b5cf6 !important;
      border-radius: 8px !important;
    }
    
    .autoapply-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      padding: 16px 24px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      z-index: 9999999;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease;
    }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    .autoapply-toast.success { border-left: 4px solid #22c55e; }
    .autoapply-toast.error { border-left: 4px solid #ef4444; }
    
    .autoapply-toast-close {
      background: none;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      font-size: 18px;
    }
  `;
  
  document.head.appendChild(styles);
}

// Display job preview
function displayJobPreview(jobData) {
  const preview = document.getElementById('autoapply-job-preview');
  if (!preview) return;
  
  preview.innerHTML = `
    <h3>${jobData.title}</h3>
    <p><strong>${jobData.company}</strong></p>
    ${jobData.location ? `<p>📍 ${jobData.location}</p>` : ''}
    <p style="color: #71717a; font-size: 10px;">ATS: ${jobData.ats}</p>
  `;
  
  // Store job data for later use
  preview.dataset.job = JSON.stringify(jobData);
}

// Setup panel event listeners
function setupPanelEvents(panel) {
  // Minimize button
  panel.querySelector('.autoapply-panel-minimize').addEventListener('click', () => {
    panel.classList.toggle('minimized');
  });
  
  // Tailor button
  panel.querySelector('#autoapply-tailor-btn').addEventListener('click', async () => {
    const btn = panel.querySelector('#autoapply-tailor-btn');
    const jobPreview = document.getElementById('autoapply-job-preview');
    const jobData = JSON.parse(jobPreview.dataset.job || '{}');
    
    if (!jobData.title) {
      showToast('Could not extract job details', 'error');
      return;
    }
    
    btn.disabled = true;
    btn.textContent = '⏳ Tailoring...';
    
    try {
      // Send message to background script
      const result = await chrome.runtime.sendMessage({
        action: 'getTailoredApplication',
        job: jobData,
      });
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      // Display tailored content
      const contentDiv = document.getElementById('autoapply-tailored-content');
      const resumeArea = document.getElementById('autoapply-resume');
      const coverArea = document.getElementById('autoapply-cover');
      const matchScore = document.getElementById('autoapply-match-score');
      
      resumeArea.value = result.tailoredResume || 'No tailored resume available';
      coverArea.value = result.tailoredCoverLetter || 'No tailored cover letter available';
      
      contentDiv.classList.remove('hidden');
      
      if (result.matchScore) {
        matchScore.innerHTML = `Match Score: <strong>${result.matchScore}</strong>%`;
        matchScore.classList.remove('hidden');
      }
      
      // Store tailored data for autofill
      panel.dataset.tailored = JSON.stringify(result);
      
      showToast('Resume and cover letter tailored!', 'success');
      
    } catch (error) {
      console.error('AutoApply AI: Tailor error', error);
      showToast(error.message || 'Failed to tailor application', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Tailor Resume & Cover Letter';
    }
  });
  
  // Auto-fill button
  panel.querySelector('#autoapply-fill-btn').addEventListener('click', async () => {
    const btn = panel.querySelector('#autoapply-fill-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Filling...';
    
    try {
      const tailoredData = panel.dataset.tailored ? JSON.parse(panel.dataset.tailored) : null;
      const result = await autofillForm(tailoredData);
      
      if (result.success) {
        showToast(`Filled ${result.fieldsCount} fields!`, 'success');
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      showToast('Failed to autofill', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📝 Auto-Fill Form';
    }
  });
  
  // Tab switching
  panel.querySelectorAll('.autoapply-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.autoapply-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      panel.querySelector('#autoapply-resume-tab').classList.toggle('hidden', tabName !== 'resume');
      panel.querySelector('#autoapply-cover-tab').classList.toggle('hidden', tabName !== 'cover');
    });
  });
  
  // Copy buttons
  panel.querySelectorAll('.autoapply-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const textarea = document.getElementById(targetId);
      navigator.clipboard.writeText(textarea.value);
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy', 2000);
    });
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autofill') {
    autofillForm().then(sendResponse);
    return true;
  }
  
  if (message.action === 'extractJob') {
    const jobData = extractJobDetails();
    sendResponse(jobData);
    return true;
  }
});

// Initialize
async function init() {
  const data = await chrome.storage.local.get(['userProfile']);
  if (data.userProfile) {
    if (document.readyState === 'complete') {
      createFloatingPanel();
    } else {
      window.addEventListener('load', createFloatingPanel);
    }
  }
}

init();

// Re-check on URL changes (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Remove old panel and create new one
    const oldPanel = document.getElementById('autoapply-ai-panel');
    if (oldPanel) oldPanel.remove();
    setTimeout(init, 1000);
  }
}).observe(document.body, { subtree: true, childList: true });
