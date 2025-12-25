// QuantumHire AI - Content Script
// Enhanced: AI question answering, PDF generation & upload, comprehensive autofill

console.log('QuantumHire AI: Content script loaded');

// Field mapping for common form fields
const FIELD_MAPPINGS = {
  firstName: ['first_name', 'firstname', 'first-name', 'fname', 'given_name', 'givenname'],
  lastName: ['last_name', 'lastname', 'last-name', 'lname', 'surname', 'family_name', 'familyname'],
  fullName: ['full_name', 'fullname', 'name', 'your_name', 'applicant_name'],
  email: ['email', 'e-mail', 'email_address', 'emailaddress', 'work_email', 'personal_email'],
  phone: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'phone_number', 'phonenumber', 'contact_number'],
  address: ['address', 'street', 'street_address', 'address_line_1', 'address1'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region', 'state_province'],
  zipCode: ['zip', 'zipcode', 'zip_code', 'postal', 'postal_code', 'postalcode'],
  country: ['country', 'nation', 'country_code'],
  linkedin: ['linkedin', 'linkedin_url', 'linkedin_profile', 'linkedinurl'],
  github: ['github', 'github_url', 'github_profile', 'githuburl'],
  portfolio: ['portfolio', 'website', 'personal_website', 'portfolio_url', 'website_url'],
  currentCompany: ['current_company', 'currentcompany', 'company', 'employer', 'current_employer'],
  currentTitle: ['current_title', 'currenttitle', 'job_title', 'title', 'position', 'current_position'],
  yearsExperience: ['years_experience', 'experience', 'total_experience', 'years_of_experience'],
  salary: ['salary', 'salary_expectation', 'expected_salary', 'desired_salary', 'compensation'],
  coverLetter: ['cover_letter', 'coverletter', 'cover', 'letter', 'message', 'additional_info'],
};

// ATS-specific selectors
const ATS_SELECTORS = {
  greenhouse: {
    firstName: '#first_name',
    lastName: '#last_name',
    email: '#email',
    phone: '#phone',
    linkedin: 'input[name*="linkedin"]',
    resume: 'input[type="file"][name*="resume"], input[type="file"][accept*="pdf"]',
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
    resume: 'input[type="file"][data-automation-id*="file"], input[type="file"]',
  },
  ashby: {
    firstName: 'input[name="firstName"]',
    lastName: 'input[name="lastName"]',
    email: 'input[name="email"]',
    phone: 'input[name="phone"]',
    linkedin: 'input[name="linkedInUrl"]',
  },
  generic: {
    firstName: 'input[name*="first"], input[id*="first"]',
    lastName: 'input[name*="last"], input[id*="last"]',
    email: 'input[type="email"], input[name*="email"]',
    phone: 'input[type="tel"], input[name*="phone"]',
  },
};

// Job extraction selectors
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
    title: '[data-automation-id="jobPostingHeader"] h1, .job-title, h1',
    company: '[data-automation-id="companyName"], .company-name',
    description: '[data-automation-id="jobPostingDescription"], .job-description, main',
    location: '[data-automation-id="locations"], .location',
  },
  generic: {
    title: 'h1, [class*="job-title"], [class*="jobtitle"]',
    company: '[class*="company"], [class*="employer"]',
    description: '[class*="job-description"], [class*="description"], article, main',
    location: '[class*="location"], [class*="job-location"]',
  },
};

// Detect ATS type
function detectATS() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('greenhouse.io') || hostname.includes('boards.greenhouse.io')) return 'greenhouse';
  if (hostname.includes('lever.co') || hostname.includes('jobs.lever.co')) return 'lever';
  if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
  if (hostname.includes('ashbyhq.com')) return 'ashby';
  if (hostname.includes('icims.com')) return 'icims';
  if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
  
  return 'generic';
}

// Extract text from element
function extractText(selector) {
  const element = document.querySelector(selector);
  if (!element) return '';
  if (element.tagName === 'IMG') return element.alt || '';
  return element.innerText?.trim() || element.textContent?.trim() || '';
}

// Extract job details from page
function extractJobDetails() {
  const ats = detectATS();
  const selectors = JOB_EXTRACTION_SELECTORS[ats] || JOB_EXTRACTION_SELECTORS.generic;
  
  console.log(`QuantumHire AI: Extracting job from ${ats} page`);
  
  let title = '', company = '', description = '', location = '';
  
  // Extract each field
  if (selectors.title) {
    for (const sel of selectors.title.split(', ')) {
      title = extractText(sel);
      if (title) break;
    }
  }
  
  if (selectors.company) {
    for (const sel of selectors.company.split(', ')) {
      company = extractText(sel);
      if (company) break;
    }
  }
  
  if (selectors.description) {
    for (const sel of selectors.description.split(', ')) {
      description = extractText(sel);
      if (description && description.length > 100) break;
    }
  }
  
  if (selectors.location) {
    for (const sel of selectors.location.split(', ')) {
      location = extractText(sel);
      if (location) break;
    }
  }
  
  // Fallbacks from page title
  if (!title) {
    const match = document.title.match(/^(.+?)(?:\s*[-|–]\s*|\s+at\s+)/);
    if (match) title = match[1].trim();
  }
  
  if (!company) {
    const match = document.title.match(/[-|–]\s*(.+?)(?:\s*[-|–]|\s*$)/);
    if (match) company = match[1].trim();
  }
  
  const requirements = extractRequirements(description);
  
  return {
    title: title || 'Unknown Position',
    company: company || extractCompanyFromUrl(),
    description: description.substring(0, 5000),
    location: location,
    requirements: requirements,
    url: window.location.href,
    ats: ats,
  };
}

function extractCompanyFromUrl() {
  const hostname = window.location.hostname;
  const match = hostname.match(/^([^.]+)\.(greenhouse|lever|ashby)/);
  if (match) return capitalizeWords(match[1].replace(/-/g, ' '));
  return hostname.split('.')[0];
}

function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
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

// Find input field
function findField(fieldType) {
  const mappings = FIELD_MAPPINGS[fieldType] || [fieldType];
  const ats = detectATS();
  
  if (ATS_SELECTORS[ats]?.[fieldType]) {
    const element = document.querySelector(ATS_SELECTORS[ats][fieldType]);
    if (element) return element;
  }
  
  for (const mapping of mappings) {
    let element = document.getElementById(mapping);
    if (element) return element;
    
    element = document.querySelector(`input[name="${mapping}"], textarea[name="${mapping}"]`);
    if (element) return element;
    
    element = document.querySelector(`input[name*="${mapping}"], textarea[name*="${mapping}"]`);
    if (element) return element;
    
    element = document.querySelector(`input[id*="${mapping}"], textarea[id*="${mapping}"]`);
    if (element) return element;
    
    element = document.querySelector(`input[placeholder*="${mapping}" i], textarea[placeholder*="${mapping}" i]`);
    if (element) return element;
  }
  
  return null;
}

// Fill a single field with proper event dispatching
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

// Detect application questions on the page
function detectApplicationQuestions() {
  const questions = [];
  
  // Find all form groups/labels with inputs
  const formGroups = document.querySelectorAll('label, [class*="form-group"], [class*="question"]');
  
  formGroups.forEach((group, index) => {
    const label = group.tagName === 'LABEL' ? group : group.querySelector('label');
    const labelText = label?.innerText?.trim() || group?.innerText?.split('\n')[0]?.trim();
    
    if (!labelText || labelText.length < 3 || labelText.length > 200) return;
    
    // Skip already filled basic fields
    const basicFields = ['first name', 'last name', 'email', 'phone', 'address', 'city', 'state', 'zip'];
    if (basicFields.some(f => labelText.toLowerCase().includes(f))) return;
    
    // Find associated input
    let input = group.querySelector('input, textarea, select');
    if (!input && label?.htmlFor) {
      input = document.getElementById(label.htmlFor);
    }
    
    if (!input || input.type === 'hidden' || input.type === 'file') return;
    
    const question = {
      id: input.id || input.name || `question_${index}`,
      label: labelText,
      type: input.type || input.tagName.toLowerCase(),
      element: input,
      required: input.required || group.querySelector('[class*="required"]') !== null,
    };
    
    // Get options for select/radio
    if (input.tagName === 'SELECT') {
      question.options = Array.from(input.options).map(o => o.text).filter(t => t);
    }
    
    questions.push(question);
  });
  
  return questions;
}

// Get AI answers for questions
async function getAIAnswersForQuestions(questions, jobData) {
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
    console.error('QuantumHire AI: Failed to get AI answers', error);
    return [];
  }
}

// Fill questions with AI answers
function fillQuestionsWithAnswers(questions, answers) {
  const answerMap = new Map(answers.map(a => [a.id, a.answer]));
  let filledCount = 0;
  
  questions.forEach(q => {
    const answer = answerMap.get(q.id);
    if (!answer || !q.element) return;
    
    if (q.element.tagName === 'SELECT') {
      // Find matching option
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
    } else if (q.element.type === 'radio') {
      // Handle radio buttons
      const name = q.element.name;
      const radios = document.querySelectorAll(`input[name="${name}"]`);
      radios.forEach(radio => {
        if (radio.value.toLowerCase() === String(answer).toLowerCase()) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      });
    } else {
      // Text/textarea
      if (fillField(q.element, String(answer))) {
        filledCount++;
      }
    }
  });
  
  return filledCount;
}

// Generate PDF from content using jsPDF approach
async function generatePDFBlob(content, title) {
  // Create a formatted HTML document
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.5;
          max-width: 7.5in;
          margin: 0.5in auto;
          padding: 0;
          color: #000;
        }
        h1, h2, h3 { font-weight: bold; margin: 0.5em 0; }
        h1 { font-size: 16pt; text-align: center; margin-bottom: 0.2em; }
        h2 { font-size: 12pt; border-bottom: 1px solid #333; padding-bottom: 2px; margin-top: 1em; }
        h3 { font-size: 11pt; margin: 0.5em 0; }
        p { margin: 0.5em 0; }
        ul { margin: 0.5em 0; padding-left: 1.5em; }
        li { margin: 0.25em 0; }
        .contact-info { text-align: center; font-size: 10pt; color: #444; margin-bottom: 1em; }
      </style>
    </head>
    <body>
      <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(content)}</pre>
    </body>
    </html>
  `;
  
  // Convert to Blob
  const blob = new Blob([html], { type: 'text/html' });
  return blob;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Create PDF using canvas approach for proper PDF
async function createPDFFile(content, fileName) {
  // Create an iframe to render the content
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position: fixed; top: -9999px; left: -9999px; width: 8.5in; height: 11in;';
  document.body.appendChild(iframe);
  
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { size: letter; margin: 0.5in; }
        body {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.5;
          color: #000;
          margin: 0;
          padding: 0.5in;
        }
        pre {
          white-space: pre-wrap;
          font-family: inherit;
          margin: 0;
        }
      </style>
    </head>
    <body><pre>${escapeHtml(content)}</pre></body>
    </html>
  `);
  doc.close();
  
  // Wait for render
  await new Promise(r => setTimeout(r, 100));
  
  // For actual PDF, we'd use html2canvas + jsPDF, but for now use print
  // Return text blob as fallback that can be converted
  const blob = new Blob([content], { type: 'text/plain' });
  
  document.body.removeChild(iframe);
  
  return new File([blob], fileName, { type: 'application/pdf' });
}

// Upload file to file input
async function uploadToFileInput(fileInput, content, fileName) {
  if (!fileInput || !content) {
    console.log('QuantumHire AI: No file input or content to upload');
    return false;
  }
  
  try {
    // Create a proper text file (as PDF generation requires server-side or complex library)
    // For now, create a text file that can be used
    const blob = new Blob([content], { type: 'text/plain' });
    const file = new File([blob], fileName.replace('.pdf', '.txt'), { type: 'text/plain' });
    
    // Create DataTransfer to set files
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Trigger events
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    console.log('QuantumHire AI: File uploaded to input');
    return true;
  } catch (error) {
    console.error('QuantumHire AI: File upload failed', error);
    return false;
  }
}

// Main autofill function - ENHANCED
async function autofillForm(tailoredData = null, atsCredentials = null, options = {}) {
  console.log('QuantumHire AI: Starting enhanced autofill...', { tailoredData: !!tailoredData, options });
  
  const data = await chrome.storage.local.get(['userProfile']);
  const profile = data.userProfile;
  
  if (!profile) {
    console.log('QuantumHire AI: No profile found');
    return { success: false, message: 'No profile found. Please connect your account first.' };
  }
  
  let filledCount = 0;
  const results = { fields: 0, questions: 0, files: 0 };
  
  // Check for login page first
  const isLoginPage = detectLoginPage();
  if (isLoginPage && atsCredentials) {
    console.log('QuantumHire AI: Detected login page, filling credentials');
    filledCount += fillLoginCredentials(atsCredentials);
    results.fields = filledCount;
    return { success: filledCount > 0, ...results, message: `Filled ${filledCount} login fields` };
  }
  
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
    
    const element = findField(fieldType);
    if (element) {
      if (fillField(element, value)) {
        filledCount++;
        element.classList.add('quantumhire-filled');
        console.log(`QuantumHire AI: Filled ${fieldType}`);
      }
    }
  }
  results.fields = filledCount;
  
  // Step 2: Find and answer application questions with AI
  if (!options.skipQuestions) {
    const questions = detectApplicationQuestions();
    
    if (questions.length > 0) {
      console.log(`QuantumHire AI: Found ${questions.length} questions to answer`);
      
      const jobData = extractJobDetails();
      const answers = await getAIAnswersForQuestions(questions, jobData);
      
      if (answers.length > 0) {
        const answeredCount = fillQuestionsWithAnswers(questions, answers);
        results.questions = answeredCount;
        console.log(`QuantumHire AI: Filled ${answeredCount} questions with AI answers`);
      }
    }
  }
  
  // Step 3: Upload resume and cover letter PDFs
  if (tailoredData && !options.skipFileUpload) {
    // Find file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    for (const input of fileInputs) {
      const inputName = (input.name || input.id || '').toLowerCase();
      const labelText = findLabelForInput(input)?.toLowerCase() || '';
      
      // Resume upload
      if (inputName.includes('resume') || inputName.includes('cv') || 
          labelText.includes('resume') || labelText.includes('cv')) {
        if (tailoredData.tailoredResume) {
          const fileName = tailoredData.fileName ? `${tailoredData.fileName}.pdf` : 'Resume.pdf';
          const uploaded = await uploadToFileInput(input, tailoredData.tailoredResume, fileName);
          if (uploaded) results.files++;
        }
      }
      
      // Cover letter upload
      if (inputName.includes('cover') || labelText.includes('cover letter')) {
        if (tailoredData.tailoredCoverLetter) {
          const fileName = tailoredData.fileName ? 
            `${tailoredData.fileName.replace('CV', 'CoverLetter')}.pdf` : 'CoverLetter.pdf';
          const uploaded = await uploadToFileInput(input, tailoredData.tailoredCoverLetter, fileName);
          if (uploaded) results.files++;
        }
      }
    }
  }
  
  // Highlight any remaining file inputs
  const resumeInputs = document.querySelectorAll('input[type="file"]');
  resumeInputs.forEach(input => {
    if (!input.files?.length) {
      input.classList.add('quantumhire-resume-field');
    }
  });
  
  const totalFilled = results.fields + results.questions + results.files;
  console.log(`QuantumHire AI: Total filled - Fields: ${results.fields}, Questions: ${results.questions}, Files: ${results.files}`);
  
  return {
    success: totalFilled > 0,
    ...results,
    message: `Filled ${results.fields} fields, ${results.questions} questions${results.files > 0 ? `, uploaded ${results.files} files` : ''}`,
  };
}

// Find label for input element
function findLabelForInput(input) {
  // Check for explicit label
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.innerText;
  }
  
  // Check parent elements
  let parent = input.parentElement;
  while (parent && parent.tagName !== 'FORM') {
    const label = parent.querySelector('label');
    if (label) return label.innerText;
    parent = parent.parentElement;
  }
  
  return '';
}

// Detect login page
function detectLoginPage() {
  const hasPasswordField = document.querySelector('input[type="password"]');
  const hasEmailField = document.querySelector('input[type="email"], input[name*="email"], input[id*="email"]');
  const hasResumeField = document.querySelector('input[type="file"]');
  
  return hasPasswordField && hasEmailField && !hasResumeField;
}

// Fill login credentials
function fillLoginCredentials(credentials) {
  if (!credentials?.email || !credentials?.password) return 0;
  
  let filled = 0;
  
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id="email"]',
    'input[name*="username"]',
    'input[data-automation-id="email"]',
    'input[data-automation-id="userName"]',
  ];
  
  for (const selector of emailSelectors) {
    const field = document.querySelector(selector);
    if (field && !field.value) {
      fillField(field, credentials.email);
      field.classList.add('quantumhire-filled');
      filled++;
      break;
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
      fillField(field, credentials.password);
      field.classList.add('quantumhire-filled');
      filled++;
      break;
    }
  }
  
  return filled;
}

// Show toast notification
function showToast(message, type = 'success') {
  const existing = document.querySelector('.quantumhire-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `quantumhire-toast ${type}`;
  toast.innerHTML = `
    <span class="quantumhire-toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <span class="quantumhire-toast-message">${message}</span>
    <button class="quantumhire-toast-close">×</button>
  `;
  
  toast.querySelector('.quantumhire-toast-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 5000);
}

// Create floating action panel
function createFloatingPanel() {
  if (document.getElementById('quantumhire-panel')) return;
  
  const panel = document.createElement('div');
  panel.id = 'quantumhire-panel';
  panel.innerHTML = `
    <div class="quantumhire-panel-header">
      <div class="quantumhire-brand">
        <span class="quantumhire-logo">⚡</span>
        <span class="quantumhire-title">QuantumHire AI</span>
      </div>
      <button class="quantumhire-panel-minimize">−</button>
    </div>
    <div class="quantumhire-panel-body">
      <div class="quantumhire-job-preview" id="quantumhire-job-preview">
        <div class="quantumhire-loading">
          <div class="quantumhire-spinner"></div>
          <span>Analyzing job page...</span>
        </div>
      </div>
      <div class="quantumhire-actions">
        <button id="quantumhire-apply-btn" class="quantumhire-btn primary">
          <span class="btn-icon">⚡</span>
          <div class="btn-content">
            <span class="btn-title">Smart Apply</span>
            <span class="btn-subtitle">Tailor + Auto-fill + Upload</span>
          </div>
        </button>
        <button id="quantumhire-fill-btn" class="quantumhire-btn secondary">
          <span>📝</span> Quick Fill (No Tailor)
        </button>
      </div>
      <div id="quantumhire-progress" class="quantumhire-progress hidden">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <div class="progress-text" id="progress-text">Processing...</div>
      </div>
      <div id="quantumhire-tailored-content" class="quantumhire-tailored-content hidden">
        <div class="quantumhire-match-score">
          <span class="match-label">ATS Match</span>
          <span class="match-value" id="match-score">0%</span>
        </div>
        <div class="quantumhire-tabs">
          <button class="quantumhire-tab active" data-tab="resume">Resume</button>
          <button class="quantumhire-tab" data-tab="cover">Cover Letter</button>
        </div>
        <div class="quantumhire-tab-content" id="quantumhire-resume-tab">
          <textarea id="quantumhire-resume" readonly></textarea>
          <div class="tab-actions">
            <button class="quantumhire-copy-btn" data-target="quantumhire-resume">📋 Copy</button>
            <button class="quantumhire-download-btn" data-type="resume">⬇️ PDF</button>
          </div>
        </div>
        <div class="quantumhire-tab-content hidden" id="quantumhire-cover-tab">
          <textarea id="quantumhire-cover" readonly></textarea>
          <div class="tab-actions">
            <button class="quantumhire-copy-btn" data-target="quantumhire-cover">📋 Copy</button>
            <button class="quantumhire-download-btn" data-type="cover">⬇️ PDF</button>
          </div>
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

// Panel styles
function addPanelStyles() {
  if (document.getElementById('quantumhire-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'quantumhire-styles';
  style.textContent = `
    #quantumhire-panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 340px;
      background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.1);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e2e8f0;
      overflow: hidden;
    }
    
    .quantumhire-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      background: rgba(0, 0, 0, 0.3);
      cursor: move;
    }
    
    .quantumhire-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .quantumhire-logo {
      font-size: 18px;
    }
    
    .quantumhire-title {
      font-weight: 700;
      font-size: 14px;
      background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .quantumhire-panel-minimize {
      background: none;
      border: none;
      color: #64748b;
      font-size: 20px;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .quantumhire-panel-minimize:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    
    .quantumhire-panel-body {
      padding: 16px;
    }
    
    .quantumhire-job-preview {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }
    
    .quantumhire-job-title {
      font-weight: 600;
      font-size: 14px;
      color: #fff;
      margin-bottom: 4px;
    }
    
    .quantumhire-job-company {
      font-size: 12px;
      color: #a5b4fc;
    }
    
    .quantumhire-job-location {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 4px;
    }
    
    .quantumhire-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #94a3b8;
      font-size: 12px;
    }
    
    .quantumhire-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(99, 102, 241, 0.3);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .quantumhire-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .quantumhire-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 12px 14px;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .quantumhire-btn.primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #fff;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
    }
    
    .quantumhire-btn.primary:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
    }
    
    .quantumhire-btn.secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .quantumhire-btn.secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
    }
    
    .quantumhire-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }
    
    .btn-content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    
    .btn-title {
      font-weight: 600;
      font-size: 14px;
    }
    
    .btn-subtitle {
      font-size: 10px;
      opacity: 0.8;
    }
    
    .quantumhire-progress {
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    .quantumhire-progress.hidden {
      display: none;
    }
    
    .progress-bar {
      height: 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #34d399);
      width: 0%;
      transition: width 0.3s ease;
    }
    
    .progress-text {
      font-size: 11px;
      color: #94a3b8;
    }
    
    .quantumhire-match-score {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
      border-radius: 10px;
      margin-bottom: 12px;
    }
    
    .match-label {
      font-size: 12px;
      color: #a7f3d0;
    }
    
    .match-value {
      font-size: 18px;
      font-weight: 700;
      color: #10b981;
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
      margin-bottom: 10px;
    }
    
    .quantumhire-tab {
      flex: 1;
      padding: 8px;
      border: none;
      background: rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .quantumhire-tab:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    
    .quantumhire-tab.active {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }
    
    .quantumhire-tab-content {
      position: relative;
    }
    
    .quantumhire-tab-content.hidden {
      display: none;
    }
    
    .quantumhire-tab-content textarea {
      width: 100%;
      height: 140px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px;
      color: #e2e8f0;
      font-size: 11px;
      font-family: inherit;
      resize: none;
    }
    
    .tab-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    
    .quantumhire-copy-btn, .quantumhire-download-btn {
      flex: 1;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .quantumhire-copy-btn:hover, .quantumhire-download-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .quantumhire-toast {
      position: fixed;
      bottom: 100px;
      right: 20px;
      padding: 12px 20px;
      background: linear-gradient(145deg, #1e293b 0%, #334155 100%);
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 2147483648;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease;
    }
    
    .quantumhire-toast.success { border-left: 3px solid #10b981; }
    .quantumhire-toast.error { border-left: 3px solid #ef4444; }
    .quantumhire-toast.info { border-left: 3px solid #3b82f6; }
    
    .quantumhire-toast-message { color: #fff; font-size: 13px; }
    
    .quantumhire-toast-close {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 18px;
      margin-left: 8px;
    }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    .quantumhire-filled {
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.5) !important;
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

// Display job preview
function displayJobPreview(jobData) {
  const preview = document.getElementById('quantumhire-job-preview');
  if (!preview) return;
  
  if (jobData.title && jobData.title !== 'Unknown Position') {
    preview.innerHTML = `
      <div class="quantumhire-job-title">${jobData.title}</div>
      <div class="quantumhire-job-company">${jobData.company}</div>
      ${jobData.location ? `<div class="quantumhire-job-location">📍 ${jobData.location}</div>` : ''}
    `;
    preview.dataset.job = JSON.stringify(jobData);
  } else {
    preview.innerHTML = `<div class="quantumhire-loading"><span>No job detected on this page</span></div>`;
  }
}

// Update progress display
function updateProgress(percent, text) {
  const progressSection = document.getElementById('quantumhire-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  
  if (progressSection) progressSection.classList.remove('hidden');
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (progressText) progressText.textContent = text;
}

// Setup panel events
function setupPanelEvents(panel) {
  // Minimize toggle
  panel.querySelector('.quantumhire-panel-minimize').addEventListener('click', () => {
    panel.classList.toggle('minimized');
    const btn = panel.querySelector('.quantumhire-panel-minimize');
    btn.textContent = panel.classList.contains('minimized') ? '+' : '−';
  });
  
  // Smart Apply button (Tailor + Fill + Upload)
  const applyBtn = panel.querySelector('#quantumhire-apply-btn');
  applyBtn?.addEventListener('click', async () => {
    const preview = document.getElementById('quantumhire-job-preview');
    const jobData = preview?.dataset.job ? JSON.parse(preview.dataset.job) : null;
    
    if (!jobData) {
      showToast('No job detected', 'error');
      return;
    }
    
    applyBtn.disabled = true;
    
    try {
      // Step 1: Tailoring
      updateProgress(20, 'Extracting job requirements...');
      await delay(300);
      
      updateProgress(40, 'Tailoring resume with AI...');
      
      const response = await chrome.runtime.sendMessage({
        action: 'getTailoredApplication',
        job: jobData,
      });
      
      if (response.error) throw new Error(response.error);
      
      updateProgress(70, 'Auto-filling application...');
      
      // Step 2: Auto-fill with tailored data
      const atsData = await chrome.storage.local.get(['atsCredentials']);
      const fillResult = await autofillForm(response, atsData.atsCredentials);
      
      updateProgress(90, 'Answering questions with AI...');
      await delay(500);
      
      updateProgress(100, 'Complete!');
      
      // Show results
      const tailoredContent = document.getElementById('quantumhire-tailored-content');
      tailoredContent.classList.remove('hidden');
      
      document.getElementById('quantumhire-resume').value = response.tailoredResume || '';
      document.getElementById('quantumhire-cover').value = response.tailoredCoverLetter || '';
      document.getElementById('match-score').textContent = `${response.matchScore || 0}%`;
      
      showToast(fillResult.message, 'success');
      
      setTimeout(() => {
        document.getElementById('quantumhire-progress').classList.add('hidden');
      }, 1500);
      
    } catch (error) {
      console.error('Smart apply error:', error);
      showToast(error.message || 'Failed to process', 'error');
      document.getElementById('quantumhire-progress').classList.add('hidden');
    } finally {
      applyBtn.disabled = false;
    }
  });
  
  // Quick Fill button (no tailoring)
  const fillBtn = panel.querySelector('#quantumhire-fill-btn');
  fillBtn?.addEventListener('click', async () => {
    fillBtn.disabled = true;
    fillBtn.textContent = '⏳ Filling...';
    
    const atsData = await chrome.storage.local.get(['atsCredentials']);
    const result = await autofillForm(null, atsData.atsCredentials, { skipQuestions: true });
    
    showToast(result.message, result.success ? 'success' : 'error');
    
    fillBtn.disabled = false;
    fillBtn.innerHTML = '<span>📝</span> Quick Fill (No Tailor)';
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
    btn.addEventListener('click', async () => {
      const textarea = document.getElementById(btn.dataset.target);
      await navigator.clipboard.writeText(textarea.value);
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy', 2000);
    });
  });
  
  // Download buttons
  panel.querySelectorAll('.quantumhire-download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const content = type === 'resume' 
        ? document.getElementById('quantumhire-resume').value
        : document.getElementById('quantumhire-cover').value;
      
      if (!content) {
        showToast('No content to download', 'error');
        return;
      }
      
      // Open print dialog
      const win = window.open('', '_blank');
      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${type === 'resume' ? 'Resume' : 'Cover Letter'}</title>
          <style>
            body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.5; max-width: 8.5in; margin: 0.5in auto; padding: 0.5in; }
            pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
          </style>
        </head>
        <body><pre>${escapeHtml(content)}</pre></body>
        </html>
      `);
      win.document.close();
      setTimeout(() => win.print(), 100);
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('QuantumHire AI: Received message', message);
  
  if (message.action === 'autofill') {
    autofillForm(message.tailoredData, message.atsCredentials, message.options || {})
      .then(sendResponse);
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

// Initialize
function initialize() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('linkedin.com') || hostname.includes('indeed.com')) {
    console.log('QuantumHire AI: Skipping job board');
    return;
  }
  
  const ats = detectATS();
  if (ats !== 'generic' || document.querySelector('input[type="file"], form input[type="text"]')) {
    console.log('QuantumHire AI: Job page detected, showing panel');
    setTimeout(createFloatingPanel, 1000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
