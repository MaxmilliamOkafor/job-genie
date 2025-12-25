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

// ============= AUTOMATION CONTROL STATE =============

let automationState = {
  speed: 1, // 1x, 1.5x, 2x, 3x
  isPaused: false,
  isRunning: false,
  shouldSkip: false,
  shouldQuit: false,
  currentJobIndex: 0,
  totalJobs: 0
};

// Speed delay multiplier (lower = faster)
function getDelayForSpeed() {
  const delays = { 1: 1000, 1.5: 666, 2: 500, 3: 333 };
  return delays[automationState.speed] || 1000;
}

// Wait with pause/skip/quit support
async function waitWithControls(ms) {
  const startTime = Date.now();
  while (Date.now() - startTime < ms) {
    if (automationState.shouldQuit) throw new Error('QUIT');
    if (automationState.shouldSkip) {
      automationState.shouldSkip = false;
      throw new Error('SKIP');
    }
    while (automationState.isPaused) {
      await new Promise(r => setTimeout(r, 100));
      if (automationState.shouldQuit) throw new Error('QUIT');
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

// ============= COMPREHENSIVE KNOCKOUT QUESTION ANSWER BANK =============
// Auto-answers optimized for ATS eligibility across ALL major platforms
// Greenhouse, Lever, Workday, iCIMS, Taleo, Ashby, SmartRecruiters, BambooHR, JazzHR

const KNOCKOUT_ANSWER_BANK = {
  // ============= WORK AUTHORIZATION (CRITICAL - ALWAYS PASS) =============
  'legal documentation.*identity.*eligibility|legally authorized|eligib.*employed|right to work|authorization to work|authorised to work': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'authorized.*work.*united states|authorized.*work.*us|work.*authorization.*us|legally.*work.*us|eligible.*work.*us|can you work.*us': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'authorized.*work.*canada|authorized.*work.*uk|authorized.*work.*europe|work.*authorization': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= VISA SPONSORSHIP (CRITICAL - ALWAYS NO) =============
  'require.*sponsorship|need.*sponsorship|sponsorship.*required|sponsor.*visa|visa.*sponsor|future.*sponsorship|now or.*future.*sponsor|employment.*sponsorship': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'sponsor.*h1b|h-1b.*sponsor|h1-b.*sponsor|need.*h1b|require.*h1b|tn.*visa|l1.*visa|o1.*visa': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'work.*without.*sponsorship|employment.*without.*sponsorship': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= AGE VERIFICATION (ALWAYS YES) =============
  'age 18|over 18|18 years|eighteen|at least 18|older than 18|minimum age|legal age|are you.*18|21 years|over 21|at least 21': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= BACKGROUND & DRUG SCREENING (ALWAYS YES) =============
  'background check|criminal background|background investigation|submit.*background|consent.*background|background screening|pre-employment.*background': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'drug screen|drug test|substance test|submit.*drug|pre-employment.*drug|toxicology|controlled substance': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'motor vehicle|mvr.*check|driving record.*check': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'credit check|credit history|financial background': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= DRIVER'S LICENSE (ALWAYS YES) =============
  'driver.*license|driving license|valid license|valid driver|possess.*license|current.*license|unrestricted.*license': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'good driving|driving history|driving record|clean driving|safe driving': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'own.*vehicle|reliable.*transportation|access.*vehicle|means.*transportation|personal.*transportation': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= RELOCATION & AVAILABILITY =============
  'willing.*relocate|open.*relocation|relocate.*position|able.*relocate|consider.*relocating|move.*location': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'available.*start|start date|earliest.*start|when.*start|how soon|soonest.*start|when.*begin': {
    answer: 'Immediately',
    selectValue: 'immediately',
    flag: false
  },
  'immediate.*start|start immediately|available immediately': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'notice period|current.*notice|weeks.*notice|days.*notice|resignation.*period': {
    answer: '2 weeks',
    flag: false
  },
  'currently employed|presently working|actively working': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= JOB FUNCTIONS & PHYSICAL REQUIREMENTS =============
  'essential functions|perform.*duties|physical requirements|able to perform|perform.*job|job.*functions': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'reasonable accommodation|disability accommodation|with or without.*accommodation|request.*accommodation': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'lift.*pounds|carry.*lbs|physical demands|standing.*hours|sitting.*hours|walk.*hours|bend.*lift|push.*pull': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'work.*environment|outdoor.*work|indoor.*work|office.*environment|warehouse.*environment|manufacturing.*environment': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= TRAVEL & SCHEDULE FLEXIBILITY =============
  'willing.*travel|travel.*required|travel.*percent|overnight.*travel|domestic.*travel|international.*travel|business.*travel': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'travel.*frequency|how much.*travel|percentage.*travel|amount.*travel': {
    answer: 'Up to 50%',
    flag: false
  },
  'work.*weekends|weekend.*availability|weekend.*work|saturday.*sunday': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'work.*shifts|shift.*work|rotating.*shifts|night.*shift|evening.*shift|flexible.*hours': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'overtime|extra.*hours|additional.*hours|extended.*hours': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'on-call|on call|standby|pager.*duty|after.*hours.*support': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'flexible.*schedule|flexible.*working|hybrid.*work|remote.*work|work.*from.*home': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'full-time|full time|permanent.*position|permanent.*role': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= PREVIOUS EMPLOYMENT =============
  'employed by.*llc|employed by.*company|worked.*before|previous.*employee|ever been employed|formerly employed|worked.*previously': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'referred by|employee referral|know anyone|current employee.*refer|referral.*source': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'applied.*before|previously.*applied|past.*application|former.*applicant': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'interview.*before|interviewed.*previously': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  
  // ============= LEGAL & AGREEMENTS =============
  'terms and conditions|agree.*terms|certification|certify|read and agree|responding.*yes.*certify|acknowledge|attestation': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'non-compete|non-disclosure|nda|confidentiality|confidential.*agreement|proprietary.*agreement': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'agree.*policy|accept.*terms|consent.*processing|consent.*data|privacy.*consent|gdpr.*consent': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'truthful.*information|accurate.*information|certify.*accurate|information.*true': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'at-will.*employment|at will.*employment|employment.*at-will': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= CRIMINAL HISTORY =============
  'convicted.*felony|criminal.*conviction|been convicted|pleaded guilty|pending.*charges|criminal.*record|arrest.*record': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'misdemeanor|criminal.*offense|criminal.*history': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  
  // ============= SECURITY CLEARANCE =============
  'security clearance|clearance.*level|active.*clearance|current.*clearance|secret.*clearance|top secret|ts/sci|public trust': {
    answerFromProfile: 'security_clearance',
    defaultAnswer: 'No, but willing to obtain',
    flag: false
  },
  'obtain.*clearance|eligible.*clearance|pass.*clearance|clearance.*investigation': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= EEO & DEMOGRAPHICS (Profile-based) =============
  'veteran status|military service|protected veteran|veteran.*self|served.*military|us.*veteran|armed forces': {
    answerFromProfile: 'veteran_status',
    defaultAnswer: 'I am not a protected veteran',
    selectValue: 'i am not a protected veteran',
    flag: false
  },
  'disability status|disabled|have.*disability|disability.*self|individual.*disability': {
    answerFromProfile: 'disability',
    defaultAnswer: 'I do not wish to answer',
    selectValue: 'i do not wish to answer',
    flag: false
  },
  'race|ethnicity|ethnic background|race.*ethnicity|racial.*identity': {
    answerFromProfile: 'race_ethnicity',
    defaultAnswer: 'Decline to self-identify',
    selectValue: 'decline',
    flag: false
  },
  'gender|sex|male.*female|gender.*identity': {
    answer: 'Prefer not to answer',
    selectValue: 'prefer not to answer',
    flag: false
  },
  'sexual orientation|lgbtq|lgbtqia': {
    answer: 'Prefer not to answer',
    selectValue: 'prefer not to answer',
    flag: false
  },
  
  // ============= GREENHOUSE SPECIFIC PATTERNS =============
  'are you legally.*18|confirm.*legal age|minimum.*working age': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'linkedin.*profile|linkedin url|linkedin.*url': {
    answerFromProfile: 'linkedin',
    flag: false
  },
  'github.*profile|github url|github.*url': {
    answerFromProfile: 'github',
    flag: false
  },
  'portfolio.*url|website.*url|personal.*website': {
    answerFromProfile: 'portfolio',
    flag: false
  },
  
  // ============= WORKDAY SPECIFIC PATTERNS =============
  'have you ever worked for|previously.*employed.*by|past.*employment.*with': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'current.*employment.*status|employment.*status|work.*status': {
    answer: 'Currently Employed',
    selectValue: 'employed',
    flag: false
  },
  
  // ============= LEVER SPECIFIC PATTERNS =============
  'how did you hear|where did you find|source.*application|how.*learn.*position': {
    answer: 'Company Website',
    selectValue: 'company website',
    flag: false
  },
  'why.*interested|interest.*role|interest.*position|attracted.*role': {
    answer: 'I am passionate about this opportunity and believe my skills align perfectly with the requirements.',
    flag: false
  },
  
  // ============= ICIMS SPECIFIC PATTERNS =============
  'shift.*preference|preferred.*shift|work.*schedule.*preference': {
    answer: 'Flexible/Any',
    selectValue: 'flexible',
    flag: false
  },
  
  // ============= TALEO SPECIFIC PATTERNS =============
  'country.*residence|residing.*country|current.*country': {
    answerFromProfile: 'country',
    defaultAnswer: 'United States',
    flag: false
  },
  
  // ============= EDUCATION VERIFICATION =============
  'highest.*degree|degree.*obtained|education.*level|completed.*degree|highest.*education': {
    answerFromProfile: 'highest_education',
    defaultAnswer: "Bachelor's Degree",
    flag: false
  },
  'bachelor.*degree|undergraduate.*degree|college.*degree|university.*degree': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'master.*degree|graduate.*degree|advanced.*degree|mba|ms degree|ma degree': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'gpa|grade point|academic.*average': {
    answer: '3.5',
    flag: false
  },
  
  // ============= CERTIFICATIONS & LICENSES =============
  'certification.*required|required.*certification|professional.*certification|industry.*certification': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'license.*required|professional.*license|state.*license': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= SKILLS & EXPERIENCE LEVEL =============
  'proficiency.*level|skill.*level|expertise.*level|experience.*level': {
    answer: 'Expert',
    selectValue: 'expert',
    flag: false
  },
  'years.*total.*experience|total.*years.*experience|overall.*experience': {
    answerFromProfile: 'total_experience',
    defaultAnswer: '8',
    flag: false
  },
  
  // ============= COMPENSATION & SALARY =============
  'salary.*expectation|expected.*salary|desired.*salary|salary.*requirement|compensation.*expectation|pay.*expectation|desired.*pay|pay.*range|salary.*range': {
    answerFromProfile: 'expected_salary',
    defaultAnswer: '$75,000 - $95,000',
    flag: false
  },
  'current.*salary|present.*salary|current.*compensation|base.*salary': {
    answerFromProfile: 'current_salary',
    defaultAnswer: 'Prefer not to disclose',
    flag: false
  },
  'hourly.*rate|rate.*per hour|hourly.*expectation': {
    answer: 'Negotiable based on total compensation',
    flag: false
  },
  'bonus.*eligible|variable.*compensation|commission': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  
  // ============= LANGUAGE REQUIREMENTS =============
  'english.*proficiency|speak.*english|english.*fluent|english.*language': {
    answer: 'Fluent/Native',
    selectValue: 'fluent',
    flag: false
  },
  'spanish.*proficiency|speak.*spanish|spanish.*language': {
    answer: 'Intermediate',
    selectValue: 'intermediate',
    flag: false
  },
  'language.*proficiency|fluent.*language|speak.*language': {
    answer: 'English (Fluent)',
    flag: false
  },
  
  // ============= CONTACT PREFERENCES =============
  'contact.*method|preferred.*contact|best way.*reach|how.*contact': {
    answer: 'Email',
    selectValue: 'email',
    flag: false
  },
  'best.*time.*call|call.*time|when.*call': {
    answer: 'Anytime during business hours',
    flag: false
  },
  
  // ============= ADDITIONAL COMMON PATTERNS =============
  'conflict.*interest|competing.*interest|outside.*employment': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'relative.*employee|family.*works|related.*anyone': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'government.*employee|public.*sector|federal.*employee': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'union.*member|belong.*union|represented.*union': {
    answer: 'No',
    selectValue: 'no',
    flag: false
  },
  'equipment.*use|tools.*own|required.*equipment|personal.*tools': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  },
  'computer.*proficient|technology.*skills|software.*skills': {
    answer: 'Yes',
    selectValue: 'yes',
    flag: false
  }
};

// Match knockout question with profile-aware answers
function matchKnockoutQuestion(questionText, userProfile = null) {
  const lowerQuestion = questionText.toLowerCase().trim();
  
  for (const [pattern, response] of Object.entries(KNOCKOUT_ANSWER_BANK)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(lowerQuestion)) {
      // Check if answer should come from profile
      if (response.answerFromProfile && userProfile) {
        const profileField = response.answerFromProfile;
        const profileValue = userProfile[profileField] || 
                            userProfile[profileField.replace(/_/g, '')] ||
                            userProfile[toCamelCase(profileField)];
        
        if (profileValue !== null && profileValue !== undefined && profileValue !== '') {
          // Map profile values to appropriate answers
          if (typeof profileValue === 'boolean') {
            return {
              answer: profileValue ? 'Yes' : 'No',
              selectValue: profileValue ? 'yes' : 'no',
              flag: response.flag
            };
          } else if (profileValue) {
            return {
              answer: String(profileValue),
              selectValue: String(profileValue).toLowerCase(),
              flag: response.flag
            };
          }
        }
        // Use default answer if profile value not available
        return {
          answer: response.defaultAnswer || response.answer || 'Yes',
          selectValue: (response.defaultAnswer || response.answer || 'yes').toLowerCase(),
          flag: response.flag
        };
      }
      return {
        answer: response.answer,
        selectValue: response.selectValue || (response.answer ? response.answer.toLowerCase() : 'yes'),
        flag: response.flag || false
      };
    }
  }
  return null;
}

// Helper to convert snake_case to camelCase
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

// Get years of experience for a skill from profile
function getExperienceYears(skillName, userProfile) {
  if (!userProfile?.skills) return 8; // Default to 8 years if unknown
  
  const skills = Array.isArray(userProfile.skills) ? userProfile.skills : [];
  const skillLower = skillName.toLowerCase();
  
  // Find matching skill
  const matchedSkill = skills.find(s => {
    const name = (s.name || s.skill || '').toLowerCase();
    return name.includes(skillLower) || skillLower.includes(name);
  });
  
  if (matchedSkill) {
    // Extract years from skill data
    if (matchedSkill.years) return matchedSkill.years;
    if (matchedSkill.experience) return matchedSkill.experience;
    
    // Map proficiency to years
    const proficiencyMap = { 'expert': 10, 'advanced': 7, 'intermediate': 4, 'beginner': 2 };
    if (matchedSkill.proficiency && proficiencyMap[matchedSkill.proficiency]) {
      return proficiencyMap[matchedSkill.proficiency];
    }
  }
  
  // Use total experience or default
  const totalExp = parseInt(userProfile.total_experience) || 8;
  return Math.min(totalExp, 8); // Cap at 8 or total experience
}

// Get salary answer based on job data and profile
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
    return currentSalary;
  }
  
  return '60,000 - 80,000'; // Reasonable default
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

// detectCaptcha removed - CAPTCHA handling disabled

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

async function getAIAnswers(questions, jobData, userProfile) {
  try {
    console.log('QuantumHire AI: Requesting AI answers for', questions.length, 'questions');
    
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
      jobDescription: jobData.description || '',
    });
    
    if (response?.error) {
      console.warn('QuantumHire AI: AI returned error:', response.error);
      showToast(`AI: ${response.error}`, 'warning');
    }
    
    console.log('QuantumHire AI: Received', response?.answers?.length || 0, 'AI answers');
    return response?.answers || [];
  } catch (error) {
    console.error('QuantumHire AI: AI answer error', error);
    showToast('AI answering unavailable, using smart defaults', 'info');
    return [];
  }
}

function fillQuestionsWithAnswers(questions, answers, jobData, userProfile) {
  const answerMap = new Map(answers.map(a => [a.id, a]));
  let filledCount = 0;
  const flaggedQuestions = [];
  const errors = [];
  
  for (const q of questions) {
    // First check knockout answer bank with profile data
    const knockoutMatch = matchKnockoutQuestion(q.label, userProfile);
    let answer = null;
    let selectValue = null;
    let shouldFlag = false;
    
    if (knockoutMatch) {
      answer = knockoutMatch.answer;
      selectValue = knockoutMatch.selectValue;
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
      if (q.label.toLowerCase().match(/salary|pay range|compensation|expected.*pay|desired pay|pay expectation/)) {
        answer = getSalaryAnswer(q.label, jobData, userProfile);
        console.log(`QuantumHire AI: Salary answer for "${q.label}" → "${answer}"`);
      }
      // Check for years of experience questions
      else if (q.label.toLowerCase().match(/years.*experience|how many years|experience.*years|years.*of/i)) {
        const skillMatch = q.label.match(/experience\s+(?:in|with|using)?\s*([a-zA-Z+#.\s]+)/i) ||
                          q.label.match(/years.*(?:of|in)?\s*([a-zA-Z+#.\s]+)\s*experience/i) ||
                          q.label.match(/([a-zA-Z+#.\s]+)\s*experience/i);
        
        if (skillMatch) {
          const skillName = skillMatch[1].trim();
          const years = getExperienceYears(skillName, userProfile);
          answer = String(years);
          console.log(`QuantumHire AI: Experience answer for "${skillName}" → ${years} years`);
        } else {
          answer = userProfile?.total_experience || '8';
          console.log(`QuantumHire AI: Default experience answer → ${answer} years`);
        }
      }
      // Check for LinkedIn URL
      else if (q.label.toLowerCase().match(/linkedin|linked.*in.*url|linkedin.*profile/)) {
        answer = userProfile?.linkedin || '';
      }
      // Check for GitHub URL
      else if (q.label.toLowerCase().match(/github|git.*hub.*url/)) {
        answer = userProfile?.github || '';
      }
      // Check for portfolio/website
      else if (q.label.toLowerCase().match(/portfolio|website|personal.*site/)) {
        answer = userProfile?.portfolio || '';
      }
      // Check for highest education
      else if (q.label.toLowerCase().match(/highest.*education|education.*level|degree.*obtained/)) {
        answer = userProfile?.highest_education || "Bachelor's Degree";
      }
      // Check for citizenship/nationality
      else if (q.label.toLowerCase().match(/citizenship|nationality|country.*citizen/)) {
        answer = userProfile?.citizenship || 'United States';
      }
      else {
        const answerObj = answerMap.get(q.id);
        if (answerObj?.answer) {
          answer = answerObj.answer;
        }
      }
    }
    
    if (!answer) continue;
    
    // Fill radio buttons
    if (q.type === 'radio' && q.elements) {
      let matched = false;
      for (const radio of q.elements) {
        const radioLabel = document.querySelector(`label[for="${radio.id}"]`);
        const radioText = (radioLabel?.innerText?.trim() || radio.value).toLowerCase();
        
        if (radioText.includes(String(answer).toLowerCase()) || 
            String(answer).toLowerCase().includes(radioText) ||
            (selectValue && radioText.includes(selectValue))) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          radio.dispatchEvent(new Event('input', { bubbles: true }));
          radio.dispatchEvent(new Event('click', { bubbles: true }));
          filledCount++;
          matched = true;
          console.log(`QuantumHire AI: Selected radio "${radioText}" for "${q.label}"`);
          break;
        }
      }
      if (!matched) {
        errors.push({ question: q.label, error: `No matching radio option for "${answer}"` });
      }
    } 
    // Fill select dropdowns
    else if (q.element && q.element.tagName === 'SELECT') {
      const options = Array.from(q.element.options);
      const answerLower = String(answer).toLowerCase();
      const selectValueLower = selectValue ? selectValue.toLowerCase() : answerLower;
      
      // First try exact match
      let match = options.find(o => {
        const optText = o.text.toLowerCase().trim();
        const optVal = o.value.toLowerCase().trim();
        return optText === selectValueLower || optVal === selectValueLower ||
               optText === answerLower || optVal === answerLower;
      });
      
      // Then try partial match
      if (!match) {
        match = options.find(o => {
          const optText = o.text.toLowerCase().trim();
          const optVal = o.value.toLowerCase().trim();
          return optText.includes(selectValueLower) || 
                 selectValueLower.includes(optText) ||
                 optVal.includes(selectValueLower) ||
                 optText.includes(answerLower) ||
                 answerLower.includes(optText);
        });
      }
      
      // For Yes/No dropdowns, try common variations
      if (!match && (answerLower === 'yes' || answerLower === 'no')) {
        match = options.find(o => {
          const optText = o.text.toLowerCase().trim();
          const optVal = o.value.toLowerCase().trim();
          if (answerLower === 'yes') {
            return optText === 'yes' || optVal === 'yes' || optVal === '1' || 
                   optVal === 'true' || optText === 'true';
          } else {
            return optText === 'no' || optVal === 'no' || optVal === '0' || 
                   optVal === 'false' || optText === 'false';
          }
        });
      }
      
      if (match && match.value !== '' && match.value !== 'select' && match.value !== 'Select...') {
        q.element.focus();
        q.element.click();
        q.element.value = match.value;
        q.element.dispatchEvent(new Event('change', { bubbles: true }));
        q.element.dispatchEvent(new Event('input', { bubbles: true }));
        q.element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        q.element.dispatchEvent(new Event('focusout', { bubbles: true }));
        
        console.log(`QuantumHire AI: Selected "${match.text}" for dropdown "${q.label}"`);
        q.element.classList.add('quantumhire-filled');
        filledCount++;
      } else {
        console.log(`QuantumHire AI: No match for dropdown "${q.label}" with answer "${answer}". Options:`, options.map(o => `${o.text}:${o.value}`));
        errors.push({ question: q.label, error: `No matching option for "${answer}"`, options: options.map(o => o.text) });
      }
    } 
    // Fill text inputs/textareas
    else if (q.element) {
      if (fillField(q.element, String(answer))) {
        q.element.classList.add('quantumhire-filled');
        filledCount++;
      } else {
        errors.push({ question: q.label, error: 'Failed to fill field' });
      }
    }
  }
  
  if (errors.length > 0) {
    console.log('QuantumHire AI: ⚠️ Fill errors:', errors);
  }
  
  if (flaggedQuestions.length > 0) {
    console.log('QuantumHire AI: ⚠️ Flagged questions requiring manual review:', flaggedQuestions);
    showToast(`⚠️ ${flaggedQuestions.length} question(s) flagged for review`, 'warning');
  }
  
  return { filledCount, flaggedQuestions, errors };
}

// ============= PDF GENERATION & FILE UPLOAD =============

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';

async function generatePDF(type, profileData, jobData, tailoredData) {
  console.log(`QuantumHire AI: Generating ${type} PDF...`);
  
  // Build filename in format: MaxOkafor_CV.pdf or MaxOkafor_CoverLetter.pdf
  const firstName = (profileData.first_name || 'User').replace(/\s+/g, '');
  const lastName = (profileData.last_name || '').replace(/\s+/g, '');
  const fileType = type === 'resume' ? 'CV' : 'CoverLetter';
  const fileName = `${firstName}${lastName}_${fileType}.pdf`;
  
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
      fileName: fileName
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

// Legacy fallback removed - PDF only uploads now

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
  
  // Store tailored data in state
  if (tailoredData) {
    applicationState.tailoredData = tailoredData;
  }
  
  // CAPTCHA detection removed - user handles manually
  
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
        } else {
          console.log('QuantumHire AI: Resume PDF not available for upload');
          showToast('⚠️ Resume PDF generation failed', 'warning');
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
        } else {
          console.log('QuantumHire AI: Cover letter PDF not available for upload');
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

// CAPTCHA Alert removed - user handles CAPTCHA manually

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
      
      <!-- AUTOMATION CONTROLS -->
      <div class="qh-automation-controls" id="qh-automation-controls">
        <div class="qh-speed-row">
          <span class="qh-speed-label">Speed:</span>
          <div class="qh-speed-buttons">
            <button class="qh-speed-btn active" data-speed="1">1x</button>
            <button class="qh-speed-btn" data-speed="1.5">1.5x</button>
            <button class="qh-speed-btn" data-speed="2">2x</button>
            <button class="qh-speed-btn" data-speed="3">3x</button>
          </div>
        </div>
        <div class="qh-control-row">
          <button class="qh-control-btn pause" id="qh-pause-btn">
            <span class="qh-ctrl-icon">⏸️</span> Pause
          </button>
          <button class="qh-control-btn skip" id="qh-skip-btn">
            <span class="qh-ctrl-icon">⏭️</span> Skip
          </button>
          <button class="qh-control-btn quit" id="qh-quit-btn">
            <span class="qh-ctrl-icon">⏹️</span> Quit
          </button>
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
        
        <button id="qh-validate-submit" class="qh-btn submit">
          <span class="qh-btn-icon">✅</span>
          <div class="qh-btn-content">
            <span class="qh-btn-title">Validate & Submit</span>
            <span class="qh-btn-subtitle">Check all fields, then submit</span>
          </div>
        </button>
      </div>
      
      <!-- Validation Results -->
      <div class="qh-validation hidden" id="qh-validation">
        <div class="qh-validation-header">📋 Form Validation</div>
        <div class="qh-validation-list" id="qh-validation-list"></div>
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
  setupAutomationControls(panel);
  
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
    
    /* Automation Controls */
    .qh-automation-controls { background: rgba(0,0,0,0.4); border-radius: 10px; padding: 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.1); }
    .qh-speed-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .qh-speed-label { font-size: 12px; color: #94a3b8; font-weight: 500; }
    .qh-speed-buttons { display: flex; gap: 4px; }
    .qh-speed-btn { padding: 6px 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 20px; color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer; }
    .qh-speed-btn:hover { background: rgba(255,255,255,0.15); color: #e2e8f0; }
    .qh-speed-btn.active { background: rgba(99,102,241,0.3); border-color: rgba(99,102,241,0.5); color: #a5b4fc; }
    .qh-control-row { display: flex; gap: 6px; }
    .qh-control-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 8px 10px; border: none; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; }
    .qh-control-btn.pause { background: rgba(251,191,36,0.2); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
    .qh-control-btn.pause.paused { background: rgba(16,185,129,0.2); color: #10b981; }
    .qh-control-btn.skip { background: rgba(148,163,184,0.2); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); }
    .qh-control-btn.quit { background: rgba(15,23,42,0.8); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); }
    .qh-control-btn.quit:hover { background: rgba(239,68,68,0.2); color: #ef4444; }
    .qh-btn.submit { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #fff; box-shadow: 0 4px 20px rgba(59,130,246,0.35); margin-top: 10px; }
    .qh-validation { background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px; margin-top: 12px; }
    .qh-validation-header { font-size: 12px; font-weight: 600; color: #a5b4fc; margin-bottom: 10px; }
    .qh-validation-list { display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto; }
    .qh-validation-error { padding: 8px 10px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; font-size: 11px; color: #fca5a5; cursor: pointer; }
    .qh-validation-success { padding: 10px; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 12px; color: #34d399; text-align: center; }
  `;
  document.head.appendChild(style);
}

// Setup automation control handlers
function setupAutomationControls(panel) {
  panel.querySelectorAll('.qh-speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.qh-speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      automationState.speed = parseFloat(btn.dataset.speed);
      showToast(`Speed: ${btn.dataset.speed}x`, 'info');
    });
  });
  
  panel.querySelector('#qh-pause-btn')?.addEventListener('click', () => {
    automationState.isPaused = !automationState.isPaused;
    const btn = panel.querySelector('#qh-pause-btn');
    btn.innerHTML = automationState.isPaused ? '<span class="qh-ctrl-icon">▶️</span> Resume' : '<span class="qh-ctrl-icon">⏸️</span> Pause';
    btn.classList.toggle('paused', automationState.isPaused);
    showToast(automationState.isPaused ? 'Paused' : 'Resumed', 'info');
  });
  
  panel.querySelector('#qh-skip-btn')?.addEventListener('click', () => { automationState.shouldSkip = true; showToast('Skipping...', 'info'); });
  panel.querySelector('#qh-quit-btn')?.addEventListener('click', () => { automationState.shouldQuit = true; showToast('Stopped', 'error'); });
  
  panel.querySelector('#qh-validate-submit')?.addEventListener('click', async () => {
    const statusEl = panel.querySelector('#qh-status');
    updateStatus(statusEl, '🔍', 'Validating...');
    const errors = [];
    document.querySelectorAll('[required]').forEach(f => {
      if (!f.value || f.value.trim() === '') errors.push({ field: findLabelForInput(f) || f.name, element: f });
    });
    const validationSection = panel.querySelector('#qh-validation');
    const validationList = panel.querySelector('#qh-validation-list');
    validationSection?.classList.remove('hidden');
    if (validationList) {
      validationList.innerHTML = errors.length === 0 
        ? '<div class="qh-validation-success">✅ All fields valid!</div>'
        : errors.map(e => `<div class="qh-validation-error">❌ ${e.field}: Required</div>`).join('');
    }
    updateStatus(statusEl, errors.length === 0 ? '✅' : '⚠️', errors.length === 0 ? 'Ready to submit' : `${errors.length} issues`);
  });
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
      
      updateStatus(statusEl, '✅', result.message);
      
      // Show results
      panel.querySelector('#qh-results').classList.remove('hidden');
      panel.querySelector('#qh-resume').value = tailoredData.tailoredResume || '';
      panel.querySelector('#qh-cover').value = tailoredData.tailoredCoverLetter || '';
      panel.querySelector('#qh-score').textContent = `${tailoredData.matchScore || 0}%`;
      
      showToast(result.message, 'success');
      
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
      automationState: automationState
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
  
  // Removed CAPTCHA detection - user handles manually
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
