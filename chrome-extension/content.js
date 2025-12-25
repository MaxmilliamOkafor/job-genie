// QuantumHire AI - Advanced Content Script
// Multi-page workflow handling, CAPTCHA detection, session persistence

console.log('QuantumHire AI: Advanced content script loaded');

// ============= PLATFORM DETECTION & CONFIGURATION =============

const PLATFORM_CONFIG = {
  workday: {
    detect: () => window.location.hostname.includes('workday.com') || window.location.hostname.includes('myworkdayjobs.com'),
    pages: ['Sign In', 'My Information', 'My Experience', 'Application Questions', 'Voluntary Disclosures', 'Self Identify', 'Review'],
    nextButton: '[data-automation-id="bottom-navigation-next-button"], button[data-automation-id="nextButton"]',
    submitButton: '[data-automation-id="bottom-navigation-submit-button"]',
    progressIndicator: '[data-automation-id="progressBar"], .wd-progressBar',
    selectors: {
      firstName: 'input[data-automation-id="firstName"]',
      lastName: 'input[data-automation-id="lastName"]',
      email: 'input[data-automation-id="email"]',
      phone: 'input[data-automation-id="phone"]',
      address: 'input[data-automation-id="addressLine1"]',
      city: 'input[data-automation-id="city"]',
      state: 'input[data-automation-id="state"]',
      zipCode: 'input[data-automation-id="postalCode"]',
      country: 'select[data-automation-id="country"], input[data-automation-id="country"]',
      resume: 'input[type="file"][data-automation-id*="file"], input[type="file"]',
    }
  },
  greenhouse: {
    detect: () => window.location.hostname.includes('greenhouse.io') || window.location.hostname.includes('boards.greenhouse.io'),
    pages: ['Application', 'Resume', 'Questions', 'Review'],
    nextButton: 'button[type="submit"], input[type="submit"]',
    submitButton: '#submit_app, button:contains("Submit")',
    selectors: {
      firstName: '#first_name',
      lastName: '#last_name',
      email: '#email',
      phone: '#phone',
      linkedin: 'input[name*="linkedin"]',
      resume: 'input[type="file"][name*="resume"]',
      coverLetter: 'textarea[name*="cover_letter"]',
    }
  },
  lever: {
    detect: () => window.location.hostname.includes('lever.co') || window.location.hostname.includes('jobs.lever.co'),
    pages: ['Application', 'Additional Info'],
    nextButton: 'button[type="submit"]',
    submitButton: 'button[type="submit"]',
    selectors: {
      fullName: 'input[name="name"]',
      email: 'input[name="email"]',
      phone: 'input[name="phone"]',
      linkedin: 'input[name="urls[LinkedIn]"]',
      github: 'input[name="urls[GitHub]"]',
      portfolio: 'input[name="urls[Portfolio]"]',
      resume: 'input[type="file"][name="resume"]',
      coverLetter: 'textarea[name="comments"]',
    }
  },
  icims: {
    detect: () => window.location.hostname.includes('icims.com'),
    pages: ['Personal Info', 'Work History', 'Education', 'References', 'EEO', 'Review'],
    nextButton: 'button.next, input[value="Next"]',
    submitButton: 'button.submit, input[value="Submit"]',
    selectors: {
      firstName: '#firstName',
      lastName: '#lastName',
      email: '#email',
      phone: '#phone',
    }
  },
  taleo: {
    detect: () => window.location.hostname.includes('taleo.net'),
    pages: ['Login', 'Personal', 'Experience', 'Education', 'Skills', 'Questions', 'Review'],
    nextButton: 'input[type="submit"][value*="Next"], button:contains("Next")',
    submitButton: 'input[type="submit"][value*="Submit"]',
    selectors: {}
  },
  ashby: {
    detect: () => window.location.hostname.includes('ashbyhq.com'),
    pages: ['Application'],
    nextButton: 'button[type="submit"]',
    submitButton: 'button[type="submit"]',
    selectors: {
      firstName: 'input[name="firstName"]',
      lastName: 'input[name="lastName"]',
      email: 'input[name="email"]',
      phone: 'input[name="phone"]',
      linkedin: 'input[name="linkedInUrl"]',
    }
  },
  smartrecruiters: {
    detect: () => window.location.hostname.includes('smartrecruiters.com'),
    pages: ['Apply', 'Questions', 'Review'],
    nextButton: 'button[type="submit"]',
    submitButton: 'button[type="submit"]',
    selectors: {
      firstName: 'input[name="firstName"]',
      lastName: 'input[name="lastName"]',
      email: 'input[name="email"]',
      phone: 'input[name="phone"]',
    }
  }
};

// ============= CAPTCHA/VERIFICATION DETECTION =============

const CAPTCHA_SELECTORS = {
  recaptcha: [
    '.g-recaptcha',
    'iframe[src*="recaptcha"]',
    '#recaptcha',
    '[data-sitekey]',
    '.grecaptcha-badge'
  ],
  hcaptcha: [
    '.h-captcha',
    'iframe[src*="hcaptcha"]',
    '[data-hcaptcha-sitekey]'
  ],
  cloudflare: [
    '.cf-turnstile',
    'iframe[src*="challenges.cloudflare"]',
    '#cf-wrapper'
  ],
  arkose: [
    'iframe[src*="arkoselabs"]',
    '#fc-iframe-wrap',
    '.funcaptcha'
  ],
  generic: [
    '[class*="captcha"]',
    '[id*="captcha"]',
    'iframe[title*="CAPTCHA"]',
    'iframe[title*="verification"]'
  ]
};

// ============= KNOCKOUT QUESTION ANSWER BANK =============
// Auto-answers for common US job application questions (Ireland-based applicant)

const KNOCKOUT_ANSWER_BANK = {
  // Work Authorization & Visa
  'legal documentation.*identity.*eligibility.*employed.*united states': {
    answer: 'No',
    flag: true,
    reason: 'EU citizen - requires visa sponsorship for US employment'
  },
  'require.*sponsorship.*work.*us|sponsor.*visa|need.*sponsorship': {
    answer: 'Yes',
    flag: true,
    reason: 'H1B or equivalent visa sponsorship required'
  },
  'authorized.*work.*united states|legally.*work.*us|work authorization': {
    answer: 'No',
    flag: true,
    reason: 'Requires visa sponsorship - EU citizen'
  },
  'citizen.*united states|us citizen': {
    answer: 'No',
    flag: true,
    reason: 'EU/Irish citizen'
  },
  
  // Age & Background
  'age 18|over 18|at least 18|18 years|eighteen': {
    answer: 'Yes',
    flag: false
  },
  'background check|criminal background|background investigation': {
    answer: 'Yes',
    flag: false
  },
  'drug screening|drug test|substance test': {
    answer: 'Yes',
    flag: false
  },
  
  // Previous Employment
  'employed by.*company|worked.*before|previous.*employee': {
    answer: 'No',
    flag: false
  },
  'referred by|employee referral|know anyone': {
    answer: 'No',
    flag: false
  },
  
  // Driver's License
  'driver.*license|driving license|valid license': {
    answer: 'Yes - EU License (Irish)',
    flag: false
  },
  
  // Availability & Relocation
  'willing.*relocate|open.*relocation|relocate.*position': {
    answer: 'Yes',
    flag: false
  },
  'available.*start|start date|earliest.*start|when.*start': {
    answer: 'Immediate availability',
    flag: false
  },
  'notice period|current.*notice': {
    answer: '2 weeks',
    flag: false
  },
  
  // Job Functions & Accommodations
  'essential functions|perform.*duties|physical requirements': {
    answer: 'Yes',
    flag: false
  },
  'reasonable accommodation|disability accommodation': {
    answer: 'Not required',
    flag: false
  },
  
  // Legal Agreements
  'terms and conditions|agree.*terms|certification|certify': {
    answer: 'Yes',
    flag: false
  },
  'non-compete|non-disclosure|nda|confidentiality': {
    answer: 'Yes',
    flag: false
  },
  
  // EEO & Demographics (usually optional)
  'veteran status|military service': {
    answer: 'I am not a veteran',
    flag: false
  },
  'disability status|disabled': {
    answer: 'I do not wish to answer',
    flag: false
  },
  'race|ethnicity|ethnic background': {
    answer: 'I do not wish to answer',
    flag: false
  },
  'gender|sex': {
    answer: 'I do not wish to answer',
    flag: false
  }
};

// Helper function to match question against answer bank
function matchKnockoutQuestion(questionText) {
  const lowerQuestion = questionText.toLowerCase();
  
  for (const [pattern, response] of Object.entries(KNOCKOUT_ANSWER_BANK)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(lowerQuestion)) {
      return response;
    }
  }
  return null;
}

// Get salary answer based on job data
function getSalaryAnswer(questionText, jobData, userProfile) {
  const expectedSalary = userProfile?.expected_salary;
  const currentSalary = userProfile?.current_salary;
  
  // Try to extract salary from job description
  const jdSalaryMatch = jobData?.description?.match(/\$[\d,]+\s*[-–]\s*\$[\d,]+/);
  
  if (jdSalaryMatch) {
    return jdSalaryMatch[0];
  } else if (expectedSalary) {
    return expectedSalary;
  } else if (currentSalary) {
    return `Market rate for ${jobData?.title || 'this role'} - Negotiable`;
  }
  
  return `Market rate for ${jobData?.title || 'the role'} - Negotiable`;
}

// ============= STATE MANAGEMENT =============

let applicationState = {
  platform: null,
  currentPage: 0,
  totalPages: 0,
  pageName: '',
  status: 'idle', // idle, in_progress, paused, completed, failed
  pauseReason: null,
  filledFields: [],
  startTime: null,
  jobData: null,
  tailoredData: null,
  sessionId: null
};

// ============= UTILITY FUNCTIONS =============

function detectPlatform() {
  for (const [name, config] of Object.entries(PLATFORM_CONFIG)) {
    if (config.detect()) {
      return { name, config };
    }
  }
  return { name: 'generic', config: null };
}

function detectCaptcha() {
  const detectedCaptchas = [];
  
  for (const [type, selectors] of Object.entries(CAPTCHA_SELECTORS)) {
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Check if visible
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            detectedCaptchas.push({
              type,
              selector,
              element: el,
              visible: true
            });
          }
        }
      }
    }
  }
  
  return detectedCaptchas;
}

function detectLoginPage() {
  const hasPasswordField = document.querySelector('input[type="password"]');
  const hasEmailField = document.querySelector('input[type="email"], input[name*="email"], input[id*="email"], input[name*="username"]');
  const hasResumeField = document.querySelector('input[type="file"]');
  const loginKeywords = ['sign in', 'log in', 'login', 'sign-in'].some(kw => 
    document.body.innerText.toLowerCase().includes(kw)
  );
  
  return (hasPasswordField && hasEmailField && !hasResumeField) || 
         (hasPasswordField && loginKeywords);
}

function detectCurrentPage(platformConfig) {
  if (!platformConfig) return { current: 1, total: 1, name: 'Application' };
  
  // Try to find progress indicator
  const progressEl = document.querySelector(platformConfig.progressIndicator || '.progress');
  if (progressEl) {
    const text = progressEl.innerText || progressEl.getAttribute('aria-valuenow');
    const match = text?.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
    if (match) {
      return { current: parseInt(match[1]), total: parseInt(match[2]), name: '' };
    }
  }
  
  // Try to match page by content
  const pageContent = document.body.innerText.toLowerCase();
  const pages = platformConfig.pages || [];
  
  for (let i = 0; i < pages.length; i++) {
    if (pageContent.includes(pages[i].toLowerCase())) {
      return { current: i + 1, total: pages.length, name: pages[i] };
    }
  }
  
  return { current: 1, total: pages.length || 1, name: pages[0] || 'Application' };
}

function extractText(selector) {
  const element = document.querySelector(selector);
  if (!element) return '';
  if (element.tagName === 'IMG') return element.alt || '';
  return element.innerText?.trim() || element.textContent?.trim() || '';
}

function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

// ============= JOB EXTRACTION =============

const JOB_EXTRACTION_SELECTORS = {
  workday: {
    title: '[data-automation-id="jobPostingHeader"] h1, .job-title, h1',
    company: '[data-automation-id="companyName"], .company-name',
    description: '[data-automation-id="jobPostingDescription"], .job-description, main',
    location: '[data-automation-id="locations"], .location',
  },
  greenhouse: {
    title: '.app-title, h1.heading',
    company: '.company-name, .logo-container img[alt]',
    description: '#content, .job-description',
    location: '.location, .job-location',
  },
  lever: {
    title: '.posting-headline h2, h1.posting-title',
    company: '.main-header-logo img[alt]',
    description: '.posting-description',
    location: '.location',
  },
  generic: {
    title: 'h1, [class*="job-title"]',
    company: '[class*="company"], [class*="employer"]',
    description: '[class*="job-description"], [class*="description"], article, main',
    location: '[class*="location"]',
  },
};

function extractJobDetails() {
  const platform = detectPlatform();
  const selectors = JOB_EXTRACTION_SELECTORS[platform.name] || JOB_EXTRACTION_SELECTORS.generic;
  
  let title = '', company = '', description = '', location = '';
  
  for (const sel of (selectors.title || '').split(', ')) {
    title = extractText(sel);
    if (title) break;
  }
  
  for (const sel of (selectors.company || '').split(', ')) {
    company = extractText(sel);
    if (company) break;
  }
  
  for (const sel of (selectors.description || '').split(', ')) {
    description = extractText(sel);
    if (description && description.length > 100) break;
  }
  
  for (const sel of (selectors.location || '').split(', ')) {
    location = extractText(sel);
    if (location) break;
  }
  
  // Fallbacks from page title
  if (!title) {
    const match = document.title.match(/^(.+?)(?:\s*[-|–]\s*|\s+at\s+)/);
    if (match) title = match[1].trim();
  }
  
  if (!company) {
    const hostname = window.location.hostname;
    const match = hostname.match(/^([^.]+)\.(workday|greenhouse|lever)/);
    if (match) company = capitalizeWords(match[1].replace(/-/g, ' '));
  }
  
  const requirements = extractRequirements(description);
  
  return {
    title: title || 'Unknown Position',
    company: company || 'Unknown Company',
    description: description.substring(0, 5000),
    location: location,
    requirements: requirements,
    url: window.location.href,
    platform: platform.name,
  };
}

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

// ============= FIELD MAPPING & FILLING =============

const FIELD_MAPPINGS = {
  firstName: ['first_name', 'firstname', 'first-name', 'fname', 'given_name'],
  lastName: ['last_name', 'lastname', 'last-name', 'lname', 'surname', 'family_name'],
  fullName: ['full_name', 'fullname', 'name', 'your_name', 'applicant_name'],
  email: ['email', 'e-mail', 'email_address', 'emailaddress', 'work_email'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone_number'],
  address: ['address', 'street', 'street_address', 'address_line_1'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region'],
  zipCode: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code'],
  country: ['country', 'nation'],
  linkedin: ['linkedin', 'linkedin_url', 'linkedin_profile'],
  github: ['github', 'github_url', 'github_profile'],
  portfolio: ['portfolio', 'website', 'personal_website'],
  currentCompany: ['current_company', 'company', 'employer'],
  currentTitle: ['current_title', 'job_title', 'title', 'position'],
  yearsExperience: ['years_experience', 'experience', 'total_experience'],
  salary: ['salary', 'salary_expectation', 'expected_salary', 'compensation'],
  coverLetter: ['cover_letter', 'coverletter', 'cover', 'letter', 'message'],
};

function findField(fieldType, platformConfig = null) {
  // Try platform-specific selector first
  if (platformConfig?.selectors?.[fieldType]) {
    const element = document.querySelector(platformConfig.selectors[fieldType]);
    if (element && element.offsetParent !== null) return element;
  }
  
  // Try generic mappings
  const mappings = FIELD_MAPPINGS[fieldType] || [fieldType];
  
  for (const mapping of mappings) {
    // ID-based lookup
    let element = document.getElementById(mapping);
    if (element && element.offsetParent !== null) return element;
    
    // Name-based lookup (exact)
    element = document.querySelector(`input[name="${mapping}"], textarea[name="${mapping}"], select[name="${mapping}"]`);
    if (element && element.offsetParent !== null) return element;
    
    // Name-based lookup (partial)
    element = document.querySelector(`input[name*="${mapping}"], textarea[name*="${mapping}"]`);
    if (element && element.offsetParent !== null) return element;
    
    // ID-based lookup (partial)
    element = document.querySelector(`input[id*="${mapping}"], textarea[id*="${mapping}"]`);
    if (element && element.offsetParent !== null) return element;
    
    // Placeholder-based lookup
    element = document.querySelector(`input[placeholder*="${mapping}" i], textarea[placeholder*="${mapping}" i]`);
    if (element && element.offsetParent !== null) return element;
    
    // Aria-label-based lookup
    element = document.querySelector(`input[aria-label*="${mapping}" i], textarea[aria-label*="${mapping}" i]`);
    if (element && element.offsetParent !== null) return element;
    
    // Data-automation-id lookup (for Workday)
    element = document.querySelector(`input[data-automation-id*="${mapping}"], textarea[data-automation-id*="${mapping}"]`);
    if (element && element.offsetParent !== null) return element;
    
    // Label-based lookup (find label, then its associated input)
    const labels = document.querySelectorAll(`label`);
    for (const label of labels) {
      if (label.innerText?.toLowerCase().includes(mapping.toLowerCase())) {
        const forId = label.getAttribute('for');
        if (forId) {
          element = document.getElementById(forId);
          if (element && element.offsetParent !== null) return element;
        }
        // Check for input inside or next to label
        element = label.querySelector('input, textarea, select');
        if (element && element.offsetParent !== null) return element;
        element = label.parentElement?.querySelector('input, textarea, select');
        if (element && element.offsetParent !== null) return element;
      }
    }
  }
  
  return null;
}

function fillField(element, value) {
  if (!element || !value) return false;
  
  try {
    // Skip if already has value and not empty
    if (element.value && element.value.trim() !== '') {
      console.log('QuantumHire AI: Field already filled, skipping');
      return false;
    }
    
    // Handle different input types
    if (element.tagName === 'SELECT') {
      const options = Array.from(element.options);
      const valueStr = String(value).toLowerCase();
      
      // Try exact match first
      let match = options.find(o => 
        o.text.toLowerCase() === valueStr || o.value.toLowerCase() === valueStr
      );
      
      // Then partial match
      if (!match) {
        match = options.find(o => 
          o.text.toLowerCase().includes(valueStr) || valueStr.includes(o.text.toLowerCase()) ||
          o.value.toLowerCase().includes(valueStr)
        );
      }
      
      if (match) {
        element.value = match.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }
    
    // For Workday and React apps - use native input setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    
    element.focus();
    
    // Clear existing value
    if (element.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
      nativeTextareaValueSetter.call(element, String(value));
    } else if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, String(value));
    } else {
      element.value = String(value);
    }
    
    // Dispatch all necessary events for React/Angular/Vue apps
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    
    // For Workday specifically
    if (element.getAttribute('data-automation-id')) {
      element.dispatchEvent(new Event('focusout', { bubbles: true }));
    }
    
    return true;
  } catch (e) {
    console.error('QuantumHire AI: Fill field error', e);
    return false;
  }
}

function fillLoginCredentials(credentials) {
  if (!credentials?.email || !credentials?.password) return 0;
  
  let filled = 0;
  
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name*="username"]',
    'input[id*="username"]',
    'input[data-automation-id="email"]',
    'input[data-automation-id="userName"]',
  ];
  
  for (const selector of emailSelectors) {
    const field = document.querySelector(selector);
    if (field && !field.value) {
      if (fillField(field, credentials.email)) {
        field.classList.add('quantumhire-filled');
        filled++;
        break;
      }
    }
  }
  
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[data-automation-id="password"]',
  ];
  
  for (const selector of passwordSelectors) {
    const field = document.querySelector(selector);
    if (field && !field.value) {
      if (fillField(field, credentials.password)) {
        field.classList.add('quantumhire-filled');
        filled++;
        break;
      }
    }
  }
  
  return filled;
}

// ============= QUESTION DETECTION & AI ANSWERING =============

function detectApplicationQuestions() {
  const questions = [];
  const processed = new Set();
  
  // Find all form groups/questions
  const formGroups = document.querySelectorAll(
    'label, [class*="form-group"], [class*="question"], [data-automation-id*="question"], .field-group'
  );
  
  formGroups.forEach((group, index) => {
    const label = group.tagName === 'LABEL' ? group : group.querySelector('label, [class*="label"]');
    const labelText = label?.innerText?.trim() || group?.innerText?.split('\n')[0]?.trim();
    
    if (!labelText || labelText.length < 3 || labelText.length > 300) return;
    
    // Skip basic fields we handle separately
    const basicFields = ['first name', 'last name', 'email', 'phone', 'address', 'city', 'state', 'zip', 'postal', 'country'];
    if (basicFields.some(f => labelText.toLowerCase().includes(f))) return;
    
    // Find associated input
    let input = group.querySelector('input:not([type="hidden"]):not([type="file"]), textarea, select');
    if (!input && label?.htmlFor) {
      input = document.getElementById(label.htmlFor);
    }
    
    if (!input || processed.has(input)) return;
    processed.add(input);
    
    const question = {
      id: input.id || input.name || `q_${index}`,
      label: labelText,
      type: input.type || input.tagName.toLowerCase(),
      element: input,
      required: input.required || group.querySelector('[class*="required"], .required') !== null,
    };
    
    if (input.tagName === 'SELECT') {
      question.options = Array.from(input.options).map(o => o.text).filter(t => t && t !== '');
    }
    
    questions.push(question);
  });
  
  // Also look for radio button groups
  const radioGroups = document.querySelectorAll('fieldset, [role="radiogroup"], [class*="radio-group"]');
  radioGroups.forEach((group, index) => {
    const legend = group.querySelector('legend, [class*="legend"], [class*="label"]');
    const labelText = legend?.innerText?.trim();
    if (!labelText) return;
    
    const radios = group.querySelectorAll('input[type="radio"]');
    if (radios.length === 0) return;
    
    const options = Array.from(radios).map(r => {
      const radioLabel = document.querySelector(`label[for="${r.id}"]`);
      return radioLabel?.innerText?.trim() || r.value;
    });
    
    questions.push({
      id: radios[0].name || `radio_${index}`,
      label: labelText,
      type: 'radio',
      elements: Array.from(radios),
      options: options,
      required: radios[0].required,
    });
  });
  
  return questions;
}

async function getAIAnswers(questions, jobData) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'answerQuestions',
      questions: questions.map(q => ({
        id: q.id,
        label: q.label,
        type: q.type,
        options: q.options,
        required: q.required,
      })),
      jobTitle: jobData.title,
      company: jobData.company,
    });
    
    return response?.answers || [];
  } catch (error) {
    console.error('QuantumHire AI: AI answer error', error);
    return [];
  }
}

function fillQuestionsWithAnswers(questions, answers, jobData, userProfile) {
  const answerMap = new Map(answers.map(a => [a.id, a]));
  let filledCount = 0;
  const flaggedQuestions = [];
  
  for (const q of questions) {
    // First check knockout answer bank
    const knockoutMatch = matchKnockoutQuestion(q.label);
    let answer = null;
    let shouldFlag = false;
    
    if (knockoutMatch) {
      answer = knockoutMatch.answer;
      shouldFlag = knockoutMatch.flag;
      if (shouldFlag) {
        flaggedQuestions.push({
          question: q.label,
          answer: answer,
          reason: knockoutMatch.reason
        });
      }
      console.log(`QuantumHire AI: Knockout match for "${q.label}" → "${answer}"${shouldFlag ? ' [FLAGGED]' : ''}`);
    } else {
      // Check for salary questions
      if (q.label.toLowerCase().match(/salary|pay range|compensation|expected.*pay/)) {
        answer = getSalaryAnswer(q.label, jobData, userProfile);
        console.log(`QuantumHire AI: Salary answer for "${q.label}" → "${answer}"`);
      } else {
        // Use AI-generated answer
        const answerObj = answerMap.get(q.id);
        if (answerObj?.answer) {
          answer = answerObj.answer;
        }
      }
    }
    
    if (!answer) continue;
    
    if (q.type === 'radio' && q.elements) {
      // Handle radio buttons
      for (const radio of q.elements) {
        const radioLabel = document.querySelector(`label[for="${radio.id}"]`);
        const radioText = (radioLabel?.innerText?.trim() || radio.value).toLowerCase();
        
        if (radioText.includes(String(answer).toLowerCase()) || 
            String(answer).toLowerCase().includes(radioText)) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
          break;
        }
      }
    } else if (q.element) {
      if (q.element.tagName === 'SELECT') {
        const options = Array.from(q.element.options);
        const match = options.find(o => 
          o.text.toLowerCase().includes(String(answer).toLowerCase()) ||
          String(answer).toLowerCase().includes(o.text.toLowerCase())
        );
        if (match) {
          q.element.value = match.value;
          q.element.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      } else {
        if (fillField(q.element, String(answer))) {
          q.element.classList.add('quantumhire-filled');
          filledCount++;
        }
      }
    }
  }
  
  // Log flagged questions for manual review
  if (flaggedQuestions.length > 0) {
    console.log('QuantumHire AI: ⚠️ Flagged questions requiring manual review:', flaggedQuestions);
    showToast(`⚠️ ${flaggedQuestions.length} question(s) flagged for review (visa/sponsorship)`, 'warning');
  }
  
  return { filledCount, flaggedQuestions };
}

// ============= PDF GENERATION & FILE UPLOAD =============

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';

async function generatePDF(type, profileData, jobData, tailoredData) {
  console.log(`QuantumHire AI: Generating ${type} PDF...`);
  
  try {
    const requestBody = {
      type: type, // 'resume' or 'cover_letter'
      personalInfo: {
        name: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim(),
        email: profileData.email,
        phone: profileData.phone,
        location: jobData?.location || profileData.city || '',
        linkedin: profileData.linkedin,
        github: profileData.github,
        portfolio: profileData.portfolio,
      },
      fileName: `${profileData.first_name || 'User'}${profileData.last_name || ''}_${type === 'resume' ? 'CV' : 'CoverLetter'}_${(jobData?.title || 'Job').replace(/\s+/g, '')}.pdf`
    };
    
    if (type === 'resume') {
      // Parse tailored resume to extract sections
      const resumeText = tailoredData?.tailoredResume || '';
      requestBody.summary = extractSection(resumeText, 'summary', 'professional summary');
      requestBody.experience = parseExperience(resumeText, profileData.work_experience);
      requestBody.education = parseEducation(profileData.education);
      requestBody.skills = parseSkills(resumeText, profileData.skills);
      requestBody.certifications = profileData.certifications || [];
      requestBody.achievements = parseAchievements(profileData.achievements);
    } else {
      // Cover letter
      const coverText = tailoredData?.tailoredCoverLetter || '';
      requestBody.coverLetter = {
        recipientCompany: jobData?.company || 'Company',
        jobTitle: jobData?.title || 'Position',
        jobId: jobData?.jobId || '',
        paragraphs: coverText.split('\n\n').filter(p => p.trim().length > 20)
      };
    }
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'PDF generation failed');
    }
    
    const result = await response.json();
    console.log(`QuantumHire AI: PDF generated successfully: ${result.fileName}`);
    
    return {
      success: true,
      pdf: result.pdf, // base64
      fileName: result.fileName,
      size: result.size
    };
  } catch (error) {
    console.error('QuantumHire AI: PDF generation error', error);
    return { success: false, error: error.message };
  }
}

function extractSection(text, ...keywords) {
  const lines = text.split('\n');
  let capture = false;
  let section = [];
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      capture = true;
      continue;
    }
    if (capture) {
      if (line.match(/^[A-Z][A-Z\s]+$/) || line.match(/^#{1,3}\s/)) {
        break; // Next section
      }
      section.push(line.trim());
    }
  }
  
  return section.filter(l => l).join(' ').substring(0, 500);
}

function parseExperience(resumeText, fallbackExperience) {
  // Try to parse from tailored text or use fallback
  if (fallbackExperience && Array.isArray(fallbackExperience)) {
    return fallbackExperience.map(exp => ({
      company: exp.company || '',
      title: exp.title || '',
      dates: exp.dates || `${exp.start_date || ''} – ${exp.end_date || 'Present'}`,
      bullets: Array.isArray(exp.description) ? exp.description : 
               (exp.description || '').split('\n').filter(b => b.trim())
    }));
  }
  return [];
}

function parseEducation(education) {
  if (!education || !Array.isArray(education)) return [];
  return education.map(edu => ({
    degree: edu.degree || '',
    school: edu.school || edu.institution || '',
    dates: edu.dates || `${edu.start_date || ''} – ${edu.end_date || ''}`,
    gpa: edu.gpa || ''
  }));
}

function parseSkills(resumeText, fallbackSkills) {
  if (fallbackSkills && Array.isArray(fallbackSkills)) {
    const primary = fallbackSkills
      .filter(s => s.proficiency === 'expert' || s.proficiency === 'advanced')
      .map(s => s.name);
    const secondary = fallbackSkills
      .filter(s => s.proficiency !== 'expert' && s.proficiency !== 'advanced')
      .map(s => s.name);
    return { primary, secondary };
  }
  return { primary: [], secondary: [] };
}

function parseAchievements(achievements) {
  if (!achievements || !Array.isArray(achievements)) return [];
  return achievements.map(a => ({
    title: a.title || '',
    date: a.date || '',
    description: a.description || ''
  }));
}

// PDF upload with retry logic
async function uploadPDFFile(fileInput, pdfBase64, fileName, maxRetries = 3) {
  if (!fileInput || !pdfBase64) return { success: false, error: 'Missing input or PDF data' };
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`QuantumHire AI: PDF upload attempt ${attempt}/${maxRetries} for ${fileName}`);
      
      // Convert base64 to Blob
      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      
      // Create DataTransfer and set files
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(pdfFile);
      fileInput.files = dataTransfer.files;
      
      // Dispatch events
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Verify upload
      if (fileInput.files.length > 0 && fileInput.files[0].name === fileName) {
        console.log(`QuantumHire AI: ✅ PDF uploaded successfully: ${fileName} (${pdfFile.size} bytes)`);
        showToast(`✅ PDF uploaded: ${fileName}`, 'success');
        return { success: true, fileName, size: pdfFile.size };
      } else {
        throw new Error('File not set correctly');
      }
    } catch (error) {
      lastError = error;
      console.error(`QuantumHire AI: PDF upload attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        showToast(`Retrying PDF upload... (${attempt + 1}/${maxRetries})`, 'info');
        await new Promise(r => setTimeout(r, 500 * attempt)); // Exponential backoff
      }
    }
  }
  
  console.error('QuantumHire AI: PDF upload failed after all retries');
  showToast(`❌ PDF upload failed: ${fileName}`, 'error');
  return { success: false, error: lastError?.message || 'Upload failed' };
}

// Legacy text upload (fallback)
async function uploadFile(fileInput, content, fileName) {
  if (!fileInput || !content) return false;
  
  try {
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], fileName.replace('.pdf', '.txt'), { type: 'text/plain' });
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('QuantumHire AI: Uploaded file:', fileName);
    return true;
  } catch (error) {
    console.error('QuantumHire AI: File upload error', error);
    return false;
  }
}

function findLabelForInput(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.innerText;
  }
  
  let parent = input.parentElement;
  for (let i = 0; i < 5 && parent; i++) {
    const label = parent.querySelector('label');
    if (label) return label.innerText;
    parent = parent.parentElement;
  }
  
  return '';
}

// ============= MAIN AUTOFILL FUNCTION =============

async function autofillForm(tailoredData = null, atsCredentials = null, options = {}) {
  console.log('QuantumHire AI: Starting advanced autofill...', options);
  
  const platform = detectPlatform();
  const platformConfig = platform.config;
  
  // Update state
  applicationState.platform = platform.name;
  applicationState.status = 'in_progress';
  applicationState.startTime = applicationState.startTime || Date.now();
  
  // Store tailored data in state for resume after CAPTCHA
  if (tailoredData) {
    applicationState.tailoredData = tailoredData;
  }
  
  // Check for CAPTCHA - only if not explicitly skipping
  if (!options.skipCaptchaCheck) {
    const captchas = detectCaptcha();
    if (captchas.length > 0) {
      console.log('QuantumHire AI: CAPTCHA detected!', captchas);
      applicationState.status = 'paused';
      applicationState.pauseReason = 'captcha';
      
      // Show persistent CAPTCHA alert
      showCaptchaAlert();
      
      return {
        success: false,
        status: 'paused',
        pauseReason: 'captcha',
        captchaType: captchas[0].type,
        message: '⚠️ Human Verification Required\n\nComplete the CAPTCHA above, then click Continue'
      };
    }
  }
  
  // Check for login page
  const isLogin = detectLoginPage();
  if (isLogin && atsCredentials) {
    console.log('QuantumHire AI: Login page detected');
    const loginFilled = fillLoginCredentials(atsCredentials);
    
    if (loginFilled > 0) {
      // Try to auto-click sign in button
      const signInSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        '[data-automation-id="click_filter"]',
        'button[data-automation-id="signInSubmitButton"]',
        'button.btn-primary[type="submit"]'
      ];
      
      for (const selector of signInSelectors) {
        const signInBtn = document.querySelector(selector);
        if (signInBtn && signInBtn.offsetParent !== null) {
          console.log('QuantumHire AI: Found sign in button, clicking...');
          setTimeout(() => signInBtn.click(), 500);
          break;
        }
      }
      
      return {
        success: true,
        status: 'login_filled',
        fields: loginFilled,
        message: `Filled ${loginFilled} login fields. Signing in...`
      };
    }
  }
  
  // Get user profile
  const data = await chrome.storage.local.get(['userProfile']);
  const profile = data.userProfile;
  
  if (!profile) {
    return { success: false, message: 'No profile found. Please connect your account.' };
  }
  
  // Detect current page
  const pageInfo = detectCurrentPage(platformConfig);
  applicationState.currentPage = pageInfo.current;
  applicationState.totalPages = pageInfo.total;
  applicationState.pageName = pageInfo.name;
  
  const results = { fields: 0, questions: 0, files: 0 };
  
  // Step 1: Fill basic fields
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
    
    const element = findField(fieldType, platformConfig);
    if (element && !element.value) {
      if (fillField(element, value)) {
        results.fields++;
        element.classList.add('quantumhire-filled');
        applicationState.filledFields.push(fieldType);
      }
    }
  }
  
  // Step 2: Answer screening questions with AI + Knockout Bank
  if (!options.skipQuestions) {
    const questions = detectApplicationQuestions();
    
    if (questions.length > 0) {
      console.log(`QuantumHire AI: Found ${questions.length} screening questions`);
      
      const jobData = tailoredData?.jobData || extractJobDetails();
      const answers = await getAIAnswers(questions, jobData);
      
      const questionResult = fillQuestionsWithAnswers(questions, answers, jobData, profile);
      results.questions = questionResult.filledCount;
      results.flaggedQuestions = questionResult.flaggedQuestions;
    }
  }
  
  // Step 3: MANDATORY PDF Generation and Upload
  if (tailoredData && !options.skipFileUpload) {
    const jobData = tailoredData.jobData || extractJobDetails();
    
    // ALWAYS generate PDFs when tailored data is available
    console.log('QuantumHire AI: 📄 Generating PDFs for mandatory upload...');
    
    let resumePdfGenerated = false;
    let coverPdfGenerated = false;
    
    // Pre-generate PDFs
    let resumePdfResult = null;
    let coverPdfResult = null;
    
    if (tailoredData.tailoredResume) {
      resumePdfResult = await generatePDF('resume', profile, jobData, tailoredData);
      resumePdfGenerated = resumePdfResult?.success;
      if (resumePdfGenerated) {
        console.log(`QuantumHire AI: ✅ Resume PDF generated: ${resumePdfResult.fileName}`);
      }
    }
    
    if (tailoredData.tailoredCoverLetter) {
      coverPdfResult = await generatePDF('cover_letter', profile, jobData, tailoredData);
      coverPdfGenerated = coverPdfResult?.success;
      if (coverPdfGenerated) {
        console.log(`QuantumHire AI: ✅ Cover Letter PDF generated: ${coverPdfResult.fileName}`);
      }
    }
    
    // Find ALL file inputs on the page with expanded detection
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    // Also look for custom upload components (Workday, Greenhouse, etc.)
    const uploadButtons = document.querySelectorAll([
      '[data-automation-id*="file"]',
      '[data-automation-id*="upload"]',
      '[data-automation-id*="resume"]',
      '[data-automation-id*="attachment"]',
      'button[class*="upload"]',
      'div[class*="dropzone"]',
      'label[class*="upload"]',
      '.file-upload',
      '.resume-upload',
      '.attachment-upload'
    ].join(', '));
    
    console.log(`QuantumHire AI: Found ${fileInputs.length} file inputs, ${uploadButtons.length} upload components`);
    
    // Track what we've uploaded
    let resumeUploaded = false;
    let coverUploaded = false;
    
    // Upload to file inputs
    for (const input of fileInputs) {
      if (input.files?.length > 0) {
        console.log('QuantumHire AI: Input already has file, skipping');
        continue;
      }
      
      const label = findLabelForInput(input).toLowerCase();
      const inputName = (input.name || input.id || '').toLowerCase();
      const inputAccept = (input.accept || '').toLowerCase();
      const parentText = (input.closest('div, label, section')?.innerText || '').toLowerCase().substring(0, 200);
      
      console.log(`QuantumHire AI: Checking file input - name: "${inputName}", label: "${label.substring(0, 50)}"`);
      
      // Resume upload detection - expanded patterns
      const isResumeField = !resumeUploaded && (
        inputName.includes('resume') || 
        inputName.includes('cv') ||
        inputName.includes('file') ||
        label.includes('resume') || 
        label.includes('cv') ||
        label.includes('attach') ||
        label.includes('upload your') ||
        parentText.includes('resume') ||
        parentText.includes('cv') ||
        parentText.includes('attach your') ||
        inputAccept.includes('pdf') ||
        inputAccept.includes('doc')
      );
      
      if (isResumeField) {
        if (resumePdfResult?.success && resumePdfResult.pdf) {
          console.log('QuantumHire AI: Uploading resume PDF...');
          const uploadResult = await uploadPDFFile(input, resumePdfResult.pdf, resumePdfResult.fileName);
          if (uploadResult.success) {
            results.files++;
            results.resumePdf = resumePdfResult;
            results.resumeUploaded = true;
            resumeUploaded = true;
          }
        } else if (tailoredData.tailoredResume) {
          // Fallback to text file
          const fileName = `${profile.first_name || 'User'}${profile.last_name || ''}_CV_${(jobData?.title || 'Job').replace(/\s+/g, '')}.txt`;
          if (await uploadFile(input, tailoredData.tailoredResume, fileName)) {
            results.files++;
            resumeUploaded = true;
            showToast('⚠️ Uploaded as text file (PDF generation failed)', 'warning');
          }
        }
        continue;
      }
      
      // Cover letter upload detection - expanded patterns  
      const isCoverField = !coverUploaded && (
        inputName.includes('cover') ||
        label.includes('cover letter') ||
        label.includes('cover_letter') ||
        label.includes('coverletter') ||
        parentText.includes('cover letter')
      );
      
      if (isCoverField) {
        if (coverPdfResult?.success && coverPdfResult.pdf) {
          console.log('QuantumHire AI: Uploading cover letter PDF...');
          const uploadResult = await uploadPDFFile(input, coverPdfResult.pdf, coverPdfResult.fileName);
          if (uploadResult.success) {
            results.files++;
            results.coverPdf = coverPdfResult;
            results.coverUploaded = true;
            coverUploaded = true;
          }
        } else if (tailoredData.tailoredCoverLetter) {
          const fileName = `${profile.first_name || 'User'}${profile.last_name || ''}_CoverLetter_${(jobData?.title || 'Job').replace(/\s+/g, '')}.txt`;
          if (await uploadFile(input, tailoredData.tailoredCoverLetter, fileName)) {
            results.files++;
            coverUploaded = true;
            showToast('⚠️ Uploaded as text file (PDF generation failed)', 'warning');
          }
        }
      }
    }
    
    // If we have a resume but couldn't find a specific resume input, try the first empty file input
    if (!resumeUploaded && resumePdfResult?.success && fileInputs.length > 0) {
      for (const input of fileInputs) {
        if (!input.files?.length) {
          console.log('QuantumHire AI: Uploading resume to first available file input...');
          const uploadResult = await uploadPDFFile(input, resumePdfResult.pdf, resumePdfResult.fileName);
          if (uploadResult.success) {
            results.files++;
            results.resumePdf = resumePdfResult;
            results.resumeUploaded = true;
            break;
          }
        }
      }
    }
    
    // Store generated PDFs for preview even if no file input found
    if (resumePdfResult?.success) {
      results.resumePdf = resumePdfResult;
    }
    if (coverPdfResult?.success) {
      results.coverPdf = coverPdfResult;
    }
  }
  
  // Highlight unfilled file inputs
  document.querySelectorAll('input[type="file"]').forEach(input => {
    if (!input.files?.length) {
      input.classList.add('quantumhire-resume-field');
    }
  });
  
  const totalFilled = results.fields + results.questions + results.files;
  
  applicationState.status = 'in_progress';
  
  // Save session state
  await saveSessionState();
  
  // Build detailed message
  let message = `Page ${pageInfo.current}/${pageInfo.total}: `;
  const parts = [];
  
  if (results.fields > 0) parts.push(`${results.fields} fields`);
  if (results.questions > 0) parts.push(`${results.questions}/${results.questions} questions auto-answered`);
  if (results.files > 0) {
    const uploadParts = [];
    if (results.resumeUploaded) uploadParts.push('CV');
    if (results.coverUploaded) uploadParts.push('Cover Letter');
    parts.push(`${uploadParts.join(' + ')} ✅ UPLOADED`);
  }
  
  message += parts.join(', ');
  
  // Add flagged questions warning
  if (results.flaggedQuestions?.length > 0) {
    message += ` | ⚠️ ${results.flaggedQuestions.length} flagged for review`;
  }
  
  return {
    success: totalFilled > 0,
    status: 'in_progress',
    ...results,
    page: { current: pageInfo.current, total: pageInfo.total, name: pageInfo.name },
    platform: platform.name,
    message
  };
}

// ============= SESSION PERSISTENCE =============

async function saveSessionState() {
  const sessionData = {
    ...applicationState,
    url: window.location.href,
    savedAt: Date.now()
  };
  
  await chrome.storage.local.set({ 
    [`session_${btoa(window.location.origin)}`]: sessionData 
  });
}

async function loadSessionState() {
  const key = `session_${btoa(window.location.origin)}`;
  const data = await chrome.storage.local.get([key]);
  return data[key] || null;
}

async function clearSessionState() {
  const key = `session_${btoa(window.location.origin)}`;
  await chrome.storage.local.remove([key]);
  applicationState = {
    platform: null,
    currentPage: 0,
    totalPages: 0,
    pageName: '',
    status: 'idle',
    pauseReason: null,
    filledFields: [],
    startTime: null,
    jobData: null,
    tailoredData: null,
    sessionId: null
  };
}

// ============= TOAST NOTIFICATIONS =============

function showToast(message, type = 'success') {
  const existing = document.querySelector('.quantumhire-toast');
  if (existing) existing.remove();
  
  const iconMap = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  
  const toast = document.createElement('div');
  toast.className = `quantumhire-toast ${type}`;
  toast.innerHTML = `
    <span class="quantumhire-toast-icon">${iconMap[type] || 'ℹ️'}</span>
    <span class="quantumhire-toast-message">${message}</span>
    <button class="quantumhire-toast-close">×</button>
  `;
  
  toast.querySelector('.quantumhire-toast-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  
  if (type !== 'warning') {
    setTimeout(() => toast.remove(), 5000);
  }
}

// ============= CAPTCHA ALERT =============

function showCaptchaAlert() {
  const existingAlert = document.getElementById('quantumhire-captcha-overlay');
  if (existingAlert) existingAlert.remove();
  
  const overlay = document.createElement('div');
  overlay.id = 'quantumhire-captcha-overlay';
  overlay.innerHTML = `
    <div class="qh-captcha-modal">
      <div class="qh-captcha-icon">⚠️</div>
      <div class="qh-captcha-title">Human Verification Required</div>
      <div class="qh-captcha-message">Complete the CAPTCHA above, then click Continue</div>
      <button id="qh-captcha-continue-btn" class="qh-captcha-btn">
        <span>▶️</span> CONTINUE
      </button>
      <button id="qh-captcha-cancel-btn" class="qh-captcha-cancel">Cancel</button>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #quantumhire-captcha-overlay {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .qh-captcha-modal {
      background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
      border: 2px solid #f59e0b;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(245, 158, 11, 0.3);
      text-align: center;
      min-width: 280px;
      animation: pulseGlow 2s infinite;
    }
    
    @keyframes pulseGlow {
      0%, 100% { box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(245, 158, 11, 0.3); }
      50% { box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 50px rgba(245, 158, 11, 0.5); }
    }
    
    .qh-captcha-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    
    .qh-captcha-title {
      color: #f59e0b;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    
    .qh-captcha-message {
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 20px;
      line-height: 1.4;
    }
    
    .qh-captcha-btn {
      width: 100%;
      padding: 14px 24px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border: none;
      border-radius: 10px;
      color: white;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }
    
    .qh-captcha-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);
    }
    
    .qh-captcha-cancel {
      margin-top: 12px;
      padding: 8px 16px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: #64748b;
      font-size: 12px;
      cursor: pointer;
    }
    
    .qh-captcha-cancel:hover {
      border-color: rgba(255, 255, 255, 0.4);
      color: #94a3b8;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  
  // Handle continue button
  document.getElementById('qh-captcha-continue-btn').addEventListener('click', async () => {
    overlay.remove();
    showToast('Resuming application...', 'info');
    
    // Resume autofill with stored tailored data
    const atsData = await chrome.storage.local.get(['atsCredentials']);
    const result = await autofillForm(
      applicationState.tailoredData,
      atsData.atsCredentials,
      { skipCaptchaCheck: true }
    );
    
    if (result.success) {
      showToast(result.message, 'success');
    } else if (result.status === 'paused') {
      // Another CAPTCHA found
      showCaptchaAlert();
    } else {
      showToast(result.message || 'Completed', 'info');
    }
  });
  
  // Handle cancel button
  document.getElementById('qh-captcha-cancel-btn').addEventListener('click', () => {
    overlay.remove();
    applicationState.status = 'idle';
    showToast('Application paused', 'info');
  });
}

// ============= FLOATING PANEL =============

function createFloatingPanel() {
  if (document.getElementById('quantumhire-panel')) return;
  
  const platform = detectPlatform();
  const pageInfo = detectCurrentPage(platform.config);
  const jobData = extractJobDetails();
  
  const panel = document.createElement('div');
  panel.id = 'quantumhire-panel';
  panel.innerHTML = `
    <div class="qh-header">
      <div class="qh-brand">
        <span class="qh-logo">⚡</span>
        <span class="qh-title">QuantumHire AI</span>
      </div>
      <div class="qh-controls">
        <span class="qh-platform-badge">${platform.name.toUpperCase()}</span>
        <button class="qh-minimize">−</button>
      </div>
    </div>
    <div class="qh-body">
      <div class="qh-job-info">
        <div class="qh-job-title">${jobData.title}</div>
        <div class="qh-job-company">${jobData.company}</div>
        ${jobData.location ? `<div class="qh-job-location">📍 ${jobData.location}</div>` : ''}
      </div>
      
      <div class="qh-progress-section" id="qh-progress">
        <div class="qh-progress-header">
          <span>Page ${pageInfo.current} of ${pageInfo.total}</span>
          <span class="qh-page-name">${pageInfo.name}</span>
        </div>
        <div class="qh-progress-bar">
          <div class="qh-progress-fill" style="width: ${(pageInfo.current / pageInfo.total) * 100}%"></div>
        </div>
      </div>
      
      <div class="qh-status" id="qh-status">
        <span class="qh-status-icon">🟢</span>
        <span class="qh-status-text">Ready to apply</span>
      </div>
      
      <div class="qh-actions">
        <button id="qh-smart-apply" class="qh-btn primary">
          <span class="qh-btn-icon">⚡</span>
          <div class="qh-btn-content">
            <span class="qh-btn-title">Smart Apply</span>
            <span class="qh-btn-subtitle">Tailor + Fill + Upload + Answer Questions</span>
          </div>
        </button>
        
        <div class="qh-btn-row">
          <button id="qh-quick-fill" class="qh-btn secondary">
            <span>📝</span> Quick Fill
          </button>
          <button id="qh-next-page" class="qh-btn secondary">
            <span>➡️</span> Next Page
          </button>
        </div>
      </div>
      
      <div class="qh-captcha-alert hidden" id="qh-captcha-alert">
        <div class="qh-alert-header">⚠️ CAPTCHA detected</div>
        <div class="qh-alert-body">Please complete verification then click CONTINUE</div>
        <button id="qh-continue-btn" class="qh-btn primary">CONTINUE</button>
      </div>
      
      <div class="qh-results hidden" id="qh-results">
        <div class="qh-match-score">
          <span class="qh-score-label">ATS Match</span>
          <span class="qh-score-value" id="qh-score">0%</span>
        </div>
        
        <!-- PDF Preview Section -->
        <div class="qh-pdf-preview" id="qh-pdf-preview">
          <div class="qh-pdf-header">📄 Generated PDFs</div>
          <div class="qh-pdf-cards">
            <div class="qh-pdf-card" id="qh-resume-pdf-card">
              <div class="qh-pdf-icon">📄</div>
              <div class="qh-pdf-info">
                <div class="qh-pdf-name" id="qh-resume-pdf-name">Resume.pdf</div>
                <div class="qh-pdf-size" id="qh-resume-pdf-size">-</div>
              </div>
              <div class="qh-pdf-actions">
                <button class="qh-pdf-preview-btn" data-type="resume" title="Preview">👁️</button>
                <button class="qh-pdf-download-btn" data-type="resume" title="Download">⬇️</button>
              </div>
            </div>
            <div class="qh-pdf-card" id="qh-cover-pdf-card">
              <div class="qh-pdf-icon">📝</div>
              <div class="qh-pdf-info">
                <div class="qh-pdf-name" id="qh-cover-pdf-name">CoverLetter.pdf</div>
                <div class="qh-pdf-size" id="qh-cover-pdf-size">-</div>
              </div>
              <div class="qh-pdf-actions">
                <button class="qh-pdf-preview-btn" data-type="cover" title="Preview">👁️</button>
                <button class="qh-pdf-download-btn" data-type="cover" title="Download">⬇️</button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="qh-tabs">
          <button class="qh-tab active" data-tab="resume">Resume Text</button>
          <button class="qh-tab" data-tab="cover">Cover Letter Text</button>
        </div>
        <div class="qh-tab-content" id="qh-resume-tab">
          <textarea id="qh-resume" readonly></textarea>
          <div class="qh-tab-actions">
            <button class="qh-copy-btn" data-target="qh-resume">📋 Copy</button>
            <button class="qh-regenerate-btn" data-type="resume">🔄 Regenerate PDF</button>
          </div>
        </div>
        <div class="qh-tab-content hidden" id="qh-cover-tab">
          <textarea id="qh-cover" readonly></textarea>
          <div class="qh-tab-actions">
            <button class="qh-copy-btn" data-target="qh-cover">📋 Copy</button>
            <button class="qh-regenerate-btn" data-type="cover">🔄 Regenerate PDF</button>
          </div>
        </div>
      </div>
      
      <!-- PDF Preview Modal -->
      <div class="qh-pdf-modal hidden" id="qh-pdf-modal">
        <div class="qh-modal-header">
          <span id="qh-modal-title">PDF Preview</span>
          <button class="qh-modal-close">×</button>
        </div>
        <div class="qh-modal-body">
          <iframe id="qh-pdf-iframe" style="width:100%;height:400px;border:none;"></iframe>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(panel);
  addPanelStyles();
  setupPanelEvents(panel);
  
  // Store job data and PDF data
  panel.dataset.job = JSON.stringify(jobData);
  panel.dataset.resumePdf = '';
  panel.dataset.coverPdf = '';
}

function addPanelStyles() {
  if (document.getElementById('quantumhire-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'quantumhire-styles';
  style.textContent = `
    #quantumhire-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 360px;
      background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);
      border-radius: 16px;
      box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e2e8f0;
      overflow: hidden;
    }
    
    .qh-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.4);
    }
    
    .qh-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .qh-logo {
      font-size: 18px;
    }
    
    .qh-title {
      font-weight: 700;
      font-size: 14px;
      background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .qh-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .qh-platform-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 3px 8px;
      background: rgba(99, 102, 241, 0.3);
      border-radius: 4px;
      color: #a5b4fc;
    }
    
    .qh-minimize {
      background: none;
      border: none;
      color: #64748b;
      font-size: 20px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .qh-minimize:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    
    .qh-body {
      padding: 16px;
    }
    
    .qh-job-info {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }
    
    .qh-job-title {
      font-weight: 600;
      font-size: 15px;
      color: #fff;
      margin-bottom: 4px;
    }
    
    .qh-job-company {
      font-size: 13px;
      color: #a5b4fc;
    }
    
    .qh-job-location {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 6px;
    }
    
    .qh-progress-section {
      background: rgba(0,0,0,0.3);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    .qh-progress-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    
    .qh-page-name {
      color: #10b981;
    }
    
    .qh-progress-bar {
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    
    .qh-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #34d399);
      transition: width 0.3s ease;
    }
    
    .qh-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: rgba(16, 185, 129, 0.1);
      border-radius: 8px;
      margin-bottom: 14px;
      font-size: 12px;
    }
    
    .qh-status-icon {
      font-size: 10px;
    }
    
    .qh-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .qh-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .qh-btn.primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #fff;
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.35);
    }
    
    .qh-btn.primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(16, 185, 129, 0.45);
    }
    
    .qh-btn.secondary {
      flex: 1;
      background: rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.1);
      justify-content: center;
    }
    
    .qh-btn.secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
    }
    
    .qh-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }
    
    .qh-btn-row {
      display: flex;
      gap: 8px;
    }
    
    .qh-btn-content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    
    .qh-btn-title {
      font-weight: 600;
      font-size: 14px;
    }
    
    .qh-btn-subtitle {
      font-size: 10px;
      opacity: 0.8;
    }
    
    .qh-captcha-alert {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(234, 88, 12, 0.2) 100%);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 10px;
      padding: 14px;
      margin-top: 12px;
    }
    
    .qh-captcha-alert.hidden {
      display: none;
    }
    
    .qh-alert-header {
      font-weight: 600;
      font-size: 13px;
      color: #fbbf24;
      margin-bottom: 6px;
    }
    
    .qh-alert-body {
      font-size: 11px;
      color: #fcd34d;
      margin-bottom: 12px;
    }
    
    .qh-results {
      margin-top: 14px;
    }
    
    .qh-results.hidden {
      display: none;
    }
    
    .qh-match-score {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 14px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%);
      border-radius: 10px;
      margin-bottom: 12px;
    }
    
    .qh-score-label {
      font-size: 12px;
      color: #a7f3d0;
    }
    
    .qh-score-value {
      font-size: 20px;
      font-weight: 700;
      color: #10b981;
    }
    
    .qh-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 10px;
    }
    
    .qh-tab {
      flex: 1;
      padding: 8px;
      border: none;
      background: rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    
    .qh-tab:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    
    .qh-tab.active {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }
    
    .qh-tab-content {
      position: relative;
    }
    
    .qh-tab-content.hidden {
      display: none;
    }
    
    .qh-tab-content textarea {
      width: 100%;
      height: 120px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px;
      color: #e2e8f0;
      font-size: 11px;
      font-family: inherit;
      resize: none;
    }
    
    .qh-tab-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    
    .qh-copy-btn, .qh-download-btn, .qh-regenerate-btn {
      flex: 1;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 11px;
      cursor: pointer;
    }
    
    .qh-copy-btn:hover, .qh-download-btn:hover, .qh-regenerate-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    /* PDF Preview Section */
    .qh-pdf-preview {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    .qh-pdf-header {
      font-size: 12px;
      font-weight: 600;
      color: #a5b4fc;
      margin-bottom: 10px;
    }
    
    .qh-pdf-cards {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .qh-pdf-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      transition: all 0.2s;
    }
    
    .qh-pdf-card:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(16, 185, 129, 0.3);
    }
    
    .qh-pdf-card.uploaded {
      border-color: rgba(16, 185, 129, 0.5);
      background: rgba(16, 185, 129, 0.1);
    }
    
    .qh-pdf-icon {
      font-size: 20px;
    }
    
    .qh-pdf-info {
      flex: 1;
    }
    
    .qh-pdf-name {
      font-size: 11px;
      font-weight: 500;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }
    
    .qh-pdf-size {
      font-size: 10px;
      color: #64748b;
    }
    
    .qh-pdf-actions {
      display: flex;
      gap: 4px;
    }
    
    .qh-pdf-preview-btn, .qh-pdf-download-btn {
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }
    
    .qh-pdf-preview-btn:hover, .qh-pdf-download-btn:hover {
      background: rgba(99, 102, 241, 0.3);
    }
    
    /* PDF Modal */
    .qh-pdf-modal {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      border-radius: 16px;
      z-index: 10;
      display: flex;
      flex-direction: column;
    }
    
    .qh-pdf-modal.hidden {
      display: none;
    }
    
    .qh-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .qh-modal-header span {
      font-weight: 600;
      font-size: 14px;
    }
    
    .qh-modal-close {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
    }
    
    .qh-modal-close:hover {
      color: #fff;
    }
    
    .qh-modal-body {
      flex: 1;
      padding: 10px;
      overflow: auto;
    }
    
    .quantumhire-toast {
      position: fixed;
      bottom: 100px;
      right: 20px;
      padding: 14px 20px;
      background: linear-gradient(145deg, #1e293b 0%, #334155 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 2147483648;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
      animation: slideIn 0.3s ease;
      max-width: 320px;
    }
    
    .quantumhire-toast.success { border-left: 4px solid #10b981; }
    .quantumhire-toast.error { border-left: 4px solid #ef4444; }
    .quantumhire-toast.warning { border-left: 4px solid #f59e0b; }
    .quantumhire-toast.info { border-left: 4px solid #3b82f6; }
    
    .quantumhire-toast-message { color: #fff; font-size: 13px; line-height: 1.4; }
    
    .quantumhire-toast-close {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 18px;
    }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    .quantumhire-filled {
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.6) !important;
      transition: box-shadow 0.3s;
    }
    
    .quantumhire-resume-field {
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.6) !important;
    }
    
    #quantumhire-panel.minimized .qh-body {
      display: none;
    }
  `;
  document.head.appendChild(style);
}

function setupPanelEvents(panel) {
  // Minimize
  panel.querySelector('.qh-minimize').addEventListener('click', () => {
    panel.classList.toggle('minimized');
    const btn = panel.querySelector('.qh-minimize');
    btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  
  // Smart Apply
  panel.querySelector('#qh-smart-apply').addEventListener('click', async () => {
    const btn = panel.querySelector('#qh-smart-apply');
    const statusEl = panel.querySelector('#qh-status');
    
    btn.disabled = true;
    updateStatus(statusEl, '⏳', 'Tailoring resume with AI...');
    
    try {
      const jobData = JSON.parse(panel.dataset.job || '{}');
      
      // Get tailored application
      const tailoredData = await chrome.runtime.sendMessage({
        action: 'getTailoredApplication',
        job: jobData,
      });
      
      if (tailoredData.error) throw new Error(tailoredData.error);
      
      updateStatus(statusEl, '📄', 'Generating PDFs...');
      
      // Generate PDFs
      const profileData = await chrome.storage.local.get(['userProfile']);
      const profile = profileData.userProfile || {};
      
      let resumePdfResult = null;
      let coverPdfResult = null;
      
      // Generate Resume PDF
      try {
        resumePdfResult = await generatePDF('resume', profile, jobData, tailoredData);
        if (resumePdfResult.success) {
          panel.dataset.resumePdf = resumePdfResult.pdf;
          panel.querySelector('#qh-resume-pdf-name').textContent = resumePdfResult.fileName;
          panel.querySelector('#qh-resume-pdf-size').textContent = formatFileSize(resumePdfResult.size);
          panel.querySelector('#qh-resume-pdf-card').classList.add('uploaded');
        }
      } catch (e) {
        console.error('Resume PDF generation failed:', e);
      }
      
      // Generate Cover Letter PDF
      try {
        coverPdfResult = await generatePDF('cover_letter', profile, jobData, tailoredData);
        if (coverPdfResult.success) {
          panel.dataset.coverPdf = coverPdfResult.pdf;
          panel.querySelector('#qh-cover-pdf-name').textContent = coverPdfResult.fileName;
          panel.querySelector('#qh-cover-pdf-size').textContent = formatFileSize(coverPdfResult.size);
          panel.querySelector('#qh-cover-pdf-card').classList.add('uploaded');
        }
      } catch (e) {
        console.error('Cover letter PDF generation failed:', e);
      }
      
      // Add PDF data to tailored data for upload
      if (resumePdfResult?.success) {
        tailoredData.resumePdf = resumePdfResult;
      }
      if (coverPdfResult?.success) {
        tailoredData.coverPdf = coverPdfResult;
      }
      
      updateStatus(statusEl, '📝', 'Auto-filling form...');
      
      // Auto-fill with tailored data
      const atsData = await chrome.storage.local.get(['atsCredentials']);
      const result = await autofillForm(tailoredData, atsData.atsCredentials);
      
      if (result.status === 'paused' && result.pauseReason === 'captcha') {
        panel.querySelector('#qh-captcha-alert').classList.remove('hidden');
        updateStatus(statusEl, '⚠️', 'Waiting for human verification...');
      } else {
        updateStatus(statusEl, '✅', result.message);
        
        // Show results
        panel.querySelector('#qh-results').classList.remove('hidden');
        panel.querySelector('#qh-resume').value = tailoredData.tailoredResume || '';
        panel.querySelector('#qh-cover').value = tailoredData.tailoredCoverLetter || '';
        panel.querySelector('#qh-score').textContent = `${tailoredData.matchScore || 0}%`;
        
        showToast(result.message, 'success');
      }
      
    } catch (error) {
      console.error('Smart apply error:', error);
      updateStatus(statusEl, '❌', error.message);
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  
  // Quick Fill
  panel.querySelector('#qh-quick-fill').addEventListener('click', async () => {
    const btn = panel.querySelector('#qh-quick-fill');
    btn.disabled = true;
    
    const atsData = await chrome.storage.local.get(['atsCredentials']);
    const result = await autofillForm(null, atsData.atsCredentials, { skipQuestions: true });
    
    showToast(result.message, result.success ? 'success' : 'error');
    btn.disabled = false;
  });
  
  // Next Page
  panel.querySelector('#qh-next-page').addEventListener('click', () => {
    const platform = detectPlatform();
    if (platform.config?.nextButton) {
      const nextBtn = document.querySelector(platform.config.nextButton);
      if (nextBtn) {
        nextBtn.click();
        showToast('Navigating to next page...', 'info');
      } else {
        showToast('Next button not found', 'error');
      }
    }
  });
  
  // Continue after CAPTCHA
  panel.querySelector('#qh-continue-btn')?.addEventListener('click', async () => {
    panel.querySelector('#qh-captcha-alert').classList.add('hidden');
    const statusEl = panel.querySelector('#qh-status');
    updateStatus(statusEl, '▶️', 'Resuming application...');
    
    // Resume autofill with skipCaptchaCheck
    const atsData = await chrome.storage.local.get(['atsCredentials']);
    const result = await autofillForm(
      applicationState.tailoredData, 
      atsData.atsCredentials, 
      { skipCaptchaCheck: true }
    );
    
    updateStatus(statusEl, '✅', result.message);
    showToast('Resumed successfully!', 'success');
  });
  
  // Tab switching
  panel.querySelectorAll('.qh-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.qh-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      panel.querySelector('#qh-resume-tab').classList.toggle('hidden', tabName !== 'resume');
      panel.querySelector('#qh-cover-tab').classList.toggle('hidden', tabName !== 'cover');
    });
  });
  
  // Copy buttons
  panel.querySelectorAll('.qh-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const textarea = panel.querySelector(`#${btn.dataset.target}`);
      await navigator.clipboard.writeText(textarea.value);
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy', 2000);
    });
  });
  
  // PDF Preview buttons
  panel.querySelectorAll('.qh-pdf-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const pdfBase64 = type === 'resume' ? panel.dataset.resumePdf : panel.dataset.coverPdf;
      
      if (!pdfBase64) {
        showToast('PDF not generated yet', 'error');
        return;
      }
      
      // Show modal with PDF
      const modal = panel.querySelector('#qh-pdf-modal');
      const iframe = panel.querySelector('#qh-pdf-iframe');
      const title = panel.querySelector('#qh-modal-title');
      
      title.textContent = type === 'resume' ? 'Resume Preview' : 'Cover Letter Preview';
      iframe.src = `data:application/pdf;base64,${pdfBase64}`;
      modal.classList.remove('hidden');
    });
  });
  
  // PDF Download buttons
  panel.querySelectorAll('.qh-pdf-download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const pdfBase64 = type === 'resume' ? panel.dataset.resumePdf : panel.dataset.coverPdf;
      const fileName = type === 'resume' 
        ? panel.querySelector('#qh-resume-pdf-name').textContent 
        : panel.querySelector('#qh-cover-pdf-name').textContent;
      
      if (!pdfBase64) {
        showToast('PDF not generated yet', 'error');
        return;
      }
      
      // Download PDF
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = fileName || `${type}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast(`Downloaded ${fileName}`, 'success');
    });
  });
  
  // Regenerate PDF buttons
  panel.querySelectorAll('.qh-regenerate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const statusEl = panel.querySelector('#qh-status');
      
      btn.disabled = true;
      btn.textContent = '⏳ Generating...';
      
      try {
        const jobData = JSON.parse(panel.dataset.job || '{}');
        const profileData = await chrome.storage.local.get(['userProfile']);
        const profile = profileData.userProfile || {};
        
        const tailoredData = {
          tailoredResume: panel.querySelector('#qh-resume').value,
          tailoredCoverLetter: panel.querySelector('#qh-cover').value,
        };
        
        const pdfType = type === 'resume' ? 'resume' : 'cover_letter';
        const result = await generatePDF(pdfType, profile, jobData, tailoredData);
        
        if (result.success) {
          if (type === 'resume') {
            panel.dataset.resumePdf = result.pdf;
            panel.querySelector('#qh-resume-pdf-name').textContent = result.fileName;
            panel.querySelector('#qh-resume-pdf-size').textContent = formatFileSize(result.size);
            panel.querySelector('#qh-resume-pdf-card').classList.add('uploaded');
          } else {
            panel.dataset.coverPdf = result.pdf;
            panel.querySelector('#qh-cover-pdf-name').textContent = result.fileName;
            panel.querySelector('#qh-cover-pdf-size').textContent = formatFileSize(result.size);
            panel.querySelector('#qh-cover-pdf-card').classList.add('uploaded');
          }
          showToast(`${type === 'resume' ? 'Resume' : 'Cover letter'} PDF regenerated!`, 'success');
        } else {
          throw new Error(result.error || 'Generation failed');
        }
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Regenerate PDF';
      }
    });
  });
  
  // Modal close button
  panel.querySelector('.qh-modal-close')?.addEventListener('click', () => {
    panel.querySelector('#qh-pdf-modal').classList.add('hidden');
    panel.querySelector('#qh-pdf-iframe').src = '';
  });
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function updateStatus(statusEl, icon, text) {
  if (!statusEl) return;
  statusEl.innerHTML = `
    <span class="qh-status-icon">${icon}</span>
    <span class="qh-status-text">${text}</span>
  `;
}

// ============= MESSAGE LISTENER =============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('QuantumHire AI: Message received', message.action);
  
  if (message.action === 'autofill') {
    autofillForm(message.tailoredData, message.atsCredentials, message.options || {})
      .then(sendResponse);
    return true;
  }
  
  if (message.action === 'extractJob') {
    sendResponse(extractJobDetails());
    return true;
  }
  
  if (message.action === 'showPanel') {
    createFloatingPanel();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'getStatus') {
    sendResponse({
      ...applicationState,
      platform: detectPlatform().name,
      page: detectCurrentPage(detectPlatform().config),
      captchas: detectCaptcha().length
    });
    return true;
  }
});

// ============= INITIALIZATION =============

async function initialize() {
  const hostname = window.location.hostname;
  
  // Skip job boards
  if (hostname.includes('linkedin.com') || hostname.includes('indeed.com')) {
    console.log('QuantumHire AI: Skipping job board');
    return;
  }
  
  const platform = detectPlatform();
  console.log(`QuantumHire AI: Detected platform: ${platform.name}`);
  
  // Check for saved session
  const savedSession = await loadSessionState();
  if (savedSession && savedSession.status === 'in_progress') {
    console.log('QuantumHire AI: Resuming saved session');
    applicationState = savedSession;
  }
  
  // Show panel on application pages
  if (platform.name !== 'generic' || document.querySelector('input[type="file"], form input[type="text"]')) {
    setTimeout(createFloatingPanel, 1000);
  }
  
  // Check for CAPTCHAs periodically
  setInterval(() => {
    const captchas = detectCaptcha();
    if (captchas.length > 0 && applicationState.status === 'in_progress') {
      applicationState.status = 'paused';
      applicationState.pauseReason = 'captcha';
      
      const captchaAlert = document.getElementById('qh-captcha-alert');
      if (captchaAlert) captchaAlert.classList.remove('hidden');
    }
  }, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
