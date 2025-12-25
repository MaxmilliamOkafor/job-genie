// AutoApply AI - Content Script
// Handles form detection and auto-filling on job application pages

console.log('AutoApply AI: Content script loaded');

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

// ATS-specific selectors
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

// Detect which ATS we're on
function detectATS() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('greenhouse.io')) return 'greenhouse';
  if (hostname.includes('lever.co')) return 'lever';
  if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
  if (hostname.includes('ashbyhq.com')) return 'ashby';
  if (hostname.includes('icims.com')) return 'icims';
  if (hostname.includes('linkedin.com')) return 'linkedin';
  if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (hostname.includes('jobvite.com')) return 'jobvite';
  
  return 'generic';
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
    // By ID
    let element = document.getElementById(mapping);
    if (element) return element;
    
    // By name
    element = document.querySelector(`input[name="${mapping}"], textarea[name="${mapping}"], select[name="${mapping}"]`);
    if (element) return element;
    
    // By name contains
    element = document.querySelector(`input[name*="${mapping}"], textarea[name*="${mapping}"]`);
    if (element) return element;
    
    // By ID contains
    element = document.querySelector(`input[id*="${mapping}"], textarea[id*="${mapping}"]`);
    if (element) return element;
    
    // By placeholder
    element = document.querySelector(`input[placeholder*="${mapping}" i], textarea[placeholder*="${mapping}" i]`);
    if (element) return element;
    
    // By aria-label
    element = document.querySelector(`input[aria-label*="${mapping}" i], textarea[aria-label*="${mapping}" i]`);
    if (element) return element;
    
    // By associated label
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
  
  // Focus the element
  element.focus();
  
  // Clear existing value
  element.value = '';
  
  // Set the value
  element.value = value;
  
  // Trigger events to notify frameworks
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  
  // Blur to trigger validation
  element.blur();
  
  return true;
}

// Main autofill function
async function autofillForm() {
  console.log('AutoApply AI: Starting autofill...');
  
  // Get profile from storage
  const data = await chrome.storage.local.get(['userProfile']);
  const profile = data.userProfile;
  
  if (!profile) {
    console.log('AutoApply AI: No profile found');
    return { success: false, message: 'No profile found. Please connect your account first.' };
  }
  
  console.log('AutoApply AI: Profile loaded', profile);
  
  let filledCount = 0;
  
  // Map profile fields to form fields
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
    coverLetter: profile.cover_letter,
  };
  
  // Fill each field
  for (const [fieldType, value] of Object.entries(fieldValues)) {
    if (!value) continue;
    
    const element = findField(fieldType);
    if (element) {
      const filled = fillField(element, value);
      if (filled) {
        filledCount++;
        console.log(`AutoApply AI: Filled ${fieldType}`);
      }
    }
  }
  
  // Handle file uploads (resume) - just highlight them
  const resumeInputs = document.querySelectorAll('input[type="file"]');
  resumeInputs.forEach(input => {
    input.style.border = '3px solid #8b5cf6';
    input.style.borderRadius = '8px';
  });
  
  console.log(`AutoApply AI: Filled ${filledCount} fields`);
  
  return {
    success: filledCount > 0,
    fieldsCount: filledCount,
    message: filledCount > 0 ? `Successfully filled ${filledCount} fields` : 'No matching form fields found',
  };
}

// Create floating button
function createFloatingButton() {
  // Check if button already exists
  if (document.getElementById('autoapply-ai-button')) return;
  
  const button = document.createElement('div');
  button.id = 'autoapply-ai-button';
  button.innerHTML = '🚀 AutoFill';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 25px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
    z-index: 999999;
    transition: all 0.3s ease;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
    button.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.5)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.4)';
  });
  
  button.addEventListener('click', async () => {
    button.innerHTML = '⏳ Filling...';
    const result = await autofillForm();
    button.innerHTML = result.success ? '✅ Done!' : '❌ No fields';
    setTimeout(() => {
      button.innerHTML = '🚀 AutoFill';
    }, 2000);
  });
  
  document.body.appendChild(button);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autofill') {
    autofillForm().then(sendResponse);
    return true; // Keep channel open for async response
  }
});

// Check if auto-detect is enabled and create button
async function init() {
  const data = await chrome.storage.local.get(['userProfile']);
  if (data.userProfile) {
    // Wait for page to fully load
    if (document.readyState === 'complete') {
      createFloatingButton();
    } else {
      window.addEventListener('load', createFloatingButton);
    }
  }
}

// Initialize
init();

// Re-check on URL changes (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(init, 1000);
  }
}).observe(document.body, { subtree: true, childList: true });
