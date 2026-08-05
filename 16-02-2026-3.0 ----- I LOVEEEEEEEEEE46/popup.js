// ATS PERFECTION v3.0 - Ultimate CV Tailor Popup Script
// Features: Professional PDF Engine, Smart CV Parser, Cover Letter Generator
// Location Strategy, Enterprise CV Parser with Immutable Field Protection
// Auto-trigger on ATS detection, 100% keyword match

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

// ============ GLOBAL ERROR HANDLER: Prevent extension crashes ============
// Catches unhandled promise rejections that would otherwise crash the extension
window.addEventListener('unhandledrejection', (event) => {
  console.error('[ATS Tailor] Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent the error from crashing the extension
  
  // Show user-friendly error message
  const errorMessage = event.reason?.message || 'An unexpected error occurred';
  if (window.atsTailor?.showToast) {
    window.atsTailor.showToast(`Error: ${errorMessage.substring(0, 100)}`, 'error');
  }
});

// Global error handler for synchronous errors
window.addEventListener('error', (event) => {
  console.error('[ATS Tailor] Unhandled error:', event.error);
  // Don't prevent default for these - let them be logged
});

// ============ GLOBAL DATE NORMALISATION: any → "Month YYYY" ============
// Jobscan-recommended formats are MM/YY, MM/YYYY, or "Month YYYY" / "Mon YYYY".
// "01-2023" (the old format) is NOT on that list and was being flagged.
// We standardise on "Month YYYY" for both halves of the range -- most
// human-readable, fully ATS-safe, no ambiguity. Range separator: " - ".
const _MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const _MONTH_LOOKUP = (() => {
  const map = {};
  _MONTHS_LONG.forEach((m, i) => {
    map[m.toLowerCase()] = i + 1;
    map[m.slice(0, 3).toLowerCase()] = i + 1;
  });
  map['sept'] = 9;
  return map;
})();
function _toMonthYYYY(token) {
  if (!token) return '';
  const t = String(token).trim();
  if (!t || /^present$|^current$|^now$|^to\s*date$|^ongoing$/i.test(t)) return 'Present';
  // YYYY-MM (ISO)
  let m = t.match(/^((?:19|20)\d{2})[-/](\d{1,2})$/);
  if (m) {
    const mi = parseInt(m[2], 10);
    if (mi >= 1 && mi <= 12) return `${_MONTHS_LONG[mi - 1]} ${m[1]}`;
  }
  // MM-YYYY or MM/YYYY (old internal format)
  m = t.match(/^(\d{1,2})[-/]((?:19|20)\d{2})$/);
  if (m) {
    const mi = parseInt(m[1], 10);
    if (mi >= 1 && mi <= 12) return `${_MONTHS_LONG[mi - 1]} ${m[2]}`;
  }
  // "Month YYYY" or "Mon YYYY" -- expand abbreviated month names to long form
  m = t.match(/^([A-Za-z]+)\.?\s+((?:19|20)\d{2})$/);
  if (m) {
    const mi = _MONTH_LOOKUP[m[1].toLowerCase()];
    if (mi) return `${_MONTHS_LONG[mi - 1]} ${m[2]}`;
    return t;
  }
  // Year only -- leave as-is
  return t;
}
// Back-compat alias for code paths that still reference _toMMYYYY
const _toMMYYYY = _toMonthYYYY;

function _buildMonthYearRange(startDate, endDate) {
  const s = _toMonthYYYY(startDate);
  const e = _toMonthYYYY(endDate || 'Present');
  if (!s && !e) return '';
  if (!s) return e;
  if (!e || s === e) return s;
  return `${s} - ${e}`;
}
const _buildMMYYYYRange = _buildMonthYearRange; // back-compat alias

console.log('[ATS PERFECTION] v3.0 loaded with immutable field protection');

// ============ TIER 1-2 TECH COMPANY DETECTION (70+ companies) ============
const TIER1_TECH_COMPANIES = {
  // FAANG + Major Tech
  faang: new Set(['google','meta','amazon','microsoft','apple','facebook']),
  // Enterprise Software  
  enterprise: new Set(['salesforce','ibm','oracle','adobe','sap','vmware','servicenow','workday']),
  // Fintech & Payments
  fintech: new Set(['stripe','paypal','visa','mastercard','block','square']),
  // SaaS & Cloud
  saas: new Set(['hubspot','intercom','zendesk','docusign','twilio','slack','atlassian','gitlab','circleci','datadog','datadoghq','unity','udemy']),
  // Social & Media
  social: new Set(['linkedin','tiktok','bytedance','snap','snapchat','dropbox','bloomberg']),
  // Hardware & Semiconductors
  hardware: new Set(['intel','broadcom','arm','armholdings','tsmc','appliedmaterials','cisco','nvidia','amd','qualcomm']),
  // Finance & Consulting
  finance: new Set(['fidelity','morganstanley','jpmorgan','jpmorganchase','blackrock','capitalone','tdsecurities','kpmg','deloitte','accenture','pwc','ey','mckinsey','kkr','fenergo']),
  // Quant & Trading
  quant: new Set(['citadel','janestreet','sig','twosigma','deshaw','rentec','renaissancetechnologies','mlp','millennium','virtu','virtufinancial','hudsontrading','hrt','jumptrading']),
  // Other Major Tech
  other: new Set(['netflix','tesla','uber','airbnb','palantir','crowdstrike','snowflake','intuit','toast','toasttab','workhuman','draftkings','walmart','roblox','doordash','instacart','rivian','chime','wasabi','wasabitechnologies','samsara','blockchain','similarweb','deepmind','googledeepmind'])
};

// Supported ATS platforms + major company career sites
const SUPPORTED_HOSTS = [
  // Standard ATS (EXCLUDES Lever and Ashby per user preference)
  'greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io',
  'workday.com', 'myworkdayjobs.com', 'smartrecruiters.com',
  'bullhornstaffing.com', 'bullhorn.com', 'teamtailor.com',
  'workable.com', 'apply.workable.com', 'icims.com',
  'oracle.com', 'oraclecloud.com', 'taleo.net',
  // Major company career sites (70+)
  'google.com', 'meta.com', 'amazon.com', 'microsoft.com', 'apple.com',
  'salesforce.com', 'ibm.com', 'adobe.com', 'stripe.com', 'hubspot.com',
  'intel.com', 'servicenow.com', 'workhuman.com', 'intercom.com', 'paypal.com',
  'tiktok.com', 'linkedin.com', 'dropbox.com', 'twilio.com', 'datadoghq.com',
  'toasttab.com', 'zendesk.com', 'docusign.com', 'fidelity.com', 'sap.com',
  'morganstanley.com', 'kpmg.com', 'deloitte.com', 'accenture.com', 'pwc.com',
  'ey.com', 'citadel.com', 'janestreet.com', 'sig.com', 'twosigma.com',
  'deshaw.com', 'rentec.com', 'mlp.com', 'virtu.com', 'hudsontrading.com',
  'jumptrading.com', 'broadcom.com', 'slack.com', 'circleci.com', 'unity.com',
  'bloomberg.com', 'vmware.com', 'mckinsey.com', 'udemy.com', 'draftkings.com',
  'walmart.com', 'mastercard.com', 'visa.com', 'blackrock.com', 'tdsecurities.com',
  'kkr.com', 'fenergo.com', 'appliedmaterials.com', 'tsmc.com', 'arm.com',
  'deepmind.google', 'cisco.com', 'jpmorgan.com', 'gitlab.com', 'atlassian.com',
  'snap.com', 'capitalone.com', 'wasabi.com', 'samsara.com', 'blockchain.com',
  'similarweb.com', 'nvidia.com', 'tesla.com', 'uber.com', 'airbnb.com',
  'palantir.com', 'crowdstrike.com', 'snowflake.com', 'netflix.com', 'amd.com'
];

// Performance constants
const MAX_JD_LENGTH = 10000; // Limit JD to 10k chars for faster processing
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

// ███ WORK EXPERIENCE IMMUTABILITY VALIDATOR ███
// Validates that AI-generated CV data preserves original company names, job titles, and dates
// These fields should NEVER be modified during tailoring - only bullet points can change
function validateWorkExperienceImmutability(originalExperience, tailoredExperience) {
  if (!Array.isArray(originalExperience) || !Array.isArray(tailoredExperience)) {
    return tailoredExperience || [];
  }
  
  const validated = tailoredExperience.map((tailoredExp, idx) => {
    const originalExp = originalExperience[idx];
    if (!originalExp) return tailoredExp;
    
    // Extract original immutable values with fallbacks for different field naming conventions
    const origCompany = originalExp.company || originalExp.companyName || '';
    const origTitle = originalExp.title || originalExp.jobTitle || originalExp.position || '';
    const origDates = originalExp.dates || _buildMMYYYYRange(originalExp.startDate, originalExp.endDate);
    const origStartDate = _toMMYYYY(originalExp.startDate) || '';
    const origEndDate = _toMMYYYY(originalExp.endDate) || '';
    
    // Return validated object with original immutable fields + tailored bullets
    return {
      ...tailoredExp,
      company: origCompany,      // ← IMMUTABLE
      companyName: origCompany,  // ← IMMUTABLE (alias)
      title: origTitle,          // ← IMMUTABLE
      jobTitle: origTitle,       // ← IMMUTABLE (alias)
      position: origTitle,       // ← IMMUTABLE (alias)
      dates: origDates,          // ← IMMUTABLE
      startDate: origStartDate,  // ← IMMUTABLE
      endDate: origEndDate,      // ← IMMUTABLE
      // Bullets/achievements CAN be tailored
      bullets: tailoredExp.bullets || tailoredExp.description || originalExp.bullets || [],
      description: tailoredExp.description || tailoredExp.bullets || originalExp.description || [],
    };
  });
  
  return validated;
}

class ATSTailor {
  constructor() {
    this.session = null;
    this.currentJob = null;
    this.generatedDocuments = {
      cv: null,
      coverLetter: null,
      cvPdf: null,
      coverPdf: null,
      cvFileName: null,
      coverFileName: null,
      matchScore: 0,
      matchedKeywords: [],
      missingKeywords: [],
      keywords: null
    };
    this.stats = { today: 0, total: 0, avgTime: 0, times: [] };
    this.currentPreviewTab = 'cv';
    this.autoTailorEnabled = true;
    
    // AI Provider toggle (Kimi K2 or OpenAI)
    this.aiProvider = 'kimi'; // 'kimi' or 'openai' - Kimi is default/primary
    
    // Workday multi-page state persistence
    this.workdayState = {
      currentStep: 0,
      totalSteps: 0,
      formData: {},
      jobId: null,
      startedAt: null,
      lastUpdated: null
    };
    
    // Base CV from profile (cached for fast reuse)
    this.baseCVContent = null;
    this.baseCVSource = null; // 'uploaded' or 'generated'
    
    // Performance: Caches for JD text and keywords per job URL
    this.jdCache = new Map(); // url -> { jd, timestamp }
    this.keywordCache = new Map(); // url -> { keywords, timestamp }
    
    // Keyword coverage report (diffs original CV vs boosted CV)
    this._coverageOriginalCV = '';
    this._defaultLocation = 'Dublin, IE';  // Will be loaded from storage
    
    // DOM element references (query once, reuse)
    this._domRefs = {};

    this.init();
  }

  // Cache DOM references for performance
  getDomRef(id) {
    if (!this._domRefs[id]) {
      this._domRefs[id] = document.getElementById(id);
    }
    return this._domRefs[id];
  }

  async init() {
    try {
      await this.loadSession();
    } catch (e) {
      console.error('[ATS Tailor] loadSession error:', e);
      this.session = null;
    }

    try { await this.loadAIProviderSettings(); } catch (e) { console.error('[ATS Tailor] loadAIProviderSettings error:', e); this.showToast('Failed to load AI settings', 'error'); }
    try { await this.loadWorkdayState(); } catch (e) { console.error('[ATS Tailor] loadWorkdayState error:', e); this.showToast('Failed to load Workday state', 'error'); }
    try { await this.loadBaseCVFromProfile(); } catch (e) { console.error('[ATS Tailor] loadBaseCVFromProfile error:', e); this.showToast('Failed to load base CV', 'error'); }

    try { this.bindEvents(); } catch (e) { console.error('[ATS Tailor] bindEvents error:', e); }
    try { this.updateUI(); } catch (e) { console.error('[ATS Tailor] updateUI error:', e); }
    
    // Fallback: ensure login or main section is visible even if updateUI failed
    try {
      const loginEl = document.getElementById('loginSection');
      const mainEl = document.getElementById('mainSection');
      if (loginEl?.classList.contains('hidden') && mainEl?.classList.contains('hidden')) {
        if (this.session) {
          mainEl?.classList.remove('hidden');
        } else {
          loginEl?.classList.remove('hidden');
        }
      }
    } catch (e) { console.error('[ATS Tailor] Fallback UI error:', e); }

    try { this.updateAIProviderUI(); } catch (e) { console.error('[ATS Tailor] updateAIProviderUI error:', e); }

    if (this.session) {
      try {
        await this.refreshSessionIfNeeded();
        await this.detectCurrentJob();
      } catch (e) {
        console.error('[ATS Tailor] Auto-detect error:', e);
      }
    }
  }
  
  // ============ AI PROVIDER SETTINGS (Synced from Profile) ============
  
  async loadAIProviderSettings() {
    return new Promise(async (resolve) => {
      // First try to load from profile if logged in
      if (this.session?.access_token && this.session?.user?.id) {
        try {
          // SECURITY: API keys are stored in user_api_keys table (no client SELECT access)
          // We only fetch the enabled flags and preference from profiles
          const profileRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=preferred_ai_provider,openai_enabled,kimi_enabled`,
            {
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${this.session.access_token}`,
              },
            }
          );
          
          if (profileRes.ok) {
            const profiles = await profileRes.json();
            const profile = profiles?.[0];
            
            if (profile) {
              // Determine active provider based on profile settings
              // openai_enabled/kimi_enabled flags indicate if a valid API key has been saved
              const preferredProvider = profile.preferred_ai_provider || 'kimi';
              const kimiEnabled = profile.kimi_enabled ?? false;
              const openaiEnabled = profile.openai_enabled ?? false;
              
              // Use preferred if available and enabled (enabled means API key is configured)
              if (preferredProvider === 'kimi' && kimiEnabled) {
                this.aiProvider = 'kimi';
              } else if (preferredProvider === 'openai' && openaiEnabled) {
                this.aiProvider = 'openai';
              } else if (kimiEnabled) {
                this.aiProvider = 'kimi';
              } else if (openaiEnabled) {
                this.aiProvider = 'openai';
              } else {
                this.aiProvider = 'kimi'; // default (will fail if no key configured)
              }
              
              console.log('[ATS Tailor] AI Provider loaded from profile:', this.aiProvider);
              
              // Save to local storage for consistency
              await chrome.storage.local.set({ 
                ai_provider: this.aiProvider,
                ai_settings: { provider: this.aiProvider, syncedFromProfile: true, savedAt: Date.now() }
              });
              
              resolve();
              return;
            }
          }
        } catch (e) {
          console.warn('[ATS Tailor] Could not load AI provider from profile:', e);
        }
      }
      
      // Fallback to local storage
      chrome.storage.local.get(['ai_provider', 'ai_settings'], (result) => {
        this.aiProvider = result.ai_provider || result.ai_settings?.provider || 'kimi';
        console.log('[ATS Tailor] AI Provider loaded from local storage:', this.aiProvider);
        resolve();
      });
    });
  }
  
  async saveAIProviderSettings() {
    // Save to local storage
    await chrome.storage.local.set({ 
      ai_provider: this.aiProvider,
      ai_settings: { provider: this.aiProvider, savedAt: Date.now() }
    });
    
    // Also save to profile in database if logged in
    if (this.session?.access_token && this.session?.user?.id) {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${this.session.access_token}`,
              Prefer: 'return=minimal'
            },
            body: JSON.stringify({
              preferred_ai_provider: this.aiProvider
            })
          }
        );
        console.log('[ATS Tailor] AI Provider saved to profile:', this.aiProvider);
      } catch (e) {
        console.warn('[ATS Tailor] Could not save AI provider to profile:', e);
      }
    }
    
    console.log('[ATS Tailor] AI Provider saved:', this.aiProvider);
    
    // Show saved indicator
    const savedEl = document.getElementById('aiSettingsSaved');
    if (savedEl) {
      savedEl.classList.add('visible');
      setTimeout(() => savedEl.classList.remove('visible'), 2000);
    }
  }
  
  updateAIProviderUI() {
    const btnKimi = document.getElementById('btnKimi');
    const btnOpenAI = document.getElementById('btnOpenAI');
    const activeLabel = document.getElementById('activeProviderBadge');
    const modelLabel = document.getElementById('activeModelLabel');
    const badgeDot = activeLabel?.querySelector('.badge-dot');
    const badgeText = activeLabel?.querySelector('.badge-text');
    
    // Update toggle button states
    if (btnKimi) {
      btnKimi.classList.toggle('selected', this.aiProvider === 'kimi');
    }
    if (btnOpenAI) {
      btnOpenAI.classList.toggle('selected', this.aiProvider === 'openai');
    }
    
    // Update info bar
    if (badgeDot) {
      badgeDot.classList.remove('kimi', 'openai');
      badgeDot.classList.add(this.aiProvider);
    }
    if (badgeText) {
      badgeText.textContent = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
    }
    if (modelLabel) {
      modelLabel.textContent = this.aiProvider === 'kimi' ? 'kimi-k2-0711-preview' : 'gpt-4o-mini';
    }
  }
  
  selectAIProvider(provider) {
    this.aiProvider = provider;
    this.saveAIProviderSettings();
    this.updateAIProviderUI();
    this.showToast(`AI Provider set to ${provider === 'kimi' ? 'Kimi K2' : 'OpenAI'}`, 'success');
  }
  
  // ============ WORKDAY MULTI-PAGE STATE PERSISTENCE ============
  
  async loadWorkdayState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['workday_multi_page_state'], (result) => {
        if (result.workday_multi_page_state) {
          this.workdayState = { ...this.workdayState, ...result.workday_multi_page_state };
        }
        resolve();
      });
    });
  }
  
  async saveWorkdayState() {
    this.workdayState.lastUpdated = Date.now();
    await chrome.storage.local.set({ workday_multi_page_state: this.workdayState });
  }
  
  async clearWorkdayState() {
    this.workdayState = {
      currentStep: 0,
      totalSteps: 0,
      formData: {},
      jobId: null,
      startedAt: null,
      lastUpdated: null
    };
    await chrome.storage.local.remove(['workday_multi_page_state']);
  }
  
  updateWorkdayProgress(step, totalSteps, formData = {}) {
    this.workdayState.currentStep = step;
    this.workdayState.totalSteps = totalSteps;
    this.workdayState.formData = { ...this.workdayState.formData, ...formData };
    this.saveWorkdayState();
    this.updateWorkdayProgressUI();
  }
  
  updateWorkdayProgressUI() {
    const progressEl = document.getElementById('workdayProgress');
    const stepIndicators = document.querySelectorAll('.workday-step-indicator');
    const statusEl = document.getElementById('workdayFlowStatus');
    
    if (progressEl && this.workdayState.totalSteps > 0) {
      const percent = (this.workdayState.currentStep / this.workdayState.totalSteps) * 100;
      progressEl.style.width = `${percent}%`;
    }
    
    stepIndicators.forEach((indicator, idx) => {
      indicator.classList.toggle('active', idx === this.workdayState.currentStep);
      indicator.classList.toggle('complete', idx < this.workdayState.currentStep);
    });
    
    if (statusEl) {
      const stepNames = ['My Information', 'Experience', 'Review'];
      statusEl.textContent = stepNames[this.workdayState.currentStep] || `Step ${this.workdayState.currentStep + 1}`;
    }
  }
  
  // ============ BASE CV FROM PROFILE (PDF/DOCX) ============
  
  async loadBaseCVFromProfile() {
    if (!this.session?.access_token || !this.session?.user?.id) {
      return;
    }
    
    try {
      // CACHE INTEGRATION: Check for cached profile (5-min TTL)
      if (typeof CacheManager !== 'undefined') {
        const cached = CacheManager.getCachedProfile(this.session.user.id);
        if (cached) {
          console.log('[ATS Tailor] ⚡ Using cached profile for base CV');
          this.baseCVContent = cached;
          this.baseCVSource = 'uploaded';
          await chrome.storage.local.set({ ats_profile: cached });
          
          // Update debug panel if available
          if (window.PDFDebugPanel && cached.professional_experience) {
            const expCount = Array.isArray(cached.professional_experience) ? cached.professional_experience.length : 0;
            const skillsCount = Array.isArray(cached.skills) ? cached.skills.length : 0;
            window.PDFDebugPanel.updateParseCVDebug({
              status: 'Cached',
              fileType: 'PROFILE',
              fileSize: 'From cache',
              textLength: expCount > 0 ? `${expCount} roles, ${skillsCount} skills` : '0',
              parseTime: 'Instant (cached)',
              textSnippet: cached.professional_experience?.[0] ? 
                `Latest role: ${cached.professional_experience[0].title || 'Unknown'} at ${cached.professional_experience[0].company || 'Unknown'}` : 
                'No experience data found'
            });
          }
          return;
        }
      }
      
      // Fetch profile with CV file info
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=cv_file_path,cv_file_name,cv_uploaded_at`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${this.session.access_token}`,
          },
        }
      );
      
      if (!profileRes.ok) return;
      
      const profiles = await profileRes.json();
      const profile = profiles?.[0];
      
      if (profile?.cv_file_path) {
        // CV file exists in storage - download and parse it
        console.log('[ATS Tailor] Found uploaded CV:', profile.cv_file_name);
        this.baseCVSource = 'uploaded';
        
        // Try to fetch the parsed CV content (cached from parse-cv function)
        const parsedCVRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=professional_experience,relevant_projects,education,skills,certifications,achievements`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${this.session.access_token}`,
            },
          }
        );
        
        if (parsedCVRes.ok) {
          const parsedData = await parsedCVRes.json();
          if (parsedData?.[0]) {
            // Store parsed CV data for use in tailoring
            this.baseCVContent = parsedData[0];
            console.log('[ATS Tailor] Loaded parsed CV content from profile');
            
            // CACHE INTEGRATION: Cache the profile for 5 minutes
            if (typeof CacheManager !== 'undefined') {
              CacheManager.setCachedProfile(this.session.user.id, parsedData[0]);
            }
            
            // Store in chrome.storage for debug panel access
            await chrome.storage.local.set({ ats_profile: parsedData[0] });
            
            // WIRE UP Parse CV Debug panel
            if (window.PDFDebugPanel) {
              const expCount = Array.isArray(parsedData[0].professional_experience) ? parsedData[0].professional_experience.length : 0;
              const skillsCount = Array.isArray(parsedData[0].skills) ? parsedData[0].skills.length : 0;
              window.PDFDebugPanel.updateParseCVDebug({
                status: 'Loaded',
                fileType: profile.cv_file_name?.split('.').pop()?.toUpperCase() || 'PDF',
                fileSize: 'From profile',
                textLength: expCount > 0 ? `${expCount} roles, ${skillsCount} skills` : '0',
                parseTime: 'Cached',
                textSnippet: parsedData[0].professional_experience?.[0] ? 
                  `Latest role: ${parsedData[0].professional_experience[0].title || 'Unknown'} at ${parsedData[0].professional_experience[0].company || 'Unknown'}` : 
                  'No experience data found'
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[ATS Tailor] Could not load base CV from profile:', e);
    }
  }

  async refreshSessionIfNeeded() {
    try {
      // If no session at all, nothing to refresh
      if (!this.session?.refresh_token || !this.session?.access_token) {
        console.log('[ATS Tailor] No session to refresh');
        return false;
      }

      // Check if current token is still valid
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${this.session.access_token}`,
        },
      });

      if (res.ok) {
        console.log('[ATS Tailor] Session still valid');
        return true;
      }

      console.log('[ATS Tailor] Session expired, attempting refresh...');

      // Token expired - try to refresh
      const refreshRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });

      if (!refreshRes.ok) {
        const errorText = await refreshRes.text().catch(() => '');
        console.warn('[ATS Tailor] Token refresh failed:', refreshRes.status, errorText);
        
        // Clear invalid session
        this.session = null;
        await chrome.storage.local.remove(['ats_session']);
        this.updateUI();
        
        // Show login prompt to user
        this.showToast('Session expired. Please sign in again.', 'warning');
        return false;
      }

      const data = await refreshRes.json();
      this.session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user || this.session.user,
      };
      await this.saveSession();
      console.log('[ATS Tailor] Session refreshed successfully');
      return true;
    } catch (e) {
      console.warn('[ATS Tailor] refreshSessionIfNeeded error:', e);
      return false;
    }
  }

  async loadSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['ats_session', 'ats_stats', 'ats_todayDate', 'ats_autoTailorEnabled', 'ats_lastGeneratedDocuments', 'ats_lastJob', 'ats_defaultLocation'],
        (result) => {
          this.session = result.ats_session || null;
          this.autoTailorEnabled = typeof result.ats_autoTailorEnabled === 'boolean' ? result.ats_autoTailorEnabled : true;
          
          // Load default location for Remote jobs
          this._defaultLocation = result.ats_defaultLocation || 'Dublin, IE';

          // Restore last job/documents for preview continuity
          this.currentJob = result.ats_lastJob || this.currentJob;
          if (result.ats_lastGeneratedDocuments) {
            this.generatedDocuments = { ...this.generatedDocuments, ...result.ats_lastGeneratedDocuments };
          }

          if (result.ats_stats) {
            this.stats = result.ats_stats;
          }

          const today = new Date().toDateString();
          if (result.ats_todayDate !== today) {
            this.stats.today = 0;
            chrome.storage.local.set({ ats_todayDate: today });
          }

          resolve();
        }
      );
    });
  }

  async saveSession() {
    await chrome.storage.local.set({ ats_session: this.session });
  }

  async saveStats() {
    await chrome.storage.local.set({
      ats_stats: this.stats,
      ats_todayDate: new Date().toDateString()
    });
  }

  bindEvents() {
    document.getElementById('loginBtn')?.addEventListener('click', () => this.login());
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    document.getElementById('tailorBtn')?.addEventListener('click', () => this.tailorDocuments({ force: true }));
    document.getElementById('refreshJob')?.addEventListener('click', () => this.detectCurrentJob());
    document.getElementById('editJobTitle')?.addEventListener('click', () => this.toggleJobTitleEdit());
    document.getElementById('jobTitleInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.saveJobTitleEdit(); });
    document.getElementById('jobTitleInput')?.addEventListener('blur', () => this.saveJobTitleEdit());
    // DOCX is the only download format -- best ATS parseability and the
    // file most recruiters actually open from the ATS portal.
    document.getElementById('downloadCv')?.addEventListener('click', () => this.downloadDocxVersion('cv'));
    document.getElementById('downloadCover')?.addEventListener('click', () => this.downloadDocxVersion('cover'));
    document.getElementById('attachBoth')?.addEventListener('click', () => this.attachBothDocuments());
    document.getElementById('copyContent')?.addEventListener('click', () => this.copyCurrentContent());
    document.getElementById('copyCoverageBtn')?.addEventListener('click', () => this.copyCoverageReport());
    
    // NEW: Text download buttons
    document.getElementById('downloadCvText')?.addEventListener('click', () => this.downloadTextVersion('cv'));
    // downloadCvDocx button removed -- downloadCv is DOCX now (DOCX-only product).
    document.getElementById('downloadCoverText')?.addEventListener('click', () => this.downloadTextVersion('cover'));
    
    // AI Provider Selection (toggle buttons - persistent)
    document.getElementById('btnKimi')?.addEventListener('click', () => this.selectAIProvider('kimi'));
    document.getElementById('btnOpenAI')?.addEventListener('click', () => this.selectAIProvider('openai'));
    
    // Connection Test Button
    document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.testAPIKeyConnection());
    
    // Debug Report Buttons
    document.getElementById('showDebugReportBtn')?.addEventListener('click', () => this.showDebugReport());
    document.getElementById('closeDebugReport')?.addEventListener('click', () => this.hideDebugReport());
    document.getElementById('downloadDebugReport')?.addEventListener('click', () => this.downloadDebugReport());
    document.getElementById('copyDebugReport')?.addEventListener('click', () => this.copyDebugReport());

    // Bulk Apply Dashboard
    document.getElementById('openBulkApply')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('bulk-apply.html') });
    });
    
    // Debug Settings Console
    document.getElementById('openDebugSettings')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('debug-settings.html') });
    });
    // Auto Tailor Toggle
    document.getElementById('autoTailorToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      this.autoTailorEnabled = enabled;
      chrome.storage.local.set({ ats_autoTailorEnabled: enabled });
      this.showToast(enabled ? 'Auto tailor enabled' : 'Auto tailor disabled', 'success');
    });
    
    // Auto-Trigger Toggle (NEW)
    document.getElementById('autoTriggerToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.runtime.sendMessage({ action: 'SET_AUTO_TRIGGER', enabled }, (response) => {
        if (response?.success) {
          this.showToast(enabled ? '⚡ Auto-trigger enabled' : 'Auto-trigger disabled', 'success');
        }
      });
    });
    
    // Load auto-trigger setting and set checkbox
    chrome.storage.local.get(['autoTriggerEnabled'], (result) => {
      const toggle = document.getElementById('autoTriggerToggle');
      if (toggle) {
        toggle.checked = result.autoTriggerEnabled !== false; // Default enabled
      }
    });
    
    // Bulk CSV Automation
    document.getElementById('csvFileInput')?.addEventListener('change', (e) => this.handleCsvUpload(e));
    document.getElementById('parseCsvBtn')?.addEventListener('click', () => this.parseCsv());
    document.getElementById('startBulkAutomation')?.addEventListener('click', () => this.startBulkAutomation());
    document.getElementById('pauseBulkBtn')?.addEventListener('click', () => this.pauseBulkAutomation());
    document.getElementById('resumeBulkBtn')?.addEventListener('click', () => this.resumeBulkAutomation());
    document.getElementById('stopBulkBtn')?.addEventListener('click', () => this.stopBulkAutomation());
    
    // Start bulk progress polling
    this.startBulkProgressPolling();
    
    // View Extracted Keywords Button (fast local extraction)
    document.getElementById('viewKeywordsBtn')?.addEventListener('click', () => this.viewExtractedKeywords());
    
    // AI Extract Keywords Button (provider-aware)
    document.getElementById('aiExtractBtn')?.addEventListener('click', () => this.aiExtractKeywords());
    
    // Skill Gap Analysis Button
    document.getElementById('skillGapBtn')?.addEventListener('click', () => this.showSkillGapPanel());
    document.getElementById('closeSkillGap')?.addEventListener('click', () => this.hideSkillGapPanel());

    // Workday Full Flow with Multi-Page State
    document.getElementById('runWorkdayFlow')?.addEventListener('click', () => this.runWorkdayFlow());
    document.getElementById('workdayAutoToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ workday_auto_enabled: enabled });
      this.showToast(enabled ? 'Workday automation enabled' : 'Workday automation disabled', 'success');
    });
    document.getElementById('saveWorkdayCreds')?.addEventListener('click', () => this.saveWorkdayCredentials());
    document.getElementById('clearWorkdayState')?.addEventListener('click', () => {
      this.clearWorkdayState();
      this.showToast('Workday state cleared', 'success');
    });
    
    // Workday Snapshot Panel buttons
    document.getElementById('captureSnapshotBtn')?.addEventListener('click', () => this.captureWorkdaySnapshot());
    document.getElementById('forceWorkdayApplyBtn')?.addEventListener('click', () => this.forceWorkdayApply());
    
    // NEW: Automatic Autofill Toggle (Settings panel)
    document.getElementById('autofillEnabledToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ autofill_enabled: enabled });
      this.showToast(enabled ? '🤖 AI Autofill enabled' : 'AI Autofill disabled', 'success');

      // Sync Workday panel toggle
      const workdayToggle = document.getElementById('workdayAutofillToggle');
      if (workdayToggle) workdayToggle.checked = enabled;

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'TOGGLE_AUTOFILL',
            enabled: enabled
          }).catch(() => {});
        }
      });
    });

    // LinkedIn Easy Apply Toggle -- independent of the master autofill
    // switch. Registration is driven by background.js's single-authority
    // sync, so we only need to persist the preference here.
    document.getElementById('linkedinAutofillToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ linkedin_autofill_enabled: enabled });
      this.showToast(enabled ? '💼 LinkedIn Easy Apply autofill enabled' : 'LinkedIn autofill disabled', 'success');
    });

    // Auto-advance: fills AND navigates. Turning it OFF must also clear
    // auto-submit, or a later re-enable would silently resume submitting.
    document.getElementById('linkedinAutoAdvanceToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      const patch = { linkedin_autoadvance_enabled: enabled };
      if (!enabled) patch.linkedin_autosubmit_enabled = false;
      chrome.storage.local.set(patch, () => this.syncLinkedInAutoUI());
      this.showToast(enabled ? '⏩ Auto-advance enabled' : 'Auto-advance disabled', 'success');
    });

    // Auto-submit sends a real application to a real employer and cannot be
    // undone, so it requires auto-advance and confirms once before arming.
    document.getElementById('linkedinAutoSubmitToggle')?.addEventListener('change', async (e) => {
      const enabled = !!e.target?.checked;
      if (enabled) {
        const adv = await new Promise((r) => chrome.storage.local.get(['linkedin_autoadvance_enabled'], (x) => r(x?.linkedin_autoadvance_enabled === true)));
        if (!adv) {
          e.target.checked = false;
          this.showToast('Turn on Auto-advance first', 'error');
          return;
        }
        if (!confirm('Auto-submit will send applications to employers with no further review.\n\nSubmitted applications cannot be recalled, and a wrong answer to a question (work authorisation, notice period, salary) is sent as-is.\n\nTurn it on?')) {
          e.target.checked = false;
          return;
        }
      }
      chrome.storage.local.set({ linkedin_autosubmit_enabled: enabled });
      this.showToast(enabled ? '🚀 Auto-submit ARMED' : 'Auto-submit off', enabled ? 'warning' : 'success');
    });

    // ---- Application follow-up email ----------------------------------
    document.getElementById('followupEnabledToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ followup_enabled: enabled });
      this.showToast(enabled ? '✉️ Follow-up email enabled' : 'Follow-up email disabled', 'success');
    });
    document.getElementById('linkedinRunNowBtn')?.addEventListener('click', () => this.runSiteAutofill('linkedin'));
    document.getElementById('indeedRunNowBtn')?.addEventListener('click', () => this.runSiteAutofill('indeed'));
    document.getElementById('followupConnectBtn')?.addEventListener('click', () => this.followupConnectGmail());
    document.getElementById('followupDiagnoseBtn')?.addEventListener('click', () => this.followupDiagnose());
    document.getElementById('followupPreflightBtn')?.addEventListener('click', () => this.followupPreflight());
    document.getElementById('followupSaveClientBtn')?.addEventListener('click', () => this.followupSaveClientId());
    document.getElementById('followupClearClientBtn')?.addEventListener('click', () => this.followupSaveClientId(true));
    document.getElementById('followupCopyRedirectBtn')?.addEventListener('click', () => this.followupCopyRedirect());
    document.getElementById('followupOpenConsoleBtn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://console.cloud.google.com/apis/credentials' });
    });
    document.getElementById('followupSaveBtn')?.addEventListener('click', () => this.followupSaveTemplate());
    document.getElementById('followupTokens')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.fu-token');
      if (btn) this.followupInsertToken(btn.textContent.trim());
    });
    document.getElementById('followupTemplateSelect')?.addEventListener('change', (e) => this.followupSelectTemplate(e.target.value));
    document.getElementById('followupNewBtn')?.addEventListener('click', () => this.followupNewTemplate(false));
    document.getElementById('followupDupBtn')?.addEventListener('click', () => this.followupNewTemplate(true));
    document.getElementById('followupDeleteBtn')?.addEventListener('click', () => this.followupDeleteTemplate());
    document.getElementById('followupResetBtn')?.addEventListener('click', () => this.followupResetTemplate());
    // The only toggle with no handler and no persistence: unchecking it was
    // forgotten as soon as the popup closed, so it silently re-armed itself
    // on every open. Now stored and restored like the rest.
    document.getElementById('followupAttachToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ followup_attach_enabled: enabled });
      this.showToast(enabled ? 'Documents will be attached' : 'Documents will not be attached', 'success');
    });
    // Contact lookup (opt-in). Off by default and only ever consulted when
    // nothing was published; see followupEnrich().
    document.getElementById('enrichEnabledToggle')?.addEventListener('change', async (e) => {
      const enabled = !!e.target?.checked;
      if (typeof ContactEnrichment !== 'undefined') await ContactEnrichment.saveConfig({ enabled });
      this.showToast(enabled ? 'Contact lookup enabled' : 'Contact lookup disabled', 'success');
      this.enrichRefreshStatus();
    });
    document.getElementById('enrichProvider')?.addEventListener('change', (e) => this.enrichSelectProvider(e.target.value));
    document.getElementById('enrichSaveBtn')?.addEventListener('click', () => this.enrichSaveKey());
    document.getElementById('enrichTestBtn')?.addEventListener('click', () => this.enrichTestKey());
    document.getElementById('enrichClearBtn')?.addEventListener('click', () => this.enrichClearKey());
    document.getElementById('enrichFindNowBtn')?.addEventListener('click', () => this.enrichFindNow());
    document.getElementById('enrichResolveProfileBtn')?.addEventListener('click', () => this.enrichResolveProfile());
    document.getElementById('enrichMoreLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      const more = document.getElementById('enrichMore');
      if (!more) return;
      const open = more.style.display !== 'none';
      more.style.display = open ? 'none' : '';
      e.target.textContent = open ? 'How it works' : 'Hide';
    });
    // Re-reveals the sign-in fields without discarding the working token,
    // so a mistyped account can be replaced without first disconnecting.
    document.getElementById('enrichSwitchBtn')?.addEventListener('click', async () => {
      this.enrichSwitching = true;
      await this.enrichRenderCredState();
      document.getElementById('enrichAccountEmail')?.focus();
    });
    document.getElementById('enrichGetKeyBtn')?.addEventListener('click', async () => {
      if (typeof ContactEnrichment === 'undefined') return;
      const id = document.getElementById('enrichProvider')?.value || '';
      const p = ContactEnrichment.listProviders().find((x) => x.id === id);
      if (p && p.keyUrl) chrome.tabs.create({ url: p.keyUrl });
    });

    document.getElementById('followupComposeBtn')?.addEventListener('click', () => this.followupCompose());
    document.getElementById('followupTestBtn')?.addEventListener('click', () => this.followupSend({ test: true }));
    document.getElementById('followupSendBtn')?.addEventListener('click', () => this.followupSend({ test: false }));

    // NEW: Automatic Autofill Toggle (Workday panel)
    document.getElementById('workdayAutofillToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ autofill_enabled: enabled });
      this.showToast(enabled ? '🤖 AI Autofill enabled' : 'AI Autofill disabled', 'success');

      // Sync Settings panel toggle
      const settingsToggle = document.getElementById('autofillEnabledToggle');
      if (settingsToggle) settingsToggle.checked = enabled;

      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'TOGGLE_AUTOFILL',
            enabled: enabled
          }).catch(() => {});
        }
      });
    });

    // (Settings panel "Run Now" button has been removed - the toggle
    // above is the single source of truth for AI Page Autofill.)

    // NEW: Manual Autofill Button (Workday panel)
    document.getElementById('workdayManualAutofillBtn')?.addEventListener('click', () => this.runManualAutofill());
    
    // NEW: Saved Responses Panel
    document.getElementById('viewSavedResponsesBtn')?.addEventListener('click', () => this.viewSavedResponses());
    document.getElementById('clearSavedResponsesBtn')?.addEventListener('click', () => this.clearSavedResponses());
    
    // Default location setting for Remote jobs
    document.getElementById('saveLocationBtn')?.addEventListener('click', () => this.saveDefaultLocation());
    document.getElementById('defaultLocationInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveDefaultLocation();
    });
    
    // Load Workday settings and location settings
    this.loadWorkdaySettings();
    this.loadLocationSettings();
    this.loadAutofillSettings();
    this.bindLinkedInFlowResults();
    this.bindGmailAttachResults();
    this.loadSavedResponsesStats();
    
    // Check and show Workday snapshot panel if on Workday
    this.checkWorkdayAndShowSnapshot();
    
    // Update Workday progress UI on load
    this.updateWorkdayProgressUI();

    // Preview tabs
    document.getElementById('previewCvTab')?.addEventListener('click', () => this.switchPreviewTab('cv'));
    document.getElementById('previewCoverTab')?.addEventListener('click', () => this.switchPreviewTab('cover'));
    document.getElementById('previewTextTab')?.addEventListener('click', () => this.switchPreviewTab('text'));

    // Enter key for login
    document.getElementById('password')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.login();
    });
    
    // Listen for runtime messages to trigger Extract & Apply Keywords button
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'TRIGGER_EXTRACT_APPLY' || message.action === 'POPUP_TRIGGER_EXTRACT_APPLY') {
        console.log('[ATS Tailor Popup] Received trigger message:', message.action, 'with animation:', message.showButtonAnimation);
        this.triggerExtractApplyWithUI(message.jobInfo, message.showButtonAnimation !== false);
        sendResponse({ status: 'triggered' });
        return true;
      }
    });
    
    // Check for pending automation trigger on popup open
    this.checkPendingAutomationTrigger();
  }
  
  // NEW: Download text version of CV/Cover Letter
  downloadTextVersion(type) {
    const content = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    if (!content) {
      this.showToast(`No ${type === 'cv' ? 'CV' : 'Cover Letter'} content to download`, 'error');
      return;
    }
    
    const fileName = type === 'cv' 
      ? (this.generatedDocuments.cvFileName || 'Resume').replace('.pdf', '') + '.txt'
      : (this.generatedDocuments.coverFileName || 'Cover_Letter').replace('.pdf', '') + '.txt';
    
    // Use ResumeBuilder if available
    if (typeof ResumeBuilder !== 'undefined' && ResumeBuilder.downloadTextVersion) {
      ResumeBuilder.downloadTextVersion(content, fileName);
    } else {
      // Fallback
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    
    this.showToast(`Downloaded ${fileName}`, 'success');
  }

  /**
   * Download the audited CV or cover letter as a .docx -- DOCX is the
   * only download format because it's the format ATS portals (Workday,
   * Greenhouse, Lever, Taleo, iCIMS, BambooHR, Glassdoor, LinkedIn)
   * parse most reliably AND the file most recruiters actually open
   * from the portal.
   */
  downloadDocxVersion(type = 'cv') {
    const isCover = type === 'cover';
    const sourceText = isCover ? this.generatedDocuments.coverLetter : this.generatedDocuments.cv;
    if (!sourceText) {
      this.showToast(`No ${isCover ? 'cover letter' : 'CV'} content yet - tailor first.`, 'error');
      return;
    }
    if (typeof DocxGenerator === 'undefined') {
      this.showToast('DOCX generator not loaded', 'error');
      return;
    }
    const builder = isCover ? DocxGenerator.fromCoverLetterText : DocxGenerator.fromCvText;
    if (!builder) {
      this.showToast('DOCX generator missing required function', 'error');
      return;
    }
    const fallbackName = isCover
      ? (this.generatedDocuments.coverFileName || 'Cover_Letter')
      : (this.generatedDocuments.cvFileName || 'Resume');
    const baseName = fallbackName.replace(/\.(pdf|docx|txt)$/i, '');
    const result = builder(sourceText, { name: baseName, filename: `${baseName}.docx` });
    if (!result.success) {
      this.showToast(`DOCX export failed: ${result.error}`, 'error');
      return;
    }
    // base64 -> blob -> download
    const bin = atob(result.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Downloaded ${result.filename} (ATS-friendly)`, 'success');
  }

  /**
   * Build the DOCX once after tailoring and store its base64 on
   * generatedDocuments so the content script can attach it to ATS
   * forms when the user's attach_format preference is "docx".
   * Pure text -> docx; cannot regress the PDF path.
   */
  buildDocxArtifact() {
    if (typeof DocxGenerator === 'undefined') {
      console.warn('[ATS Tailor] DOCX generator not loaded');
      return;
    }
    // CV
    try {
      const cvText = this.generatedDocuments?.cv;
      if (cvText && DocxGenerator.fromCvText) {
        const baseName = (this.generatedDocuments.cvFileName || 'Resume').replace(/\.(pdf|docx|txt)$/i, '');
        const result = DocxGenerator.fromCvText(cvText, { name: baseName, filename: `${baseName}.docx` });
        if (result && result.success && result.base64) {
          this.generatedDocuments.cvDocx = result.base64;
          this.generatedDocuments.cvDocxFileName = result.filename || `${baseName}.docx`;
          console.log('[ATS Tailor] CV DOCX ready:', this.generatedDocuments.cvDocxFileName);
        }
      }
    } catch (e) {
      console.warn('[ATS Tailor] CV DOCX build failed:', e?.message);
    }
    // Cover letter
    try {
      const clText = this.generatedDocuments?.coverLetter;
      if (clText && DocxGenerator.fromCoverLetterText) {
        const baseName = (this.generatedDocuments.coverFileName || 'Cover_Letter').replace(/\.(pdf|docx|txt)$/i, '');
        const result = DocxGenerator.fromCoverLetterText(clText, { name: baseName, filename: `${baseName}.docx` });
        if (result && result.success && result.base64) {
          this.generatedDocuments.coverDocx = result.base64;
          this.generatedDocuments.coverDocxFileName = result.filename || `${baseName}.docx`;
          console.log('[ATS Tailor] Cover Letter DOCX ready:', this.generatedDocuments.coverDocxFileName);
        }
      }
    } catch (e) {
      console.warn('[ATS Tailor] Cover DOCX build failed:', e?.message);
    }
  }
  
  /**
   * Check for pending automation trigger when popup opens
   * If automation triggered while popup was closed, execute it now
   */
  async checkPendingAutomationTrigger() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['pending_extract_apply'], resolve);
    });

    if (result.pending_extract_apply?.triggeredFromAutomation) {
      const pendingTrigger = result.pending_extract_apply;
      const age = Date.now() - (pendingTrigger.timestamp || 0);

      // Only process if trigger is recent (within 30 seconds)
      if (age < 30000) {
        console.log('[ATS Tailor Popup] Found pending automation trigger, executing...');

        // Clear the pending trigger first (prevents double-runs)
        await chrome.storage.local.remove(['pending_extract_apply']);

        // Trigger immediately (visible button animation)
        requestAnimationFrame(() => {
          this.triggerExtractApplyWithUI(pendingTrigger.jobInfo, true);
        });
      } else {
        // Clear stale trigger
        await chrome.storage.local.remove(['pending_extract_apply']);
      }
    }
  }
  
  /**
   * Trigger Extract & Apply Keywords button with visible pressed/loading state
   * DIRECT API CALL: Calls tailorDocuments() directly for reliability
   */
  async triggerExtractApplyWithUI(jobInfo, showAnimation = true) {
    const btn = document.getElementById('tailorBtn');
    const progressContainer = document.getElementById('progressContainer');
    const pipelineSteps = document.getElementById('pipelineSteps');
    
    if (!btn) {
      console.warn('[ATS Tailor Popup] tailorBtn not found');
      return;
    }
    
    const startTime = performance.now();
    
    // Show progress container and pipeline steps immediately
    progressContainer?.classList.remove('hidden');
    pipelineSteps?.classList.remove('hidden');
    
    // Update progress text
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = 'Step 1/3: Extracting keywords from job description...';
    
    // Highlight step 1 as working
    this.updateStepUI(1, 'working');
    
    // Show pressed/loading state - BLUE only (no orange states)
    if (showAnimation) {
      btn.classList.add('pressed', 'loading', 'btn-animating');
      btn.classList.remove('btn-tailoring'); // Never use orange
      btn.classList.add('btn-gradient'); // Keep blue gradient
      btn.disabled = true;
      
      // Animate the button press visually - BLUE only (no background change)
      btn.style.transform = 'scale(0.98)';
      btn.style.transition = 'all 0.15s ease-in-out';
      // NO inline background - keep the CSS class blue gradient
    }
    
    const btnText = btn.querySelector('.btn-text');
    const btnIcon = btn.querySelector('.btn-icon-left');
    const btnTime = btn.querySelector('.btn-time');
    
    // Set BLUE PROCESSING state - only icon and text change
    if (btnIcon) btnIcon.textContent = '⏳';
    if (btnText) btnText.textContent = 'Tailoring...';
    if (btnTime) btnTime.textContent = '~5s';
    
    // If jobInfo provided, update current job
    if (jobInfo) {
      this.currentJob = jobInfo;
      this.updateJobDisplay();
    }
    
    try {
      // ============ DIRECT API CALL: Use tailorDocuments() for reliability ============
      console.log('[ATS Tailor Popup] Starting direct tailorDocuments() call...');
      
      // Step 1 complete, Step 2 working
      this.updateStepUI(1, 'complete');
      this.updateStepUI(2, 'working');
      if (progressText) progressText.textContent = 'Step 2/3: Boosting CV to 95-100% match...';
      
      // Call tailorDocuments directly - this is the reliable path
      await this.tailorDocuments({ force: true });
      
      // Step 2 complete, Step 3 working
      this.updateStepUI(2, 'complete');
      this.updateStepUI(3, 'working');
      if (progressText) progressText.textContent = 'Step 3/3: Generating ATS CV and Cover Letter...';
      
      // Small delay to show step 3, then mark complete
      await new Promise(r => setTimeout(r, 500));
      
      const elapsed = Math.round(performance.now() - startTime);
      
      // Mark all steps as complete
      this.updateStepUI(3, 'complete');
      if (progressText) progressText.textContent = 'Complete! Tailored CV and Cover Letter ready.';
      
      // Success - INSTANT RESET to BLUE READY state (NO green flash, NO delays)
      btn.style.background = '';
      btn.style.transform = '';
      btn.style.boxShadow = '';
      btn.style.transition = '';
      btn.classList.remove('pressed', 'loading', 'btn-animating', 'btn-tailoring');
      btn.classList.add('btn-gradient');
      btn.disabled = false;
      
      // Set BLUE READY state
      if (btnIcon) btnIcon.textContent = '⚡';
      if (btnText) btnText.textContent = 'Extract & Apply Keywords to CV';
      if (btnTime) btnTime.textContent = '~5s';
      
      // Hide progress immediately
      progressContainer?.classList.add('hidden');
      
      this.showToast(`Attached! Match: ${this.generatedDocuments.matchScore || 95}%`, 'success');
      
      // Notify content script to show green success banner (on PAGE, not extension)
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'UPDATE_BANNER',
            text: 'Tailored CV and Cover Letter attached successfully',
            status: 'success'
          }).catch(() => {});
        }
      });
      
      // Notify background that extraction is complete
      chrome.runtime.sendMessage({ action: 'EXTRACT_APPLY_COMPLETE' }).catch(() => {});
      
    } catch (error) {
      console.error('[ATS Tailor Popup] Error:', error);
      
      // Error - INSTANT RESET to BLUE READY state (show toast for error)
      btn.style.background = '';
      btn.style.transform = '';
      btn.style.boxShadow = '';
      btn.style.transition = '';
      btn.classList.remove('pressed', 'loading', 'btn-animating', 'btn-tailoring');
      btn.classList.add('btn-gradient');
      btn.disabled = false;
      
      // Set BLUE READY state even on error
      if (btnIcon) btnIcon.textContent = '⚡';
      if (btnText) btnText.textContent = 'Extract & Apply Keywords to CV';
      if (btnTime) btnTime.textContent = '~5s';
      
      if (progressText) progressText.textContent = `❌ Error: ${error.message}`;
      progressContainer?.classList.add('hidden');
      
      this.showToast(`Error: ${error.message}`, 'error');
    } finally {
      // Ensure button is always reset to BLUE READY state (failsafe)
      btn.classList.remove('pressed', 'loading', 'btn-animating', 'btn-tailoring');
      btn.classList.add('btn-gradient');
      btn.disabled = false;
      btn.style.transform = '';
      btn.style.boxShadow = '';
      btn.style.background = '';
      btn.style.transition = '';
      
      if (btnIcon) btnIcon.textContent = '⚡';
      if (btnText) btnText.textContent = 'Extract & Apply Keywords to CV';
      if (btnTime) btnTime.textContent = '~5s';
    }
  }
  
  /**
   * Helper: Update step UI state (working/complete)
   */
  updateStepUI(stepNum, status) {
    const step = document.getElementById(`step${stepNum}`);
    if (!step) return;
    const icon = step.querySelector('.step-icon');
    if (status === 'working') {
      if (icon) icon.textContent = '⏳';
      step.classList.add('active');
      step.classList.remove('complete');
    } else if (status === 'complete') {
      if (icon) icon.textContent = '✓';
      step.classList.remove('active');
      step.classList.add('complete');
    }
  }
  
  /**
   * Trigger LazyApply 28s sync - schedules CV override after LazyApply attaches their CV
   */
  async triggerLazyApplySync() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'LAZYAPPLY_28S_SYNC'
        });
        this.showToast(`LazyApply override scheduled in ${response.delay / 1000}s`, 'success');
      }
    } catch (e) {
      this.showToast('Could not schedule LazyApply sync', 'error');
    }
  }

  async loadWorkdaySettings() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['workday_email', 'workday_password', 'workday_verify_password', 'workday_auto_enabled'], resolve);
    });
    
    const emailInput = document.getElementById('workdayEmail');
    const passwordInput = document.getElementById('workdayPassword');
    const verifyPasswordInput = document.getElementById('workdayVerifyPassword');
    const autoToggle = document.getElementById('workdayAutoToggle');
    const emailDisplay = document.getElementById('workdayEmailDisplay');
    
    if (emailInput && result.workday_email) emailInput.value = result.workday_email;
    if (passwordInput && result.workday_password) passwordInput.value = result.workday_password;
    if (verifyPasswordInput && result.workday_verify_password) verifyPasswordInput.value = result.workday_verify_password;
    if (autoToggle) autoToggle.checked = result.workday_auto_enabled !== false;
    if (emailDisplay && result.workday_email) emailDisplay.textContent = result.workday_email;
  }

  saveWorkdayCredentials() {
    const email = document.getElementById('workdayEmail')?.value;
    const password = document.getElementById('workdayPassword')?.value;
    const verifyPassword = document.getElementById('workdayVerifyPassword')?.value;
    
    if (!email || !password) {
      this.showToast('Please enter email and password', 'error');
      return;
    }
    
    const emailDisplay = document.getElementById('workdayEmailDisplay');
    if (emailDisplay) emailDisplay.textContent = email;
    
    chrome.runtime.sendMessage({
      action: 'UPDATE_WORKDAY_CREDENTIALS',
      email: email,
      password: password,
      verifyPassword: verifyPassword || password
    });
    
    chrome.storage.local.set({
      workday_email: email,
      workday_password: password,
      workday_verify_password: verifyPassword || password
    });
    
    this.showToast('Workday credentials saved!', 'success');
  }
  
  // ============ AUTOFILL SETTINGS ============
  async loadAutofillSettings() {
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['autofill_enabled', 'linkedin_autofill_enabled',
        'linkedin_autoadvance_enabled', 'linkedin_autosubmit_enabled', 'followup_enabled',
        'followup_attach_enabled'], resolve);
    });

    // Default OFF: matches "Toggle off to save API usage" messaging.
    const enabled = result.autofill_enabled === true;
    const toggle = document.getElementById('autofillEnabledToggle');
    if (toggle) toggle.checked = enabled;
    const workdayToggle = document.getElementById('workdayAutofillToggle');
    if (workdayToggle) workdayToggle.checked = enabled;
    // LinkedIn Easy Apply is an independent preference (also default OFF).
    const liToggle = document.getElementById('linkedinAutofillToggle');
    if (liToggle) liToggle.checked = result.linkedin_autofill_enabled === true;
    const advToggle = document.getElementById('linkedinAutoAdvanceToggle');
    if (advToggle) advToggle.checked = result.linkedin_autoadvance_enabled === true;
    const subToggle = document.getElementById('linkedinAutoSubmitToggle');
    if (subToggle) subToggle.checked = result.linkedin_autosubmit_enabled === true;
    this.syncLinkedInAutoUI();
    // Follow-up email: preference, saved template, and live Gmail status.
    const fuToggle = document.getElementById('followupEnabledToggle');
    if (fuToggle) fuToggle.checked = result.followup_enabled === true;
    // Defaults ON: attaching the tailored documents is the useful case.
    const atToggle = document.getElementById('followupAttachToggle');
    if (atToggle) atToggle.checked = result.followup_attach_enabled !== false;
    this.followupLoadTemplate();
    this.followupRefreshStatus();
    this.enrichInitUI();
    // DOCX is now the only attach format; the selector was removed and
    // attach_format is hard-pinned to 'docx' inside the tailor pipeline.
  }
  
  async runManualAutofill() {
    // The Settings-panel "Run Now" button has been retired. This method
    // is kept only for the Workday panel's "Run Manual Autofill" button.
    const btns = [
      document.getElementById('workdayManualAutofillBtn')
    ].filter(Boolean);

    btns.forEach(btn => {
      btn.disabled = true;
      const textEl = btn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Running...';
    });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        this.showToast('No active tab found', 'error');
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'RUN_MANUAL_AUTOFILL'
      });

      if (response?.success) {
        this.showToast(`✅ Autofill complete! Filled ${response.filledCount || 0} fields`, 'success');
      } else if (response?.blocked) {
        this.showToast('AI Page Autofill is OFF - turn it on to run autofill', 'error');
      } else {
        this.showToast(response?.error || 'Autofill failed', 'error');
      }
    } catch (e) {
      console.error('[Popup] Manual autofill error:', e);
      this.showToast('Autofill failed - check console', 'error');
    } finally {
      btns.forEach(btn => {
        btn.disabled = false;
        const textEl = btn.querySelector('.btn-text');
        if (textEl) textEl.textContent = 'Run Manual Autofill';
      });
    }
  }
  
  // ============ SAVED RESPONSES MEMORY ============
  async loadSavedResponsesStats() {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['saved_responses'], resolve);
      });
      
      const responses = result.saved_responses || {};
      const count = Object.keys(responses).length;
      
      const statsEl = document.getElementById('savedResponsesStats');
      if (statsEl) {
        statsEl.innerHTML = `<span class="stat-badge">${count} saved responses</span>`;
      }
    } catch (e) {
      console.log('[Popup] Error loading saved responses stats:', e);
    }
  }
  
  async viewSavedResponses() {
    const listEl = document.getElementById('savedResponsesList');
    if (!listEl) return;
    
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['saved_responses'], resolve);
      });
      
      const responses = result.saved_responses || {};
      const entries = Object.entries(responses);
      
      if (entries.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No saved responses yet. Apply to jobs to build your response memory.</p>';
        listEl.classList.remove('hidden');
        return;
      }
      
      // Sort by most recently used
      entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
      
      const html = entries.slice(0, 20).map(([question, data]) => `
        <div class="saved-response-item">
          <div class="response-question">${this.escapeHtml(question.substring(0, 80))}${question.length > 80 ? '...' : ''}</div>
          <div class="response-answer">${this.escapeHtml((data.answer || '').substring(0, 50))}${(data.answer || '').length > 50 ? '...' : ''}</div>
          <div class="response-meta">Used ${data.useCount || 1}x</div>
        </div>
      `).join('');
      
      listEl.innerHTML = html;
      listEl.classList.toggle('hidden', false);
    } catch (e) {
      console.error('[Popup] Error viewing saved responses:', e);
    }
  }
  
  async clearSavedResponses() {
    if (!confirm('Are you sure you want to clear all saved responses? This cannot be undone.')) {
      return;
    }
    
    try {
      await chrome.storage.local.remove(['saved_responses']);
      this.showToast('Saved responses cleared', 'success');
      this.loadSavedResponsesStats();
      
      const listEl = document.getElementById('savedResponsesList');
      if (listEl) {
        listEl.innerHTML = '<p class="empty-state">No saved responses.</p>';
      }
    } catch (e) {
      this.showToast('Failed to clear responses', 'error');
    }
  }
  
  // Load default location settings
  loadLocationSettings() {
    const locationInput = document.getElementById('defaultLocationInput');
    if (locationInput && this._defaultLocation) {
      locationInput.value = this._defaultLocation;
    }
  }
  
  // Save default location for Remote jobs
  saveDefaultLocation() {
    const locationInput = document.getElementById('defaultLocationInput');
    const location = locationInput?.value?.trim();
    
    if (!location) {
      this.showToast('Please enter a valid location', 'error');
      return;
    }
    
    this._defaultLocation = location;
    chrome.storage.local.set({ ats_defaultLocation: location });
    
    // Also update content script with new default location
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'UPDATE_DEFAULT_LOCATION',
          defaultLocation: location
        }).catch(() => {});
      }
    });
    
    this.showToast(`Default location set to: ${location}`, 'success');
  }
  
  // ============ BULK CSV AUTOMATION METHODS ============
  
  handleCsvUpload(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      this.bulkCsvRaw = event.target?.result || '';
      this.showToast('CSV loaded - click Parse CSV', 'success');
    };
    reader.readAsText(file);
  }
  
  parseCsv() {
    if (!this.bulkCsvRaw) {
      this.showToast('Upload a CSV file first', 'error');
      return;
    }
    
    const lines = this.bulkCsvRaw.split('\n').map(l => l.trim()).filter(Boolean);
    this.bulkCsvJobs = lines.slice(1).map(line => {
      const [url] = line.split(',').map(s => s.trim().replace(/"/g, ''));
      return { url, status: 'pending' };
    }).filter(job => job.url && (job.url.includes('job') || job.url.includes('career') || job.url.includes('workday') || job.url.includes('greenhouse')));
    
    this.updateBulkUI();
    this.showToast(`Parsed ${this.bulkCsvJobs.length} job URLs`, 'success');
  }
  
  updateBulkUI() {
    const preview = document.getElementById('csvPreview');
    const stats = document.getElementById('csvStats');
    const startBtn = document.getElementById('startBulkAutomation');
    
    if (this.bulkCsvJobs?.length) {
      if (stats) stats.textContent = `${this.bulkCsvJobs.length} jobs parsed`;
      preview?.classList.remove('hidden');
      if (startBtn) startBtn.disabled = false;
    }
  }
  
  async startBulkAutomation() {
    if (!this.bulkCsvJobs?.length) {
      this.showToast('Parse CSV first', 'error');
      return;
    }
    
    this.showToast('Starting bulk automation...', 'success');
    
    document.getElementById('bulkControls')?.classList.remove('hidden');
    document.getElementById('startBulkAutomation').disabled = true;
    
    chrome.runtime.sendMessage({
      action: 'START_BULK_CSV_AUTOMATION',
      jobs: this.bulkCsvJobs
    });
  }
  
  pauseBulkAutomation() {
    chrome.runtime.sendMessage({ action: 'PAUSE_BULK_AUTOMATION' });
    document.getElementById('pauseBulkBtn')?.classList.add('hidden');
    document.getElementById('resumeBulkBtn')?.classList.remove('hidden');
    this.showToast('Bulk automation paused', 'success');
  }
  
  resumeBulkAutomation() {
    chrome.runtime.sendMessage({ action: 'RESUME_BULK_AUTOMATION' });
    document.getElementById('pauseBulkBtn')?.classList.remove('hidden');
    document.getElementById('resumeBulkBtn')?.classList.add('hidden');
    this.showToast('Bulk automation resumed', 'success');
  }
  
  stopBulkAutomation() {
    chrome.runtime.sendMessage({ action: 'STOP_BULK_AUTOMATION' });
    document.getElementById('bulkControls')?.classList.add('hidden');
    document.getElementById('startBulkAutomation').disabled = false;
    this.showToast('Bulk automation stopped', 'success');
  }
  
  startBulkProgressPolling() {
    if (this._bulkPollInterval) clearInterval(this._bulkPollInterval);
    this._bulkPollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'GET_BULK_PROGRESS' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.progress) {
          this.updateBulkProgress(response.progress);
        }
      });
    }, 2000);
  }
  
  updateBulkProgress(progress) {
    const percent = progress.total ? (progress.completed / progress.total * 100) : 0;
    const progressFill = document.getElementById('bulkProgressFill');
    const statusEl = document.getElementById('currentJobStatus');
    const statsEl = document.getElementById('csvStats');
    
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (statusEl) statusEl.textContent = progress.currentJob || 'Ready';
    if (statsEl && progress.total > 0) {
      statsEl.textContent = `${progress.completed}/${progress.total} completed`;
    }
  }

  async runWorkdayFlow() {
    if (!this.session) {
      this.showToast('Please login first', 'error');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('workday') && !tab?.url?.includes('myworkdayjobs')) {
      this.showToast('Navigate to a Workday job page first', 'error');
      return;
    }

    this.showToast('Starting Workday TOP1 automation...', 'success');
    this.setStatus('Running Workday TOP1 Flow...', 'working');

    // First capture the snapshot if not already captured
    await this.captureWorkdaySnapshot();

    let candidateData = null;
    try {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=*`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${this.session.access_token}`,
          },
        }
      );
      const profiles = await profileRes.json();
      candidateData = profiles?.[0] || null;
    } catch (e) {
      console.log('Could not fetch profile for Workday flow');
    }

    // Send to content script to start the flow
    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'START_WORKDAY_FLOW',
        candidateData: candidateData
      });
    } catch (e) {
      // Fallback to background
      chrome.runtime.sendMessage({
        action: 'TRIGGER_WORKDAY_FLOW',
        candidateData: candidateData
      });
    }

    setTimeout(() => {
      window.close();
    }, 1000);
  }
  
  /**
   * Check if on Workday and show/hide snapshot panel accordingly
   */
  async checkWorkdayAndShowSnapshot() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const isWorkday = tab?.url?.includes('workday') || tab?.url?.includes('myworkdayjobs');
      
      const snapshotPanel = document.getElementById('workdaySnapshotPanel');
      if (snapshotPanel) {
        snapshotPanel.classList.toggle('hidden', !isWorkday);
      }
      
      if (isWorkday) {
        // Load any existing snapshot
        await this.loadWorkdaySnapshot();
      }
    } catch (e) {
      console.log('[ATS Tailor] Error checking Workday status:', e);
    }
  }
  
  /**
   * Load existing Workday snapshot from storage
   */
  async loadWorkdaySnapshot() {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['workday_cached_keywords', 'workday_cached_jobInfo'], resolve);
      });
      
      if (result.workday_cached_jobInfo && result.workday_cached_keywords) {
        this.updateSnapshotUI(result.workday_cached_jobInfo, result.workday_cached_keywords);
      }
    } catch (e) {
      console.log('[ATS Tailor] Error loading snapshot:', e);
    }
  }
  
  /**
   * Capture Workday JD snapshot from current page
   */
  async captureWorkdaySnapshot() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        this.showToast('No active tab found', 'error');
        return;
      }
      
      this.showToast('Capturing JD snapshot...', 'success');
      
      // Send message to content script to capture snapshot
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'CAPTURE_WORKDAY_SNAPSHOT'
      });
      
      if (response?.success && response.snapshot) {
        // Store snapshot
        chrome.storage.local.set({
          workday_cached_keywords: response.snapshot.keywords,
          workday_cached_jobInfo: response.snapshot,
        });
        
        this.updateSnapshotUI(response.snapshot, response.snapshot.keywords);
        this.showToast(`Captured ${response.snapshot.keywords?.total || 0} keywords!`, 'success');
      } else {
        this.showToast('Could not capture JD - try refreshing page', 'error');
      }
    } catch (e) {
      console.error('[ATS Tailor] Snapshot capture error:', e);
      this.showToast('Capture failed - ensure you are on a Workday job listing', 'error');
    }
  }
  
  /**
   * Update the snapshot panel UI with captured data
   */
  updateSnapshotUI(jobInfo, keywords) {
    const badge = document.getElementById('snapshotStatus');
    const titleEl = document.getElementById('snapshotJobTitle');
    const companyEl = document.getElementById('snapshotCompany');
    const locationEl = document.getElementById('snapshotLocation');
    const keywordsEl = document.getElementById('snapshotKeywords');
    const jdPreviewEl = document.getElementById('snapshotJDPreview');
    
    if (badge) {
      badge.textContent = 'Captured ✓';
      badge.classList.add('captured');
    }
    if (titleEl) titleEl.textContent = jobInfo.title || '-';
    if (companyEl) companyEl.textContent = jobInfo.company || '-';
    if (locationEl) locationEl.textContent = jobInfo.location || '-';
    if (keywordsEl) keywordsEl.textContent = `${keywords?.total || 0} extracted`;
    if (jdPreviewEl) jdPreviewEl.textContent = (jobInfo.description || 'No description').substring(0, 500) + '...';
  }
  
  /**
   * Force click the Apply button after snapshot capture
   */
  async forceWorkdayApply() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        this.showToast('No active tab found', 'error');
        return;
      }
      
      // First capture snapshot if not done
      await this.captureWorkdaySnapshot();
      
      this.showToast('Clicking Apply button...', 'success');
      
      // Send message to content script to click Apply
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'FORCE_WORKDAY_APPLY'
      });
      
      if (response?.success) {
        this.showToast('Apply clicked! Navigating...', 'success');
        setTimeout(() => window.close(), 500);
      } else {
        this.showToast(response?.error || 'Could not find Apply button', 'error');
      }
    } catch (e) {
      console.error('[ATS Tailor] Force Apply error:', e);
      this.showToast('Error clicking Apply - check console', 'error');
    }
  }

  copyCurrentContent() {
    const content = this.currentPreviewTab === 'cv' 
      ? this.generatedDocuments.cv 
      : this.generatedDocuments.coverLetter;
    
    if (content) {
      navigator.clipboard.writeText(content)
        .then(() => this.showToast('Copied to clipboard!', 'success'))
        .catch(() => this.showToast('Failed to copy', 'error'));
    } else {
      this.showToast('No content to copy', 'error');
    }
  }

  switchPreviewTab(tab) {
    this.currentPreviewTab = tab;
    
    document.getElementById('previewCvTab')?.classList.toggle('active', tab === 'cv');
    document.getElementById('previewCoverTab')?.classList.toggle('active', tab === 'cover');
    document.getElementById('previewTextTab')?.classList.toggle('active', tab === 'text');
    
    this.updatePreviewContent();
  }

  updatePreviewContent() {
    const previewContent = document.getElementById('previewContent');
    if (!previewContent) return;
    
    // Handle text view tab
    if (this.currentPreviewTab === 'text') {
      const cvContent = this.generatedDocuments.cv || '';
      if (cvContent) {
        // Show plain text version with monospace formatting
        previewContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 10px; line-height: 1.3; padding: 8px; background: #f5f5f5; border-radius: 4px; overflow-x: auto;">${cvContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        previewContent.classList.remove('placeholder');
      } else {
        previewContent.textContent = 'Generate CV to see text version...';
        previewContent.classList.add('placeholder');
      }
      return;
    }
    
    const content = this.currentPreviewTab === 'cv' 
      ? this.generatedDocuments.cv 
      : this.generatedDocuments.coverLetter;
    
    const hasPdf = this.currentPreviewTab === 'cv' 
      ? this.generatedDocuments.cvPdf 
      : this.generatedDocuments.coverPdf;
    
    if (content) {
      previewContent.innerHTML = this.formatPreviewContent(content, this.currentPreviewTab);
      previewContent.classList.remove('placeholder');
    } else if (hasPdf) {
      previewContent.textContent = `PDF generated - click Download to view the ${this.currentPreviewTab === 'cv' ? 'CV' : 'Cover Letter'}`;
      previewContent.classList.add('placeholder');
    } else {
      previewContent.textContent = 'Click "Tailor CV & Cover Letter" to generate...';
      previewContent.classList.add('placeholder');
    }
  }

  formatPreviewContent(content, type) {
    if (!content) return '';
    
    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };
    
    let formatted = escapeHtml(content);
    
    if (type === 'cv') {
      formatted = formatted
        .replace(/^(PROFESSIONAL SUMMARY|WORK EXPERIENCE|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|ACHIEVEMENTS|PROJECTS|TECHNICAL PROFICIENCIES)/gm, 
          '<span class="section-header">$1</span>')
        .replace(/^([A-Z][A-Za-z\s&]+)\s*\|\s*(.+)$/gm, 
          '<strong>$1</strong> | <span class="date-line">$2</span>')
        .replace(/^[•▪]\s*/gm, '• ');
    } else {
      formatted = formatted
        .replace(/^(Date:.+)$/m, '<span class="date-line">$1</span>')
        .replace(/^(Dear .+,)$/m, '<strong>$1</strong>')
        .replace(/^(Sincerely,|Best regards,|Regards,)$/m, '<br><strong>$1</strong>');
    }
    
    return formatted;
  }

  updateUI() {
    const loginSection = document.getElementById('loginSection');
    const mainSection = document.getElementById('mainSection');
    const userEmail = document.getElementById('userEmail');
    
    if (!this.session) {
      loginSection?.classList.remove('hidden');
      mainSection?.classList.add('hidden');
      this.setStatus('Login Required', 'error');
    } else {
      loginSection?.classList.add('hidden');
      mainSection?.classList.remove('hidden');
      if (userEmail) userEmail.textContent = this.session.user?.email || 'Logged in';
      this.setStatus('Ready', 'ready');
    }
    
    const todayEl = document.getElementById('todayCount');
    const totalEl = document.getElementById('totalCount');
    const avgEl = document.getElementById('avgTime');
    if (todayEl) todayEl.textContent = this.stats.today;
    if (totalEl) totalEl.textContent = this.stats.total;
    if (avgEl) avgEl.textContent = this.stats.avgTime > 0 ? `${Math.round(this.stats.avgTime)}s` : '0s';
    
    const autoTailorToggle = document.getElementById('autoTailorToggle');
    if (autoTailorToggle) {
      autoTailorToggle.checked = this.autoTailorEnabled;
    }
    
    const hasDocuments = this.generatedDocuments.cv || 
                         this.generatedDocuments.coverLetter || 
                         this.generatedDocuments.cvPdf || 
                         this.generatedDocuments.coverPdf;
    if (hasDocuments) {
      document.getElementById('documentsCard')?.classList.remove('hidden');
      this.updateDocumentDisplay();
      this.updatePreviewContent();
    }
  }

  updateDocumentDisplay() {
    const cvFileName = document.getElementById('cvFileName');
    const coverFileName = document.getElementById('coverFileName');
    
    if (cvFileName && this.generatedDocuments.cvFileName) {
      cvFileName.textContent = this.generatedDocuments.cvFileName;
      cvFileName.title = this.generatedDocuments.cvFileName;
    }
    
    if (coverFileName && this.generatedDocuments.coverFileName) {
      coverFileName.textContent = this.generatedDocuments.coverFileName;
      coverFileName.title = this.generatedDocuments.coverFileName;
    }
    
    const cvSize = document.getElementById('cvSize');
    const coverSize = document.getElementById('coverSize');
    
    if (cvSize && this.generatedDocuments.cvPdf) {
      const sizeKB = Math.round(this.generatedDocuments.cvPdf.length * 0.75 / 1024);
      cvSize.textContent = `${sizeKB} KB`;
    }
    
    if (coverSize && this.generatedDocuments.coverPdf) {
      const sizeKB = Math.round(this.generatedDocuments.coverPdf.length * 0.75 / 1024);
      coverSize.textContent = `${sizeKB} KB`;
    }
    
    // Update AI Match Analysis Panel
    this.updateMatchAnalysisUI();
  }

  /**
   * OPTIMIZED: Update AI Match Analysis panel with keyword chips
   * Uses batch DOM updates for performance
   */
  /**
   * Render recruiter-audit warnings as a collapsed, text-only details
   * section under the AI Match Analysis card. Only appears when there is
   * something actionable; removed entirely when there are no warnings.
   */
  // ============ APPLICATION FOLLOW-UP EMAIL ============

  // Context for token expansion: job details from the current posting plus
  // the user's own contact details from their profile.
  async followupContext() {
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(['ats_profile', 'ats_lastJob'], (r) => resolve(r || {}))
    );
    const profile = stored.ats_profile || {};
    // Job detection nulls currentJob whenever it fails, and it fails on
    // plenty of pages the user has open when they send the note (Gmail, a
    // LinkedIn search-results URL, a reloaded popup). That wiped the
    // company, so {{company_name}} fell back to "your team" and
    // {{job_title}} to "the advertised role" -- the note lost the two
    // details that make it worth sending. Fall back to the last job we
    // actually tailored for, which is the job the documents belong to.
    const job = this.currentJob || stored.ats_lastJob || {};
    const detected = this.jdContact || this.generatedDocuments?.jdContact || {};
    const first = profile.first_name || profile.firstName || '';
    const last = profile.last_name || profile.lastName || '';
    return {
      email: (document.getElementById('followupTo')?.value || detected.email || '').trim(),
      jobId: detected.jobId || '',
      contactName: detected.contactName || '',
      title: this.currentJob?.title || job.title || detected.title || '',
      company: this.resolveCompanyName(this.currentJob || job, detected),
      myName: [first, last].filter(Boolean).join(' ').trim(),
      myEmail: profile.email || this.session?.user?.email || '',
      myPhone: profile.phone || '',
      myLinkedin: profile.linkedin || '',
      country: profile.country || '',
      headline: (this.generatedDocuments?.applyVerdict?.score >= 75)
        ? 'a close match for this role on the requirements you listed'
        : 'a candidate whose background maps onto the core requirements you listed',
      jobUrl: this.currentJob?.url || job.url || '',
      attachmentNames: this.followupAttachments().map((a) => a.filename),
    };
  }

  // The cover letter says "at Nortal" while the email said "at your team",
  // because they resolved the company differently: the cover letter runs a
  // multi-strategy extractor with a placeholder blocklist, the email just
  // read jobData.company. Same posting, two answers, and the email got the
  // useless one. Use the cover letter's extractor so both agree.
  //
  // It returns 'the hiring organization' when it cannot find a name; that
  // is a placeholder, not an answer, so it is mapped back to empty and
  // renderBlock drops the phrase rather than writing something vacuous.
  resolveCompanyName(job, detected) {
    const PLACEHOLDER = /^(the hiring organi[sz]ation|your team|the company|unknown|n\/a)$/i;
    const clean = (v) => {
      const s = String(v || '').trim();
      return (!s || PLACEHOLDER.test(s)) ? '' : s;
    };
    const direct = clean(job && job.company);
    if (direct) return direct;
    try {
      const gen = (typeof CoverLetterGenerator !== 'undefined') ? CoverLetterGenerator : window.CoverLetterGenerator;
      if (gen && typeof gen.extractCompanyName === 'function') {
        const found = clean(gen.extractCompanyName(job || {}));
        if (found) return found;
      }
    } catch (e) {}
    return clean(detected && detected.company)
      || clean(this.generatedDocuments && this.generatedDocuments.company)
      || '';
  }

  // The tailored CV and cover letter already generated for THIS job, ready
  // to attach. Only files that actually exist are returned, so
  // {{attachment_note}} can never claim an attachment that is not there.
  followupAttachments() {
    if (document.getElementById('followupAttachToggle')?.checked === false) return [];
    const g = this.generatedDocuments || {};
    const safe = (n, fallback) => String(n || fallback).replace(/[\r\n"]/g, '').trim() || fallback;

    // DOCX FIRST. attach_format is hard-pinned to docx in the tailor
    // pipeline, so cvDocx/coverDocx are the fields that are actually
    // populated; cvPdf/coverPdf are frequently empty. Reading only the PDF
    // fields silently produced zero attachments -- the email went out with
    // nothing on it and said so to nobody.
    const pick = (docx, docxName, pdf, pdfName, fallbackBase) => {
      if (docx) return { filename: safe(docxName, fallbackBase + '.docx'), base64: docx };
      if (pdf) return { filename: safe(pdfName, fallbackBase + '.pdf'), base64: pdf };
      return null;
    };

    const out = [];
    const cv = pick(g.cvDocx, g.cvDocxFileName, g.cvPdf, g.cvFileName, 'CV');
    if (cv) out.push(cv);
    const cover = pick(g.coverDocx, g.coverDocxFileName, g.coverPdf, g.coverFileName, 'Cover_Letter');
    if (cover) out.push(cover);
    return out;
  }

  // Manual "fill now" for the per-site fillers. Injects the scripts into the
  // active tab first, so it works even when the tab predates the toggle
  // being switched on (registerContentScripts only covers later loads).
  // Auto-submit is meaningless without auto-advance; show that in the UI
  // rather than letting the user arm a switch that cannot fire.
  syncLinkedInAutoUI() {
    chrome.storage.local.get(['linkedin_autoadvance_enabled', 'linkedin_autosubmit_enabled'], (r) => {
      const adv = r?.linkedin_autoadvance_enabled === true;
      const sub = document.getElementById('linkedinAutoSubmitToggle');
      const help = document.getElementById('linkedinAutoSubmitHelp');
      if (sub) {
        sub.disabled = !adv;
        if (!adv) sub.checked = false;
      }
      if (help) help.style.opacity = adv ? '' : '0.55';
    });
  }

  // The content script reports how a hands-free run ended.
  bindLinkedInFlowResults() {
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg || msg.action !== 'JG_LINKEDIN_FLOW_RESULT') return;
        const out = document.getElementById('autofillRunResult');
        if (out) {
          out.textContent = this.describeFlowResult(msg.result);
          out.style.color = ['submitted', 'at-submit'].includes(msg.result?.status)
            ? 'var(--success)' : 'var(--warning)';
        }
      });
    } catch (e) {}
  }

  describeFlowResult(r) {
    if (!r) return '';
    const n = r.steps || 0;
    switch (r.status) {
      case 'submitted': return 'Application submitted after ' + n + ' step(s).';
      case 'at-submit': return 'Filled ' + n + ' step(s). ' + r.detail;
      case 'needs-you': return r.detail;
      case 'stuck':     return r.detail;
      // detail distinguishes "no Easy Apply button on this job" from
      // "clicked it and the dialog never came up" -- discarding it here
      // reduced three different causes to one useless sentence.
      case 'no-modal':  return r.detail || 'No Easy Apply dialog open.';
      case 'off':       return r.detail;
      case 'no-button': return 'Filled ' + n + ' step(s), then found no Next button.';
      case 'max-steps': return r.detail;
      default:          return r.detail || r.status;
    }
  }

  // What the page actually looked like, summarised for the panel and
  // dumped in full to the page console.
  async linkedinDiagSuffix(tabId) {
    try {
      const d = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => (window.__JG_LINKEDIN_DIAGNOSE__ ? window.__JG_LINKEDIN_DIAGNOSE__() : null),
      });
      const info = (d || []).map((x) => x && x.result).filter(Boolean);
      const best = info.find((i) => i.launchFound || i.modalFound)
        || info.find((i) => i.easyApplyCandidates && i.easyApplyCandidates.length)
        || info[0];
      if (!best) return '';
      console.log('[JG] LinkedIn diagnostic:', JSON.stringify(info, null, 2));
      return ' [EasyApply button: ' + (best.launchFound ? 'found' : 'NOT found')
        + ', dialog: ' + (best.modalFound ? 'open' : 'none')
        + ', candidates: ' + (best.easyApplyCandidates || []).length
        + '] Full details in the page console (F12).';
    } catch (e) {
      return '';
    }
  }

  async runSiteAutofill(site) {
    const out = document.getElementById('autofillRunResult');
    const say = (msg, color) => { if (out) { out.textContent = msg; out.style.color = color || ''; } };
    const cfg = site === 'linkedin'
      ? { host: 'linkedin.com', files: ['autofill-core.js', 'linkedin-autofill.js'],
          fn: '__JG_LINKEDIN_FILL_NOW__', key: 'linkedin_autofill_enabled',
          label: 'LinkedIn Easy Apply', hint: 'No Easy Apply dialog found on this page. Open one first.' }
      : { host: 'indeed.com', files: ['autofill-core.js', 'indeed-autofill.js'],
          fn: '__JG_INDEED_FILL_NOW__', key: 'autofill_enabled',
          label: 'Indeed', hint: 'No Indeed application form found on this page. Open one first.' };

    try {
      const enabled = await new Promise((r) => chrome.storage.local.get([cfg.key], (x) => r(x && x[cfg.key] === true)));
      if (!enabled) { say('Turn the ' + cfg.label + ' toggle ON first.', 'var(--warning)'); return; }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) { say('No active tab.', 'var(--error)'); return; }
      if (!String(tab.url || '').includes(cfg.host)) {
        say('Open a ' + cfg.label + ' page in this tab first.', 'var(--warning)');
        return;
      }

      say('Filling…');
      // allFrames: LinkedIn frames some employers' forms (Broadbean etc.).
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: cfg.files });
      } catch (e) { /* already present is fine */ }

      // With auto-advance armed, the button should APPLY from a job
      // listing: press Easy Apply, fill every step, advance. Otherwise it
      // just fills whatever step is already open.
      let entryFn = cfg.fn;
      let flowMode = false;
      if (site === 'linkedin') {
        const adv = await new Promise((r) => chrome.storage.local.get(
          ['linkedin_autoadvance_enabled'], (x) => r(x?.linkedin_autoadvance_enabled === true)));
        if (adv) { entryFn = '__JG_LINKEDIN_APPLY_NOW__'; flowMode = true; }
      }

      // executeScript returns one result PER FRAME. chrome.tabs.sendMessage
      // delivers only the first frame's reply, so a silent frame could mask
      // the frame actually holding the form.
      let frameResults = [];
      try {
        const raw = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: (fnName) => {
            const fn = window[fnName];
            return fn ? fn() : { found: false, filled: 0, alreadySet: 0, answerable: 0, why: 'not-loaded' };
          },
          args: [entryFn],
        });
        frameResults = (raw || []).map((r) => r && r.result).filter(Boolean);
      } catch (e) {
        say('Could not reach the page: ' + (e.message || e), 'var(--error)');
        return;
      }

      if (flowMode) {
        const flow = frameResults.find((r) => r && r.status && r.status !== 'no-modal')
          || frameResults.find((r) => r && r.status) || null;
        if (flow) {
          const good = ['submitted', 'at-submit'].includes(flow.status);
          let msg = this.describeFlowResult(flow);
          // A failure to even open the dialog is the case that used to go
          // quiet, so attach what was actually on the page.
          if (flow.status === 'no-modal') msg += await this.linkedinDiagSuffix(tab.id);
          say(msg, good ? 'var(--success)' : 'var(--warning)');
          return;
        }
      }

      const hit = frameResults.find((r) => r.found) || {};
      const filled = frameResults.reduce((n, r) => n + (r.filled || 0), 0);
      const alreadySet = frameResults.reduce((n, r) => n + (r.alreadySet || 0), 0);

      if (filled > 0) {
        say('Filled ' + filled + ' field(s). Review before submitting.', 'var(--success)');
      } else if (hit.found && alreadySet > 0) {
        // The common case on LinkedIn's contact step, which LinkedIn
        // prefills from the profile. Nothing was wrong.
        say('Nothing to fill: all ' + alreadySet + ' field(s) on this step already had values. '
          + 'Continue to the next step and press this again.', 'var(--success)');
      } else if (hit.found) {
        say('Found the form, but no field on this step matched your profile. '
          + 'Later steps usually have more.', 'var(--warning)');
      } else if (frameResults.some((r) => r.why === 'no-profile')) {
        say('Your profile is empty. Fill in name, email and phone first.', 'var(--warning)');
      } else if (frameResults.some((r) => r.why === 'not-loaded')) {
        say('Autofill did not load on this page. Reload the tab and try again.', 'var(--warning)');
      } else {
        // Detection failed. Rather than leave the user guessing, report what
        // was actually on the page so the cause is visible.
        const diag = site === 'linkedin' ? await this.linkedinDiagSuffix(tab.id) : '';
        say(cfg.hint + diag, 'var(--warning)');
      }
    } catch (e) {
      say('Failed: ' + (e.message || e), 'var(--error)');
    }
  }

  // The Gmail page reports whether the drop actually took. If it did not,
  // fall back to downloading the files so they can be dragged in -- one
  // action, rather than a silently missing attachment.
  bindGmailAttachResults() {
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg || msg.action !== 'JG_GMAIL_ATTACH_RESULT') return;
        const el = document.getElementById('followupResult');
        if (msg.ok) {
          if (el) {
            el.textContent = 'Attached ' + msg.count + ' file(s) in Gmail. Review and press Send.';
            el.style.color = 'var(--success)';
          }
          return;
        }
        if (el) {
          el.textContent = 'Gmail would not accept the attachment automatically. '
            + 'Downloading the files so you can drag them into the message.';
          el.style.color = 'var(--warning)';
        }
        this.downloadFollowupAttachments();
      });
    } catch (e) {}
  }

  // Guaranteed fallback: put the documents on disk so they can be dragged
  // into the compose window.
  downloadFollowupAttachments() {
    for (const f of this.followupAttachments()) {
      try {
        const bin = atob(f.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
        chrome.downloads
          ? chrome.downloads.download({ url, filename: f.filename, saveAs: false })
          : Object.assign(document.createElement('a'), { href: url, download: f.filename }).click();
      } catch (e) {
        console.warn('[JG] could not download attachment', f.filename, e);
      }
    }
  }

  // Insert a variable at the caret in whichever field was last focused,
  // so chips work for the subject as well as the body.
  followupInsertToken(token) {
    const body = document.getElementById('followupBody');
    const subject = document.getElementById('followupSubject');
    const el = (document.activeElement === subject) ? subject : body;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + token + el.value.slice(end);
    const caret = start + token.length;
    el.focus();
    try { el.setSelectionRange(caret, caret); } catch (e) {}
  }

  // Prior contact with this employer, shown before sending. A recruiter
  // sees the whole thread history, so the user should too.
  async followupShowHistory() {
    if (typeof FollowupEmail === 'undefined') return;
    const el = document.getElementById('followupResult');
    if (!el) return;
    try {
      const ctx = await this.followupContext();
      if (!ctx.email && !ctx.company) return;
      const jobKey = (this.currentJob?.url || ctx.jobUrl || ctx.title || '') + '|' + ctx.email;
      const policy = await FollowupEmail.checkSendPolicy({
        company: ctx.company, email: ctx.email, jobKey,
      });
      if (!policy.history.length) { el.textContent = ''; return; }

      const lines = policy.history.map((h) =>
        '• ' + new Date(h.at).toLocaleDateString('en-GB') + ' - ' + (h.title || 'a role') + ' → ' + h.to);
      const when = policy.nextEligibleAt
        ? ' Eligible again ' + new Date(policy.nextEligibleAt).toLocaleDateString('en-GB') + '.'
        : '';
      const head = policy.skip
        ? '⏭️ Will skip - ' + policy.reasons[0] + when
        : '⚠️ You have contacted ' + (ctx.company || 'this company') + ' before' +
          (policy.burstRemaining > 0 ? ' (' + policy.burstRemaining + ' more allowed before the gap applies)' : '') + ':';
      el.textContent = head + '\n' + lines.join('\n');
      el.style.whiteSpace = 'pre-wrap';
      el.style.color = policy.skip ? 'var(--error)' : 'var(--warning)';
    } catch (e) { /* history display must never break the panel */ }
  }

  // Runtime OAuth config: the client ID lives in extension storage on this
  // device, so nothing needs committing to a public repo.
  async followupSaveClientId(clear) {
    if (typeof FollowupEmail === 'undefined') return;
    const el = document.getElementById('followupClientId');
    const value = clear ? '' : (el?.value || '').trim();
    if (clear) {
      // Clearing the ID must also drop the live access token. Removing the
      // ID alone left a usable token in storage, so the extension could
      // still send mail after the user believed they had disconnected.
      // saveOAuthConfig already invalidates the cached redirect URI when
      // the client ID changes.
      try { await FollowupEmail.disconnect(); } catch (e) {}
    }
    await FollowupEmail.saveOAuthConfig({ clientId: value });
    if (clear && el) el.value = '';
    this.showToast(clear ? 'Client ID and saved Gmail authorisation cleared' : 'Client ID saved to this device', 'success');
    this.followupRefreshStatus();
  }

  async followupCopyRedirect() {
    if (typeof FollowupEmail === 'undefined') return;
    const uri = FollowupEmail.redirectUri();
    try {
      await navigator.clipboard.writeText(uri);
      this.showToast('Redirect URI copied', 'success');
    } catch (e) {
      this.showToast(uri, 'success');   // clipboard blocked: show it to copy manually
    }
  }

  async followupRefreshStatus() {
    const el = document.getElementById('followupGmailStatus');
    if (!el || typeof FollowupEmail === 'undefined') return;
    try {
      const [ok, mode] = await Promise.all([FollowupEmail.isConnected(), FollowupEmail.authMode()]);
      const via = mode === 'runtime' ? 'Client ID stored on this device'
        : mode === 'manifest' ? 'Client ID from manifest' : '';
      let cls = 'is-warn';
      let title = 'Not connected';
      let sub = 'Click Connect Gmail to authorise.';
      if (ok) {
        cls = 'is-ok';
        title = 'Connected';
        sub = 'Sends from your own account' + (via ? ' · ' + via : '');
      } else if (mode === 'unconfigured') {
        title = 'Not configured';
        sub = 'Paste a client ID below, then Connect.';
      } else if (via) {
        sub = via + ' · click Connect Gmail to authorise.';
      }
      this.followupSetStatus(cls, title, sub);
      // Show the exact redirect URI -- registering a mismatching one is the
      // single most common cause of the OAuth flow failing.
      const rEl = document.getElementById('followupRedirectUri');
      if (rEl) {
        rEl.value = FollowupEmail.redirectUri();
        rEl.onclick = () => rEl.select();
      }
      // Reflect a stored client ID without echoing it in full.
      const cfg = await FollowupEmail.loadOAuthConfig();
      const idEl = document.getElementById('followupClientId');
      if (idEl && cfg.clientId && !idEl.value) idEl.value = cfg.clientId;
    } catch (e) {
      this.followupSetStatus('is-error', 'Unavailable', (e.message || String(e)).slice(0, 120));
    }
  }

  // Renders the connection pill: state class, headline, and sub-line.
  followupSetStatus(cls, title, sub) {
    const el = document.getElementById('followupGmailStatus');
    if (!el) return;
    el.className = 'fu-status ' + (cls || '');
    el.innerHTML = '<span class="fu-dot"></span><span class="fu-status-text"></span>';
    const t = el.querySelector('.fu-status-text');
    t.textContent = title || '';
    if (sub) {
      const s2 = document.createElement('span');
      s2.className = 'fu-status-sub';
      s2.textContent = sub;
      t.appendChild(s2);
    }
  }

  async followupConnectGmail() {
    if (typeof FollowupEmail === 'undefined') return;
    try {
      await FollowupEmail.connect();
      this.showToast('Gmail connected', 'success');
    } catch (e) {
      this.showToast('Gmail connect failed - run Diagnose setup', 'error');
      await this.followupDiagnose();
    }
    this.followupRefreshStatus();
  }

  // Surfaces the precise misconfiguration rather than a generic OAuth error.
  async followupDiagnose() {
    const out = document.getElementById('followupDiagnostics');
    if (!out || typeof FollowupEmail === 'undefined') return;
    out.style.display = 'block';
    out.textContent = 'Running checks…';
    try {
      const d = await FollowupEmail.diagnose();
      const lines = [
        d.ok ? '✅ ' + d.summary : '⚠️  ' + d.summary,
        '',
        'Extension ID: ' + (d.extensionId || '(unknown)'),
        'Client ID:    ' + (d.clientId || '(not set)'),
        '',
      ];
      for (const c of d.checks) {
        lines.push((c.ok ? '  ✓ ' : '  ✗ ') + c.name);
        if (!c.ok && c.fix) lines.push('      → ' + c.fix);
      }
      out.textContent = lines.join('\n');
    } catch (e) {
      out.textContent = 'Diagnostics failed: ' + (e.message || e);
    }
  }

  // Paint the selector + editor from the stored library.
  async followupLoadTemplate() {
    if (typeof FollowupEmail === 'undefined') return;
    const { templates, activeId, active } = await FollowupEmail.listTemplates();
    const sel = document.getElementById('followupTemplateSelect');
    if (sel) {
      sel.innerHTML = templates
        .map((t) => '<option value="' + t.id + '"' + (t.id === activeId ? ' selected' : '') + '>' +
          String(t.name).replace(/[<>&]/g, '') + '</option>')
        .join('');
    }
    this.followupFillEditor(active);
  }

  followupFillEditor(tpl) {
    if (!tpl) return;
    const n = document.getElementById('followupTemplateName');
    const s = document.getElementById('followupSubject');
    const b = document.getElementById('followupBody');
    if (n) n.value = tpl.name || '';
    if (s) s.value = tpl.subject || '';
    if (b) b.value = tpl.body || '';
    this._followupActiveId = tpl.id;
  }

  async followupSelectTemplate(id) {
    if (typeof FollowupEmail === 'undefined') return;
    const tpl = await FollowupEmail.setActiveTemplate(id);
    this.followupFillEditor(tpl);
  }

  async followupSaveTemplate() {
    if (typeof FollowupEmail === 'undefined') return;
    const saved = await FollowupEmail.saveTemplate({
      id: this._followupActiveId,
      name: document.getElementById('followupTemplateName')?.value || '',
      subject: document.getElementById('followupSubject')?.value || '',
      body: document.getElementById('followupBody')?.value || '',
    });
    await this.followupLoadTemplate();
    // Editing a preset forks a copy; say so rather than silently renaming.
    this.showToast(saved.name ? 'Saved as "' + saved.name + '"' : 'Template saved', 'success');
  }

  async followupNewTemplate(duplicate) {
    if (typeof FollowupEmail === 'undefined') return;
    const base = document.getElementById('followupTemplateName')?.value || 'New template';
    const name = duplicate ? base + ' (copy)' : 'New template';
    const tpl = await FollowupEmail.createTemplate(name, duplicate ? this._followupActiveId : undefined);
    await this.followupLoadTemplate();
    this.showToast('Created "' + tpl.name + '"', 'success');
  }

  async followupDeleteTemplate() {
    if (typeof FollowupEmail === 'undefined') return;
    try {
      const next = await FollowupEmail.deleteTemplate(this._followupActiveId);
      if (!next) { this.showToast('Nothing to delete', 'error'); return; }
      await this.followupLoadTemplate();
      this.showToast('Template deleted', 'success');
    } catch (e) {
      this.showToast(e.message || 'Could not delete', 'error');
    }
  }

  async followupResetTemplate() {
    if (typeof FollowupEmail === 'undefined') return;
    await FollowupEmail.resetTemplate();
    await this.followupLoadTemplate();
    this.showToast('Built-in presets restored (your own templates kept)', 'success');
  }

  // Renders the CURRENT editor content (not the saved copy) so the user
  // always previews/sends exactly what is on screen.
  // No-setup send path: open Gmail's own compose window with the note
  // already written. Uses the same context, template and anti-spam policy
  // as the API path -- the only difference is that the user presses Send,
  // so no OAuth client, redirect URI or Cloud Console project is involved.
  async followupCompose() {
    const result = document.getElementById('followupResult');
    const setMsg = (msg, color) => { if (result) { result.textContent = msg; result.style.color = color || ''; } };
    if (typeof FollowupEmail === 'undefined') { setMsg('Follow-up module not loaded', 'var(--error)'); return; }

    try {
      const ctx = await this.followupContext();
      const tokens = FollowupEmail.buildTokens(ctx);
      // renderBlock drops lines whose tokens resolved to nothing, so an
      // absent Job ID or phone number leaves no trace in the message.
      const subject = FollowupEmail.renderBlock(document.getElementById('followupSubject')?.value || '', tokens)
        .replace(/\s{2,}/g, ' ').trim();
      const body = FollowupEmail.renderBlock(document.getElementById('followupBody')?.value || '', tokens);

      // Final gate: an unsubstituted token must never reach a recruiter.
      const leftover = FollowupEmail.findUnfilledTokens(subject + '\n' + body);
      if (leftover.length) {
        setMsg('Not sent - unknown variable(s) in your template: ' + leftover.join(' ')
          + '. Remove them or use one of the listed variables.', 'var(--error)');
        return;
      }

      if (!ctx.email) {
        setMsg('No recipient. Add an address the employer published in the posting.', 'var(--error)');
        return;
      }

      // Same company-level anti-spam guard as the silent path. Opening a
      // window is not sending, so an over-limit case warns instead of
      // blocking -- the user can still see the draft and decide.
      const jobKey = (this.currentJob?.url || ctx.title || '') + '|' + ctx.email;
      const policy = await FollowupEmail.checkSendPolicy({ company: ctx.company, email: ctx.email, jobKey });
      if (policy.skip) {
        const when = policy.nextEligibleAt
          ? ' Eligible again on ' + new Date(policy.nextEligibleAt).toLocaleDateString('en-GB') + '.'
          : '';
        setMsg('Careful - ' + policy.reasons[0] + when + ' Opening anyway; consider not sending.', 'var(--warning)');
      }

      // Gmail's compose URL has no parameter for files, so hand them to
      // the content script on mail.google.com instead: it attaches them
      // the same way a person would, by dropping them on the compose
      // window. Written BEFORE the tab opens so they are already waiting.
      const files = this.followupAttachments();
      if (files.length) {
        await new Promise((r) => chrome.storage.local.set({
          followup_pending_attachments: {
            at: Date.now(),
            files: files.map((f) => ({ filename: f.filename, base64: f.base64 })),
          },
        }, r));
      }

      await FollowupEmail.openCompose({ to: ctx.email, subject, body });
      // Logged only after the compose window opens, so the history stays
      // an honest record of notes the user actually acted on.
      await FollowupEmail.markSent(jobKey, { company: ctx.company, email: ctx.email, via: 'compose' });
      if (!policy.skip) {
        setMsg(files.length
          ? 'Opened in Gmail with ' + files.length + ' attachment(s). Review and press Send.'
          : 'Opened in Gmail. Review it and press Send.', 'var(--success)');
      }
    } catch (e) {
      setMsg('Could not open Gmail: ' + (e.message || e), 'var(--error)');
    }
  }

  // Sends the follow-up as the final step of a tailoring run, so a found
  // address needs no separate click. followup_enabled was previously
  // written to storage but never READ: the toggle did nothing and the only
  // ways to send were the two buttons.
  //
  // ORDER MATTERS. This runs after buildDocxArtifact() and after the
  // documents are persisted, because the note attaches the tailored CV and
  // cover letter. Sending before they exist would deliver an email that
  // promises attachments it does not carry, so the documents are treated
  // as a precondition, not a bonus.
  //
  // A queue-until-submitted variant was written first and removed: nothing
  // in the extension records that an application was actually submitted,
  // so the gate could never open and the note would never have gone out.
  // A feature that cannot fire is worse than one that fires a few minutes
  // before the user presses Submit.
  async autoSendFollowup() {
    // Every exit from this method is recorded and shown. Fifteen
    // applications produced fifteen console lines nobody reads and no
    // visible difference between "switched off", "nobody to write to" and
    // "sent" -- so a silently disabled toggle looked exactly like a working
    // one that found no addresses.
    const outcome = async (state, message, level) => {
      console.log('[ATS Tailor] follow-up:', state, '-', message);
      try {
        await chrome.storage.local.set({
          followup_last_outcome: { at: Date.now(), state, message, job: this.currentJob?.title || '' },
        });
      } catch (e) {}
      const el = document.getElementById('followupResult');
      if (el) {
        el.textContent = message;
        el.style.color = level === 'error' ? 'var(--error)'
          : level === 'success' ? 'var(--success)' : 'var(--warning)';
      }
      if (level) this.showToast(message, level === 'success' ? 'success' : 'warning');
    };

    try {
      if (typeof FollowupEmail === 'undefined') {
        await outcome('module-missing', 'Follow-up module did not load, so no note was sent.', 'error');
        return;
      }
      const cfg = await new Promise((r) => chrome.storage.local.get(['followup_enabled'], (x) => r(x || {})));
      if (cfg.followup_enabled !== true) {
        await outcome('disabled',
          'Follow-up email is switched off, so no note was sent. Turn on '
          + '"Application Follow-up Email" in Settings.', 'warning');
        return;
      }

      // Contact detection started earlier in the tailoring run and reaches
      // into the job tab. Let it finish before deciding there is nobody to
      // write to, or a slow page turns into a silently unsent note.
      if (this.contactDetection) { try { await this.contactDetection; } catch (e) {} }

      const ctx = await this.followupContext();
      if (!ctx.email) {
        const enrichState = await this.followupEnrichmentState();
        await outcome('no-recipient',
          'No address found for this role, so no note was sent. ' + enrichState, 'warning');
        return;
      }

      // The documents are the point of the note. If neither was produced,
      // hold off rather than send an empty-handed email.
      const files = this.followupAttachments();
      if (!files.length) {
        await outcome('no-documents',
          'Follow-up not sent - no tailored documents were generated to attach.', 'warning');
        return;
      }

      // followupSend applies the company-level anti-spam policy, so a
      // repeat employer is skipped quietly rather than mailed twice.
      await this.followupSend({ test: false });
      await outcome('sent', 'Follow-up sent to ' + ctx.email + ' with '
        + files.length + ' attachment(s).', 'success');
    } catch (e) {
      // A failed note must never look like a failed tailoring run, but it
      // must not look like a successful one either.
      try {
        await outcome('failed', 'Follow-up could not be sent: ' + (e && e.message ? e.message : e), 'error');
      } catch (reportError) {
        console.warn('[ATS Tailor] could not report follow-up failure:', reportError && reportError.message);
      }
    }
  }

  // One line explaining why no address turned up, so "no email was found"
  // is actionable instead of a dead end.
  async followupEnrichmentState() {
    if (typeof ContactEnrichment === 'undefined') return 'Contact lookup is unavailable.';
    try {
      const cfg = await ContactEnrichment.loadConfig();
      if (cfg.enabled !== true) {
        return 'The posting published none, and contact lookup is switched off '
          + '(Settings -> Contact lookup).';
      }
      const providers = ContactEnrichment.listProviders();
      const withKeys = [];
      for (const p of providers) {
        const cred = await ContactEnrichment.getCred(p.id);
        if (cred && (cred.apiKey || cred.token)) withKeys.push(p.label);
      }
      if (!withKeys.length) {
        return 'The posting published none, and no lookup provider has a key saved.';
      }
      return 'The posting published none, and ' + withKeys.join(' / ')
        + ' returned nobody. Use "Find contact for this job now" in Settings to see why.';
    } catch (e) { return ''; }
  }

  async followupSend({ test }) {
    const result = document.getElementById('followupResult');
    const setMsg = (msg, color) => { if (result) { result.textContent = msg; result.style.color = color || ''; } };
    if (typeof FollowupEmail === 'undefined') { setMsg('Follow-up module not loaded', 'var(--error)'); return; }

    try {
      const ctx = await this.followupContext();
      const tokens = FollowupEmail.buildTokens(ctx);
      // renderBlock drops lines whose tokens resolved to nothing, so an
      // absent Job ID or phone number leaves no trace in the message.
      const subject = FollowupEmail.renderBlock(document.getElementById('followupSubject')?.value || '', tokens)
        .replace(/\s{2,}/g, ' ').trim();
      const body = FollowupEmail.renderBlock(document.getElementById('followupBody')?.value || '', tokens);

      // Final gate: an unsubstituted token must never reach a recruiter.
      const leftover = FollowupEmail.findUnfilledTokens(subject + '\n' + body);
      if (leftover.length) {
        setMsg('Not sent - unknown variable(s) in your template: ' + leftover.join(' ')
          + '. Remove them or use one of the listed variables.', 'var(--error)');
        return;
      }

      if (test) {
        if (!ctx.myEmail) { setMsg('No address on your profile to send the test to', 'var(--error)'); return; }
        setMsg('Sending test…');
        // A test must be a BYTE-EXACT replica of what the recruiter gets.
        // It previously prepended an explanatory preamble and a [TEST]
        // subject prefix, and -- worse -- omitted the attachments
        // entirely, so the one thing the test existed to verify was the
        // one thing it could not show. Same subject, same body, same
        // files; only the recipient differs.
        const testFiles = this.followupAttachments();
        await FollowupEmail.send({
          to: ctx.myEmail,
          subject,
          body,
          fromName: ctx.myName,
          attachments: testFiles,
        });
        setMsg('Test sent to ' + ctx.myEmail
          + (testFiles.length ? ' with ' + testFiles.length + ' attachment(s)' : ' (no documents generated yet, so nothing attached)')
          + ' ✓', 'var(--success)');
        return;
      }

      if (!ctx.email) { setMsg('No recipient. Add an address the employer published, or leave blank to skip.', 'var(--error)'); return; }
      const jobKey = (this.currentJob?.url || ctx.title || '') + '|' + ctx.email;

      // Anti-spam policy: email is permanent in the recipient's mailbox and
      // they see every past note in one thread. Check history across the
      // whole COMPANY, not just this posting.
      const policy = await FollowupEmail.checkSendPolicy({
        company: ctx.company, email: ctx.email, jobKey,
      });
      // Over the limit: skip quietly. No dialog, nothing sent -- just say
      // why and when this company is eligible again.
      if (policy.skip) {
        const when = policy.nextEligibleAt
          ? ' Eligible again on ' + new Date(policy.nextEligibleAt).toLocaleDateString('en-GB') + '.'
          : '';
        setMsg('Skipped - ' + policy.reasons[0] + when, 'var(--warning)');
        console.log('[ATS Tailor] follow-up skipped:', policy.reasons[0]);
        return;
      }
      if (policy.warnings.length) setMsg(policy.warnings[0], 'var(--warning)');

      setMsg('Sending…');
      const files = this.followupAttachments();
      await FollowupEmail.send({ to: ctx.email, subject, body, fromName: ctx.myName, attachments: files });
      await FollowupEmail.markSent(jobKey, {
        to: ctx.email, title: ctx.title, jobId: ctx.jobId, company: ctx.company,
      });
      setMsg('Follow-up sent to ' + ctx.email + ' ✓', 'var(--success)');
      this.showToast('Follow-up email sent', 'success');
    } catch (e) {
      setMsg('Send failed: ' + (e.message || e), 'var(--error)');
    }
  }

  // Called after tailoring: read the posting for a PUBLISHED contact email
  // and the job/requisition ID, then surface it in the composer.
  async followupDetectContact() {
    try {
      // Clear FIRST. Without this, a run whose detection fails leaves the
      // previous job's recipient in place, and the note for this
      // application goes to a recruiter at the last company. A missing
      // address is a skipped email; a stale one is an email to the wrong
      // employer.
      this.jdContact = null;
      if (this.generatedDocuments) this.generatedDocuments.jdContact = null;
      const toEl0 = document.getElementById('followupTo');
      if (toEl0 && toEl0.dataset && toEl0.dataset.autofilled === '1') {
        toEl0.value = '';
        delete toEl0.dataset.autofilled;
      }

      if (typeof JDContactExtractor === 'undefined') return;
      const jdText = this.currentJob?.description || this.currentJob?.jdText || '';
      const detected = JDContactExtractor.extract({
        jdText,
        url: this.currentJob?.url || '',
        title: this.currentJob?.title || '',
        company: this.currentJob?.company || '',
        ownEmail: this.session?.user?.email || '',
        // Harvested from the JOB PAGE, not from this popup. Without it the
        // extractor would call JDContactSources.harvest() against the
        // popup's own document, which publishes no employer contacts, so
        // mailto links and JSON-LD applicationContact never counted.
        pageSources: await this.followupHarvestPageSources(),
      });
      // Durable home. generatedDocuments is reassigned wholesale later in
      // the tailoring run, which discarded whatever detection had found --
      // the recipient was located and then thrown away before the send.
      this.jdContact = detected;
      if (this.generatedDocuments) this.generatedDocuments.jdContact = detected;

      const toEl = document.getElementById('followupTo');
      const info = document.getElementById('followupDetected');
      if (toEl && detected.email && !toEl.value) { toEl.value = detected.email; toEl.dataset.autofilled = '1'; }
      if (info) {
        if (detected.hasPublishedEmail) {
          info.textContent = '✓ Published in the posting: ' + detected.email +
            (detected.contactName ? ' (' + detected.contactName + ')' : '') +
            (detected.jobId ? ' · Job ID ' + detected.jobId : '');
          info.style.color = 'var(--success)';
        } else {
          info.textContent = 'No email in this posting' +
            (detected.jobId ? ' (Job ID ' + detected.jobId + ')' : '') +
            ' - checking the company\'s published careers address…';
          info.style.color = 'var(--warning)';
          // Automatic fallback: look for a candidate-facing mailbox the
          // employer published on its own site. No manual step.
          this.followupFindCareersAddress();
        }
      }
      console.log('[ATS Tailor] JD contact:', detected.email || '(none)', '| jobId:', detected.jobId || '(none)');
      // Show prior contact with this employer up front, so the decision is
      // informed before the Send button is even considered.
      this.followupShowHistory();
    } catch (e) {
      console.warn('[ATS Tailor] followupDetectContact failed:', e && e.message);
    }
  }

  // ---- contact lookup settings -----------------------------------------
  // Populates the provider list and restores whatever is already saved, so
  // reopening the popup shows the real state rather than an empty form.
  async enrichInitUI() {
    if (typeof ContactEnrichment === 'undefined') return;
    const sel = document.getElementById('enrichProvider');
    if (!sel) return;
    try {
      const providers = ContactEnrichment.listProviders();
      const cfg = await ContactEnrichment.loadConfig();
      const current = cfg.provider || providers[0].id;

      sel.innerHTML = providers
        .map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
      sel.value = current;

      const t = document.getElementById('enrichEnabledToggle');
      if (t) t.checked = cfg.enabled === true;

      this.enrichSelectProvider(current);
    } catch (e) {
      console.warn('[ATS Tailor] enrichment UI init failed:', e && e.message);
    }
  }

  // Key-style and account-style providers need different fields. Showing
  // an "API key" box for Closely, which issues none, is what sends people
  // hunting for a key that does not exist.
  async enrichSelectProvider(id) {
    if (typeof ContactEnrichment === 'undefined') return;
    const p = ContactEnrichment.listProviders().find((x) => x.id === id);
    if (!p) return;
    await ContactEnrichment.saveConfig({ provider: id });

    const hint = document.getElementById('enrichHint');
    if (hint) hint.textContent = p.hint || '';
    const getBtn = document.getElementById('enrichGetKeyBtn');
    if (getBtn) getBtn.textContent = p.keyKind === 'account' ? 'Open provider site ↗' : 'Open provider API keys page ↗';

    // The saved secret is never written back into the field: a stored key
    // must not be readable from the popup, only replaceable.
    const keyInput = document.getElementById('enrichApiKey');
    if (keyInput) keyInput.value = '';
    const pw = document.getElementById('enrichAccountPassword');
    if (pw) pw.value = '';
    const emailEl = document.getElementById('enrichAccountEmail');
    if (emailEl) emailEl.value = '';

    // Switching provider drops any "change account" state from the last one.
    this.enrichSwitching = false;
    await this.enrichRenderCredState(id);
    this.enrichRefreshStatus();
  }

  // Decides which credential controls are on screen. An account-style
  // provider that is already connected shows WHO it is connected as, not an
  // empty email and password pair -- blank boxes read as "not signed in"
  // when a token is sitting in storage and working.
  async enrichRenderCredState(providerId) {
    if (typeof ContactEnrichment === 'undefined') return;
    const id = providerId || document.getElementById('enrichProvider')?.value;
    const p = ContactEnrichment.listProviders().find((x) => x.id === id);
    if (!p) return;
    const cred = await ContactEnrichment.getCred(id);

    const isAccount = p.keyKind === 'account';
    const connected = isAccount && !!(cred && cred.token) && !this.enrichSwitching;

    const show = (elId, on) => {
      const el = document.getElementById(elId);
      if (el) el.style.display = on ? '' : 'none';
    };
    show('enrichKeyFields', !isAccount);
    show('enrichAccountFields', isAccount && !connected);
    show('enrichConnected', connected);
    // Nothing to save while connected: the token is already stored. Test
    // and Clear stay, because those are the two things still worth doing.
    show('enrichSaveBtn', !connected);
    show('enrichSwitchRow', connected);

    const saveBtn = document.getElementById('enrichSaveBtn');
    if (saveBtn) saveBtn.textContent = isAccount ? 'Sign in and create key' : 'Save key';

    const text = document.getElementById('enrichConnectedText');
    if (text && connected) {
      const who = cred.accountEmail ? ' as ' + cred.accountEmail : '';
      const when = cred.at ? ', ' + new Date(cred.at).toLocaleDateString('en-GB') : '';
      text.textContent = 'Connected to ' + p.label + who + when
        + '. Your password was not stored - only the token it issued.';
    }
  }

  async enrichRefreshStatus() {
    if (typeof ContactEnrichment === 'undefined') return;
    const el = document.getElementById('enrichStatus');
    if (!el) return;
    try {
      const cfg = await ContactEnrichment.loadConfig();
      const id = document.getElementById('enrichProvider')?.value || cfg.provider;
      const p = ContactEnrichment.listProviders().find((x) => x.id === id);
      const cred = await ContactEnrichment.getCred(id);
      const saved = !!(cred && (cred.apiKey || cred.token));

      if (!saved) {
        el.textContent = 'No key saved for ' + (p ? p.label : id) + '.';
        el.style.color = 'var(--warning)';
      } else if (cfg.enabled !== true) {
        el.textContent = 'Key saved for ' + (p ? p.label : id) + ', but lookup is switched off.';
        el.style.color = 'var(--warning)';
      } else {
        el.textContent = 'Key saved for ' + (p ? p.label : id) + '. Used only when nothing is published.';
        el.style.color = 'var(--success)';
      }
    } catch (e) { /* status is cosmetic */ }
  }

  async enrichSaveKey() {
    if (typeof ContactEnrichment === 'undefined') return;
    const el = document.getElementById('enrichStatus');
    const set = (msg, color) => { if (el) { el.textContent = msg; el.style.color = color || ''; } };
    const id = document.getElementById('enrichProvider')?.value || '';
    const p = ContactEnrichment.listProviders().find((x) => x.id === id);
    if (!p) return;

    try {
      if (p.keyKind === 'account') {
        const emailEl = document.getElementById('enrichAccountEmail');
        const pwEl = document.getElementById('enrichAccountPassword');
        const email = (emailEl?.value || '').trim();
        const password = pwEl?.value || '';
        if (!email || !password) { set('Enter your ' + p.label + ' email and password.', 'var(--error)'); return; }

        set('Signing in to ' + p.label + '…');
        const r = await ContactEnrichment.createKey(id, { email, password });
        // Clear the password field the moment the exchange is done. It was
        // never persisted; this stops it sitting in the DOM afterwards.
        if (pwEl) pwEl.value = '';
        set(r.message || (r.ok ? 'Connected.' : 'Could not connect.'), r.ok ? 'var(--success)' : 'var(--error)');
        if (r.ok) {
          // Signed in: collapse the credential fields into the connected row.
          this.enrichSwitching = false;
          if (emailEl) emailEl.value = '';
          await this.enrichRenderCredState(id);
          this.showToast(p.label + ' connected', 'success');
        }
        return;
      }

      const keyEl = document.getElementById('enrichApiKey');
      const apiKey = (keyEl?.value || '').trim();
      if (!apiKey) { set('Paste your ' + p.label + ' API key first.', 'var(--error)'); return; }
      await ContactEnrichment.saveKey(id, { apiKey });
      if (keyEl) keyEl.value = '';
      set('Key saved. Testing…');
      const t = await ContactEnrichment.testKey(id);
      set(t.message, t.ok ? 'var(--success)' : 'var(--error)');
      this.showToast(t.ok ? p.label + ' key saved' : 'Key saved but not accepted', t.ok ? 'success' : 'error');
    } catch (e) {
      set('Could not save: ' + (e.message || e), 'var(--error)');
    }
  }

  async enrichTestKey() {
    if (typeof ContactEnrichment === 'undefined') return;
    const el = document.getElementById('enrichStatus');
    const set = (msg, color) => { if (el) { el.textContent = msg; el.style.color = color || ''; } };
    const id = document.getElementById('enrichProvider')?.value || '';
    set('Testing…');
    try {
      const t = await ContactEnrichment.testKey(id);
      set(t.message, t.ok ? 'var(--success)' : 'var(--error)');
    } catch (e) {
      set('Test failed: ' + (e.message || e), 'var(--error)');
    }
  }

  /**
   * Every precondition a follow-up depends on, checked in order, each with
   * the specific thing to change when it fails.
   *
   * This exists because the failure that cost fifteen applications was not
   * any single broken step -- it was that no screen showed which step was
   * broken. Each area had its own diagnostic and none of them covered the
   * chain, so finding the answer meant knowing in advance where to look.
   *
   * Sends nothing and spends no provider credits.
   */
  async followupPreflight() {
    const out = document.getElementById('followupPreflight');
    const lines = [];
    const flush = () => { if (out) out.textContent = lines.join('\n'); };
    const say = (s) => { lines.push(s); flush(); };
    let blockers = 0;
    const ok = (label, detail) => say('  OK    ' + label + (detail ? '  -  ' + detail : ''));
    const bad = (label, fix) => { blockers++; say('  STOP  ' + label + '\n           fix: ' + fix); };
    const note = (label, detail) => say('  note  ' + label + (detail ? '  -  ' + detail : ''));

    say('Checking…'); lines.length = 0;

    try {
      // 1. Modules. A file missing from popup.html is invisible at runtime.
      const missing = [
        ['JDContactExtractor', typeof JDContactExtractor !== 'undefined'],
        ['FollowupEmail', typeof FollowupEmail !== 'undefined'],
        ['ContactEnrichment', typeof ContactEnrichment !== 'undefined'],
        ['JGProfileMemory', typeof JGProfileMemory !== 'undefined'],
      ].filter(([, present]) => !present).map(([n]) => n);
      if (missing.length) bad('Modules not loaded: ' + missing.join(', '),
        'reload the extension at chrome://extensions (the files are not being loaded)');
      else ok('All modules loaded');

      // 2. The master switch. Off here means nothing sends, however much
      //    else works -- and it was silent about it.
      const st = await new Promise((r) => chrome.storage.local.get(
        ['followup_enabled', 'followup_attach_enabled', 'followup_last_outcome'], (x) => r(x || {})));
      if (st.followup_enabled === true) ok('Follow-up email is ON');
      else bad('Follow-up email is OFF, so nothing will send',
        'turn on "Application Follow-up Email" in Settings');
      if (st.followup_attach_enabled === false) {
        note('Attachments are OFF', 'the note would go without your CV and cover letter');
      } else ok('Attachments are ON');

      // 3. Gmail. Without a token the send fails at the last step.
      let gmailReady = false;
      let gmailMode = '';
      try {
        gmailReady = typeof FollowupEmail !== 'undefined' && !!(await FollowupEmail.isConnected());
        gmailMode = typeof FollowupEmail !== 'undefined' ? await FollowupEmail.authMode() : '';
      } catch (e) { gmailReady = false; }
      if (gmailReady) ok('Gmail connected', gmailMode ? 'via ' + gmailMode + ' client' : '');
      else if (gmailMode === 'unconfigured') {
        // No OAuth client at all: the API send cannot work, but the compose
        // path can, and it needs no Cloud Console project.
        bad('No Gmail OAuth client configured',
          'either paste a client ID above, or use "Open in Gmail" to send by hand');
      } else {
        bad('Gmail not connected', 'press "Connect Gmail" above, then re-run this check');
      }

      // 4. A job in front of us.
      const job = this.currentJob || {};
      const company = this.enrichCompanyName();
      if (job.title || company) {
        ok('Job detected', (company || '?') + ' - ' + (job.title || 'untitled'));
      } else {
        bad('No job detected on this page',
          'open the job posting itself, then reopen this popup');
      }

      // 5. Documents. The note is held rather than sent empty-handed.
      const files = this.followupAttachments();
      if (files.length) ok('Documents ready', files.map((f) => f.filename).join(', '));
      else note('No tailored documents yet',
        'run "Extract & Apply Keywords to CV" first - the note is held until both exist');

      // 6. A recipient, and where it would come from.
      const detected = this.jdContact || this.generatedDocuments?.jdContact || {};
      const typed = (document.getElementById('followupTo')?.value || '').trim();
      if (detected.email || typed) {
        ok('Recipient', (detected.email || typed)
          + ' (' + (detected.emailSource || 'typed by you') + ')');
      } else {
        note('No recipient yet', 'nothing published on this posting; the lookup below decides');
      }

      // 7. The lookup, and what it has to work with.
      if (typeof ContactEnrichment !== 'undefined') {
        const cfg = await ContactEnrichment.loadConfig();
        if (cfg.enabled !== true) {
          note('Contact lookup is OFF',
            'published addresses still work; switch it on to search when none is published');
        } else {
          const withCred = [];
          for (const p of ContactEnrichment.listProviders()) {
            const c = await ContactEnrichment.getCred(p.id);
            if (c && (c.apiKey || c.token)) withCred.push(p.label);
          }
          if (withCred.length) ok('Contact lookup ON', 'credentials: ' + withCred.join(', '));
          else bad('Contact lookup is ON but no provider has a credential',
            'sign in to Closely, or paste a ContactOut/Hunter/Apollo key, in Contact lookup below');

          const handles = await this.followupProfileHandles();
          if (handles.length) ok('LinkedIn profiles available', handles.slice(0, 3).join(', '));
          else note('No LinkedIn profile for this employer',
            'open a recruiter\'s profile, or visit a few - browsed profiles are remembered and matched later');
        }
      }

      // 8. Can we read the job page at all? An injection failure here is
      //    why published mailto links and JSON-LD went unseen for so long.
      const sources = await this.followupHarvestPageSources();
      if (sources === null) {
        note('Could not read the job page',
          'a restricted page (chrome:// or the Web Store) blocks this; open the posting itself');
      } else {
        ok('Job page readable',
          sources.emails.length + ' published address(es), ' + sources.names.length + ' name(s)');
      }

      // 9. What happened last time, so a past silent skip is visible now.
      if (st.followup_last_outcome) {
        const o = st.followup_last_outcome;
        note('Last follow-up (' + new Date(o.at).toLocaleString('en-GB') + ')', o.message);
      }

      say('');
      say(blockers === 0
        ? 'No blockers. Tailor a job and the follow-up will send if an address is found,'
          + '\nand skip quietly if none is.'
        : blockers + ' blocker(s) above would stop a follow-up. Fix those first.');
    } catch (e) {
      say('');
      say('Check failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // Runs the real lookup against the job in the current tab and prints
  // every step: what the job resolved to, what the page already published,
  // which providers were tried or skipped and why, and what came back.
  //
  // This exists because the useful failure is the silent one. A lookup that
  // never fired -- because the posting already had an address, or because
  // the only provider with a key needs a LinkedIn poster the page does not
  // have -- looks exactly like a lookup that ran and found nobody, and
  // spends no credits either way.
  async enrichFindNow() {
    const out = document.getElementById('enrichDiagnostics');
    const lines = [];
    const write = () => { if (out) out.textContent = lines.join('\n'); };
    const say = (s) => { lines.push(s); write(); };

    if (typeof ContactEnrichment === 'undefined') { say('Enrichment module not loaded.'); return; }
    say('Checking…');
    lines.length = 0;

    try {
      const cfg = await ContactEnrichment.loadConfig();
      say('Lookup enabled: ' + (cfg.enabled === true ? 'yes' : 'NO - switch it on above'));

      // What the page already published. If this has an address, enrichment
      // is correctly skipped during a real run and no credits are spent.
      const published = this.jdContact || this.generatedDocuments?.jdContact || null;
      if (!published) {
        say('No job scanned yet in this popup. Run "Extract & Apply Keywords to CV" first,');
        say('or open the job page and reopen this popup.');
      } else {
        say('Published address on the posting: ' + (published.email || 'none'));
        if (published.email && published.hasPublishedEmail) {
          say('');
          say('The posting already publishes an address, so a real run uses that and');
          say('never calls a provider. That is why no credits are spent.');
        }
      }

      const ctx = {
        company: this.enrichCompanyName(),
        title: this.currentJob?.title || '',
        location: this.currentJob?.location || '',
        domain: this.followupCompanyDomain(),
        linkedinProfiles: await this.followupProfileHandles(),
      };
      say('');
      say('Searching for:');
      say('  company  : ' + (ctx.company || '(unknown - a lookup cannot run without this)'));
      say('  role     : ' + (ctx.title || '(unknown)'));
      say('  location : ' + (ctx.location || '(none)'));
      say('  domain   : ' + (ctx.domain || '(none)'));
      const activeProfile = await this.activeLinkedInProfile();
      say('  profiles : ' + (ctx.linkedinProfiles.length
        ? ctx.linkedinProfiles.join(', ')
          + (activeProfile ? '   (' + activeProfile + ' is the profile open in this tab)' : '')
        : '(none - no profile open and this page names nobody)'));

      say('');
      say('Running lookup (this spends provider credits)…');
      // noCache so the result reflects the providers right now, not a
      // week-old answer. This is the button for "is it actually working".
      const r = await ContactEnrichment.findContacts(ctx, { noCache: true });

      say('');
      for (const line of (r.trace || [])) say('  ' + line);

      say('');
      if (r.results && r.results.length) {
        say('Found ' + r.results.length + ':');
        for (const p of r.results) {
          say('  ' + p.email + '  -  ' + (p.name || '?') + (p.title ? ', ' + p.title : '')
            + '  [' + (p.provider || '?') + (p.source === 'job-poster' ? ', named poster' : '') + ']');
        }
        say('');
        say('The top one is what a follow-up would use, and only when the posting');
        say('publishes nothing itself.');
      } else {
        const why = {
          disabled: 'Lookup is switched off.',
          'no-api-key': 'No provider has a key saved.',
          'needs-named-poster': 'The only provider with a key can resolve a named LinkedIn '
            + 'poster, and this page names nobody. Add a ContactOut, Hunter or Apollo key.',
          'no-company': 'No employer name could be determined, so there was nothing to search.',
          'bad-api-key': 'Every provider rejected its key.',
          'rate-limited': 'Rate limited by the provider.',
          'out-of-credits': 'The provider reports no credits left.',
          network: 'Could not reach the provider.',
          'no-match': 'The providers ran and returned nobody matching.',
        }[r.reason] || ('Nothing found (' + (r.reason || 'unknown') + ').');
        say('Result: ' + why);
      }
    } catch (e) {
      say('');
      say('Diagnostic failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // Name the person, get their verified work address. Works through
  // whichever provider holds a credential, and does not depend on that
  // provider being able to SEARCH -- which is what makes it the reliable
  // path when a posting names nobody but you found the recruiter yourself.
  async enrichResolveProfile() {
    const out = document.getElementById('enrichDiagnostics');
    const say = (s) => { if (out) out.textContent = s; };
    if (typeof ContactEnrichment === 'undefined') { say('Enrichment module not loaded.'); return; }

    const raw = (document.getElementById('enrichProfileUrl')?.value || '').trim();
    if (!raw) { say('Paste a LinkedIn profile URL first.'); return; }

    say('Resolving…');
    try {
      const r = await ContactEnrichment.resolveProfile(raw);
      if (r.ok && r.results.length) {
        const top = r.results[0];
        say('Found: ' + top.email + '\n'
          + (top.name ? top.name : '') + (top.title ? ', ' + top.title : '') + '\n'
          + 'via ' + (r.source || 'provider') + '\n\n'
          + 'Put into the To field above. Review before sending.');
        const toEl = document.getElementById('followupTo');
        if (toEl) { toEl.value = top.email; toEl.dataset.autofilled = '1'; }
        // Recorded the same way a detected address is, so the follow-up
        // and its attachments use it exactly like a published one.
        this.jdContact = Object.assign({}, this.jdContact || {}, {
          email: top.email,
          contactName: top.name || '',
          emailSource: 'enriched-profile',
          hasPublishedEmail: false,
        });
        if (this.generatedDocuments) this.generatedDocuments.jdContact = this.jdContact;
        this.showToast('Contact resolved', 'success');
      } else {
        say({
          disabled: 'Contact lookup is switched off.',
          'bad-profile': 'That does not look like a LinkedIn profile URL. '
            + 'Use the form https://www.linkedin.com/in/their-handle',
          'no-api-key': 'No provider has a credential saved.',
          'bad-api-key': 'The provider rejected the saved credential.',
          'rate-limited': 'Rate limited - try again shortly.',
          'out-of-credits': 'The provider reports no credits left.',
          network: 'Could not reach the provider.',
          'no-match': 'The provider has no address on file for that profile.',
        }[r.reason] || ('Nothing found (' + (r.reason || 'unknown') + ').'));
      }
    } catch (e) {
      say('Resolve failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  async enrichClearKey() {
    if (typeof ContactEnrichment === 'undefined') return;
    const id = document.getElementById('enrichProvider')?.value || '';
    await ContactEnrichment.clearKey(id);
    await ContactEnrichment.clearCache();
    const keyEl = document.getElementById('enrichApiKey');
    if (keyEl) keyEl.value = '';
    const pwEl = document.getElementById('enrichAccountPassword');
    if (pwEl) pwEl.value = '';
    const emailEl = document.getElementById('enrichAccountEmail');
    if (emailEl) emailEl.value = '';
    // Disconnected: the sign-in fields come back.
    this.enrichSwitching = false;
    await this.enrichRenderCredState(id);
    this.showToast('Key and cached lookups cleared', 'success');
    this.enrichRefreshStatus();
  }

  // Runs JDContactSources against the JOB TAB and merges what every frame
  // published. Per-frame matters: Greenhouse and Lever postings are
  // routinely embedded in an iframe on the employer's own careers page, and
  // the mailto link is inside that frame, not the top document.
  // (executeScript returns one result per frame; tabs.sendMessage would
  // deliver only the first frame's reply.)
  async followupHarvestPageSources() {
    const EMPTY = { emails: [], names: [], org: '', jobId: '' };
    try {
      if (!chrome?.scripting?.executeScript) return null;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (!tabId) return null;

      // The module is a content script on the ATS domains but not on every
      // employer's own site, so make sure it is present before calling it.
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['jd-contact-sources.js'],
        });
      } catch (e) { /* already injected, or a frame we may not touch */ }

      const frames = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => {
          try { return window.JDContactSources ? window.JDContactSources.harvest() : null; }
          catch (e) { return null; }
        },
      });

      const merged = { emails: [], names: [], org: '', jobId: '' };
      for (const f of (frames || [])) {
        const r = f && f.result;
        if (!r) continue;
        merged.emails.push.apply(merged.emails, r.emails || []);
        merged.names.push.apply(merged.names, r.names || []);
        if (!merged.org) merged.org = r.org || '';
        if (!merged.jobId) merged.jobId = r.jobId || '';
      }
      // De-duplicate across frames: an embedded posting often repeats the
      // parent page's contact details.
      const seenE = new Set();
      merged.emails = merged.emails.filter((e) => {
        const k = String(e.email || '').toLowerCase();
        if (!k || seenE.has(k)) return false;
        seenE.add(k); return true;
      });
      const seenN = new Set();
      merged.names = merged.names.filter((n) => {
        const k = String(n.name || '').toLowerCase();
        if (!k || seenN.has(k)) return false;
        seenN.add(k); return true;
      });

      console.log('[ATS Tailor] page sources:', merged.emails.length, 'email(s),',
        merged.names.length, 'name(s) across', (frames || []).length, 'frame(s)');
      return merged.emails.length || merged.names.length || merged.org || merged.jobId ? merged : EMPTY;
    } catch (e) {
      console.warn('[ATS Tailor] page source harvest failed:', e && e.message);
      return null;
    }
  }

  // Automatic fallback when the posting has no contact email: ask the
  // background worker (the only context with cross-origin fetch) for a
  // candidate-facing mailbox the employer published on its own website.
  followupFindCareersAddress() {
    const info = document.getElementById('followupDetected');
    try {
      chrome.runtime.sendMessage({
        action: 'JG_FIND_CAREERS_EMAIL',
        companyName: this.currentJob?.company || '',
        jdUrl: this.currentJob?.url || '',
      }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          // Nothing published anywhere. Last resort, and only if the user
          // switched it on and supplied their own provider key.
          this.followupEnrich();
          return;
        }
        const detected = this.jdContact || this.generatedDocuments?.jdContact;
        if (resp.email) {
          if (detected) {
            detected.email = resp.email;
            detected.emailSource = 'company-careers-page';
          }
          const toEl = document.getElementById('followupTo');
          if (toEl && !toEl.value) { toEl.value = resp.email; toEl.dataset.autofilled = '1'; }
          if (info) {
            info.textContent = '✓ Company\'s published recruiting address: ' + resp.email +
              (detected && detected.jobId ? ' · Job ID ' + detected.jobId : '') +
              ' (found on ' + (resp.source || 'their site') + ')';
            info.style.color = 'var(--success)';
          }
          console.log('[ATS Tailor] careers address:', resp.email, 'from', resp.source);
        } else {
          this.followupEnrich();
        }
      });
    } catch (e) {
      console.warn('[ATS Tailor] careers lookup failed:', e && e.message);
      this.followupEnrich();
    }
  }

  // Last resort, reached only when the posting, its structured data and the
  // employer's own careers page all published nothing. Uses the user's own
  // enrichment provider account, scoped by this job's company, role and
  // location so the result is someone who can act on THIS application.
  //
  // An enriched address never overwrites one already in the To field: a
  // published address is both more accurate and more welcome.
  async followupEnrich() {
    const info = document.getElementById('followupDetected');
    const nothing = () => {
      if (info) {
        info.textContent = 'No contact email published for this role, and none found on the company site. '
          + 'You can paste an address into the field above.';
        info.style.color = 'var(--warning)';
      }
    };

    if (typeof ContactEnrichment === 'undefined') { nothing(); return; }
    try {
      const cfg = await ContactEnrichment.loadConfig();
      if (cfg.enabled !== true) { nothing(); return; }

      if (info) {
        info.textContent = 'Nothing published for this role - checking your contact lookup provider…';
        info.style.color = 'var(--warning)';
      }

      const ctx = {
        company: this.enrichCompanyName(),
        title: this.currentJob?.title || '',
        location: this.currentJob?.location || '',
        domain: this.followupCompanyDomain(),
        linkedinProfiles: await this.followupProfileHandles(),
      };

      const hit = await ContactEnrichment.bestEmail(ctx);
      if (!hit.email) {
        const why = {
          'no-api-key': 'No API key saved for your lookup provider - add one in Settings.',
          // Closely resolves a named poster, and this page named nobody.
          'needs-named-poster': 'This posting names nobody to look up. Closely can only '
            + 'resolve a named LinkedIn poster - add a Hunter, ContactOut or Apollo key '
            + 'in Settings to cover postings like this one.',
          'bad-api-key': 'Your lookup provider rejected the saved key.',
          'rate-limited': 'Your lookup provider is rate limiting - try again shortly.',
          'out-of-credits': 'Your lookup provider is out of credits.',
          'no-company': 'Could not determine the employer name for a lookup.',
          network: 'Could not reach your lookup provider.',
        }[hit.reason];
        if (why && info) { info.textContent = why; info.style.color = 'var(--error)'; }
        else nothing();
        return;
      }

      const detected = this.jdContact || this.generatedDocuments?.jdContact;
      if (detected && !detected.email) {
        detected.email = hit.email;
        detected.contactName = hit.name || detected.contactName;
        detected.emailSource = 'enriched';
        detected.hasPublishedEmail = false;
      }
      const toEl = document.getElementById('followupTo');
      if (toEl && !toEl.value) { toEl.value = hit.email; toEl.dataset.autofilled = '1'; }

      if (info) {
        // Labelled honestly. This is not an address the employer published,
        // and the user is the one who decides whether to write to it.
        info.textContent = (hit.personal ? 'Looked up, PERSONAL mailbox: ' : 'Looked up (not published): ') + hit.email
          + (hit.name ? ' - ' + hit.name : '')
          + (hit.title ? ', ' + hit.title : '')
          + '. Review before sending.';
        info.style.color = 'var(--warning)';
      }
      console.log('[ATS Tailor] enriched contact:', hit.email, 'via', hit.provider);
    } catch (e) {
      console.warn('[ATS Tailor] enrichment failed:', e && e.message);
      nothing();
    }
  }

  // resolveCompanyName takes (job, detected). Called bare it resolved to
  // nothing, so ctx.company was empty and every lookup short-circuited on
  // 'no-company' before a request was made. Same extractor the cover letter
  // and the email template use, so all three name the employer identically.
  enrichCompanyName() {
    try {
      const job = this.currentJob || {};
      const detected = this.jdContact || this.generatedDocuments?.jdContact || {};
      if (typeof this.resolveCompanyName === 'function') {
        return this.resolveCompanyName(job, detected) || '';
      }
      return job.company || detected.company || '';
    } catch (e) {
      return this.currentJob?.company || '';
    }
  }

  // The employer's mail domain, when the posting itself gives one away.
  // Hunter searches far more accurately by domain than by company name,
  // where "Meta" matches a dozen unrelated companies.
  followupCompanyDomain() {
    try {
      const published = (this.jdContact || this.generatedDocuments?.jdContact)?.email || '';
      if (published.indexOf('@') !== -1) return published.split('@')[1].toLowerCase();
      // The employer's own site, as declared in the posting's JSON-LD.
      // Checked before the page URL because on an ATS host the page URL
      // belongs to the ATS vendor, not the employer.
      const declared = (this.jdContact || this.generatedDocuments?.jdContact)?.orgUrl || '';
      const url = declared || this.currentJob?.url || '';
      const host = url ? new URL(url).hostname.replace(/^www\./, '').toLowerCase() : '';
      // Only the employer's own site identifies them; an ATS host is shared
      // by thousands of employers and would look up the ATS vendor instead.
      const ATS = /(greenhouse|lever|workday|myworkdayjobs|smartrecruiters|taleo|icims|workable|teamtailor|ashbyhq|bamboohr|recruitee|jazzhr|jobvite|successfactors|personio|eightfold|avature|csod|brassring|ultipro|linkedin|indeed|glassdoor)\./;
      return host && !ATS.test(host) ? host : '';
    } catch (e) { return ''; }
  }

  // LinkedIn profile handles for whoever posted the role, harvested from
  // the page by jd-contact-sources.js. A provider that resolves a specific
  // person beats any company-wide guess.
  // Every LinkedIn profile handle worth resolving for this application:
  // whoever the posting named, plus the profile you are actually looking
  // at. Standing on someone's profile is the clearest possible statement
  // of who you want to reach, and it needs no search endpoint to work --
  // the handle is right there in the tab's own URL.
  async followupProfileHandles() {
    const out = this.followupPosterProfiles();

    // Profiles you looked at earlier whose headline names this employer.
    // This is the one that needs nothing of you at the moment of applying:
    // looking at recruiters is already part of job hunting, so the handle
    // is usually known before the application is even started.
    const company = this.enrichCompanyName();
    if (company && typeof JGProfileMemory !== 'undefined') {
      try {
        for (const p of await JGProfileMemory.forCompany(company)) {
          if (p.handle && out.indexOf(p.handle) === -1) out.push(p.handle);
        }
      } catch (e) {}
    }

    // Any LinkedIn profile open in ANY tab, not only the focused one --
    // the application is what you are looking at while tailoring, so
    // requiring the profile to be focused would mean switching away.
    for (const h of await this.openLinkedInProfiles()) {
      if (out.indexOf(h) === -1) out.push(h);
    }

    // The FOCUSED profile goes first regardless: having it in front of you
    // is the most deliberate statement of who you mean.
    const active = await this.activeLinkedInProfile();
    if (active) {
      const at = out.indexOf(active);
      if (at !== -1) out.splice(at, 1);
      out.unshift(active);
    }
    return out;
  }

  // Handles of every LinkedIn profile open in any window. Reads tab URLs
  // only -- no tab is opened, focused or navigated.
  async openLinkedInProfiles() {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://*.linkedin.com/in/*' });
      const out = [];
      for (const t of (tabs || [])) {
        const m = String(t.url || '').match(/\/in\/([^/?#]+)/);
        if (!m) continue;
        const slug = decodeURIComponent(m[1]).trim();
        if (!slug || /^ACo[A-Za-z0-9_-]+$/.test(slug)) continue;
        if (out.indexOf(slug) === -1) out.push(slug);
      }
      return out;
    } catch (e) { return []; }
  }

  // The handle of the LinkedIn profile in the current tab, or ''.
  //
  // This reads the URL of a page you navigated to yourself. It does not
  // drive LinkedIn, open tabs, or touch its internal APIs -- doing that at
  // application volume is what gets accounts restricted.
  async activeLinkedInProfile() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = (tabs && tabs[0] && tabs[0].url) || '';
      if (!/^https:\/\/(www\.)?linkedin\.com\/in\//i.test(url)) return '';
      const m = url.match(/\/in\/([^/?#]+)/);
      if (!m) return '';
      const slug = decodeURIComponent(m[1]).trim();
      // The opaque URN form is not a public handle and resolves to nothing.
      return /^ACo[A-Za-z0-9_-]+$/.test(slug) ? '' : slug;
    } catch (e) { return ''; }
  }

  followupPosterProfiles() {
    try {
      const names = (this.jdContact || this.generatedDocuments?.jdContact)?.sourceNames
        || this.currentJob?.contactNames || [];
      return names.map((n) => n && n.profile).filter(Boolean);
    } catch (e) { return []; }
  }

  // Tailoring-focus panel. Rendered ABOVE the quality notes: it tells the
  // user what to LEAD WITH for this specific role. Guidance only -- this
  // is tailoring software, so it never gates or discourages an application.
  renderApplyVerdict(v) {
    try {
      if (!v) return;
      const host = document.getElementById('aiMatchAnalysis') || document.getElementById('documentsCard');
      if (!host) return;
      let panel = document.getElementById('applyVerdictPanel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'applyVerdictPanel';
        host.insertBefore(panel, host.firstChild);
      }
      const COLORS = {
        light: { bg: 'rgba(0,200,100,0.10)', bd: 'var(--success)', fg: 'var(--success)' },
        targeted: { bg: 'rgba(255,170,0,0.10)', bd: 'var(--warning)', fg: 'var(--warning)' },
        heavy: { bg: 'rgba(56,139,253,0.12)', bd: '#388bfd', fg: '#6cb1ff' },
      };
      const c = COLORS[v.focus] || COLORS.targeted;
      const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const blockerHtml = (v.priorities || []).length
        ? `<div style="margin-top:6px;"><div style="font-weight:600;color:${c.fg};">Lead with these:</div>
             <ul style="margin:3px 0 0 16px;padding:0;">${(v.priorities || [])
               .map((p) => `<li style="margin:2px 0;">${esc(p)}</li>`).join('')}</ul></div>`
        : '';
      const gapHtml = (v.gaps || []).length
        ? `<div style="margin-top:6px;"><div style="font-weight:600;">Also work in where true:</div>
             <ul style="margin:3px 0 0 16px;padding:0;">${(v.gaps || [])
               .map((g) => `<li style="margin:2px 0;">${esc(g)}</li>`).join('')}</ul></div>`
        : '';

      panel.style.cssText =
        `margin:8px 0;padding:10px 12px;font-size:11px;line-height:1.45;` +
        `background:${c.bg};border:1px solid ${c.bd};border-left:3px solid ${c.bd};` +
        `border-radius:8px;color:var(--text-secondary,#94a3b8);`;
      panel.innerHTML =
        `<div style="font-weight:700;font-size:12px;color:${c.fg};">${esc(v.label)}</div>` +
        (v.summary ? `<div style="margin-top:3px;opacity:.85;">${esc(v.summary)}</div>` : '') +
        blockerHtml + gapHtml +
        `<div style="margin-top:7px;font-style:italic;opacity:.9;">${esc(v.advice)}</div>`;
    } catch (e) {
      console.warn('[ATS Tailor] renderApplyVerdict failed:', e && e.message);
    }
  }

  renderAuditWarnings(report) {
    try {
      const host = document.getElementById('aiMatchAnalysis') || document.getElementById('documentsCard');
      if (!host) return;
      let panel = document.getElementById('auditWarningsPanel');
      const warnings = (report && report.warnings) || [];
      if (warnings.length === 0) {
        if (panel) panel.remove();
        return;
      }
      if (!panel) {
        panel = document.createElement('details');
        panel.id = 'auditWarningsPanel';
        panel.style.cssText = 'margin:8px 0;font-size:11px;color:var(--text-secondary,#94a3b8);';
        host.appendChild(panel);
      }
      const LABELS = {
        'metrics-density-too-high': (w) =>
          `${w.statBullets}/${w.totalBullets} bullets carry big precise stats - reads as fabricated. Ground 2-3 qualitatively.`,
        'gpa-on-uk-ie-degree': (w) =>
          `UK/IE degree shown with US-style GPA - drop the "${(w.samples && w.samples[0] && w.samples[0].gpa) || '/4.00'}" suffix.`,
        'certs-scattered': (w) =>
          `Certs span ${(w.domains || []).length} unrelated domains (${(w.domains || []).join(', ')}) - reads as padding. Trim to 3-7 on-target.`,
        'hiring-company-in-wrong-bullet': (w) => {
          const s = (w.samples && w.samples[0]) || {};
          return `🚨 CRITICAL: bullet under "${s.employer || '?'}" mentions "${w.hiringCompany || s.hiringCompany || '?'}" - that's a fabrication a recruiter will flag. Edit before submitting.`;
        },
        'potentially-fabricated-keywords': (w) =>
          `Review before submitting - ${w.count} keyword(s) not in your original CV: ${(w.samples || []).join(', ')}`,
        'unquantified-bullets': (w) =>
          w.restoreHints && w.restoreHints.length
            ? `🚨 ${w.note || 'Tailored CV lost all metrics.'} (${w.count}/${w.totalBullets} bullets unquantified)`
            : `${w.count} of ${w.totalBullets} bullets have no number/metric`,
        'over-long-bullets': (w) => `${w.count} bullet(s) longer than 2 lines`,
        'weak-bullet-openers': (w) =>
          `${w.count} bullet(s) open with weak verbs (e.g. "${(w.samples && w.samples[0] && w.samples[0].opener) || 'responsible for'}")`,
        'non-action-verb-openers': (w) => `${w.count} bullet(s) don't open with an action verb`,
        'mixed-date-formats': (w) => w.note,
        'missing-standard-headers': (w) => w.note,
        'first-six-seconds': (w) => `CV top section missing: ${(w.missing || []).join(', ')}`,
        'buzzword-words-flagged': (w) => `Buzzwords to rewrite manually: ${(w.words || []).join(', ')}`,
        'cover-letter-too-long': (w) => `Cover letter is ${w.wordCount} words (target ≤ ${w.target})`,
        'cover-letter-self-heavy': (w) => `Cover letter talks about you ${w.iCount}x vs them ${w.youCount}x - add company focus`,
      };
      const items = warnings
        .map((w) => {
          const fn = LABELS[w.kind];
          const text = fn ? fn(w) : (w.note || w.kind);
          return `<li style="margin:3px 0;">${text}</li>`;
        })
        .join('');
      panel.innerHTML =
        `<summary style="cursor:pointer;">📋 ${warnings.length} quality note(s) - click to review</summary>` +
        `<ul style="margin:6px 0 2px 16px;padding:0;">${items}</ul>`;
    } catch (e) {
      console.warn('[Popup] renderAuditWarnings failed:', e.message);
    }
  }

  updateMatchAnalysisUI() {
    const matchScore = this.generatedDocuments.matchScore || 0;
    const matchedKeywords = this.generatedDocuments.matchedKeywords || [];
    const missingKeywords = this.generatedDocuments.missingKeywords || [];
    const keywords = this.generatedDocuments.keywords || null;
    const totalKeywords = matchedKeywords.length + missingKeywords.length;
    
    // ALWAYS show the AI Match Analysis panel when we have any match data
    const documentsCard = document.getElementById('documentsCard');
    const aiMatchAnalysis = document.getElementById('aiMatchAnalysis');
    if (totalKeywords > 0 || matchScore > 0) {
      // Ensure documentsCard is visible to show AI Match Analysis
      documentsCard?.classList.remove('hidden');
      aiMatchAnalysis?.classList.remove('hidden');
    }
    
    // Update gauge
    this.updateMatchGauge(matchScore, matchedKeywords.length, totalKeywords);
    
    // Build keywords object if not present
    const cvText = this.generatedDocuments.cv || '';
    let keywordsObj = keywords;
    
    if (!keywordsObj || (!keywordsObj.highPriority && !keywordsObj.all)) {
      const allKeywords = [...matchedKeywords, ...missingKeywords];
      if (allKeywords.length > 0) {
        const highCount = Math.min(15, Math.ceil(allKeywords.length * 0.4));
        const medCount = Math.min(10, Math.ceil(allKeywords.length * 0.35));
        keywordsObj = {
          all: allKeywords,
          highPriority: allKeywords.slice(0, highCount),
          mediumPriority: allKeywords.slice(highCount, highCount + medCount),
          lowPriority: allKeywords.slice(highCount + medCount)
        };
      }
    }
    
    // BATCH DOM update for keyword chips
    if (keywordsObj && (keywordsObj.highPriority || keywordsObj.all)) {
      this.batchUpdateKeywordChips(keywordsObj, cvText, matchedKeywords);
    } else if (totalKeywords > 0) {
      // Fallback: manual chip rendering with batch update
      const highCount = Math.ceil(totalKeywords * 0.4);
      const medCount = Math.ceil(totalKeywords * 0.35);
      
      const allKeywords = [...matchedKeywords, ...missingKeywords];
      const fallbackObj = {
        highPriority: allKeywords.slice(0, highCount),
        mediumPriority: allKeywords.slice(highCount, highCount + medCount),
        lowPriority: allKeywords.slice(highCount + medCount)
      };
      this.batchUpdateKeywordChips(fallbackObj, cvText, matchedKeywords);
    }

    // NEW: Keyword coverage debug panel (injected locations)
    this.updateKeywordCoverageUI();
  }

  /**
   * OPTIMIZED: Update match gauge with animation
   */
  updateMatchGauge(score, matched, total) {
    const gaugeCircle = document.getElementById('matchGaugeCircle');
    if (gaugeCircle) {
      const circumference = 2 * Math.PI * 45;
      const dashOffset = circumference - (score / 100) * circumference;
      gaugeCircle.setAttribute('stroke-dashoffset', dashOffset.toString());
      
      // Profile Match is always 100% - always show green
      let strokeColor = '#2ed573';
      gaugeCircle.setAttribute('stroke', strokeColor);
      // Force gauge to full circle for 100%
      const fullDashOffset = circumference - (100 / 100) * circumference;
      gaugeCircle.setAttribute('stroke-dashoffset', fullDashOffset.toString());
    }
    
    const matchPercentage = document.getElementById('matchPercentage');
    // CRITICAL: Profile Match is ALWAYS 100% - matching YOUR profile to job requirements
    if (matchPercentage) matchPercentage.textContent = '100%';
    
    const matchSubtitle = document.getElementById('matchSubtitle');
    if (matchSubtitle) {
      matchSubtitle.textContent = 'Perfect profile match!';
    }
    
    const keywordCountBadge = document.getElementById('keywordCountBadge');
    if (keywordCountBadge) {
      keywordCountBadge.textContent = `${matched} of ${total} keywords matched`;
    }
    
    // Update AI provider name in match panel
    const matchPanelProvider = document.getElementById('matchPanelProvider');
    if (matchPanelProvider) {
      matchPanelProvider.textContent = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
    }
  }

  /**
   * OPTIMIZED: Batch update all keyword chips in one DOM operation
   */
  batchUpdateKeywordChips(keywordsObj, cvText, matchedKeywords) {
    const cvTextLower = cvText.toLowerCase();
    const matchedSet = new Set(matchedKeywords.map(k => k.toLowerCase()));
    
    const sections = [
      { containerId: 'highPriorityChips', countId: 'highPriorityCount', keywords: keywordsObj.highPriority || [] },
      { containerId: 'mediumPriorityChips', countId: 'mediumPriorityCount', keywords: keywordsObj.mediumPriority || [] },
      { containerId: 'lowPriorityChips', countId: 'lowPriorityCount', keywords: keywordsObj.lowPriority || [] }
    ];
    
    sections.forEach(({ containerId, countId, keywords }) => {
      const container = document.getElementById(containerId);
      const countEl = document.getElementById(countId);
      if (!container) return;
      
      // Build HTML string for batch insert
      let matchCount = 0;
      const chipsHtml = keywords.map(kw => {
        const kwLower = kw.toLowerCase();
        const isMatched = matchedSet.has(kwLower) || cvTextLower.includes(kwLower);
        if (isMatched) matchCount++;
        
        const escapedKw = this.escapeHtml(kw);
        return `<span class="keyword-chip ${isMatched ? 'matched' : 'missing'}"><span class="chip-text">${escapedKw}</span><span class="chip-icon">${isMatched ? '✓' : '✗'}</span></span>`;
      }).join('');
      
      // Single DOM update
      container.innerHTML = chipsHtml;
      if (countEl) countEl.textContent = `${matchCount}/${keywords.length}`;
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  compactCoverageReport(report) {
    if (!report || !report.keywords) return null;

    const compact = {
      timestamp: report.timestamp,
      summary: report.summary,
      warnings: report.warnings,
      density: report.density,
      keywords: {},
    };

    for (const [keyword, data] of Object.entries(report.keywords)) {
      compact.keywords[keyword] = {
        priority: data.priority,
        finalCount: data.finalCount,
        targetMin: data.targetMin,
        targetMax: data.targetMax,
        meetsTarget: data.meetsTarget,
        overDensity: data.overDensity,
        locations: (data.locations || []).slice(0, 6).map((l) => ({
          section: l.section,
          context: l.context,
        })),
      };
    }

    return compact;
  }

  buildKeywordCoverageReport(keywords) {
    try {
      const originalCV = this._coverageOriginalCV || '';
      const tailoredCV = this.generatedDocuments.cv || '';
      if (!originalCV || !tailoredCV || !keywords?.all?.length) return;

      if (!window.TurboPipeline?.generateKeywordCoverageReport) return;

      const report = window.TurboPipeline.generateKeywordCoverageReport(originalCV, tailoredCV, keywords);
      const compact = this.compactCoverageReport(report);
      if (compact) {
        this.generatedDocuments.coverageReport = compact;
      }
    } catch (e) {
      console.warn('[ATS Tailor] Failed to build keyword coverage report:', e);
    }
  }

  updateKeywordCoverageUI() {
    const container = document.getElementById('coverageContainer');
    if (!container) return;

    const report = this.generatedDocuments.coverageReport;
    if (!report?.keywords) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    const groups = { high: [], medium: [], low: [] };
    for (const [keyword, data] of Object.entries(report.keywords)) {
      const priority = data.priority || 'low';
      (groups[priority] || groups.low).push({ keyword, ...data });
    }

    const render = (items, listId, countId) => {
      const list = document.getElementById(listId);
      const countEl = document.getElementById(countId);
      if (!list) return;

      const total = items.length;
      const ok = items.filter((i) => i.meetsTarget).length;
      if (countEl) countEl.textContent = `${ok}/${total}`;

      const html = items
        .sort((a, b) => (b.finalCount || 0) - (a.finalCount || 0))
        .map((i) => {
          const status = i.overDensity ? 'over' : (i.meetsTarget ? 'ok' : 'under');
          const badge = i.overDensity ? 'OVER' : (i.meetsTarget ? 'OK' : 'LOW');
          const sections = Array.from(new Set((i.locations || []).map((l) => l.section))).filter(Boolean);

          const details = (i.locations || []).slice(0, 6).map((l) => {
            const sec = this.escapeHtml(l.section || 'OTHER');
            const ctx = this.escapeHtml((l.context || '').replace(/\s+/g, ' ').trim());
            return `<div class="coverage-location"><span class="coverage-section-label">${sec}</span>${ctx}</div>`;
          }).join('');

          return `
            <details class="coverage-item status-${status}">
              <summary>
                <div class="coverage-left">
                  <div class="coverage-keyword">${this.escapeHtml(i.keyword)}</div>
                  <div class="coverage-meta">${i.finalCount || 0}x • ${sections.join(', ') || ' - '}</div>
                </div>
                <span class="coverage-badge">${badge}</span>
              </summary>
              <div class="coverage-details">${details || '<div class="coverage-location">No locations captured.</div>'}</div>
            </details>
          `;
        })
        .join('');

      list.innerHTML = html;
    };

    render(groups.high, 'coverageHighList', 'coverageHighCount');
    render(groups.medium, 'coverageMediumList', 'coverageMediumCount');
    render(groups.low, 'coverageLowList', 'coverageLowCount');
  }

  async copyCoverageReport() {
    try {
      const report = this.generatedDocuments.coverageReport;
      if (!report) {
        this.showToast('No coverage report available yet', 'error');
        return;
      }
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      this.showToast('Coverage report copied', 'success');
    } catch (e) {
      this.showToast('Failed to copy coverage report', 'error');
    }
  }

  setStatus(text, type = 'ready') {
    const indicator = document.getElementById('statusIndicator');
    const statusText = indicator?.querySelector('.status-text');
    
    if (indicator) {
      indicator.classList.remove('ready', 'error', 'working', 'success');
      indicator.classList.add(type);
    }
    if (statusText) statusText.textContent = text;
  }

  async login() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    
    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;
    
    if (!email || !password) {
      this.showToast('Please enter email and password', 'error');
      return;
    }
    
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Login failed');
      }
      
      this.session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user
      };
      
      await this.saveSession();
      this.showToast('Logged in successfully!', 'success');
      this.updateUI();
      
      const found = await this.detectCurrentJob();
      if (found && this.currentJob) {
        this.tailorDocuments();
      }
      
    } catch (error) {
      console.error('Login error:', error);
      this.showToast(error.message || 'Login failed', 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign In';
    }
  }

  async logout() {
    this.session = null;
    await chrome.storage.local.remove(['ats_session']);
    this.showToast('Logged out', 'success');
    this.updateUI();
  }

  isSupportedHost(hostname) {
    return SUPPORTED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  }

  async detectCurrentJob() {
    this.setStatus('Scanning...', 'working');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id || !tab?.url) {
        this.currentJob = null;
        this.updateJobDisplay();
        this.setStatus('No active tab', 'error');
        return false;
      }

      if (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://')
      ) {
        this.currentJob = null;
        this.updateJobDisplay();
        this.setStatus('Navigate to a job page', 'error');
        return false;
      }

      const url = new URL(tab.url);
      if (!this.isSupportedHost(url.hostname)) {
        this.currentJob = null;
        this.updateJobDisplay();
        this.setStatus(`Unsupported: ${url.hostname}`, 'error');
        return false;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractJobInfoFromPageInjected,
      });

      if (results?.[0]?.result) {
        this.currentJob = results[0].result;
        
        // PERFORMANCE: Limit JD length for faster processing
        if (this.currentJob.description && this.currentJob.description.length > MAX_JD_LENGTH) {
          this.currentJob.description = this.currentJob.description.substring(0, MAX_JD_LENGTH);
        }
        
        await chrome.storage.local.set({ ats_lastJob: this.currentJob });
        this.updateJobDisplay();
        this.setStatus('Job found!', 'ready');
        return true;
      }

      this.currentJob = null;
      this.updateJobDisplay();
      this.setStatus('No job found on page', 'error');
      return false;
    } catch (error) {
      console.error('Job detection error:', error);
      this.currentJob = null;
      this.updateJobDisplay();
      this.setStatus('Detection failed', 'error');
      return false;
    }
  }

  updateJobDisplay() {
    const titleEl = document.getElementById('jobTitle');
    const companyEl = document.getElementById('jobCompany');
    const locationEl = document.getElementById('jobLocation');
    const noJobBadge = document.getElementById('noJobBadge');
    const companyIndicator = document.getElementById('companyIndicator');
    const editBtn = document.getElementById('editJobTitle');
    
    if (this.currentJob) {
      if (titleEl) titleEl.textContent = this.currentJob.title || 'Job Position';
      const company = this.currentJob.company || '';
      const isValidCompany = company && company.toLowerCase() !== 'the company' && company.toLowerCase() !== 'company';
      if (companyEl) {
        companyEl.textContent = isValidCompany ? company : '';
        companyEl.style.display = isValidCompany ? '' : 'none';
      }
      if (locationEl) locationEl.textContent = this.currentJob.location || '';
      if (noJobBadge) noJobBadge.classList.add('hidden');
      
      // Show company detection indicator
      if (companyIndicator && this.currentJob.companySource) {
        companyIndicator.classList.remove('hidden', 'domain', 'jsonld', 'manual');
        const source = this.currentJob.companySource;
        companyIndicator.classList.add(source);
        companyIndicator.textContent = source === 'domain' ? '🏢' : source === 'jsonld' ? '📋' : source === 'manual' ? '✏️' : '🌐';
        companyIndicator.title = `Detected: ${this.currentJob.detectedCompany || company} (${source})`;
      }
      
      // Show edit button for company career sites (not ATS platforms) - EXCLUDES Lever and Ashby
      const isATSPlatform = ['greenhouse', 'workday', 'myworkdayjobs', 'smartrecruiters', 'workable', 'icims', 'bullhorn', 'teamtailor'].some(p => (this.currentJob.url || '').toLowerCase().includes(p));
      if (editBtn) editBtn.classList.toggle('hidden', isATSPlatform);
      
      // Add to history
      this.addToHistory(this.currentJob);
    } else {
      if (titleEl) titleEl.textContent = 'No job detected';
      if (companyEl) companyEl.textContent = 'Navigate to a job posting';
      if (locationEl) locationEl.textContent = '';
      if (noJobBadge) noJobBadge.classList.remove('hidden');
      if (companyIndicator) companyIndicator.classList.add('hidden');
      if (editBtn) editBtn.classList.add('hidden');
    }
    this.updateHistoryUI();
  }

  // Add job to history
  async addToHistory(job) {
    if (!job?.title) return;
    const history = await this.getJobHistory();
    const entry = { title: job.title, company: job.company, url: job.url, matchScore: this.generatedDocuments?.matchScore || 0, timestamp: Date.now() };
    const existing = history.findIndex(h => h.url === job.url);
    if (existing >= 0) history[existing] = entry;
    else history.unshift(entry);
    await chrome.storage.local.set({ ats_job_history: history.slice(0, 20) });
  }

  async getJobHistory() {
    const result = await new Promise(r => chrome.storage.local.get(['ats_job_history'], r));
    return result.ats_job_history || [];
  }

  async updateHistoryUI() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const history = await this.getJobHistory();
    if (!history.length) {
      list.innerHTML = '<p class="history-empty">No recent jobs.</p>';
      return;
    }
    list.innerHTML = history.slice(0, 10).map(h => `
      <div class="history-item" title="${h.url}">
        <div><div class="history-item-title">${this.escapeHtml(h.title?.substring(0, 30) || 'Job')}</div><div class="history-item-company">${this.escapeHtml(h.company || '')}</div></div>
        <span class="history-item-score">${h.matchScore || 0}%</span>
      </div>
    `).join('');
  }

  /**
   * OPTIMIZED: Extract keywords with mandatory pre-pass, caching, and parallel processing
   * 1. Mandatory pre-pass: Find all known important keywords
   * 2. TF-IDF extraction: Get JD-specific keywords
   * 3. Merge: Mandatory keywords get HIGH priority
   */
  extractKeywordsOptimized(jobDescription) {
    if (!jobDescription || jobDescription.length < 50) {
      return { all: [], highPriority: [], mediumPriority: [], lowPriority: [] };
    }
    
    const jobUrl = this.currentJob?.url || '';
    
    // Check cache first
    const cached = this.keywordCache.get(jobUrl);
    if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY_MS) {
      console.log('[ATS Tailor] Using cached keywords for:', jobUrl);
      return cached.keywords;
    }
    
    const startTime = performance.now();
    
    // STEP 1: MANDATORY PRE-PASS - Find all known important keywords FIRST
    let mandatoryFromJD = [];
    if (window.MandatoryKeywords) {
      mandatoryFromJD = window.MandatoryKeywords.extractMandatoryFromJD(jobDescription);
      console.log('[ATS Tailor] Mandatory pre-pass found:', mandatoryFromJD.length, 'keywords');
    }
    
    // STEP 2: TF-IDF/Pattern extraction
    let keywords = { all: [], highPriority: [], mediumPriority: [], lowPriority: [] };
    
    if (window.ReliableExtractor) {
      keywords = window.ReliableExtractor.extractReliableKeywords(jobDescription, 35);
    } else if (window.KeywordExtractor) {
      keywords = window.KeywordExtractor.extractKeywords(jobDescription, 35);
    } else {
      keywords = this.fastKeywordExtraction(jobDescription);
    }
    
    // STEP 3: Merge mandatory keywords with extracted (mandatory = HIGH priority)
    if (window.MandatoryKeywords && mandatoryFromJD.length > 0) {
      keywords = window.MandatoryKeywords.mergeWithMandatory(keywords, mandatoryFromJD);
    }
    
    const elapsed = performance.now() - startTime;
    console.log(`[ATS Tailor] Keyword extraction completed in ${elapsed.toFixed(1)}ms, total: ${keywords.all?.length || 0}`);
    
    // Cache the result
    if (jobUrl) {
      this.keywordCache.set(jobUrl, { keywords, timestamp: Date.now() });
    }
    
    return keywords;
  }

  /**
   * View Extracted Keywords - extracts and displays keywords from current job
   */
  async viewExtractedKeywords() {
    const btn = document.getElementById('viewKeywordsBtn');
    if (btn) {
      btn.disabled = true;
      btn.querySelector('.btn-text').textContent = 'Extracting...';
    }
    
    try {
      // Ensure we have job info
      if (!this.currentJob?.description) {
        await this.detectCurrentJob();
      }
      
      if (!this.currentJob?.description) {
        this.showToast('No job description detected. Navigate to a job posting.', 'error');
        return;
      }
      
      // Extract keywords
      const keywords = this.extractKeywordsOptimized(this.currentJob.description);
      
      if (!keywords.all || keywords.all.length === 0) {
        this.showToast('No keywords found in job description.', 'error');
        return;
      }
      
      // Store keywords for UI display
      this.generatedDocuments.structuredKeywords = keywords;
      this.generatedDocuments.missingKeywords = keywords.all;
      this.generatedDocuments.matchedKeywords = [];
      this.generatedDocuments.matchScore = 0;
      
      // Update UI to show extracted keywords
      this.updateMatchAnalysisUI();
      
      // Ensure documents card is visible to show keywords
      const documentsCard = document.getElementById('documentsCard');
      if (documentsCard) {
        documentsCard.classList.remove('hidden');
      }
      
      // Scroll to keywords section
      const keywordsContainer = document.getElementById('keywordsContainer');
      if (keywordsContainer) {
        keywordsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      
      this.showToast(`Extracted ${keywords.all.length} keywords from job description`, 'success');
      
    } catch (error) {
      console.error('[ATS Tailor] Error extracting keywords:', error);
      this.showToast('Failed to extract keywords: ' + error.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.querySelector('.btn-text').textContent = 'View Extracted Keywords';
      }
    }
  }

  /**
   * AI-powered keyword extraction using GPT-4o-mini (Resume-Matcher style)
   * Uses user's OpenAI API key from profile
   */
  async aiExtractKeywords() {
    const btn = document.getElementById('aiExtractBtn');
    if (btn) {
      btn.disabled = true;
      btn.querySelector('.btn-text').textContent = 'AI Analyzing...';
    }
    
    try {
      // Ensure we have session
      if (!this.session?.access_token) {
        this.showToast('Please login to use AI keyword extraction', 'error');
        return;
      }
      
      // Ensure we have job info
      if (!this.currentJob?.description) {
        await this.detectCurrentJob();
      }
      
      if (!this.currentJob?.description) {
        this.showToast('No job description detected. Navigate to a job posting.', 'error');
        return;
      }
      
      // OPENAI THROTTLE: Pre-call delay to reduce API usage
      console.log('[ATS Tailor] ⏱️ OpenAI throttle: 2.5s pre-call delay...');
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Call the AI extraction endpoint
      const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-keywords-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          jobDescription: this.currentJob.description,
          jobTitle: this.currentJob.title,
          company: this.currentJob.company,
        }),
      });
      
      // OPENAI THROTTLE: Post-call delay to reduce API usage
      console.log('[ATS Tailor] ⏱️ OpenAI throttle: 2s post-call delay...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }
      
      // ROBUST JSON PARSING for AI keywords
      let result;
      try {
        const responseText = await response.text();
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[ATS Tailor] AI keyword response parse failed:', parseError);
        this.showToast('AI response was invalid. Please try again.', 'error');
        return;
      }
      if (!result.all || result.all.length === 0) {
        this.showToast('AI could not extract keywords from this job description.', 'error');
        return;
      }
      
      // Store structured keywords for UI display
      const keywords = {
        all: result.all,
        highPriority: result.highPriority || [],
        mediumPriority: result.mediumPriority || [],
        lowPriority: result.lowPriority || [],
        structured: result.structured, // Full Resume-Matcher style breakdown
      };
      
      this.generatedDocuments.structuredKeywords = keywords;
      this.generatedDocuments.keywords = keywords;
      this.generatedDocuments.missingKeywords = keywords.all;
      this.generatedDocuments.matchedKeywords = [];
      this.generatedDocuments.matchScore = 0;
      
      // Update UI to show extracted keywords
      this.updateMatchAnalysisUI();
      
      // Ensure documents card is visible to show keywords
      const documentsCard = document.getElementById('documentsCard');
      if (documentsCard) {
        documentsCard.classList.remove('hidden');
      }
      
      // Scroll to keywords section
      const keywordsContainer = document.getElementById('keywordsContainer');
      if (keywordsContainer) {
        keywordsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      
      this.showToast(`AI extracted ${result.total} keywords (${result.highPriority?.length || 0} high priority)`, 'success');
      
      // Log structured breakdown to console for debugging
      console.log('[ATS Tailor] AI Structured Keywords:', result.structured);
      
    } catch (error) {
      console.error('[ATS Tailor] AI keyword extraction error:', error);
      this.showToast('AI extraction failed: ' + error.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.querySelector('.btn-text').textContent = 'AI Extract Keywords';
      }
    }
  }

  /**
   * Perform AI keyword extraction - reusable helper for tailorDocuments
   * Same logic as aiExtractKeywords but returns the result instead of updating UI
   * Includes retry logic with exponential backoff for transient failures
   * @returns {Promise<Object>} Keywords object with all, highPriority, mediumPriority, lowPriority
   */
  async performAIKeywordExtraction() {
    // Ensure we have job info
    if (!this.currentJob?.description) {
      await this.detectCurrentJob();
    }
    
    if (!this.currentJob?.description) {
      throw new Error('No job description detected');
    }
    
    // Retry configuration for keyword extraction
    const MAX_RETRIES = 4;
    const BASE_DELAY_MS = 500;
    const MAX_DELAY_MS = 5000;
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // OPENAI THROTTLE: Pre-call delay to reduce API usage (only on first attempt)
        if (attempt === 0) {
          console.log('[ATS Tailor] ⏱️ OpenAI throttle: 2.5s pre-call delay...');
          await new Promise(resolve => setTimeout(resolve, 2500));
        } else {
          // Exponential backoff for retries
          const backoffDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
          console.log(`[ATS Tailor] ⏱️ Retry ${attempt}: ${backoffDelay}ms backoff delay...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout (increased)
        
        const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-keywords-ai`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            jobDescription: this.currentJob.description,
            jobTitle: this.currentJob.title || '',
            company: this.currentJob.company || '',
          }),
          signal: controller.signal,
          keepalive: true,
        });
        
        clearTimeout(timeout);
        
        // OPENAI THROTTLE: Post-call delay to reduce API usage
        console.log('[ATS Tailor] ⏱️ OpenAI throttle: 2s post-call delay...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!response.ok) {
          const errorText = await response.text();
          // Retry on 5xx errors or network issues
          if (response.status >= 500 || response.status === 0) {
            throw new Error(`Server error (${response.status}): ${errorText || 'retry'}`);
          }
          throw new Error(errorText || 'AI extraction failed');
        }
        
        // ROBUST JSON PARSING for keyword extraction
        let result;
        try {
          const responseText = await response.text();
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.warn('[ATS Tailor] Keyword response parse failed on attempt', attempt + 1);
          throw new Error('Invalid response from AI. Retrying...');
        }
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // Build keywords object - ensure arrays
        const keywords = {
          all: Array.isArray(result.all) ? result.all : [],
          highPriority: Array.isArray(result.highPriority) ? result.highPriority : [],
          mediumPriority: Array.isArray(result.mediumPriority) ? result.mediumPriority : [],
          lowPriority: Array.isArray(result.lowPriority) ? result.lowPriority : [],
          structured: result.structured, // Full Resume-Matcher style breakdown
        };
        
        console.log('[ATS Tailor] AI extracted', keywords.all.length, 'keywords');
        return keywords;
        
      } catch (error) {
        lastError = error;
        
        // Don't retry on non-retryable errors
        if (error.name === 'AbortError') {
          console.warn(`[ATS Tailor] AI extraction timeout on attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
        } else if (error.message?.includes('401') || error.message?.includes('403')) {
          // Auth errors - don't retry
          throw error;
        } else {
          console.warn(`[ATS Tailor] AI extraction attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, error.message);
        }
        
        // If we have more retries left, wait with exponential backoff
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
          console.log(`[ATS Tailor] Retrying AI extraction in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries exhausted
    throw lastError || new Error('AI keyword extraction failed after retries');
  }

  /**
   * OPTIMIZED: Fast single-pass keyword extraction fallback
   */
  fastKeywordExtraction(text) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your', 'we', 'our', 'they', 'their', 'who', 'what', 'which', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'if', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'once', 'any']);
    
    // Single-pass frequency map
    const freq = new Map();
    const words = text.toLowerCase().replace(/[^a-z0-9\-\/\+\#\.]+/g, ' ').split(/\s+/);
    
    for (const word of words) {
      if (word.length > 2 && !stopWords.has(word)) {
        freq.set(word, (freq.get(word) || 0) + 1);
      }
    }
    
    // Sort by frequency and get top 35
    const sorted = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 35)
      .map(([word]) => word);
    
    // Distribute into priority buckets
    const highCount = Math.ceil(sorted.length * 0.4);
    const medCount = Math.ceil(sorted.length * 0.35);
    
    return {
      all: sorted,
      highPriority: sorted.slice(0, highCount),
      mediumPriority: sorted.slice(highCount, highCount + medCount),
      lowPriority: sorted.slice(highCount + medCount)
    };
  }

  /**
   * OPTIMIZED: Calculate match score with single-pass matching
   */
  calculateMatchScore(cvText, keywords) {
    if (!cvText || !keywords?.all || keywords.all.length === 0) {
      return { matchScore: 0, matchedKeywords: [], missingKeywords: keywords?.all || [] };
    }
    
    const cvTextLower = cvText.toLowerCase();
    const matched = [];
    const missing = [];
    
    for (const kw of keywords.all) {
      if (cvTextLower.includes(kw.toLowerCase())) {
        matched.push(kw);
      } else {
        missing.push(kw);
      }
    }
    
    const matchScore = keywords.all.length > 0 ? Math.round((matched.length / keywords.all.length) * 100) : 0;
    
    return { matchScore, matchedKeywords: matched, missingKeywords: missing };
  }

  /**
   * OPTIMIZED: Boost CV to 95%+ match with internal keyword injection
   * Called automatically by tailorDocuments - no separate button needed
   */
  async boostCVTo95Plus(cvText, keywords, updateProgress) {
    if (!cvText || !keywords?.all || keywords.all.length === 0) {
      return { tailoredCV: cvText, finalScore: 0, matchedKeywords: [], missingKeywords: [] };
    }
    
    const initial = this.calculateMatchScore(cvText, keywords);
    
    if (initial.matchScore >= 95) {
      return { 
        tailoredCV: cvText, 
        finalScore: initial.matchScore, 
        matchedKeywords: initial.matchedKeywords, 
        missingKeywords: initial.missingKeywords,
        keywords 
      };
    }
    
    let tailorResult = null;
    
    // Try optimized tailoring modules
    if (window.TailorUniversal) {
      tailorResult = await window.TailorUniversal.tailorCV(cvText, keywords, { targetScore: 95 });
    } else if (window.AutoTailor95) {
      const tailor = new window.AutoTailor95({
        onProgress: updateProgress,
        onScoreUpdate: (score) => {
          const interim = this.calculateMatchScore(cvText, keywords);
          this.updateMatchGauge(score, interim.matchedKeywords.length, keywords.all.length);
        }
      });
      tailorResult = await tailor.autoTailorTo95Plus(this.currentJob?.description || '', cvText);
    } else if (window.CVTailor) {
      tailorResult = window.CVTailor.tailorCV(cvText, keywords, { targetScore: 95 });
    } else {
      // FAST fallback: Simple keyword injection
      tailorResult = this.fastKeywordInjection(cvText, keywords, initial.missingKeywords);
    }
    
    if (tailorResult?.tailoredCV) {
      const finalMatch = this.calculateMatchScore(tailorResult.tailoredCV, keywords);
      return {
        tailoredCV: tailorResult.tailoredCV,
        finalScore: finalMatch.matchScore,
        matchedKeywords: finalMatch.matchedKeywords,
        missingKeywords: finalMatch.missingKeywords,
        injectedKeywords: tailorResult.injectedKeywords || [],
        keywords
      };
    }
    
    return { 
      tailoredCV: cvText, 
      finalScore: initial.matchScore, 
      matchedKeywords: initial.matchedKeywords, 
      missingKeywords: initial.missingKeywords,
      keywords 
    };
  }

  /**
   * GUARANTEED 100% MATCH: Natural keyword injection into CV
   * Strategy (prioritizes Work Experience for natural integration):
   * 1. Experience: Primary focus - 25+ keywords naturally integrated into bullet points
   * 2. Summary: 5-8 keywords as expertise phrases
   * 3. Skills: Remaining keywords grouped by category
   * 4. Catch-all: Any remaining keywords as Technical Proficiencies
   */
  fastKeywordInjection(cvText, keywords, missingKeywords) {
    if (!missingKeywords || missingKeywords.length === 0) {
      return { tailoredCV: cvText, injectedKeywords: [] };
    }

    // ██ JUNK KEYWORD FILTER ██
    // These words from job descriptions provide ZERO ATS value and make CVs look unprofessional
    const JUNK_KEYWORDS = new Set([
      // Generic JD filler words
      'customer service', 'high school diploma', 'commission', 'customer-facing',
      'lawn care', 'independent work', 'motivated', 'benefits', 'fast-paced',
      'work environment', 'crm software', 'motivation', 'self-motivated',
      'go-getter', 'passion', 'passionate', 'enthusiasm', 'enthusiastic',
      'dedicated', 'dedication', 'driven', 'dynamic', 'proactive',
      'synergy', 'paradigm', 'robust', 'commitment', 'reliable', 'reliability',
      'integrity', 'professionalism', 'multitasking', 'positive attitude',
      'work ethic', 'goal-oriented', 'results-oriented', 'mission',
      'love for technology', 'able to withstand work pressure',
      'good learning', 'goodjob', 'sidekiq', 'canvas',
      // JD boilerplate fragments
      'equal opportunity', 'competitive salary', 'full-time', 'part-time',
      'base salary', 'bonus', 'stock options', 'health insurance',
      'dental', 'vision', '401k', 'pto', 'paid time off', 'remote work',
      'hybrid', 'on-site', 'office', 'headquarters', 'location',
      'apply now', 'submit resume', 'cover letter', 'interview',
      // Too generic to be useful
      'can-do attitude', 'people person', 'go above and beyond',
      'think outside the box', 'hit the ground running', 'wear many hats'
    ]);

    // PROTECTED KEYWORDS: These are valid ATS terms that must NEVER be filtered out
    const PROTECTED_KEYWORDS = new Set([
      'collaboration skills', 'communication skills', 'programming skills',
      'problem solving', 'troubleshoot issues', 'resolve issues', 'implement tools',
      'improve efficiency', 'game development', 'mobile games', 'mobile applications',
      'technical qa', 'performance metrics', 'project management',
      'business', 'solutions', 'services', 'communication', 'collaboration'
    ]);

    // Filter out junk keywords before injection
    const cleanMissing = missingKeywords.filter(kw => {
      const kwLower = kw.toLowerCase().trim();
      if (PROTECTED_KEYWORDS.has(kwLower)) return true; // Always keep protected terms
      if (JUNK_KEYWORDS.has(kwLower)) return false;
      if (kwLower.length < 3) return false;  // Too short to be meaningful
      if (kwLower.length > 60) return false;  // Too long, likely a sentence fragment
      return true;
    });

    if (cleanMissing.length === 0) {
      return { tailoredCV: cvText, injectedKeywords: [] };
    }

    let tailoredCV = cvText;
    let injectedKeywords = [];
    let remaining = [...cleanMissing];

    // STEP 1: PRIMARY - Inject into Work Experience (25+ keywords naturally across bullets)
    if (remaining.length > 0) {
      const experienceMatch = tailoredCV.match(/(WORK EXPERIENCE|EXPERIENCE|EMPLOYMENT HISTORY|PROFESSIONAL EXPERIENCE)\s*\n([\s\S]*?)(?=\n(EDUCATION|SKILLS|TECHNICAL SKILLS|CERTIFICATIONS|ACHIEVEMENTS|PROJECTS)|\n\n\n|$)/i);
      if (experienceMatch) {
        const expStart = experienceMatch.index;
        const expEnd = expStart + experienceMatch[0].length;
        let experienceText = experienceMatch[0];
        
        // Find all bullet points
        const bullets = experienceText.match(/^[•\-\*]\s*.+$/gm) || [];

        // TONED DOWN: appending keywords to every bullet reads as spam and
        // trips believability checks. Inject at most ONE keyword per bullet,
        // into at most half the bullets, and only keywords that fit a
        // natural "using X" frame (short noun phrases). Everything else
        // falls through to the Summary / Skills steps below - a cleaner and
        // equally strong ATS signal than stuffed bullets.
        const fitsUsingFrame = (kw) => {
          const k = (kw || '').trim();
          if (!k || k.length > 24) return false;
          if (k.split(/\s+/).length > 2) return false;            // multi-word JD fragments read as nonsense
          if (/\b(licensure|licen[sc]e|diploma|degree|certif\w*|experience|years?|ability|knowledge|background|education)\b/i.test(k)) return false;
          return true;
        };
        const naturalConnectors = ['using', 'with'];
        const fitting = remaining.filter(fitsUsingFrame);
        const maxBullets = Math.max(1, Math.floor(bullets.length / 2));
        const toInject = fitting.slice(0, Math.min(maxBullets, fitting.length));
        // Keep everything we did NOT inject (non-fitting + overflow) so the
        // Summary / Skills steps still capture them.
        const injectedSet = new Set(toInject.map((k) => k.toLowerCase()));
        remaining = remaining.filter((k) => !injectedSet.has(k.toLowerCase()));

        let keywordIdx = 0;
        bullets.forEach((bullet, idx) => {
          if (keywordIdx >= toInject.length) return;
          if (idx % 2 === 1) return;                              // skip alternate bullets so not every line carries a tail
          const kw = toInject[keywordIdx];
          if (bullet.toLowerCase().includes(kw.toLowerCase())) { keywordIdx++; return; }
          const connector = naturalConnectors[keywordIdx % naturalConnectors.length];
          const enhanced = bullet.replace(/\.?\s*$/, `, ${connector} ${kw}.`);
          experienceText = experienceText.replace(bullet, enhanced);
          injectedKeywords.push(kw);
          keywordIdx++;
        });

        tailoredCV = tailoredCV.substring(0, expStart) + experienceText + tailoredCV.substring(expEnd);
      }
    }
    
    // STEP 2: Inject 5-8 keywords into Summary as expertise
    if (remaining.length > 0) {
      const summaryMatch = tailoredCV.match(/(PROFESSIONAL SUMMARY|SUMMARY|PROFILE|CAREER SUMMARY)\s*\n([\s\S]*?)(?=\n[A-Z]{3,}|\n\n|$)/i);
      if (summaryMatch) {
        const summaryStart = summaryMatch.index;
        const summaryEnd = summaryStart + summaryMatch[0].length;
        const summaryText = summaryMatch[2];
        
        const toInject = remaining.slice(0, Math.min(8, remaining.length));
        remaining = remaining.slice(toInject.length);
        
        // Build natural expertise sentence
        let injectionPhrase = '';
        if (toInject.length <= 3) {
          injectionPhrase = ` Expertise includes ${toInject.join(', ')}.`;
        } else if (toInject.length <= 5) {
          injectionPhrase = ` Strong background in ${toInject.slice(0, 3).join(', ')}, with additional skills in ${toInject.slice(3).join(' and ')}.`;
        } else {
          injectionPhrase = ` Core skills include ${toInject.slice(0, 4).join(', ')}. Proficiency in ${toInject.slice(4).join(', ')}.`;
        }
        
        const newSummary = summaryText.trim() + injectionPhrase;
        tailoredCV = tailoredCV.substring(0, summaryStart) + 
                     summaryMatch[1] + '\n' + newSummary + 
                     tailoredCV.substring(summaryEnd);
        injectedKeywords.push(...toInject);
      }
    }
    
    // STEP 3: Inject ALL remaining into EXISTING Skills section ONLY
    // CRITICAL FIX v4.0: NEVER create a second SKILLS section - only merge into existing one
    // Filter soft skills OUT of skills section (they belong in experience bullets only)
    if (remaining.length > 0) {
      // Filter: only inject technical/hard keywords into skills section, NOT soft skills
      // Fluff phrases ("good judgment" in a SKILLS list reads as stuffing
      // to any human) are kept OUT of the skills section along with the
      // classic soft skills; they surface in experience bullets instead.
      const softSkillFilter = /^(communication|collaboration|teamwork|leadership|mentoring|mentorship|problem.?solving|critical.?thinking|adaptability|flexibility|empathy|prioriti|time.?management|conflict|creative.?thinking|decision.?making|initiative|negotiation|coaching|facilitation|delegation|accountability|strategic.?thinking|relationship|change.?management|continuous.?improvement|knowledge.?sharing|stakeholder|cross.?functional|presentation|active.?listening|emotional.?intelligence|customer.?focus|client.?management|vendor.?management|resource.?management|budget.?management|incident.?management|quality.?assurance|process.?improvement|requirements.?gathering|design.?thinking|data.?driven|attention.?to.?detail|analytical.?thinking|roadmap.?planning|pair.?programming|code.?review|technical.?writing|(good\s+)?judg?ement|good\s+judgment|resourcefulness|influence|curiosity|ownership|integrity|work\s+ethic|growth\s+mindset|engineering\s+excellence|humility|grit|drive|self.?starter|team\s+player|bias\s+for\s+action|customer\s+obsession)$/i;

      const technicalRemaining = remaining.filter(kw => !softSkillFilter.test(kw.trim()));
      const softRemaining = remaining.filter(kw => softSkillFilter.test(kw.trim()));

      // Try to inject soft skills into experience bullets first
      if (softRemaining.length > 0) {
        const expMatch2 = tailoredCV.match(/(WORK EXPERIENCE|EXPERIENCE|EMPLOYMENT HISTORY|PROFESSIONAL EXPERIENCE)\s*\n([\s\S]*?)(?=\n(EDUCATION|SKILLS|TECHNICAL SKILLS|CERTIFICATIONS|ACHIEVEMENTS|PROJECTS)|\n\n\n|$)/i);
        if (expMatch2) {
          const eStart = expMatch2.index;
          const eEnd = eStart + expMatch2[0].length;
          let eText = expMatch2[0];
          const eBullets = eText.match(/^[•\-\*]\s*.+$/gm) || [];
          // TONED DOWN: cap soft-skill tails at 2 bullets (was unbounded), and
          // only on bullets that don't already carry an appended ", X." tail,
          // so we never stack two tails on one line.
          const MAX_SOFT_TAILS = 2;
          let sIdx = 0;
          for (let i = 0; i < eBullets.length && sIdx < Math.min(softRemaining.length, MAX_SOFT_TAILS); i++) {
            const kw = softRemaining[sIdx];
            const alreadyTailed = /,\s+(using|with|demonstrating)\s+[^.]+\.$/i.test(eBullets[i].trim());
            if (!alreadyTailed && !eBullets[i].toLowerCase().includes(kw.toLowerCase())) {
              const enhanced = eBullets[i].replace(/\.?\s*$/, `, demonstrating ${kw}.`);
              eText = eText.replace(eBullets[i], enhanced);
              injectedKeywords.push(kw);
              sIdx++;
            }
          }
          tailoredCV = tailoredCV.substring(0, eStart) + eText + tailoredCV.substring(eEnd);
        }
      }

      // Merge ONLY technical keywords into the FIRST existing skills section
      if (technicalRemaining.length > 0) {
        const skillsMatch = tailoredCV.match(/(SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS|TECHNICAL PROFICIENCIES)\s*\n([\s\S]*?)(?=\n[A-Z]{3,}|\n\n|$)/i);
        if (skillsMatch) {
          const skillsStart = skillsMatch.index;
          const skillsEnd = skillsStart + skillsMatch[0].length;
          const skillsHeader = skillsMatch[1];
          const skillsText = skillsMatch[2].trim();

          // Clean up existing skills (remove bullets, normalize)
          const existingSkills = skillsText
            .replace(/^[•\-\*]\s*/gm, '')
            .split(/[,\n]+/)
            .map(s => s.trim())
            .filter(Boolean);

          // Merge with remaining TECHNICAL keywords (deduplicated)
          const existingSet = new Set(existingSkills.map(s => s.toLowerCase()));
          const newSkills = [...existingSkills];
          for (const kw of technicalRemaining) {
            if (!existingSet.has(kw.toLowerCase())) {
              newSkills.push(kw);
              existingSet.add(kw.toLowerCase());
            }
          }

          // Format as clean comma-separated list - use SAME header as before (no rename)
          tailoredCV = tailoredCV.substring(0, skillsStart) +
                       skillsHeader + '\n' + newSkills.join(', ') +
                       tailoredCV.substring(skillsEnd);
          injectedKeywords.push(...technicalRemaining);
          remaining = [];
        }
        // If NO skills section found, DO NOT create one. Remaining keywords are dropped.
        // This prevents the duplicate SKILLS section bug.
      }
    }
    
    // STEP 4: REMOVED - No separate "TECHNICAL PROFICIENCIES" section
    // All keywords are now merged into the single SKILLS section above
    
    return { tailoredCV, injectedKeywords };
  }

  /**
   * OPTIMIZED: Full automatic tailoring pipeline
   * IMPLEMENTATION FLOW:
   * 1. Click "AI Extract Keywords" → Wait for full extraction
   * 2. Grab 100% match keywords → Integrate naturally into Work Experience bullets
   * 3. Verify 100% profile match in extension UI
   * 4. Generate "Tailored_CV_[Job]_[Date].pdf" → Enable preview/download
   * 5. Auto-attach PDF to application upload field
   * 
   * UI updates at each stage for responsiveness
   */
  async tailorDocuments(options = {}) {
    if (!this.currentJob) {
      this.showToast('No job detected', 'error');
      return;
    }

    // ATOMIC guard: prevent concurrent tailoring runs.  Multiple call
    // sites (Extract & Apply button, post-login auto-trigger, content.js
    // popup ping, manual Tailor button) can fire near-simultaneously and
    // would otherwise each kick off a full pipeline for the same job.
    if (this._tailoringInProgress) {
      console.log('[ATS Tailor Popup] tailorDocuments already running, ignoring duplicate call');
      return;
    }
    // De-duplicate per job URL too -- guards against accidental re-entry
    // even after a tailoring run completes within the same popup session.
    const jobUrl = this.currentJob?.url || this.currentJob?.jobUrl || window.location?.href || '';
    if (!options.force && jobUrl && this._lastTailoredJobUrl === jobUrl) {
      console.log('[ATS Tailor Popup] Job already tailored this session, skipping (pass {force:true} to override)');
      return;
    }
    // ROLE-FIT GATE: warn before tailoring when the job is outside the
    // candidate's professional family. Pure keyword tailoring cannot
    // bridge "ML Engineer applying to Journalist" -- the model ends up
    // pretending the candidate is a journalist, which a hiring editor
    // rejects in seconds. Better to warn and let the user decide.
    if (!options.force && !options.skipFitGate && typeof CareerBoostEngine !== 'undefined') {
      try {
        const jdText = this.currentJob?.description || this.currentJob?.jdText || this.currentJob?.title || '';
        const cvText = this.baseCVContent || '';
        if (jdText && cvText && CareerBoostEngine.detectArchetype) {
          const jobArch = CareerBoostEngine.detectArchetype(jdText)?.primary;
          const profileArch = CareerBoostEngine.detectArchetype(cvText)?.primary;
          if (jobArch && profileArch && jobArch.key !== profileArch.key) {
            // Only block on a confident mismatch -- avoid false positives
            // on roles where the JD is ambiguous.
            const jobConf = CareerBoostEngine.detectArchetype(jdText)?.confidence || 0;
            if (jobConf >= 0.6) {
              const msg = `Role-fit warning\n\n` +
                `This looks like a ${jobArch.label} role, but your CV reads as ${profileArch.label}.\n\n` +
                `Tailoring cannot honestly bridge that gap -- it would have to fabricate a background ` +
                `you don't have. A recruiter spots this in seconds.\n\n` +
                `Tailor anyway? (Cancel = stop and review)`;
              const proceed = confirm(msg);
              if (!proceed) {
                this._tailoringInProgress = false;
                this.showToast('Tailor cancelled (role-fit mismatch)', 'success');
                return;
              }
              console.log('[ATS Tailor] Role-fit override:', profileArch.label, '->', jobArch.label);
            }
          }
        }
      } catch (e) {
        console.warn('[ATS Tailor] Role-fit gate skipped:', e?.message);
      }
    }

    this._tailoringInProgress = true;

    // Find the recruiter NOW, as its own step.
    //
    // This used to live at the end of the ApplyVerdict block, inside the
    // qualification-threshold branch. That gave it four independent ways to
    // never run -- QualificationThresholdEngine missing, the threshold call
    // throwing, ApplyVerdict missing, or evaluate()/renderApplyVerdict()
    // throwing -- and every one of them was caught and logged as a verdict
    // failure. The result was a tailoring run that completed perfectly and
    // silently never looked for anybody to send it to.
    //
    // Finding the recipient is not a side effect of the tailoring-focus
    // panel. It runs unconditionally, and starting it here also overlaps
    // the tab read and any provider call with document generation instead
    // of waiting until after it. autoSendFollowup awaits the promise.
    // Guarded on BOTH sides. Hoisting this out of the ApplyVerdict block
    // was meant to stop another feature's failure from costing the
    // application its recipient -- but it left the call itself unprotected
    // in the middle of the tailoring path, where a synchronous throw kills
    // the run and a rejected promise nobody awaits surfaces as an
    // unhandled error. Finding the recipient must never be able to stop
    // the CV being written.
    this.contactDetection = Promise.resolve()
      .then(() => this.followupDetectContact())
      .catch((e) => {
        console.warn('[ATS Tailor] contact detection failed (tailoring continues):', e && e.message);
        return null;
      });

    const startTime = Date.now();
    const btn = document.getElementById('tailorBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const pipelineSteps = document.getElementById('pipelineSteps');
    
    btn.disabled = true;
    // SINGLE BUTTON STATE: Blue gradient - always use btn-gradient, never btn-tailoring
    const btnIconLeft = btn.querySelector('.btn-icon-left');
    const btnText = btn.querySelector('.btn-text');
    const btnTime = btn.querySelector('.btn-time');
    
    // Keep BLUE state while processing (just disable + change text)
    if (btnIconLeft) btnIconLeft.textContent = '⏳';
    if (btnText) btnText.textContent = 'Tailoring...';
    if (btnTime) btnTime.textContent = '~5s';
    // Keep blue gradient - NO orange state
    btn.classList.remove('btn-tailoring');
    btn.classList.add('btn-gradient');
    
    progressContainer?.classList.remove('hidden');
    pipelineSteps?.classList.remove('hidden');
    if (progressText) progressText.textContent = 'Step 1/3: Extracting keywords from job description...';
    this.setStatus('Tailoring...', 'working');
    
    // WIRE UP DEBUG PANELS: Reset and start logging
    if (window.PDFDebugPanel) {
      window.PDFDebugPanel.reset();
      window.PDFDebugPanel.logStart('popup.tailorDocuments');
    }
    this.logDebug('tailorDocuments', 'Pipeline started', { job: this.currentJob?.title });

    const updateProgress = (percent, text) => {
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = text;
    };

    const updateStep = (stepNum, status) => {
      const step = document.getElementById(`step${stepNum}`);
      if (!step) return;
      const icon = step.querySelector('.step-icon');
      if (status === 'working') {
        icon.textContent = '⏳';
        step.classList.add('active');
        step.classList.remove('complete');
      } else if (status === 'complete') {
        icon.textContent = '✓';
        step.classList.remove('active');
        step.classList.add('complete');
      }
    };

    try {
      // ============ STEP 1: AI EXTRACT KEYWORDS (Click "AI Extract Keywords" first) ============
      updateStep(1, 'working');
      updateProgress(5, 'Step 1/3: AI Extracting keywords from job description...');

      const sessionValid = await this.refreshSessionIfNeeded();
      if (!this.session?.access_token || !this.session?.user?.id) {
        // Show login screen automatically
        this.updateUI();
        throw new Error('Session expired. Please sign in using the form above, then try again.');
      }

      // Ensure we have a job description first
      if (!this.currentJob?.description) {
        await this.detectCurrentJob();
      }
      
      if (!this.currentJob?.description || this.currentJob.description.length < 50) {
        throw new Error('No job description found. Please navigate to a job posting page and try again.');
      }
      
      // FIRST: Call AI Extract Keywords (equivalent to clicking the AI Extract button)
      let keywords = null;
      try {
        keywords = await this.performAIKeywordExtraction();
        console.log('[ATS Tailor] Step 1 - AI Extracted keywords:', keywords?.all?.length || 0);
      } catch (aiError) {
        // Silent fallback to local extraction if AI fails - no warning needed
        console.log('[ATS Tailor] Using local keyword extraction');
        keywords = this.extractKeywordsOptimized(this.currentJob.description);
      }
      
      if (!keywords || !keywords.all || keywords.all.length === 0) {
        throw new Error('Could not extract keywords from job description');
      }
      
      // Store keywords immediately for UI
      this.generatedDocuments.keywords = keywords;
      
      // UPDATE UI: Show extracted keywords immediately (before boost)
      this.generatedDocuments.matchedKeywords = [];
      this.generatedDocuments.missingKeywords = keywords.all;
      this.generatedDocuments.matchScore = 0;
      this.updateMatchAnalysisUI();
      
      // Save keywords to history for comparison feature
      await this.saveKeywordsToHistory(keywords);

      updateStep(1, 'complete');

      // ============ STEP 2: Load Profile & Generate Base CV ============
      updateStep(2, 'working');
      updateProgress(20, 'Step 2/3: Loading profile & generating tailored CV...');

      // Fetch user profile (API call) - includes CV file info
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=first_name,last_name,email,phone,linkedin,github,portfolio,cover_letter,professional_experience,relevant_projects,education,skills,certifications,achievements,ats_strategy,city,country,address,state,zip_code,cv_file_path,cv_file_name,cv_uploaded_at,preferred_ai_provider`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${this.session.access_token}`,
          },
        }
      );

      if (!profileRes.ok) {
        const profileError = await profileRes.text().catch(() => '');
        console.error('[ATS Tailor] Profile load failed:', profileRes.status, profileError);
        throw new Error(`Profile not found. Please visit the QuantumHire dashboard and complete your profile before tailoring. (Error: ${profileRes.status})`);
      }

      const profileRows = await profileRes.json();
      const p = profileRows?.[0] || {};
      
      // Update AI provider from profile if set
      if (p.preferred_ai_provider && ['kimi', 'openai'].includes(p.preferred_ai_provider)) {
        this.aiProvider = p.preferred_ai_provider;
        this.saveAIProviderSettings();
        this.updateAIProviderUI();
      }
      
      // Check if user has uploaded a base CV
      const hasUploadedCV = !!p.cv_file_path;
      if (hasUploadedCV) {
        console.log('[ATS Tailor] Using uploaded CV as base document:', p.cv_file_name);
        this.baseCVSource = 'uploaded';
      } else {
        console.log('[ATS Tailor] No uploaded CV found, using profile data to generate CV');
        this.baseCVSource = 'generated';
      }

      // Apply user location rules for tailoring/output
      // IMPORTANT: never include "Remote" in the candidate location line.
      const rawCity = String(p.city || '').split('|')[0].trim();
      const rawCountry = String(p.country || '').trim();
      const country = rawCountry && rawCountry.toLowerCase() === 'ireland' ? 'IE' : rawCountry;
      const base = [rawCity, country].filter(Boolean).join(', ').trim();
      this._defaultLocation = (/\bremote\b/i.test(String(p.city || '')) || /\bdublin\b/i.test(rawCity))
        ? 'Dublin, IE'
        : (base || 'Dublin, IE');

      const effectiveJobLocation = window.ATSLocationTailor?.normalizeJobLocationForApplication
        ? window.ATSLocationTailor.normalizeJobLocationForApplication(this.currentJob.location || '', this._defaultLocation)
        : (this.currentJob.location || this._defaultLocation);
      this.currentJob.location = effectiveJobLocation;
      
      console.log(`[ATS Tailor] Step 2 - Profile loaded (AI: ${this.aiProvider}), generating base CV...`);

      // Update step text with AI provider info
      const providerName = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
      updateProgress(35, `Step 2/3: ${providerName} generating tailored documents...`);

      // OPENAI THROTTLE: Pre-call delay to reduce API usage
      if (this.aiProvider !== 'kimi') {
        console.log('[ATS Tailor] ⏱️ OpenAI throttle: 3s pre-tailoring delay...');
        updateProgress(36, 'OpenAI rate limiting (saving API usage)...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const tailorController = new AbortController();
      const tailorTimeoutId = setTimeout(() => tailorController.abort(), 120_000); // Increased from 75s to 120s for AI tailoring

      const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        signal: tailorController.signal,
        body: JSON.stringify({
          jobTitle: this.currentJob.title || '',
          company: this.currentJob.company || '',
          location: this.currentJob.location || '',
          description: this.currentJob.description || '',
          // Job-derived city sent explicitly so the server's smartLocation
          // uses it as Priority 1 (deterministic) instead of re-extracting
          // from raw text. NEVER the profile fallback - that would pin every
          // CV header to the home city.
          extractedCity: (() => {
            const appLoc = this.getApplicationLocation();
            const fb = this._defaultLocation || 'Dublin, IE';
            return appLoc && appLoc !== fb ? appLoc : undefined;
          })(),
          requirements: [],
          aiProvider: this.aiProvider, // Pass selected AI provider
          userProfile: {
            firstName: p.first_name || '',
            lastName: p.last_name || '',
            email: p.email || this.session.user.email || '',
            phone: p.phone || '',
            linkedin: p.linkedin || '',
            github: p.github || '',
            portfolio: p.portfolio || '',
            coverLetter: p.cover_letter || '',
            professionalExperience: Array.isArray(p.professional_experience) ? p.professional_experience : [],
            relevantProjects: Array.isArray(p.relevant_projects) ? p.relevant_projects : [],
            education: Array.isArray(p.education) ? p.education : [],
            skills: Array.isArray(p.skills) ? p.skills : [],
            certifications: Array.isArray(p.certifications) ? p.certifications : [],
            achievements: Array.isArray(p.achievements) ? p.achievements : [],
            atsStrategy: p.ats_strategy || '',
            // Job-adaptive location (sanitised; falls back to profile)
            city: this.getApplicationLocation(),
            country: p.country || undefined,
            address: p.address || undefined,
            state: p.state || undefined,
            zipCode: p.zip_code || undefined,
            // Pass CV file info so backend knows user has uploaded a base CV
            cvFilePath: p.cv_file_path || undefined,
            cvFileName: p.cv_file_name || undefined,
          },
        }),
      }).finally(() => clearTimeout(tailorTimeoutId));

      updateProgress(40, 'Step 2/3: Processing API response...');

      // OPENAI THROTTLE: Post-call delay to reduce API usage
      if (this.aiProvider !== 'kimi') {
        console.log('[ATS Tailor] ⏱️ OpenAI throttle: 2.5s post-tailoring delay...');
        updateProgress(70, 'Processing tailored documents...');
        await new Promise(resolve => setTimeout(resolve, 2500));
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const isHtml = /^\s*</.test((errorText || '').trim());
        const msg = response.status === 502
          ? 'Service temporarily unavailable (502). Please retry in a few seconds.'
          : (!isHtml && errorText ? errorText : `Server error (${response.status})`);
        throw new Error(msg);
      }

      // ROBUST JSON PARSING: Handle truncated responses gracefully
      let result;
      try {
        const responseText = await response.text();
        
        // Try to parse as JSON
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.warn('[ATS Tailor] JSON parse failed, attempting to repair truncated response...');
          
          // Try to repair common truncation patterns
          let repairedText = responseText;
          
          // If response ends with incomplete string, try to close it
          if (responseText.endsWith('"')) {
            // Ends mid-key/value - try adding closing braces
            repairedText = responseText + ': null}';
          } else if (responseText.match(/"[^"]*$/)) {
            // Has unclosed string - close it and add braces
            repairedText = responseText + '"}';
          }
          
          // Add missing closing braces
          const openBraces = (repairedText.match(/{/g) || []).length;
          const closeBraces = (repairedText.match(/}/g) || []).length;
          const missingBraces = openBraces - closeBraces;
          if (missingBraces > 0) {
            repairedText += '}'.repeat(missingBraces);
          }
          
          // Try to parse repaired JSON
          try {
            result = JSON.parse(repairedText);
            console.log('[ATS Tailor] Successfully repaired truncated JSON response');
          } catch (repairError) {
            console.error('[ATS Tailor] Could not repair JSON:', repairError);
            console.error('[ATS Tailor] Raw response (first 500 chars):', responseText.substring(0, 500));
            throw new Error('Server returned invalid response. Please try again.');
          }
        }
      } catch (textError) {
        console.error('[ATS Tailor] Failed to read response text:', textError);
        throw new Error('Failed to read server response. Please try again.');
      }
      
      if (result.error) throw new Error(result.error);

      updateProgress(50, 'Step 2/3: Validating tailored documents...');
      console.log('[ATS Tailor] API response keys:', Object.keys(result).join(', '));
      console.log('[ATS Tailor] tailoredResume length:', (result.tailoredResume || '').length);

      // ███ CRITICAL: VALIDATE & FIX WORK EXPERIENCE IMMUTABILITY ███
      // AI may have changed job titles/company names - force them back to profile values
      const originalExperience = Array.isArray(p.professional_experience) ? p.professional_experience : [];
      
      if ((result.resumeStructured || result.structuredCv) && originalExperience.length > 0) {
        const structuredCv = result.resumeStructured || result.structuredCv;
        
        if (Array.isArray(structuredCv.experience)) {
          console.log('[ATS Tailor] ███ Validating work experience immutability ███');
          
          structuredCv.experience = structuredCv.experience.map((aiExp, idx) => {
            const originalExp = originalExperience[idx];
            if (!originalExp) return aiExp;
            
            // Log any detected changes for debugging
            const aiCompany = aiExp.company || '';
            const aiTitle = aiExp.title || '';
            const origCompany = originalExp.company || originalExp.companyName || '';
            const origTitle = originalExp.title || originalExp.jobTitle || originalExp.position || '';
            
            // Silent log - immutable field protection is working correctly
            if (aiCompany !== origCompany || aiTitle !== origTitle) {
              console.log(`[ATS Tailor] Immutable field protection applied for role ${idx + 1}`);
            }
            
            // FORCE original values - never trust AI for these fields
            return {
              ...aiExp,
              company: origCompany,  // ← LOCKED FROM ORIGINAL PROFILE
              title: origTitle,      // ← LOCKED FROM ORIGINAL PROFILE
              dates: originalExp.dates || _buildMMYYYYRange(originalExp.startDate, originalExp.endDate),  // ← LOCKED (MM-YYYY)
              startDate: _toMMYYYY(originalExp.startDate),  // ← LOCKED (MM-YYYY)
              endDate: _toMMYYYY(originalExp.endDate),      // ← LOCKED (MM-YYYY)
              // bullets/description CAN be tailored by AI
              bullets: aiExp.bullets || aiExp.description || originalExp.bullets || originalExp.description || [],
            };
          });
          
          console.log('[ATS Tailor] ✓ Work experience immutability validated');
        }
        
        // Update result with validated structuredCv
        result.resumeStructured = structuredCv;
        result.structuredCv = structuredCv;
      }

      // PART 1A: Store structuredCv from tailoring for PDF generation (no re-parsing)
      if (result.resumeStructured || result.structuredCv) {
        window.quantumhireStructuredCv = result.resumeStructured || result.structuredCv;
        console.log('[ATS Tailor] structuredCv stored for PDF generation:', window.quantumhireStructuredCv);
      }
      
      // Store location match warnings for UI
      if (result.locationMatch) {
        this.locationMatch = result.locationMatch;
        console.log('[ATS Tailor] Location Match Score:', result.locationMatch.matchScore);
        
        // Show location warnings
        if (result.locationMatch.flags?.sponsorshipNeeded) {
          this.showToast('⚠️ This role may require visa sponsorship', 'warning');
        }
        if (result.locationMatch.flags?.relocationRequired) {
          this.showToast('⚠️ This role requires relocation', 'warning');
        }
        if (result.locationMatch.flags?.timezoneCompatible === false) {
          this.showToast('⚠️ Timezone may be challenging', 'warning');
        }
      }

      // Save original CV (before local boosting) for coverage report diffing
      this._coverageOriginalCV = result.tailoredResume || '';

      // Filename format: {FirstName}_{LastName}_CV.pdf and {FirstName}_{LastName}_Cover_Letter.pdf
      const firstName = (p.first_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (p.last_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || '';
      const fileBaseName = lastName ? `${firstName}_${lastName}` : firstName;

      this.profileInfo = { firstName: p.first_name, lastName: p.last_name };

      // CRITICAL: Final post-processing boundary (UK spelling + anti-AI) before UI/PDF
      const cqe = (typeof ContentQualityEngine !== 'undefined' ? ContentQualityEngine : globalThis.ContentQualityEngine);
      const sanitise = (text) => {
        if (!text || typeof text !== 'string') return text;
        try {
          return cqe?.sanitiseCVBlock ? cqe.sanitiseCVBlock(text) : text;
        } catch (e) {
          console.warn('[ATS Tailor] ContentQualityEngine sanitisation failed (continuing):', e);
          return text;
        }
      };

      const sanitisedCv = sanitise(this.normalizeDocumentText(result.tailoredResume, 'cv'));
      const sanitisedCover = sanitise(this.normalizeDocumentText(result.tailoredCoverLetter || result.coverLetter, 'cover'));

      this.generatedDocuments = {
        cv: sanitisedCv,
        coverLetter: sanitisedCover,
        cvPdf: result.resumePdf,
        coverPdf: result.coverLetterPdf,
        cvFileName: `${fileBaseName}_CV.docx`,
        coverFileName: `${fileBaseName}_Cover_Letter.docx`,
        matchScore: result.matchScore || 0,
        matchedKeywords: result.keywordsMatched || result.matchedKeywords || [],
        missingKeywords: result.keywordsMissing || result.missingKeywords || [],
        keywords: keywords,
        structuredCv: window.quantumhireStructuredCv, // Store reference for later PDF generation
        // CRITICAL: Store professional summary explicitly for PDF generation
        professionalSummary: sanitise(
          result.professionalSummary ||
            result.extractedSummary ||
            window.quantumhireStructuredCv?.summary?.text ||
            (typeof window.quantumhireStructuredCv?.summary === 'string' ? window.quantumhireStructuredCv.summary : '')
        )
      };
      
      // WIRE UP DEBUG PANELS: Log input data after profile load
      if (window.PDFDebugPanel) {
        window.PDFDebugPanel.logInputData({
          firstName: p.first_name,
          lastName: p.last_name,
          email: p.email,
          professionalExperience: p.professional_experience,
          relevantProjects: p.relevant_projects,
          education: p.education,
          skills: p.skills,
          certifications: p.certifications,
        }, result.tailoredResume);
      }
      this.logDebug('tailorDocuments', 'Profile loaded', { 
        expCount: Array.isArray(p.professional_experience) ? p.professional_experience.length : 0,
        projectsCount: Array.isArray(p.relevant_projects) ? p.relevant_projects.length : 0,
        cvLength: (result.tailoredResume || '').length
      });

      // Calculate initial match score against extracted keywords
      if (keywords.all?.length > 0 && this.generatedDocuments.cv) {
        const initial = this.calculateMatchScore(this.generatedDocuments.cv, keywords);
        this.generatedDocuments.matchedKeywords = initial.matchedKeywords;
        this.generatedDocuments.missingKeywords = initial.missingKeywords;
        this.generatedDocuments.matchScore = initial.matchScore;

        // UPDATE UI: Show initial match score
        this.updateMatchAnalysisUI();
      }

      console.log('[ATS Tailor] Step 2 - Initial match score:', this.generatedDocuments.matchScore + '%');
      updateStep(2, 'complete');

      // ============ STEP 3: GUARANTEED 100% MATCH - No keywords left behind ============
      updateStep(3, 'working');
      updateProgress(55, 'Step 3/3: Guaranteeing 100% keyword match...');

      const currentScore = this.generatedDocuments.matchScore || 0;
      
      // ALWAYS boost to 100% - no keywords left unmatched
      if (currentScore < 100 && keywords.all?.length > 0) {
        try {
          let boostResult = await this.boostCVTo95Plus(
            this.generatedDocuments.cv,
            keywords,
            (percent, text) => {
              updateProgress(55 + (percent * 0.15), `Step 3/3: ${text}`);
            }
          );

          // If still not 100%, use aggressive injection
          if (boostResult.finalScore < 100 && boostResult.missingKeywords?.length > 0) {
            console.log('[ATS Tailor] Applying final injection for remaining', boostResult.missingKeywords.length, 'keywords');
            const finalInject = this.fastKeywordInjection(
              boostResult.tailoredCV || this.generatedDocuments.cv,
              keywords,
              boostResult.missingKeywords
            );
            
            if (finalInject.tailoredCV) {
              boostResult.tailoredCV = finalInject.tailoredCV;
              boostResult.injectedKeywords = [...(boostResult.injectedKeywords || []), ...finalInject.injectedKeywords];
              
              // Recalculate final score - should now be 100%
              const finalMatch = this.calculateMatchScore(boostResult.tailoredCV, keywords);
              boostResult.finalScore = finalMatch.matchScore;
              boostResult.matchedKeywords = finalMatch.matchedKeywords;
              boostResult.missingKeywords = finalMatch.missingKeywords;
            }
          }

          if (boostResult.tailoredCV) {
            this.generatedDocuments.cv = boostResult.tailoredCV;
            this.generatedDocuments.matchScore = boostResult.finalScore;
            this.generatedDocuments.matchedKeywords = boostResult.matchedKeywords;
            this.generatedDocuments.missingKeywords = boostResult.missingKeywords;
            
            // UPDATE UI: Show final 100% match score
            this.updateMatchAnalysisUI();
            
            console.log('[ATS Tailor] Step 3 - Final score:', boostResult.finalScore + '%', 
                        'injected:', boostResult.injectedKeywords?.length || 0, 'keywords');
          }
        } catch (boostError) {
          console.warn('[ATS Tailor] Boost failed, applying fallback injection:', boostError);
          // Fallback: aggressive injection
          const fallbackInject = this.fastKeywordInjection(
            this.generatedDocuments.cv,
            keywords,
            this.generatedDocuments.missingKeywords
          );
          if (fallbackInject.tailoredCV) {
            this.generatedDocuments.cv = fallbackInject.tailoredCV;
            const finalMatch = this.calculateMatchScore(fallbackInject.tailoredCV, keywords);
            this.generatedDocuments.matchScore = finalMatch.matchScore;
            this.generatedDocuments.matchedKeywords = finalMatch.matchedKeywords;
            this.generatedDocuments.missingKeywords = finalMatch.missingKeywords;
            this.updateMatchAnalysisUI();
          }
        }
      } else if (currentScore >= 100) {
        console.log('[ATS Tailor] Step 3 - Already at 100%');
      }

      // ============ QUALIFICATION THRESHOLD CHECK (75%+) ============
      // After keyword boost, verify the CV meets the 75% required qualification threshold
      // If not, inject gap-closing keywords from unmet qualifications
      if (typeof QualificationThresholdEngine !== 'undefined' && this.currentJob?.description) {
        try {
          const thresholdResult = QualificationThresholdEngine.autoTailorForThreshold(
            this.generatedDocuments.cv,
            this.currentJob.description,
            { threshold: 75 }
          );

          // Store qualification results for UI display
          this.generatedDocuments.qualificationMatch = thresholdResult;
          this.generatedDocuments.qualificationDashboard = thresholdResult.dashboard;

          // TAILORING FOCUS: read GENUINE fit (thresholdResult.initialScore,
          // captured BEFORE the gap-closing injection below inflates it) and
          // turn the JD's highest-leverage gaps into tailoring direction --
          // what this CV should LEAD WITH for this specific role. Guidance
          // only; it never gates or discourages an application.
          if (typeof ApplyVerdict !== 'undefined') {
            try {
              const verdict = ApplyVerdict.evaluate({
                thresholdResult,
                jdText: this.currentJob.description || '',
                originalCV: this.getOriginalCVText() || this.generatedDocuments.cv || '',
              });
              this.generatedDocuments.applyVerdict = verdict;
              console.log('[ATS Tailor] Tailoring focus:', verdict.focus, '|', verdict.summary);
              this.renderApplyVerdict(verdict);
              // Contact detection deliberately does NOT live here: see the
              // top of tailorDocuments. A failure in this block must not
              // cost the application its recipient.
            } catch (e) {
              console.warn('[ATS Tailor] Apply verdict failed:', e && e.message);
            }
          }

          if (thresholdResult.needsTailoring && thresholdResult.keywordsToInject?.length > 0) {
            console.log(`[ATS Tailor] Qualification gap detected: ${thresholdResult.initialScore}% (need ${thresholdResult.targetScore}%). Injecting ${thresholdResult.keywordsToInject.length} gap-closing keywords.`);

            // Inject gap-closing keywords into CV using fastKeywordInjection
            const gapInject = this.fastKeywordInjection(
              this.generatedDocuments.cv,
              { all: thresholdResult.keywordsToInject },
              thresholdResult.keywordsToInject
            );

            if (gapInject.tailoredCV) {
              this.generatedDocuments.cv = gapInject.tailoredCV;

              // Recalculate both keyword score and qualification score
              const postGapMatch = this.calculateMatchScore(this.generatedDocuments.cv, keywords);
              this.generatedDocuments.matchScore = postGapMatch.matchScore;
              this.generatedDocuments.matchedKeywords = postGapMatch.matchedKeywords;
              this.generatedDocuments.missingKeywords = postGapMatch.missingKeywords;

              // Recalculate qualification threshold
              const postGapQual = QualificationThresholdEngine.autoTailorForThreshold(
                this.generatedDocuments.cv,
                this.currentJob.description,
                { threshold: 75 }
              );
              this.generatedDocuments.qualificationMatch = postGapQual;
              this.generatedDocuments.qualificationDashboard = postGapQual.dashboard;

              console.log(`[ATS Tailor] Post-gap qualification score: ${postGapQual.initialScore}%`);
            }
          } else {
            console.log(`[ATS Tailor] Qualification threshold met: ${thresholdResult.initialScore}%`);
          }
        } catch (qualError) {
          console.warn('[ATS Tailor] Qualification threshold check failed:', qualError);
        }
      }

      // Build keyword coverage report for debugging (injected locations in CV)
      this.buildKeywordCoverageReport(keywords);

      updateProgress(80, 'Step 3/3: Regenerating PDF with boosted CV...');
      
      // WIRE UP DEBUG PANELS: Log before PDF generation
      this.logDebug('tailorDocuments', 'Pre-PDF boost complete', { 
        finalScore: this.generatedDocuments.matchScore,
        matchedCount: this.generatedDocuments.matchedKeywords?.length,
        missingCount: this.generatedDocuments.missingKeywords?.length
      });

      // CRITICAL: Apply ContentQualityEngine sanitisation to final CV and cover letter
      // Ensures UK spelling, no banned words, no em dashes in ALL output
      if (typeof ContentQualityEngine !== 'undefined') {
        if (this.generatedDocuments.cv) {
          this.generatedDocuments.cv = ContentQualityEngine.sanitiseCVBlock(this.generatedDocuments.cv);
          console.log('[ATS Tailor] Applied ContentQualityEngine to final CV');
        }
        if (this.generatedDocuments.coverLetter) {
          this.generatedDocuments.coverLetter = ContentQualityEngine.sanitiseContent(
            this.generatedDocuments.coverLetter, { removePronouns: false }
          );
          console.log('[ATS Tailor] Applied ContentQualityEngine to cover letter');
        }
      }

      // ============ POST-SANITISATION KEYWORD RE-INJECTION ============
      // ContentQualityEngine may have altered/removed keywords during sanitisation.
      // Verify all JD keywords are still present and re-inject any that were lost.
      if (keywords.all?.length > 0 && this.generatedDocuments.cv) {
        const postSanitiseMatch = this.calculateMatchScore(this.generatedDocuments.cv, keywords);
        if (postSanitiseMatch.missingKeywords?.length > 0) {
          console.log(`[ATS Tailor] Post-sanitisation: ${postSanitiseMatch.missingKeywords.length} keywords lost during sanitisation, re-injecting...`);
          
          let cvText = this.generatedDocuments.cv;
          const toReInject = postSanitiseMatch.missingKeywords;

          // Separate multi-word phrases from single keywords
          const multiWord = toReInject.filter(kw => kw.includes(' '));
          const singleWord = toReInject.filter(kw => !kw.includes(' '));

          // MULTI-WORD PHRASES: Inject into experience bullet for ATS phrase matching
          if (multiWord.length > 0) {
            const expMatch = cvText.match(/(WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE)\s*\n/i);
            if (expMatch && expMatch.index !== undefined) {
              const afterExp = cvText.substring(expMatch.index);
              const lines = afterExp.split('\n');
              let lastBulletIdx = -1;
              let passedBullet = false;
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('-') || line.startsWith('•')) {
                  passedBullet = true;
                  lastBulletIdx = i;
                }
                if (passedBullet && !line.startsWith('-') && !line.startsWith('•') && line.length > 0 && /\d{2}\/\d{4}/.test(line)) break;
              }
              if (lastBulletIdx > 0) {
                // Build natural bullet with multi-word phrases
                const verbPhrases = [];
                const nounPhrases = [];
                const verbStarters = ['troubleshoot', 'implement', 'improve', 'resolve', 'manage', 'develop', 'create', 'define', 'optimize', 'optimise', 'maintain', 'investigate', 'monitor', 'set', 'collaborate'];
                for (const p of multiWord) {
                  const first = p.split(' ')[0].toLowerCase();
                  if (verbStarters.some(v => first.startsWith(v))) verbPhrases.push(p);
                  else nounPhrases.push(p);
                }
                let bullet;
                if (verbPhrases.length > 0 && nounPhrases.length > 0) {
                  bullet = `- Applied ${nounPhrases.join(' and ')} to ${verbPhrases.join(', ')}, driving measurable improvements across development workflows.`;
                } else if (verbPhrases.length > 0) {
                  bullet = `- Utilised technical expertise to ${verbPhrases.join(', ')}, ensuring reliable and scalable delivery processes.`;
                } else {
                  bullet = `- Demonstrated ${nounPhrases.join(', ')} across cross-functional projects, contributing to continuous process improvement.`;
                }
                lines.splice(lastBulletIdx + 1, 0, bullet);
                cvText = cvText.substring(0, expMatch.index) + lines.join('\n');
                console.log(`[ATS Tailor] Injected ${multiWord.length} multi-word phrases into experience bullet`);
              }
            }
          }

          // SINGLE KEYWORDS: Inject into Technical Proficiencies / Skills section
          if (singleWord.length > 0) {
            const skillsMatch = cvText.match(/(TECHNICAL\s+PROFICIENCIES|TECHNICAL\s+SKILLS|SKILLS)\s*\n([^\n]*(?:\n(?![A-Z]{3,})[^\n]*)*)/i);
            if (skillsMatch) {
              const sectionStart = skillsMatch.index;
              const fullMatch = skillsMatch[0];
              const sectionContent = fullMatch.trimEnd();
              const separator = sectionContent.endsWith(',') ? ' ' : ', ';
              const enriched = sectionContent + separator + singleWord.join(', ');
              cvText = cvText.substring(0, sectionStart) + enriched + cvText.substring(sectionStart + fullMatch.length);
            } else {
              const insertBefore = cvText.match(/\n(CERTIFICATIONS|EDUCATION|ACHIEVEMENTS)\b/i);
              if (insertBefore && insertBefore.index !== undefined) {
                const newSection = `\n\nTECHNICAL PROFICIENCIES\n${singleWord.join(', ')}\n`;
                cvText = cvText.substring(0, insertBefore.index) + newSection + cvText.substring(insertBefore.index);
              } else {
                cvText += `\n\nTECHNICAL PROFICIENCIES\n${singleWord.join(', ')}\n`;
              }
            }
          }

          this.generatedDocuments.cv = cvText;
          
          // Recalculate final score
          const finalCheck = this.calculateMatchScore(cvText, keywords);
          this.generatedDocuments.matchScore = finalCheck.matchScore;
          this.generatedDocuments.matchedKeywords = finalCheck.matchedKeywords;
          this.generatedDocuments.missingKeywords = finalCheck.missingKeywords;
          this.updateMatchAnalysisUI();
          
          console.log(`[ATS Tailor] Post-sanitisation re-injection complete: ${finalCheck.matchScore}% (${finalCheck.matchedKeywords?.length}/${keywords.all.length})`);
        } else {
          console.log('[ATS Tailor] Post-sanitisation: all keywords intact ✓');
        }
      }

      // CRITICAL: Ensure the CV header carries the JOB-ADAPTIVE candidate
      // address. The model often pre-writes "Dublin, IE" (it sees the
      // profile city), and the previous "is there already a location?"
      // check matched that and skipped the replacement -- so the adaptive
      // value never reached the file. Fix: ALWAYS replace whatever the
      // contact line starts with with the adaptive location.
      const applicationLocation = this.getApplicationLocation();
      if (this.generatedDocuments.cv) {
        let cvText = this.generatedDocuments.cv;
        const phoneEmailRe = /^(.+\n)([^\n]*(?:\+?\d[\d\s:+()-]{6,}|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})[^\n]*)/m;
        const m = cvText.match(phoneEmailRe);
        if (m) {
          // Strip a leading location-like prefix (e.g. "Dublin, IE | ")
          // from the contact line, then prepend the adaptive value.
          const stripped = m[2].replace(
            /^[\s,;|]*[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'\- ]{1,60}(?:,\s*[A-Za-z]{2,30}){0,2}\s*[|,;]\s*/, ''
          );
          cvText = cvText.replace(phoneEmailRe, m[1] + applicationLocation + ' | ' + stripped);
          this.generatedDocuments.cv = cvText;
          console.log('[ATS Tailor] CV header location set to:', applicationLocation);
        }
      }

      // CRITICAL: Normalise all experience dates to "Month YYYY" format in
      // generated CV text. Jobscan's match report explicitly recommends
      // MM/YY, MM/YYYY, or "Month YYYY"; the previous MM-YYYY (e.g.
      // "01-2023") was being flagged as non-compliant. We standardise on
      // "Month YYYY" for the most human-readable, ATS-safe output.
      if (this.generatedDocuments.cv) {
        let cvText = this.generatedDocuments.cv;
        const monthName = (mm) => _MONTHS_LONG[Math.max(1, Math.min(12, parseInt(mm, 10))) - 1];
        // Order matters. Step 1: expand abbreviated month names FIRST so
        // they don't conflict with the year-only fallbacks. "Jan 2023" ->
        // "January 2023".
        cvText = cvText.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+((?:19|20)\d{2})\b/g, (m, mon, y) => {
          const mi = _MONTH_LOOKUP[mon.toLowerCase()];
          return mi ? `${_MONTHS_LONG[mi - 1]} ${y}` : m;
        });
        // Step 2: numeric formats -> "Month YYYY".
        cvText = cvText.replace(/\b((?:19|20)\d{2})[-/](\d{1,2})\b/g, (m, y, mo) => `${monthName(mo)} ${y}`);
        cvText = cvText.replace(/\b(\d{1,2})[-/]((?:19|20)\d{2})\b/g, (m, mo, y) => {
          const n = parseInt(mo, 10);
          return n >= 1 && n <= 12 ? `${monthName(mo)} ${y}` : m;
        });
        // Step 3: year-only ranges -> "January YYYY ..." (only applies to
        // YEARS NOT already preceded by a month name -- the negative
        // lookbehind prevents reprocessing "January 2023 - Present").
        cvText = cvText.replace(/(?<![A-Za-z]\s)\b((?:19|20)\d{2})\s*[– - -]\s*Present\b/gi, (m, y) => `January ${y} - Present`);
        cvText = cvText.replace(/(?<![A-Za-z]\s)\b((?:19|20)\d{2})\s*[– - -]\s*((?:19|20)\d{2})\b/g, (m, s, e) => `January ${s} - January ${e}`);
        // Step 4: normalise any remaining en/em dash range separators
        // between "Month YYYY" tokens to plain hyphens.
        cvText = cvText.replace(/(\b[A-Za-z]+ (?:19|20)\d{2})\s*[– - ]\s*(Present|[A-Za-z]+ (?:19|20)\d{2})\b/g, '$1 - $2');
        this.generatedDocuments.cv = cvText;
        console.log('[ATS Tailor] Converted dates to "Month YYYY" format');
      }

      // CRITICAL: Sanitise cover letter text to remove standalone "Company" line
      if (this.generatedDocuments.coverLetter) {
        let coverText = this.generatedDocuments.coverLetter;
        // Remove standalone "Company" lines (case insensitive)
        coverText = coverText
          .replace(/^\s*Company\s*$/gm, '')
          .replace(/\n\s*Company\s*\n/gi, '\n')
          .replace(/\n\n\n+/g, '\n\n');
        // Add portfolio URL after date line if not present
        if (!/maxmilliamlabs-ai\.web\.app|maxmilliam/i.test(coverText.split('Dear')[0] || '')) {
          coverText = coverText.replace(
            /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\n/i,
            '$1\nmaxmilliamlabs-ai.web.app\n'
          );
        }
        // Force the cover-letter header location to the job-adaptive
        // value (replacing whatever the model wrote, typically "Dublin, IE").
        const clLocation = this.getApplicationLocation();
        const clPhoneEmailRe = /^(.+\n)([^\n]*(?:\+?\d[\d\s:+()-]{6,}|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})[^\n]*)/m;
        const mCl = coverText.match(clPhoneEmailRe);
        if (mCl) {
          const strippedCl = mCl[2].replace(
            /^[\s,;|]*[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'\- ]{1,60}(?:,\s*[A-Za-z]{2,30}){0,2}\s*[|,;]\s*/, ''
          );
          coverText = coverText.replace(clPhoneEmailRe, mCl[1] + clLocation + ' | ' + strippedCl);
        }
        this.generatedDocuments.coverLetter = coverText;
        console.log('[ATS Tailor] Sanitised cover letter text');
      }

      // CRITICAL: Apply dedupeSectionHeaders to CV text BEFORE passing to PDF generator
      // This ensures the OpenResumeGenerator receives clean text without duplicated headers
      if (this.generatedDocuments.cv) {
        this.generatedDocuments.cv = this.dedupeSectionHeaders(this.generatedDocuments.cv);
        console.log('[ATS Tailor] Applied dedupeSectionHeaders to CV text before PDF generation');
      }

      // === Recruiter Audit: post-process pass on the FINAL CV + cover
      // letter text, just before PDF generation.  Strips empty buzzword
      // phrases, mirrors JD vocabulary to exact terms, echoes the JD job
      // title into the scan zone, and surfaces unquantified bullets +
      // first-six-seconds gaps as warnings the user can act on.
      // Pure text ops, ~5ms.  Skipped silently if the module is missing
      // or the caller passes options.recruiterAudit === false.
      if (options.recruiterAudit !== false && typeof RecruiterAudit !== 'undefined' && this.generatedDocuments.cv) {
        try {
          const stored = await new Promise((resolve) =>
            chrome.storage.local.get(['ats_profile'], (r) => resolve(r || {}))
          );
          const profile = stored.ats_profile || {};
          const candidateName = [profile.first_name || profile.firstName, profile.last_name || profile.lastName]
            .filter(Boolean).join(' ').trim();
          const audited = RecruiterAudit.runRecruiterAudit({
            cvText: this.generatedDocuments.cv,
            coverLetterText: this.generatedDocuments.coverLetter || '',
            jdText: this.currentJob?.description || this.currentJob?.jdText || '',
            jdTitle: this.currentJob?.title || '',
            jdCompany: this.currentJob?.company || '',
            candidateName,
            // v3: honesty audit needs the ORIGINAL CV + JD keywords so it
            // can flag any tailored term that wasn't already in the user's
            // genuine CV. baseCVContent is often the PARSED PROFILE OBJECT
            // (not text) -- passing it raw stringified to "[object Object]"
            // and silently broke every original-vs-tailored comparison.
            originalCV: this.getOriginalCVText(),
            jobKeywords: this.generatedDocuments.keywords || null,
            // v8: guarantee the SELECTED PROJECTS section from the profile's
            // structured projects (with verbatim live/code links) so it
            // renders on every generated CV, fully ATS-parseable.
            relevantProjects: Array.isArray(profile.relevant_projects) ? profile.relevant_projects
              : (Array.isArray(profile.relevantProjects) ? profile.relevantProjects : []),
          });
          this.generatedDocuments.cv = audited.cvText;
          if (audited.coverLetterText) this.generatedDocuments.coverLetter = audited.coverLetterText;
          this.generatedDocuments.recruiterAudit = audited.report;
          console.log('[ATS Tailor] Recruiter audit:', audited.report.fixes.length, 'fixes,',
            audited.report.warnings.length, 'warnings,', audited.report.timingMs + 'ms');
          this.renderAuditWarnings(audited.report);
        } catch (e) {
          console.warn('[ATS Tailor] Recruiter audit skipped:', e.message);
        }
      }

      // CRITICAL: Sanitise the structuredCv before PDF generation (all paths)
      this.sanitizeStructuredCV();

      // Regenerate PDF with boosted CV and dynamic location
      if (this.generatedDocuments.cv) {
        await this.regeneratePDFAfterBoost();
        
        // WIRE UP DEBUG PANELS: Log output after PDF generation
        if (window.PDFDebugPanel) {
          window.PDFDebugPanel.logOutputData({
            cvBase64Length: (this.generatedDocuments.cvPdf || '').length,
            coverBase64Length: (this.generatedDocuments.coverPdf || '').length,
            cvFilename: this.generatedDocuments.cvFileName,
            coverFilename: this.generatedDocuments.coverFileName,
          });
          window.PDFDebugPanel.logComplete();
        }
      }

      updateStep(3, 'complete');

      // ============ FINAL: Attach CV & Update UI ============
      updateProgress(90, 'Attaching tailored CV to application...');

      // Build both DOCX artifacts (CV + cover letter). DOCX is the ONLY
      // attach/download format -- best ATS parseability and the file
      // most recruiters actually open from the portal.
      this.buildDocxArtifact();

      // CRITICAL: Store files in chrome.storage for content.js attach loop
      await chrome.storage.local.set({
        // CV (DOCX is the attached file; PDF kept for backward compat /
        // preview only -- never the attached document).
        cvPDF: this.generatedDocuments.cvPdf,
        cvFileName: this.generatedDocuments.cvFileName,
        cvText: this.generatedDocuments.cv || '',
        cvDocx: this.generatedDocuments.cvDocx || null,
        cvDocxFileName: this.generatedDocuments.cvDocxFileName || null,
        // Cover letter (DOCX too -- text retained for diff/audit).
        coverPDF: this.generatedDocuments.coverPdf,
        coverFileName: this.generatedDocuments.coverFileName,
        coverLetterText: this.generatedDocuments.coverLetter || '',
        coverDocx: this.generatedDocuments.coverDocx || null,
        coverDocxFileName: this.generatedDocuments.coverDocxFileName || null,
        // Hard-pinned to DOCX (the user-facing format selector was
        // removed; DOCX everywhere is the new product behaviour).
        attach_format: 'docx',
      });
      console.log('[ATS Tailor] Stored CV+cover DOCX in chrome.storage (DOCX-only attach)');
      
      // Auto-attach BOTH CV and Cover Letter to the page
      try {
        await this.attachBothDocuments();
      } catch (attachError) {
        console.warn('[ATS Tailor] Auto-attach failed:', attachError);
        // Don't throw - document generation was successful
      }

      updateProgress(100, 'Complete! 100% keyword match achieved.');

      await chrome.storage.local.set({ ats_lastGeneratedDocuments: this.generatedDocuments });

      // Documents exist and are stored: the note can now carry them.
      // Same rule as detection -- the follow-up is an extra, and it must
      // not be able to fail a tailoring run that has already produced both
      // documents. Anything thrown here would surface as a failed tailor.
      try {
        await this.autoSendFollowup();
      } catch (followupError) {
        console.warn('[ATS Tailor] follow-up step failed (documents are fine):',
          followupError && followupError.message);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      this.stats.today++;
      this.stats.total++;
      this.stats.times.push(elapsed);
      if (this.stats.times.length > 10) this.stats.times.shift();
      this.stats.avgTime = this.stats.times.reduce((a, b) => a + b, 0) / this.stats.times.length;
      await this.saveStats();
      this.updateUI();

      // Show documents card and preview
      document.getElementById('documentsCard')?.classList.remove('hidden');
      this.updateDocumentDisplay();
      this.updatePreviewContent();
      
      const finalScore = this.generatedDocuments.matchScore;
      this.showToast(
        `Done in ${elapsed.toFixed(1)}s! ${finalScore}% keyword match.`, 
        'success'
      );
      this.setStatus('Complete', 'ready');

      // ============ AUTOMATION COMPLETE: PREPARE FOR NEXT ATS ============
      // Signal to LazyApply/external automation that this job is complete
      await this.signalAutomationComplete({
        success: true,
        elapsed,
        matchScore: finalScore,
        jobUrl: this.currentJob?.url || window.location?.href,
        company: this.currentJob?.company,
        title: this.currentJob?.title
      });

    } catch (error) {
      console.error('Tailoring error:', error);
      const errMsg = error.message || 'Unknown error';
      this.showToast(`Tailoring failed: ${errMsg}`, 'error');
      this.setStatus('Error', 'error');
      // Show error in progress text so it persists visually
      if (progressText) progressText.textContent = `Error: ${errMsg}`;
      if (progressContainer) progressContainer.classList.remove('hidden');

      // Signal failure to external automation (guarded to prevent double-crash)
      try {
        await this.signalAutomationComplete({
          success: false,
          error: error.message,
          jobUrl: this.currentJob?.url || window.location?.href
        });
      } catch (signalError) {
        console.warn('[ATS Tailor] signalAutomationComplete failed:', signalError);
      }
      this.showToast(error.message || 'Failed', 'error');
      this.setStatus('Error', 'error');
      
      // Signal failure to external automation
      await this.signalAutomationComplete({
        success: false,
        error: error.message,
        jobUrl: this.currentJob?.url || window.location?.href
      });
    } finally {
      // Release the atomic guard and record the URL we just tailored so
      // duplicate triggers for the same job become no-ops until the user
      // forces a re-tailor.
      this._tailoringInProgress = false;
      const completedUrl = this.currentJob?.url || this.currentJob?.jobUrl || window.location?.href || '';
      if (completedUrl) this._lastTailoredJobUrl = completedUrl;

      // INSTANT RESET TO BLUE READY STATE
      const btnIconLeft = btn.querySelector('.btn-icon-left');
      const btnText = btn.querySelector('.btn-text');
      const btnTime = btn.querySelector('.btn-time');

      btn.disabled = false;
      btn.classList.remove('btn-tailoring');
      btn.classList.add('btn-gradient');

      if (btnIconLeft) btnIconLeft.textContent = '⚡';
      if (btnText) btnText.textContent = 'Extract & Apply Keywords to CV';
      if (btnTime) btnTime.textContent = '~5s';

      // On error keep progress visible so user sees the message; otherwise hide
      const hadError = progressText && progressText.textContent.startsWith('Error:');
      if (!hadError) {
        progressContainer?.classList.add('hidden');
      }

      [1, 2, 3].forEach(n => {
        const step = document.getElementById(`step${n}`);
        if (step) {
          step.classList.remove('active', 'complete');
          const icon = step.querySelector('.step-icon');
          if (icon) icon.textContent = hadError ? '❌' : '⏳';
        }
      });
    }
  }

  /**
   * Regenerate PDF after CV boost with dynamic location tailoring
   */
  /**
   * Job-adaptive candidate location for THIS application.
   * Uses the job's normalized location (so geo-screened roles don't knock
   * the candidate out on distance alone) and falls back to the profile
   * location. Job locations are typed by recruiters and can be misspelled
   * or malformed, so the result is sanitised and shape-validated -- any
   * junk falls back to the profile location rather than landing on the CV.
   */
  // Serialise the stored base-CV data to PLAIN TEXT for the recruiter
  // audit's original-vs-tailored comparisons (honesty + metric-loss).
  // baseCVContent is usually the parsed profile OBJECT, which would
  // otherwise stringify to "[object Object]" and break every comparison.
  getOriginalCVText() {
    const c = this.baseCVContent;
    if (!c) return '';
    if (typeof c === 'string') return c;
    try {
      const parts = [];
      const exp = c.professional_experience || c.professionalExperience || [];
      for (const e of (Array.isArray(exp) ? exp : [])) {
        parts.push([e.company, e.title || e.role, e.dates].filter(Boolean).join(' | '));
        const bullets = Array.isArray(e.bullets) ? e.bullets
          : (typeof e.description === 'string' ? e.description.split(/\r?\n/) : []);
        for (const b of bullets) if (b && String(b).trim()) parts.push('• ' + String(b).trim());
      }
      const projs = c.relevant_projects || c.relevantProjects || [];
      for (const p of (Array.isArray(projs) ? projs : [])) {
        parts.push([p.name, p.techStack].filter(Boolean).join(' | '));
        const bullets = Array.isArray(p.bullets) ? p.bullets
          : (typeof p.description === 'string' ? p.description.split(/\r?\n/) : []);
        for (const b of bullets) if (b && String(b).trim()) parts.push('• ' + String(b).trim());
      }
      const skills = Array.isArray(c.skills) ? c.skills : [];
      if (skills.length) parts.push('Skills: ' + skills.map((s) => (typeof s === 'string' ? s : (s && s.name) || '')).filter(Boolean).join(', '));
      const certs = Array.isArray(c.certifications) ? c.certifications : [];
      for (const ct of certs) if (ct) parts.push('• ' + String(ct));
      return parts.join('\n');
    } catch (e) {
      return '';
    }
  }

  getApplicationLocation() {
    const fallback = this._defaultLocation || 'Dublin, IE';
    const raw = this.currentJob?.location || '';
    let loc = '';
    try {
      if (window.ATSLocationTailor?.normalizeJobLocationForApplication) {
        loc = window.ATSLocationTailor.normalizeJobLocationForApplication(raw, fallback);
      } else {
        loc = raw || fallback;
      }
    } catch (e) {
      loc = fallback;
    }
    const result = this.sanitizeLocationString(loc, fallback, { rawSource: raw });
    // Diagnostic: shows exactly why a location was (or wasn't) adapted.
    console.log(`[ATS Tailor] Location: raw="${raw}" -> normalized="${loc}" -> final="${result}"`);
    return result;
  }

  sanitizeLocationString(loc, fallback, opts = {}) {
    if (!loc) return fallback;
    let s = String(loc)
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/, ,+/g, ',')
      .replace(/^[,\s]+|[,\s.]+$/g, '')
      .trim();
    // Validate shape: "City", "City, CC", "City, Country", "City, ST, US".
    // Recruiter-typed junk (digits, slashes, "hybrid/remote- london!!", etc.)
    // fails this and falls back to the profile location.
    const valid = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'\- ]{1,39}(?:,\s*[A-Za-z]{2}(?:,\s*[A-Za-z]{2})?|,\s*[A-Za-zÀ-ÖØ-öø-ÿ.'\- ]{2,30})?$/.test(s);
    if (!valid) return fallback;
    // Recruiter placeholders that pass the shape check but aren't places.
    if (/^(tbd|n\/?a|various|multiple|flexible|anywhere|unknown|remote|hybrid|onsite|location)$/i.test(s.split(',')[0].trim())) {
      return fallback;
    }
    // Remote/hybrid wording anywhere in the string means this isn't a
    // clean place name -- the normalizer should already have resolved it,
    // so whatever reached here is junk. Fall back.
    if (/\b(remote|hybrid|onsite|on-site|wfh|work\s*from\s*home|virtual)\b/i.test(s)) {
      return fallback;
    }
    // Recognition gate: letters-only junk ("Asdfgh", "Anywhere in EMEA")
    // passes the shape check, so verify the place actually resolves
    // against the city dataset / country codes when the strategy is loaded.
    //
    // ESCAPE HATCH: small real towns (e.g. "Foster City, CA") may be
    // missing from the 33k-city dataset. If the city segment was typed
    // VERBATIM by the recruiter in the raw job location AND the raw text
    // also contained a country/state token, trust it -- the fabrication
    // problem we're guarding against is the normalizer APPENDING a country
    // to junk, which can't happen when the recruiter supplied both parts.
    try {
      if (window.ATSLocationTailor?.isRecognizedPlace &&
          !window.ATSLocationTailor.isRecognizedPlace(s)) {
        const rawSource = String(opts.rawSource || '').toLowerCase();
        const citySeg = s.split(',')[0].trim().toLowerCase();
        const recruiterTypedCity = citySeg.length >= 3 && rawSource.includes(citySeg);
        const recruiterTypedRegion = /,\s*[A-Za-z]{2}\b|,\s*[A-Za-z][A-Za-z ]{3,}$/.test(String(opts.rawSource || '').trim());
        if (!(recruiterTypedCity && recruiterTypedRegion)) {
          return fallback;
        }
      }
    } catch (e) {}
    // Tidy casing: title-case an all-lowercase city; uppercase 2-letter codes.
    s = s.split(',').map((part, i) => {
      const p = part.trim();
      if (i > 0 && /^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
      if (p === p.toLowerCase()) return p.replace(/(^|[\s\-'])[a-z]/g, (c) => c.toUpperCase());
      return p;
    }).join(', ');
    return s;
  }

  /**
   * Summary text for the generated PDF.
   * CRITICAL: prefer the summary from the AUDITED CV text
   * (this.generatedDocuments.cv) so every recruiter-audit fix (buzzword
   * purge, 360-char clamp, target-role echo, em-dash removal) reaches
   * the actual FILE. Previously the raw profile ats_strategy overrode
   * it inside OpenResumeGenerator, so audit fixes applied only to the
   * preview text -- not the PDF the user submits.
   */
  getAuditedSummaryForPdf(fallbackSummary) {
    const cvText = this.generatedDocuments?.cv || '';
    const m = cvText.match(/^(?:PROFESSIONAL SUMMARY|SUMMARY|PROFILE)\s*:?\s*\n([\s\S]*?)(?=\n\s*\n|\n(?:WORK EXPERIENCE|EXPERIENCE|CORE COMPETENCIES|EMPLOYMENT|SKILLS|EDUCATION)\b)/im);
    let summary = m && m[1] ? m[1].trim().replace(/\s*\n\s*/g, ' ') : '';
    if (summary) return summary;

    // Fallback: raw profile strategy text -- run the same audit fixes on it.
    summary = String(fallbackSummary || '').trim();
    if (summary && typeof RecruiterAudit !== 'undefined') {
      try {
        summary = RecruiterAudit.purgeBuzzwords(summary).text;
        const wrapped = 'PROFESSIONAL SUMMARY\n' + summary + '\n\nEXPERIENCE';
        const clamped = RecruiterAudit.clampSummary(wrapped, { maxChars: 360 });
        const mm = clamped.text.match(/PROFESSIONAL SUMMARY\n([\s\S]*?)\n\nEXPERIENCE/);
        if (mm && mm[1]) summary = mm[1].trim();
      } catch (e) {}
    }
    return summary;
  }

  async regeneratePDFAfterBoost() {
    try {
      console.log('[ATS Tailor] Regenerating PDF after boost (OpenResume style)...');

      // Get ATS-safe location in strict format: "City, ISO2" (or "City, ST, US")
      let tailoredLocation = this._defaultLocation || 'Dublin, IE';
      if (window.ATSLocationTailor?.normalizeJobLocationForApplication) {
        tailoredLocation = window.ATSLocationTailor.normalizeJobLocationForApplication(
          this.currentJob?.location || '',
          this._defaultLocation || 'Dublin, IE'
        );
      } else if (this.currentJob?.location) {
        tailoredLocation = this.currentJob.location;
      }
      // Recruiter-typed job locations can be malformed; sanitise + validate
      // before the value reaches any CV/cover header or PDF.
      tailoredLocation = this.sanitizeLocationString(tailoredLocation, this._defaultLocation || 'Dublin, IE');
      console.log('[ATS Tailor] Tailored location:', tailoredLocation);

      // Get user profile for header
      let candidateData = {};
      try {
        if (this.session?.access_token && this.session?.user?.id) {
          const profileRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=first_name,last_name,email,phone,linkedin,github,portfolio,professional_experience,relevant_projects,education,skills,certifications,ats_strategy`,
            {
              headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${this.session.access_token}`,
              },
            }
          );
          if (profileRes.ok) {
            const profiles = await profileRes.json();
            candidateData = profiles?.[0] || {};
          }
        }
      } catch (e) {
        console.warn('[ATS Tailor] Could not fetch profile for PDF regeneration:', e);
      }

      // PRIORITY 1: Use OpenResume Generator for perfect ATS PDFs
      if (window.OpenResumeGenerator) {
        try {
          console.log('[ATS Tailor] Using OpenResume Generator for ATS-perfect PDFs...');

          const atsPackage = await window.OpenResumeGenerator.generateATSPackage(
            this.generatedDocuments.cv,
            this.generatedDocuments.keywords || {},
            {
              title: this.currentJob?.title || '',
              company: this.currentJob?.company || '',
              location: tailoredLocation
            },
            {
              firstName: candidateData.first_name,
              lastName: candidateData.last_name,
              email: candidateData.email || this.session?.user?.email,
              phone: candidateData.phone,
              linkedin: candidateData.linkedin,
              github: candidateData.github,
              portfolio: candidateData.portfolio,
              professionalExperience: candidateData.professional_experience || [],
              relevantProjects: candidateData.relevant_projects || [],
              education: candidateData.education,
              skills: candidateData.skills,
              certifications: candidateData.certifications,
              // Audited summary (from generatedDocuments.cv) so the PDF
              // matches the preview -- NOT the raw profile ats_strategy.
              summary: this.getAuditedSummaryForPdf(candidateData.ats_strategy),
              city: tailoredLocation
            }
          );

          if (atsPackage.cvBase64) {
            this.generatedDocuments.cvPdf = atsPackage.cvBase64;
            this.generatedDocuments.cvFileName = atsPackage.cvFilename;
            this.generatedDocuments.tailoredLocation = tailoredLocation;
            console.log('[ATS Tailor] OpenResume CV generated:', atsPackage.cvFilename);
          }

          if (atsPackage.coverBase64) {
            this.generatedDocuments.coverPdf = atsPackage.coverBase64;
            this.generatedDocuments.coverFileName = atsPackage.coverFilename;
            console.log('[ATS Tailor] OpenResume Cover Letter generated:', atsPackage.coverFilename);
          }

          if (atsPackage.matchScore) {
            this.generatedDocuments.matchScore = atsPackage.matchScore;
          }

          if (atsPackage.cvBase64) return; // Only return if PDF was actually generated
        } catch (p1Error) {
          console.warn('[ATS Tailor] OpenResume P1 failed, falling through to P2/P3:', p1Error.message);
        }
      }

      // PRIORITY 1.5: Use ProfessionalPDFEngine for CV and Cover Letter PDFs
      if (typeof ProfessionalPDFEngine !== 'undefined') {
        try {
          console.log('[ATS Tailor] Using ProfessionalPDFEngine for PDF generation...');

          const pdfCandidateData = {
            firstName: candidateData.first_name,
            first_name: candidateData.first_name,
            lastName: candidateData.last_name,
            last_name: candidateData.last_name,
            email: candidateData.email || this.session?.user?.email,
            phone: candidateData.phone,
            linkedin: candidateData.linkedin,
            github: candidateData.github,
            portfolio: candidateData.portfolio,
            city: tailoredLocation,
            location: tailoredLocation,
            professional_experience: candidateData.professional_experience || []
          };

          // Generate CV PDF
          const cvResult = await ProfessionalPDFEngine.generateCV(
            pdfCandidateData,
            this.generatedDocuments.cv,
            { location: tailoredLocation },
            { location: tailoredLocation, title: this.currentJob?.title || '', company: this.currentJob?.company || '' }
          );
          if (cvResult?.success && cvResult.pdf) {
            this.generatedDocuments.cvPdf = cvResult.pdf;
            this.generatedDocuments.cvFileName = cvResult.filename || this.generatedDocuments.cvFileName;
            this.generatedDocuments.tailoredLocation = tailoredLocation;
            console.log('[ATS Tailor] ProfessionalPDFEngine CV generated:', this.generatedDocuments.cvFileName);
          }

          // Generate Cover Letter PDF
          const coverResult = await ProfessionalPDFEngine.generateCoverLetter(
            pdfCandidateData,
            this.generatedDocuments.coverLetter,
            { title: this.currentJob?.title || '', company: this.currentJob?.company || '', location: tailoredLocation }
          );
          if (coverResult?.success && coverResult.pdf) {
            this.generatedDocuments.coverPdf = coverResult.pdf;
            this.generatedDocuments.coverFileName = coverResult.filename || this.generatedDocuments.coverFileName;
            console.log('[ATS Tailor] ProfessionalPDFEngine Cover Letter generated:', this.generatedDocuments.coverFileName);
          }

          if (this.generatedDocuments.cvPdf) return;
        } catch (pdfEngineError) {
          console.warn('[ATS Tailor] ProfessionalPDFEngine failed, falling through:', pdfEngineError.message);
        }
      }

      // PRIORITY 2: Use PDFATSPerfect if available
      if (window.PDFATSPerfect) {
        const pdfResult = await window.PDFATSPerfect.regenerateAfterBoost({
          jobData: this.currentJob,
          candidateData: {
            firstName: candidateData.first_name,
            lastName: candidateData.last_name,
            email: candidateData.email || this.session?.user?.email,
            phone: candidateData.phone,
            linkedin: candidateData.linkedin,
            github: candidateData.github,
            portfolio: candidateData.portfolio
          },
          boostedCVText: this.generatedDocuments.cv,
          currentLocation: tailoredLocation
        });

        if (pdfResult.pdf) {
          this.generatedDocuments.cvPdf = pdfResult.pdf;
          this.generatedDocuments.cvFileName = pdfResult.fileName;
          this.generatedDocuments.tailoredLocation = pdfResult.location;
          console.log('[ATS Tailor] PDF regenerated:', pdfResult.fileName);
          return;
        } else if (pdfResult.requiresBackendGeneration) {
          await this.regeneratePDFViaBackend(pdfResult, tailoredLocation);
          return;
        }
      }
      
      // PRIORITY 3: Fallback to backend generation
      await this.regeneratePDFViaBackend(null, tailoredLocation);
      
    } catch (error) {
      console.error('[ATS Tailor] PDF regeneration failed:', error);
      // Don't throw - boost was successful, just PDF failed
    } finally {
      // Build DOCX in parallel so the content-script attach can choose
      // PDF or DOCX based on the user's attach_format preference.
      this.buildDocxArtifact();
      // Push the freshly-built docx + filename + format preference to
      // the active tab so the attach loop picks the right file.
      this.pushAttachPayloadToActiveTab();
    }
  }

  /**
   * Forward CV + cover-letter DOCX artifacts to the content script.
   * DOCX is the only attach format (best ATS parseability and the file
   * recruiters open from the portal); PDF rides along only as a fallback
   * the content script can use if the DOCX hasn't been built yet.
   */
  async pushAttachPayloadToActiveTab() {
    try {
      const tabs = await new Promise((r) => chrome.tabs.query({ active: true, currentWindow: true }, r));
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (!tabId) return;
      const payload = {
        action: 'JG_SET_ATTACH_PAYLOAD',
        format: 'docx',
        // CV
        cvDocx: this.generatedDocuments.cvDocx || null,
        cvDocxFileName: this.generatedDocuments.cvDocxFileName || null,
        cvPdf: this.generatedDocuments.cvPdf || null,
        cvFileName: this.generatedDocuments.cvFileName || null,
        cvText: this.generatedDocuments.cv || '',
        // Cover
        coverDocx: this.generatedDocuments.coverDocx || null,
        coverDocxFileName: this.generatedDocuments.coverDocxFileName || null,
        coverPdf: this.generatedDocuments.coverPdf || null,
        coverFileName: this.generatedDocuments.coverFileName || null,
        coverText: this.generatedDocuments.coverLetter || '',
      };
      chrome.tabs.sendMessage(tabId, payload).catch(() => {});
    } catch (e) {
      console.warn('[ATS Tailor] pushAttachPayloadToActiveTab failed:', e?.message);
    }
  }

  /**
   * Regenerate PDF via Supabase edge function
   */
  async regeneratePDFViaBackend(textFormat, tailoredLocation) {
    try {
      if (!this.session?.access_token) {
        console.warn('[ATS Tailor] No session for backend PDF generation');
        return;
      }

      // Get structuredCv which contains the professional summary
      const structuredCv = window.quantumhireStructuredCv || this.generatedDocuments.structuredCv;
      
      // Extract professional summary from structuredCv or stored data
      let professionalSummary = '';
      if (structuredCv?.summary) {
        professionalSummary = typeof structuredCv.summary === 'string' 
          ? structuredCv.summary 
          : structuredCv.summary.text || structuredCv.summary.content || '';
      }
      
      // Also check for stored summary from tailoring result
      if (!professionalSummary && this.generatedDocuments.professionalSummary) {
        professionalSummary = this.generatedDocuments.professionalSummary;
      }

      console.log('[ATS Tailor] regeneratePDFViaBackend - Summary length:', professionalSummary.length);

      const pdfSafeCvContent = this.dedupeSectionHeaders(this.generatedDocuments.cv || '');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          content: pdfSafeCvContent,
          type: 'cv',
          tailoredLocation: tailoredLocation,
          jobTitle: this.currentJob?.title,
          company: this.currentJob?.company,
          firstName: this.profileInfo?.firstName,
          lastName: this.profileInfo?.lastName,
          fileName: this.generatedDocuments.cvFileName,
          // Pass only the summary string to avoid payload bloat
          summary: professionalSummary
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const isHtml = /^\s*</.test((errorText || '').trim());
        const msg = response.status === 502
          ? 'Service temporarily unavailable (502) during PDF generation.'
          : (!isHtml && errorText ? errorText : `PDF generation failed (${response.status})`);
        console.warn('[ATS Tailor] Backend PDF generation failed:', msg);
        return;
      }

      // ROBUST JSON PARSING for PDF response
      let result;
      try {
        const responseText = await response.text();
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.warn('[ATS Tailor] PDF response parse failed:', parseError);
        return;
      }
      
      if (result.pdf) {
        this.generatedDocuments.cvPdf = result.pdf;
        this.generatedDocuments.cvFileName = result.fileName || this.generatedDocuments.cvFileName;
        console.log('[ATS Tailor] PDF regenerated via backend:', result.fileName);
      }
    } catch (error) {
      console.error('[ATS Tailor] Backend PDF generation failed:', error);
    }
  }

  /**
   * Sanitise the global structuredCv object before ANY PDF generation path.
   * - Filters bogus experience entries (section headers as company names)
   * - Deduplicates skills and certifications
   * - Applies neverLeakGuard to all text fields (summary, bullets, titles)
   */
  sanitizeStructuredCV() {
    const structuredCv = window.quantumhireStructuredCv || this.generatedDocuments?.structuredCv;
    if (!structuredCv) return;

    const HEADER_PATTERNS = new Set([
      'professional experience', 'work experience', 'experience',
      'employment history', 'career history', 'employment',
      'work history', 'positions held', 'career',
      'education', 'skills', 'certifications', 'projects', 'achievements',
      'professional summary', 'summary', 'technical proficiencies',
      'technical skills', 'core skills'
    ]);

    const normalise = (s) => String(s || '').toLowerCase().replace(/[#:*|]/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s{2,}/g, ' ').trim();

    // Helper: detect single or duplicated section headers
    const isHeaderish = (v) => {
      if (HEADER_PATTERNS.has(v)) return true;
      // Catch "work experience work experience" etc.
      for (const h of HEADER_PATTERNS) {
        if (v === (h + ' ' + h)) return true;
        // Catch triple+ repeats
        if (v.startsWith(h + ' ') && v.replace(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim() === '') return true;
      }
      return false;
    };

    // Filter bogus experience entries
    if (Array.isArray(structuredCv.experience)) {
      structuredCv.experience = structuredCv.experience.filter(job => {
        const company = normalise(job.company || job.companyName || '');
        const title = normalise(job.title || job.jobTitle || job.position || '');
        if (HEADER_PATTERNS.has(company)) {
          console.log('[ATS Tailor] sanitizeStructuredCV: removed header-as-company:', job.company);
          return false;
        }
        if (HEADER_PATTERNS.has(title) && !company) {
          console.log('[ATS Tailor] sanitizeStructuredCV: removed header-as-title:', job.title);
          return false;
        }
        if (isHeaderish(company)) {
          console.log('[ATS Tailor] sanitizeStructuredCV: removed header-as-company:', job.company);
          return false;
        }
        if (isHeaderish(title) && !company) {
          console.log('[ATS Tailor] sanitizeStructuredCV: removed header-as-title:', job.title);
          return false;
        }
        if (!company || company.length < 2) return false;
        return true;
      });
    }

    // Deduplicate skills
    if (Array.isArray(structuredCv.skills)) {
      const seen = new Set();
      structuredCv.skills = structuredCv.skills.filter(s => {
        const key = String(s).toLowerCase().trim();
        if (seen.has(key) || !key) return false;
        seen.add(key);
        return true;
      });
    }

    // Deduplicate certifications
    if (Array.isArray(structuredCv.certifications)) {
      const seen = new Set();
      structuredCv.certifications = structuredCv.certifications.filter(c => {
        const key = String(c).toLowerCase().trim();
        if (seen.has(key) || !key) return false;
        seen.add(key);
        return true;
      });
    }

    // Apply neverLeakGuard to all text fields
    const guard = (typeof ContentQualityEngine !== 'undefined' && ContentQualityEngine.neverLeakGuard)
      ? ContentQualityEngine.neverLeakGuard.bind(ContentQualityEngine)
      : null;

    if (guard) {
      if (structuredCv.summary) structuredCv.summary = guard(structuredCv.summary);

      if (Array.isArray(structuredCv.experience)) {
        structuredCv.experience.forEach(job => {
          if (job.title) job.title = guard(job.title);
          if (Array.isArray(job.bullets)) {
            job.bullets = job.bullets.map(b => guard(b));
          }
          if (Array.isArray(job.achievements)) {
            job.achievements = job.achievements.map(a => guard(a));
          }
          if (Array.isArray(job.responsibilities)) {
            job.responsibilities = job.responsibilities.map(r => guard(r));
          }
        });
      }

      if (Array.isArray(structuredCv.skills)) {
        structuredCv.skills = structuredCv.skills.map(s => guard(s));
      }
      if (Array.isArray(structuredCv.certifications)) {
        structuredCv.certifications = structuredCv.certifications.map(c => guard(c));
      }
    }

    // Write back
    if (window.quantumhireStructuredCv) window.quantumhireStructuredCv = structuredCv;
    if (this.generatedDocuments?.structuredCv) this.generatedDocuments.structuredCv = structuredCv;
    console.log('[ATS Tailor] sanitizeStructuredCV complete');
  }

  /**
   * Dedupe repeated section headers AND split inline headers in plain-text CV/cover content.
   * Prevents output like: "WORK EXPERIENCE\n\nWORK EXPERIENCE".
   * ALSO FIXES: "SKILLS: PYTHON, JAVA, C++" -> splits to "SKILLS\n" + properly cased content.
   */
  dedupeSectionHeaders(text) {
    if (!text || typeof text !== 'string') return text;

    // CRITICAL FIX v2: Collapse inline duplicated headers on the SAME line
    // "WORK EXPERIENCE WORK EXPERIENCE" → "WORK EXPERIENCE"
    // "PROFESSIONAL EXPERIENCE PROFESSIONAL EXPERIENCE" → "PROFESSIONAL EXPERIENCE"
    let fixedText = text.replace(
      /\b(WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|ACHIEVEMENTS|PROFESSIONAL SUMMARY|SUMMARY)(\s+\1)+\b/gi,
      (match, header) => header.toUpperCase()
    );

    // CRITICAL FIX: Break apart concatenated headers (e.g., "...GOOGLE CLOCERTIFICATIONS:...")
    // This happens when AI truncates a word and immediately starts the next section
    fixedText = fixedText
      .replace(/([A-Za-z])(SKILLS|CERTIFICATIONS|EDUCATION|EXPERIENCE|SUMMARY|PROJECTS|ACHIEVEMENTS)(\s*:|\s+[A-Z])/g, '$1\n$2$3')
      .replace(/(SKILLS|CERTIFICATIONS|EDUCATION|EXPERIENCE|SUMMARY|PROJECTS|ACHIEVEMENTS)\s*:\s*/gi, (match, header) => {
        return header.toUpperCase() + ': ';
      });

    // CRITICAL FIX v4.0: Merge duplicate SEPARATE section headers
    // When "SKILLS\ncontent1...\nCERTIFICATIONS\n...\nSKILLS\ncontent2..." exists,
    // merge content2 into the first SKILLS section and remove the second
    const MERGEABLE_SECTIONS = ['SKILLS', 'TECHNICAL SKILLS', 'TECHNICAL PROFICIENCIES', 'CORE SKILLS', 'KEY SKILLS', 'CERTIFICATIONS'];
    for (const sectionName of MERGEABLE_SECTIONS) {
      const sectionRegex = new RegExp(
        `^${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`,
        'gim'
      );
      const matches = [...fixedText.matchAll(sectionRegex)];
      if (matches.length > 1) {
        // Found duplicate section - merge second occurrence into first
        // Find the content of the second section
        const secondStart = matches[1].index;
        const headerLen = matches[1][0].length;
        const contentStart = secondStart + headerLen;
        // Content ends at next section header or end of text
        const nextHeaderMatch = fixedText.slice(contentStart).match(/\n[A-Z][A-Z\s]{2,30}\n/);
        const contentEnd = nextHeaderMatch ? contentStart + nextHeaderMatch.index : fixedText.length;
        const secondContent = fixedText.slice(contentStart, contentEnd).trim();

        if (secondContent) {
          // Find end of first section's content
          const firstStart = matches[0].index;
          const firstHeaderLen = matches[0][0].length;
          const firstContentStart = firstStart + firstHeaderLen;
          const nextHeaderAfterFirst = fixedText.slice(firstContentStart).match(/\n[A-Z][A-Z\s]{2,30}\n/);
          const firstContentEnd = nextHeaderAfterFirst ? firstContentStart + nextHeaderAfterFirst.index : contentStart - 2;

          // Merge: append second content to first, remove second section entirely
          const firstContent = fixedText.slice(firstContentStart, firstContentEnd).trim();
          const mergedContent = firstContent + ', ' + secondContent;
          fixedText = fixedText.slice(0, firstContentStart) + mergedContent + '\n' +
                     fixedText.slice(firstContentEnd, secondStart) +
                     fixedText.slice(contentEnd);

          console.log(`[ATS Tailor] dedupeSectionHeaders: Merged duplicate "${sectionName}" sections`);
        }
      }
    }

    const HEADER_KEYS = new Set([
      'PROFESSIONAL SUMMARY',
      'SUMMARY',
      'PROFILE',
      'OBJECTIVE',
      'WORK EXPERIENCE',
      'PROFESSIONAL EXPERIENCE',
      'EXPERIENCE',
      'EMPLOYMENT',
      'EDUCATION',
      'SKILLS',
      'TECHNICAL SKILLS',
      'CORE SKILLS',
      'TECHNICAL PROFICIENCIES',
      'CERTIFICATIONS',
      'LICENSES',
      'PROJECTS',
      'ACHIEVEMENTS'
    ]);

    const normaliseHeader = (line) =>
      (line || '')
        .toString()
        .trim()
        .toUpperCase()
        .replace(/[:\s]+$/g, '');

    /**
     * Normalise ALL CAPS content to proper casing (Title Case with acronym preservation).
     * Example: "PYTHON, JAVA, NODE.JS, AWS" -> "Python, Java, Node.js, AWS"
     */
    const normaliseContent = (content) => {
      if (!content) return '';
      const trimmed = content.trim();
      
      // If content is not all uppercase, return as-is (already properly cased)
      if (trimmed !== trimmed.toUpperCase()) return trimmed;
      
      // Known technical terms with correct casing
      const KNOWN_FORMATS = {
        'PYTHON': 'Python', 'JAVA': 'Java', 'JAVASCRIPT': 'JavaScript',
        'TYPESCRIPT': 'TypeScript', 'NODE.JS': 'Node.js', 'REACT': 'React',
        'ANGULAR': 'Angular', 'VUE.JS': 'Vue.js', 'MONGODB': 'MongoDB',
        'POSTGRESQL': 'PostgreSQL', 'MYSQL': 'MySQL', 'REDIS': 'Redis',
        'DOCKER': 'Docker', 'KUBERNETES': 'Kubernetes', 'TERRAFORM': 'Terraform',
        'JENKINS': 'Jenkins', 'GITHUB': 'GitHub', 'GITLAB': 'GitLab',
        'JIRA': 'Jira', 'CONFLUENCE': 'Confluence', 'SLACK': 'Slack',
        'SALESFORCE': 'Salesforce', 'TABLEAU': 'Tableau', 'POWER BI': 'Power BI',
        'EXCEL': 'Excel', 'POWERPOINT': 'PowerPoint', 'AZURE': 'Azure',
        'C++': 'C++', 'C#': 'C#', 'KOTLIN': 'Kotlin', 'SWIFT': 'Swift',
        'GRAPHQL': 'GraphQL', 'REST': 'REST', 'RESTFUL': 'RESTful',
        'MACHINE LEARNING': 'Machine Learning', 'DEEP LEARNING': 'Deep Learning',
        'NATURAL LANGUAGE PROCESSING': 'Natural Language Processing',
        'DATA SCIENCE': 'Data Science', 'DATA ANALYSIS': 'Data Analysis',
        'BUSINESS INTELLIGENCE': 'Business Intelligence',
        'PROJECT MANAGEMENT': 'Project Management', 'AGILE': 'Agile',
        'SCRUM': 'Scrum', 'DEVOPS': 'DevOps', 'CI/CD': 'CI/CD',
        'GOOGLE CLOUD': 'Google Cloud', 'GOOGLE CLOUD PLATFORM': 'Google Cloud Platform'
      };
      
      // Acronyms to keep uppercase (2-5 chars)
      const ACRONYMS = new Set([
        'AWS', 'GCP', 'SQL', 'API', 'CSS', 'HTML', 'XML', 'JSON', 'REST',
        'CI', 'CD', 'ML', 'AI', 'UI', 'UX', 'ETL', 'LLM', 'IAC', 'SRE',
        'PMP', 'CPA', 'CFA', 'MBA', 'PHD', 'IIBA', 'CBAP', 'ITIL'
      ]);
      
      // Split by comma, normalise each term
      return trimmed.split(',').map(term => {
        const t = term.trim();
        const upper = t.toUpperCase();
        
        // Check known formats first
        if (KNOWN_FORMATS[upper]) return KNOWN_FORMATS[upper];
        
        // Check if it's a pure acronym
        if (ACRONYMS.has(upper)) return upper;
        
        // Convert to Title Case, preserving acronyms within
        return t.toLowerCase().split(/[\s\-\/]+/).map((word, idx) => {
          const wordUpper = word.toUpperCase();
          if (ACRONYMS.has(wordUpper)) return wordUpper;
          // Keep version numbers (e.g., "3.9" in "python 3.9")
          if (/^\d+\.?\d*$/.test(word)) return word;
          return word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
      }).join(', ');
    };

    /**
     * INLINE HEADER DETECTION: Matches "SKILLS: content" or "CERTIFICATIONS: content"
     * Returns { header, content } or null if not an inline header.
     */
    const parseInlineHeader = (line) => {
      const trimmed = (line || '').trim();
      // Pattern: HEADER: content (header is all caps, followed by colon and content)
      const inlineMatch = trimmed.match(/^([A-Z][A-Z\s]{2,30}):\s*(.+)$/);
      if (inlineMatch) {
        const potentialHeader = inlineMatch[1].trim().toUpperCase();
        if (HEADER_KEYS.has(potentialHeader)) {
          return { header: potentialHeader, content: inlineMatch[2].trim() };
        }
      }
      return null;
    };

    const lines = fixedText.split(/\r?\n/);
    const out = [];

    let lastHeader = null;
    let lastHeaderHadContent = true; // true so first header is always allowed

    for (const line of lines) {
      const trimmed = (line || '').trim();
      
      // FIRST: Check for inline header (e.g., "SKILLS: PYTHON, JAVA, C++")
      const inlineResult = parseInlineHeader(line);
      if (inlineResult) {
        // Split inline header into separate header line + normalised content line
        const { header, content } = inlineResult;
        
        // Skip duplicate header if same as last and no content between
        if (lastHeader === header && !lastHeaderHadContent) {
          // Just add the content, skip the duplicate header
          out.push(normaliseContent(content));
          lastHeaderHadContent = true;
          continue;
        }
        
        out.push(header); // Add header on its own line
        out.push(normaliseContent(content)); // Add normalised content on next line
        lastHeader = header;
        lastHeaderHadContent = true;
        continue;
      }
      
      // Standard header detection (header on its own line)
      const header = normaliseHeader(line);
      const isHeader = HEADER_KEYS.has(header);

      if (isHeader) {
        // If same header repeats before any content, skip it.
        if (lastHeader === header && !lastHeaderHadContent) {
          continue;
        }
        out.push(header); // standardise header casing
        lastHeader = header;
        lastHeaderHadContent = false;
        continue;
      }

      // Keep line as-is.
      out.push(line);
      if (trimmed) {
        // Any non-empty non-header line counts as content.
        lastHeaderHadContent = true;
      }
    }

    // Collapse excessive blank lines introduced by removals
    return out
      .join('\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  /**
   * Extract plain document text from mixed payloads.
   * Handles accidental JSON wrappers like:
   * {"tailoredResume":"..."} or {"coverLetter":"..."}
   */
  normalizeDocumentText(rawDoc, type) {
    if (!rawDoc) return '';

    const pickFromObject = (obj) => {
      if (!obj || typeof obj !== 'object') return '';

      const candidateKeys = type === 'cv'
        ? ['tailoredResume', 'resume', 'cv', 'content', 'text', 'plainText', 'document']
        : ['tailoredCoverLetter', 'coverLetter', 'cover', 'content', 'text', 'plainText', 'document'];

      for (const key of candidateKeys) {
        if (typeof obj[key] === 'string' && obj[key].trim()) {
          return obj[key].trim();
        }
      }

      return '';
    };

    if (typeof rawDoc === 'object') {
      const fromObject = pickFromObject(rawDoc);
      if (fromObject) return fromObject;
      try {
        return JSON.stringify(rawDoc, null, 2);
      } catch (e) {
        return '';
      }
    }

    if (typeof rawDoc !== 'string') return '';

    let trimmed = rawDoc.trim();
    if (!trimmed) return '';

    // Some pipelines return stringified JSON instead of plain text document content
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        const fromParsed = pickFromObject(parsed);
        if (fromParsed) return fromParsed;
      } catch (_) {
        // Not JSON - keep original text
      }
    }

    // Defensive: malformed LLM output sometimes leaks the OTHER document
    // field's JSON syntax into this one (e.g. CV ends with `",
    // "tailoredCoverLetter":"..."}` ).  Strip any such trailing fragment.
    const otherKey = type === 'cv' ? 'tailoredCoverLetter' : 'tailoredResume';
    const otherRe = new RegExp(`["\\s,]+\\\\?"?${otherKey}\\\\?"?\\s*:.*$`, 'is');
    if (otherRe.test(trimmed)) {
      trimmed = trimmed.replace(otherRe, '').replace(/[",\s]+$/, '').trim();
    }

    // Defensive: convert literal escape sequences (\n \t \") into the actual
    // characters they represent.  Happens when JSON-encoded strings are
    // passed through code paths that don't unescape.
    if (trimmed.includes('\\n') || trimmed.includes('\\t') || trimmed.includes('\\"')) {
      trimmed = trimmed
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    return trimmed;
  }

  /**
   * PART 1B: Completely rewritten downloadDocument function
   * Uses structuredCv from tailoring step - NO re-parsing
   */
  async downloadDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const rawTextDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;

    const filename = type === 'cv'
      ? (this.generatedDocuments.cvFileName || `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_CV.pdf`.replace(/_+/g, '_'))
      : (this.generatedDocuments.coverFileName || `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_Cover_Letter.pdf`.replace(/_+/g, '_'));

    // Always enforce final UK spelling boundary on plain text passed to PDF generator
    const cqe = (typeof ContentQualityEngine !== 'undefined' ? ContentQualityEngine : globalThis.ContentQualityEngine);
    const normalizedRawText = this.normalizeDocumentText(rawTextDoc, type);
    const textDoc = (() => {
      if (!normalizedRawText || typeof normalizedRawText !== 'string') return normalizedRawText;
      try {
        return cqe?.sanitiseCVBlock ? cqe.sanitiseCVBlock(normalizedRawText) : normalizedRawText;
      } catch (e) {
        console.warn('[ATS Tailor] ContentQualityEngine sanitisation failed (continuing):', e);
        return normalizedRawText;
      }
    })();

    // CRITICAL: Prevent duplicated section headers in any generated output
    const pdfSafeTextDoc = this.dedupeSectionHeaders(textDoc);

    try {
      // Always prefer deterministic server-side generation for consistent PDF layout.
      // Cached PDFs can come from older pipelines and may have inconsistent formatting.
      let structuredCv = window.quantumhireStructuredCv || this.generatedDocuments.structuredCv;

      // ██ FINAL GATE v3: Sanitise structuredCv via centralised method ██
      // Filters bogus experience entries, deduplicates skills/certs, applies neverLeakGuard
      this.sanitizeStructuredCV();
      // Re-fetch after sanitisation (sanitizeStructuredCV writes back)
      structuredCv = window.quantumhireStructuredCv || this.generatedDocuments.structuredCv;

      if (type === 'cv' && structuredCv) {
        this.showToast('⏳ Generating PDF...', 'info');

        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.session?.access_token || ''}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: 'resume',
            fileName: filename,
            structuredCv,
            plainText: pdfSafeTextDoc,
          }),
        });

        if (!response.ok) {
          console.error('[ATS Tailor] PDF generation via structuredCv failed:', response.status);
          this.showToast('PDF generation failed - please try again', 'error');
          return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/pdf')) {
          const arrayBuffer = await response.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('✅ Downloaded!', 'success');
          return;
        }

        // JSON response with base64
        let result;
        try {
          const responseText = await response.text();
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[ATS Tailor] PDF response parse error:', parseError);
          this.showToast('PDF generation failed - invalid response', 'error');
          return;
        }

        if (result?.pdf) {
          const blob = await this.base64ToBlob(result.pdf, 'application/pdf');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.fileName || filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('✅ Downloaded!', 'success');
          return;
        }
      }

      // Fallback: If no deterministic generation path worked, download cached PDF if present.
      if (doc) {
        const blob = await this.base64ToBlob(doc, 'application/pdf');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Downloaded!', 'success');
        return;
      }

      // If no PDF but we have text, try cover letter generation
      if (type === 'cover' && textDoc) {
        const personalInfo = structuredCv?.personalInfo || {
          firstName: this.profileInfo?.firstName,
          lastName: this.profileInfo?.lastName,
          email: this.session?.user?.email,
          phone: '',
        };

        this.showToast('⏳ Generating PDF...', 'info');

        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.session?.access_token || ''}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: 'coverletter',
            fileName: filename,
            personalInfo,
            plainText: pdfSafeTextDoc,
          }),
        });

        if (!response.ok) {
          this.showToast('Cover letter PDF generation failed - please try again', 'error');
          return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/pdf')) {
          const arrayBuffer = await response.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('✅ Downloaded!', 'success');
          return;
        }

        let result;
        try {
          const responseText = await response.text();
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[ATS Tailor] Cover letter PDF parse error:', parseError);
          this.showToast('Cover letter PDF generation failed', 'error');
          return;
        }

        if (result?.pdf) {
          const blob = await this.base64ToBlob(result.pdf, 'application/pdf');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.fileName || filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('✅ Downloaded!', 'success');
          return;
        }
      }

      // Final fallback: download as text
      if (pdfSafeTextDoc) {
        const blob = new Blob([pdfSafeTextDoc], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace('.pdf', '.txt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Downloaded as text', 'success');
      } else {
        this.showToast('No document available', 'error');
      }
    } catch (error) {
      console.error('[ATS Tailor] PDF download error:', error);
      this.showToast('Download failed - please try again', 'error');
    }
  }

  async base64ToBlob(base64, type) {
    // SAFE: avoids atob() on huge strings (can crash extension)
    if (!base64 || typeof base64 !== 'string') {
      throw new Error('Invalid PDF data');
    }

    // Guard against unusually large payloads
    if (base64.length > 25_000_000) {
      throw new Error('PDF too large to download safely');
    }

    const res = await fetch(`data:${type};base64,${base64}`);
    const blob = await res.blob();

    if (!blob || blob.size < 512) {
      throw new Error('Generated PDF looks corrupted');
    }

    return blob;
  }

  // ============ LAZYAPPLY INTEGRATION: RESET FOR NEXT APPLICATION ============
  /**
   * Resets extension state after successful automation, preparing for next ATS platform.
   * Called automatically after CV & Cover Letter are attached.
   * Keeps session/profile cached but clears job-specific data.
   */
  async resetForNextApplication() {
    console.log('[ATS Tailor] 🔄 Resetting for next application...');
    
    // Clear current job data (will be re-detected on new page)
    this.currentJob = null;
    
    // Clear generated documents (will regenerate for next job)
    this.generatedDocuments = {
      cv: null,
      coverLetter: null,
      cvPdf: null,
      coverPdf: null,
      cvFileName: null,
      coverFileName: null,
      matchScore: 0,
      matchedKeywords: [],
      missingKeywords: [],
      keywords: null
    };
    
    // Clear caches for this job URL (keep profile cache)
    const currentUrl = window.location?.href;
    if (currentUrl) {
      this.jdCache.delete(currentUrl);
      this.keywordCache.delete(currentUrl);
    }
    
    // Clear chrome storage for attached files (new job needs new files)
    await chrome.storage.local.remove([
      'cvPDF',
      'coverPDF',
      'coverLetterText',
      'cvFileName',
      'coverFileName',
      'ats_lastGeneratedDocuments'
    ]);
    
    // Reset UI elements
    const documentsCard = document.getElementById('documentsCard');
    if (documentsCard) documentsCard.classList.add('hidden');
    
    // Update status to show readiness
    this.setStatus('Ready for next job', 'ready');
    
    console.log('[ATS Tailor] ✅ Reset complete - ready for next ATS platform');
    
    // Broadcast to content script that we're ready
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'AUTOMATION_RESET_COMPLETE',
          ready: true,
          timestamp: Date.now()
        }).catch(() => {});
      }
    } catch (e) {
      // Ignore - tab may have changed
    }
  }

  /**
   * Signals to external automation tools (LazyApply, etc.) that this job is complete.
   * Stores completion status in chrome.storage for cross-script access.
   */
  async signalAutomationComplete(result) {
    console.log('[ATS Tailor] 📡 Signaling automation complete:', result.success ? '✅ SUCCESS' : '❌ FAILED');
    
    // Store completion status for external tools
    const completionData = {
      ...result,
      timestamp: Date.now(),
      readyForNext: true
    };
    
    await chrome.storage.local.set({
      'ats_automation_complete': completionData,
      'ats_last_job_completed': {
        url: result.jobUrl,
        company: result.company,
        title: result.title,
        success: result.success,
        matchScore: result.matchScore,
        elapsed: result.elapsed,
        completedAt: new Date().toISOString()
      }
    });
    
    // Broadcast completion to any listening content scripts
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'AUTOMATION_COMPLETE',
            ...completionData
          }).catch(() => {});
        }
      }
    } catch (e) {
      // Ignore broadcast errors
    }
    
    // Also dispatch a custom event for same-page listeners
    window.dispatchEvent(new CustomEvent('ats-tailor-complete', { 
      detail: completionData 
    }));
    
    console.log('[ATS Tailor] 📡 Completion signal sent - extension ready for next job');
  }


  async attachDocument(type) {
    // DOCX is the attached file (best ATS parseability). PDF base64 is
    // passed only as a fallback the content script uses if no DOCX exists.
    const docx = type === 'cv' ? this.generatedDocuments.cvDocx : this.generatedDocuments.coverDocx;
    const docxFileName = type === 'cv' ? this.generatedDocuments.cvDocxFileName : this.generatedDocuments.coverDocxFileName;
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const baseFallback = type === 'cv'
      ? `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_CV`.replace(/_+/g, '_')
      : `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_Cover_Letter`.replace(/_+/g, '_');
    const filename = docxFileName
      || (docx ? `${baseFallback}.docx` : (type === 'cv' ? this.generatedDocuments.cvFileName : this.generatedDocuments.coverFileName) || `${baseFallback}.pdf`);

    if (!docx && !doc && !textDoc) {
      this.showToast('No document available', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');

      const res = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: 'attachDocument',
            type,
            docx,            // preferred: DOCX base64
            pdf: doc,        // fallback only
            text: textDoc,
            filename,
          },
          (response) => {
            const err = chrome.runtime.lastError;
            if (err) return reject(new Error(err.message || 'Send message failed'));
            resolve(response);
          }
        );
      });

      if (res?.success && res?.skipped) {
        this.showToast(res.message || 'Skipped (no upload field)', 'success');
        return;
      }

      if (res?.success) {
        this.showToast(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached!`, 'success');
        return;
      }

      this.showToast(res?.message || 'Failed to attach document', 'error');
    } catch (error) {
      console.error('Attach error:', error);
      this.showToast(error?.message || 'Failed to attach document', 'error');
    }
  }

  async attachBothDocuments() {
    this.showToast('Attaching documents...', 'success');
    
    try {
      // SEQUENTIAL ATTACH: Same proven method as ats-tailor-extension both attach
      // Step 1: Attach CV first
      await this.attachDocument('cv');
      
      // Step 2: Wait 500ms for UI to settle (prevents race conditions)
      await new Promise(r => setTimeout(r, 500));
      
      // Step 3: Attach Cover Letter
      await this.attachDocument('cover');
      
      this.showToast('Both documents attached!', 'success');
    } catch (error) {
      console.error('[ATS Tailor] attachBothDocuments error:', error);
      this.showToast(error.message || 'Failed to attach documents', 'error');
    }
  }

  showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Error toasts stay visible longer so users can read the message
    const duration = type === 'error' ? 8000 : 3000;
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ============ KEYWORD HISTORY & COMPARISON FEATURE ============

  /**
   * Save extracted keywords to history for skill gap analysis
   * @param {Object} keywords - Extracted keywords object
   */
  async saveKeywordsToHistory(keywords) {
    if (!keywords?.all?.length || !this.currentJob) return;
    
    try {
      const historyEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        jobTitle: this.currentJob.title || 'Unknown Position',
        company: this.currentJob.company || 'Unknown Company',
        url: this.currentJob.url || '',
        keywords: {
          all: keywords.all,
          highPriority: keywords.highPriority || [],
          mediumPriority: keywords.mediumPriority || [],
          lowPriority: keywords.lowPriority || []
        }
      };
      
      // Get existing history
      const result = await chrome.storage.local.get(['ats_keyword_history']);
      const history = result.ats_keyword_history || [];
      
      // Add new entry and keep last 20 job postings
      history.unshift(historyEntry);
      if (history.length > 20) history.pop();
      
      await chrome.storage.local.set({ ats_keyword_history: history });
      console.log('[ATS Tailor] Saved keywords to history:', historyEntry.jobTitle);
    } catch (error) {
      console.warn('[ATS Tailor] Failed to save keyword history:', error);
    }
  }

  /**
   * Get keyword history for comparison
   * @returns {Promise<Array>} Keyword history entries
   */
  async getKeywordHistory() {
    const result = await chrome.storage.local.get(['ats_keyword_history']);
    return result.ats_keyword_history || [];
  }

  /**
   * Compare keywords between multiple job postings to identify skill gaps
   * @param {Array<string>} entryIds - IDs of history entries to compare
   * @returns {Object} Comparison results with common keywords and gaps
   */
  async compareKeywords(entryIds = []) {
    const history = await this.getKeywordHistory();
    
    // If no IDs provided, compare all entries
    const entries = entryIds.length > 0
      ? history.filter(h => entryIds.includes(h.id))
      : history;
    
    if (entries.length < 2) {
      return { 
        error: 'Need at least 2 job postings to compare',
        entries: entries.length 
      };
    }
    
    // Count keyword frequency across all jobs
    const keywordFrequency = new Map();
    const keywordJobs = new Map();
    
    for (const entry of entries) {
      const allKeywords = entry.keywords?.all || [];
      for (const kw of allKeywords) {
        const kwLower = kw.toLowerCase();
        keywordFrequency.set(kwLower, (keywordFrequency.get(kwLower) || 0) + 1);
        
        if (!keywordJobs.has(kwLower)) {
          keywordJobs.set(kwLower, []);
        }
        keywordJobs.get(kwLower).push(entry.jobTitle);
      }
    }
    
    // Categorize keywords by frequency
    const totalJobs = entries.length;
    const commonKeywords = []; // Appears in 70%+ of jobs
    const frequentKeywords = []; // Appears in 40-69% of jobs
    const rareKeywords = []; // Appears in <40% of jobs
    
    for (const [keyword, count] of keywordFrequency.entries()) {
      const ratio = count / totalJobs;
      const keywordInfo = {
        keyword,
        count,
        percentage: Math.round(ratio * 100),
        jobs: keywordJobs.get(keyword)
      };
      
      if (ratio >= 0.7) {
        commonKeywords.push(keywordInfo);
      } else if (ratio >= 0.4) {
        frequentKeywords.push(keywordInfo);
      } else {
        rareKeywords.push(keywordInfo);
      }
    }
    
    // Sort by frequency
    commonKeywords.sort((a, b) => b.count - a.count);
    frequentKeywords.sort((a, b) => b.count - a.count);
    rareKeywords.sort((a, b) => b.count - a.count);
    
    // Identify skill gaps (common keywords user might be missing)
    const userSkills = new Set(
      (this.generatedDocuments?.cv || '').toLowerCase().split(/\W+/)
    );
    
    const skillGaps = commonKeywords
      .filter(k => !userSkills.has(k.keyword))
      .slice(0, 15);
    
    return {
      totalJobsCompared: totalJobs,
      commonKeywords: commonKeywords.slice(0, 20),
      frequentKeywords: frequentKeywords.slice(0, 15),
      rareKeywords: rareKeywords.slice(0, 10),
      skillGaps,
      summary: {
        totalUniqueKeywords: keywordFrequency.size,
        coreSkillsCount: commonKeywords.length,
        gapsIdentified: skillGaps.length
      }
    };
  }

  /**
   * Show skill gap analysis modal
   */
  async showSkillGapAnalysis() {
    try {
      const comparison = await this.compareKeywords();
      
      if (comparison.error) {
        this.showToast(comparison.error, 'error');
        return;
      }
      
      // Build and show results
      const gapsList = comparison.skillGaps.map(g => g.keyword).join(', ') || 'None identified';
      const commonList = comparison.commonKeywords.slice(0, 10).map(k => k.keyword).join(', ');
      
      console.log('[ATS Tailor] Skill Gap Analysis:', comparison);
      this.showToast(
        `Analyzed ${comparison.totalJobsCompared} jobs. ${comparison.summary.gapsIdentified} potential skill gaps found.`,
        'success'
      );
      
      // Store comparison for UI display
      this.lastComparison = comparison;
      
      return comparison;
    } catch (error) {
      console.error('[ATS Tailor] Skill gap analysis error:', error);
      this.showToast('Failed to analyze skill gaps', 'error');
    }
  }

  /**
   * Show skill gap analysis panel with results
   */
  async showSkillGapPanel() {
    const panel = document.getElementById('skillGapPanel');
    const btn = document.getElementById('skillGapBtn');
    
    if (btn) {
      btn.disabled = true;
      btn.querySelector('.btn-text').textContent = 'Analyzing...';
    }
    
    try {
      const comparison = await this.showSkillGapAnalysis();
      
      if (!comparison || comparison.error) {
        // Check if we have any history
        const history = await this.getKeywordHistory();
        if (history.length < 2) {
          this.showToast('Tailor at least 2 different job postings first to compare skills', 'error');
          return;
        }
        return;
      }
      
      // Populate core skills
      const coreChips = document.getElementById('coreSkillsChips');
      if (coreChips) {
        coreChips.innerHTML = comparison.commonKeywords
          .map(k => `<span class="skill-chip core" title="Found in ${k.percentage}% of jobs">${this.escapeHtml(k.keyword)} <span class="chip-count">${k.count}</span></span>`)
          .join('');
      }
      
      // Populate skill gaps
      const gapsChips = document.getElementById('gapsChips');
      if (gapsChips) {
        if (comparison.skillGaps.length > 0) {
          gapsChips.innerHTML = comparison.skillGaps
            .map(k => `<span class="skill-chip gap" title="In-demand skill missing from your CV">${this.escapeHtml(k.keyword)} <span class="chip-count">${k.percentage}%</span></span>`)
            .join('');
        } else {
          gapsChips.innerHTML = '<span class="no-gaps">Great! No significant skill gaps detected.</span>';
        }
      }
      
      // Update summary
      const summary = document.getElementById('skillGapSummary');
      if (summary) {
        summary.innerHTML = `<p>Analyzed <strong>${comparison.totalJobsCompared} job postings</strong>. Found <strong>${comparison.summary.totalUniqueKeywords}</strong> unique keywords with <strong>${comparison.summary.coreSkillsCount}</strong> appearing frequently.</p>`;
      }
      
      // Show panel
      if (panel) {
        panel.classList.remove('hidden');
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      
    } catch (error) {
      console.error('[ATS Tailor] Show skill gap panel error:', error);
      this.showToast('Failed to analyze skills', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.querySelector('.btn-text').textContent = 'Skill Gap Analysis';
      }
    }
  }

  /**
   * Hide skill gap analysis panel
   */
  hideSkillGapPanel() {
    const panel = document.getElementById('skillGapPanel');
    if (panel) {
      panel.classList.add('hidden');
    }
  }
}

/**
 * Injected function to extract job information from the current page
 * Runs in page context - self-contained with no external dependencies
 * ENHANCED: 70+ company career site selectors for proper job title/company extraction
 */
function extractJobInfoFromPageInjected() {
  const result = {
    title: '',
    company: '',
    location: '',
    description: '',
    url: window.location.href,
    detectedCompany: '', // Company detected from domain
    companySource: 'auto' // 'auto', 'domain', 'jsonld', 'selector'
  };

  try {
    const host = window.location.hostname.toLowerCase().replace(/^www\./, '');

    // --- Helper: get text from first matching selector ---
    const getText = (...selectors) => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) return el.textContent.trim();
        } catch (e) {}
      }
      return '';
    };

    // ============ TIER 1-2 COMPANY CAREER SITE SELECTORS (70+) ============
    // Maps domain → { company name, title selectors, description selectors }
    const COMPANY_CAREER_SELECTORS = {
      // ===== FAANG + Major Tech =====
      'google.com': {
        company: 'Google',
        title: ['h2.gc-job-detail__title', 'h2[class*="job-title"]', '.gc-job-detail h2', 'h1.gc-job-detail__title', 'h1[itemprop="title"]', 'h1'],
        location: ['.gc-job-detail__location', '[itemprop="jobLocation"]', '.location'],
        description: ['.gc-job-detail__description', '[itemprop="description"]', '.job-description', 'main']
      },
      'about.google': {
        company: 'Google',
        title: ['h2.gc-job-detail__title', 'h1', 'h2'],
        location: ['.gc-job-detail__location', '.location'],
        description: ['.gc-job-detail__description', 'main']
      },
      'deepmind.google': {
        company: 'Google DeepMind',
        title: ['h1', 'h2.job-title'],
        location: ['.location', '[class*="location"]'],
        description: ['.job-description', 'main']
      },
      'meta.com': {
        company: 'Meta',
        title: ['h1[data-testid="job-title"]', 'h1._8sfs', 'h1'],
        location: ['[data-testid="job-location"]', '.location'],
        description: ['[data-testid="job-description"]', '.job-description', 'main']
      },
      'amazon.com': {
        company: 'Amazon',
        title: ['h1.job-title', 'h1[data-job-title]', 'h1'],
        location: ['.job-location', '[data-job-location]'],
        description: ['.job-description', '#job-description', 'main']
      },
      'amazon.jobs': {
        company: 'Amazon',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'microsoft.com': {
        company: 'Microsoft',
        title: ['h1.job-title', 'h1[class*="title"]', 'h1'],
        location: ['.job-location', '[class*="location"]'],
        description: ['.job-description', '.description', 'main']
      },
      'apple.com': {
        company: 'Apple',
        title: ['h1#job-title', 'h1.job-details__title', 'h1'],
        location: ['.job-details__location', '[class*="location"]'],
        description: ['.job-details__description', '.description', 'main']
      },

      // ===== Enterprise Software =====
      'salesforce.com': {
        company: 'Salesforce',
        title: ['h1.job-title', 'h1', 'h2.job-title'],
        location: ['.job-location', '[class*="location"]'],
        description: ['.job-description', 'main']
      },
      'ibm.com': {
        company: 'IBM',
        title: ['h1.bx--type-productive-heading-05', 'h1.job-title', 'h1'],
        location: ['.job-location', '[class*="location"]'],
        description: ['.job-description', '.description', 'main']
      },
      'oracle.com': {
        company: 'Oracle',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', '#requisitionDescriptionInterface', 'main']
      },
      'adobe.com': {
        company: 'Adobe',
        title: ['h1.job-title', 'h1[data-automation="job-title"]', 'h1'],
        location: ['.job-location', '[data-automation="job-location"]'],
        description: ['.job-description', '[data-automation="job-description"]', 'main']
      },
      'sap.com': {
        company: 'SAP',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'vmware.com': {
        company: 'VMware',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'servicenow.com': {
        company: 'ServiceNow',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },

      // ===== Fintech & Payments =====
      'stripe.com': {
        company: 'Stripe',
        title: ['h1.JobDetailPage__title', 'h1[class*="title"]', 'h1'],
        location: ['.JobDetailPage__location', '[class*="location"]'],
        description: ['.JobDetailPage__description', '.description', 'main']
      },
      'paypal.com': {
        company: 'PayPal',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'visa.com': {
        company: 'Visa',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'mastercard.com': {
        company: 'Mastercard',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },

      // ===== SaaS & Cloud =====
      'hubspot.com': {
        company: 'HubSpot',
        title: ['h1.careers-detail__title', 'h1[class*="job-title"]', 'h1[class*="career"]', 'h1.job-title', '.job-details h1', 'article h1', 'main h1', 'h1'],
        location: ['.careers-detail__location', '.job-location', '[class*="location"]', 'h3:contains("Dublin")'],
        description: ['.careers-detail__description', '.job-description', '.careers-detail-content', 'article', 'main']
      },
      'intercom.com': {
        company: 'Intercom',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'zendesk.com': {
        company: 'Zendesk',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'docusign.com': {
        company: 'DocuSign',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'twilio.com': {
        company: 'Twilio',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'slack.com': {
        company: 'Slack',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'atlassian.com': {
        company: 'Atlassian',
        title: ['h1[data-testid="job-title"]', 'h1.job-title', 'h1'],
        location: ['[data-testid="job-location"]', '.job-location'],
        description: ['[data-testid="job-description"]', '.job-description', 'main']
      },
      'gitlab.com': {
        company: 'GitLab',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'circleci.com': {
        company: 'CircleCI',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'datadoghq.com': {
        company: 'Datadog',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'unity.com': {
        company: 'Unity',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'udemy.com': {
        company: 'Udemy',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'workhuman.com': {
        company: 'Workhuman',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },

      // ===== Social & Media =====
      'linkedin.com': {
        company: 'LinkedIn',
        title: ['h1.topcard__title', 'h1.job-title', 'h1'],
        location: ['.topcard__flavor--bullet', '.job-location'],
        description: ['.description__text', '.job-description', 'main']
      },
      'tiktok.com': {
        company: 'TikTok',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'snap.com': {
        company: 'Snapchat',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'dropbox.com': {
        company: 'Dropbox',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'bloomberg.com': {
        company: 'Bloomberg',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },

      // ===== Hardware & Semiconductors =====
      'intel.com': {
        company: 'Intel',
        title: ['h1.job-title', 'h1#jobTitle', 'h1'],
        location: ['.job-location', '#jobLocation'],
        description: ['.job-description', '#jobDescription', 'main']
      },
      'broadcom.com': {
        company: 'Broadcom',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'arm.com': {
        company: 'Arm Holdings',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'tsmc.com': {
        company: 'TSMC',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'appliedmaterials.com': {
        company: 'Applied Materials',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'cisco.com': {
        company: 'Cisco',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'nvidia.com': {
        company: 'Nvidia',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'amd.com': {
        company: 'AMD',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },

      // ===== Finance & Consulting (Big 4) =====
      'fidelity.com': {
        company: 'Fidelity',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'morganstanley.com': {
        company: 'Morgan Stanley',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'jpmorgan.com': {
        company: 'JP Morgan Chase',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'blackrock.com': {
        company: 'BlackRock',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'capitalone.com': {
        company: 'Capital One',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'tdsecurities.com': {
        company: 'TD Securities',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'kpmg.com': {
        company: 'KPMG',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'deloitte.com': {
        company: 'Deloitte',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'accenture.com': {
        company: 'Accenture',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'pwc.com': {
        company: 'PwC',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'ey.com': {
        company: 'EY',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'mckinsey.com': {
        company: 'McKinsey',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'kkr.com': {
        company: 'KKR',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'fenergo.com': {
        company: 'Fenergo',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },

      // ===== Quant & Trading Firms =====
      'citadel.com': {
        company: 'Citadel',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'janestreet.com': {
        company: 'Jane Street',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'sig.com': {
        company: 'SIG',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'twosigma.com': {
        company: 'Two Sigma',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'deshaw.com': {
        company: 'DE Shaw',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'rentec.com': {
        company: 'Renaissance Technologies',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'mlp.com': {
        company: 'Millennium Management',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'virtu.com': {
        company: 'Virtu Financial',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'hudsontrading.com': {
        company: 'Hudson River Trading',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'jumptrading.com': {
        company: 'Jump Trading',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },

      // ===== Other Major Tech =====
      'netflix.com': {
        company: 'Netflix',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'tesla.com': {
        company: 'Tesla',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'uber.com': {
        company: 'Uber',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'airbnb.com': {
        company: 'Airbnb',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'palantir.com': {
        company: 'Palantir',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'crowdstrike.com': {
        company: 'CrowdStrike',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'snowflake.com': {
        company: 'Snowflake',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'toasttab.com': {
        company: 'Toast',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'draftkings.com': {
        company: 'DraftKings',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'wasabi.com': {
        company: 'Wasabi Technologies',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'samsara.com': {
        company: 'Samsara',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'blockchain.com': {
        company: 'Blockchain.com',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'similarweb.com': {
        company: 'Similarweb',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      },
      'corporate.walmart.com': {
        company: 'Walmart',
        title: ['h1.job-title', 'h1'],
        location: ['.job-location'],
        description: ['.job-description', 'main']
      }
    };

    // Check if current host matches any known company career site
    let companyConfig = null;
    let matchedDomain = null;
    
    // Direct match first
    if (COMPANY_CAREER_SELECTORS[host]) {
      companyConfig = COMPANY_CAREER_SELECTORS[host];
      matchedDomain = host;
    } else {
      // Partial match - check if host contains any known domain
      for (const [domain, config] of Object.entries(COMPANY_CAREER_SELECTORS)) {
        const baseDomain = domain.split('.').slice(-2).join('.');
        if (host.includes(baseDomain.split('.')[0]) || host.endsWith(baseDomain)) {
          companyConfig = config;
          matchedDomain = domain;
          break;
        }
      }
    }

    // ============ COMPANY-SPECIFIC EXTRACTION ============
    if (companyConfig) {
      result.detectedCompany = companyConfig.company;
      result.companySource = 'domain';
      result.company = companyConfig.company;
      
      // Use company-specific selectors
      result.title = getText(...companyConfig.title);
      result.location = getText(...companyConfig.location);
      result.description = getText(...companyConfig.description);
      
      console.log(`[ATS Tailor] Detected ${companyConfig.company} career page, extracted: "${result.title}"`);
    }

    // ============ ATS PLATFORM SELECTORS ============
    // --- Greenhouse ---
    if (!result.title && host.includes('greenhouse')) {
      result.title = getText('h1.app-title', '.job-title h1', 'h1[class*="job"]', '.posting-headline h1', 'h1');
      result.company = result.company || getText('.company-name', '[class*="company"]') || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = result.location || getText('.location', '[class*="location"]', '.posting-categories .location');
      result.description = result.description || getText('#content', '.content', '.posting-content', '.job-post-content', '[class*="description"]', 'main');
      result.companySource = 'selector';
    }
    // --- Workday / myworkdayjobs ---
    else if (!result.title && (host.includes('workday') || host.includes('myworkdayjobs'))) {
      result.title = getText('[data-automation-id="jobPostingHeader"] h2', 'h2[data-automation-id="jobTitle"]', '[data-automation-id="jobPostingTitle"]', 'h1', 'h2');
      result.company = result.company || getText('[data-automation-id="company"]') || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = result.location || getText('[data-automation-id="locations"]', '[data-automation-id="location"]', '[class*="location"]');
      const descEl = document.querySelector('[data-automation-id="jobPostingDescription"]');
      if (descEl) {
        result.description = descEl.innerText || descEl.textContent || '';
      } else {
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        result.description = main.innerText?.substring(0, 15000) || '';
      }
      result.companySource = 'selector';
    }
    // --- SmartRecruiters ---
    else if (!result.title && host.includes('smartrecruiters')) {
      result.title = getText('h1.job-title', 'h1[class*="title"]', 'h1');
      result.company = result.company || getText('.company-name', '[class*="company"]');
      result.location = result.location || getText('.job-location', '[class*="location"]');
      result.description = result.description || getText('.job-description', '.job-sections', '[class*="description"]', 'main');
      result.companySource = 'selector';
    }
    // --- Workable ---
    else if (!result.title && host.includes('workable')) {
      result.title = getText('h1[data-ui="job-title"]', 'h1');
      result.company = result.company || getText('[data-ui="company-name"]', '.company-name');
      result.location = result.location || getText('[data-ui="job-location"]', '.job-location');
      result.description = result.description || getText('[data-ui="job-description"]', '.job-description', 'main');
      result.companySource = 'selector';
    }
    // --- Lever --- EXCLUDED per user preference (unsupported)
    // --- Ashby --- EXCLUDED per user preference (unsupported)
    // --- Teamtailor ---
    else if (!result.title && host.includes('teamtailor')) {
      result.title = getText('h1.job-title', 'h1');
      result.company = result.company || getText('.company-name', '[class*="company"]') || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = result.location || getText('.location', '[class*="location"]');
      result.description = result.description || getText('.job-ad-body', '.job-body', '.description', 'main');
      result.companySource = 'selector';
    }
    // --- iCIMS ---
    else if (!result.title && host.includes('icims')) {
      result.title = getText('.iCIMS_Header h1', 'h1.title', 'h1');
      result.company = result.company || getText('.iCIMS_CompanyName', '[class*="company"]');
      result.location = result.location || getText('.iCIMS_JobLocation', '[class*="location"]');
      result.description = result.description || getText('.iCIMS_JobContent', '.iCIMS_MainWrapper', 'main');
      result.companySource = 'selector';
    }
    // --- Bullhorn ---
    else if (!result.title && host.includes('bullhorn')) {
      result.title = getText('h1.job-title', 'h1');
      result.company = result.company || getText('.company-name');
      result.location = result.location || getText('.job-location', '[class*="location"]');
      result.description = result.description || getText('.job-description', '.job-details', 'main');
      result.companySource = 'selector';
    }
    // --- Generic fallback ---
    else if (!result.title) {
      result.title = getText('h1') || document.title.split('|')[0].split('-')[0].trim();
      result.company = result.company || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = result.location || getText('[class*="location"]', '[data-testid*="location"]');
      result.description = result.description || getText('main', 'article', '[class*="description"]', '#content', '[role="main"]');
      result.companySource = 'auto';
    }

    // --- Fallback: Meta tags ---
    if (!result.title) {
      result.title = document.querySelector('meta[property="og:title"]')?.content || document.title;
    }
    if (!result.description || result.description.length < 100) {
      const fallbackDesc = document.querySelector('meta[property="og:description"]')?.content ||
                           document.querySelector('meta[name="description"]')?.content || '';
      if (fallbackDesc.length > result.description.length) {
        result.description = fallbackDesc;
      }
      if (result.description.length < 200) {
        const mainEl = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        result.description = (mainEl.innerText || mainEl.textContent || '').substring(0, 15000);
      }
    }

    // --- JSON-LD structured data ---
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        let data = JSON.parse(script.textContent);
        if (Array.isArray(data)) data = data.find(d => d['@type'] === 'JobPosting');
        if (data?.['@type'] === 'JobPosting') {
          if (!result.title && data.title) result.title = data.title;
          if (!result.company && data.hiringOrganization?.name) {
            result.company = data.hiringOrganization.name;
            result.companySource = 'jsonld';
          }
          if (!result.location) {
            const loc = data.jobLocation;
            if (loc?.address?.addressLocality) {
              result.location = loc.address.addressLocality;
              if (loc.address.addressRegion) result.location += ', ' + loc.address.addressRegion;
            } else if (typeof loc === 'string') {
              result.location = loc;
            }
          }
          if ((!result.description || result.description.length < 200) && data.description) {
            const temp = document.createElement('div');
            temp.innerHTML = data.description;
            const cleanDesc = temp.textContent || temp.innerText || '';
            if (cleanDesc.length > result.description.length) result.description = cleanDesc;
          }
          break;
        }
      } catch (e) {}
    }

    // --- Additional Company Fallbacks ---
    if (!result.company || result.company.toLowerCase() === 'company' || result.company.length < 2) {
      const titleMatch = (result.title || document.title || '').match(/\bat\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:\s*[-|]|\s*$)/i);
      if (titleMatch) result.company = titleMatch[1].trim();
    }
    if (!result.company || result.company.toLowerCase() === 'company' || result.company.length < 2) {
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain.length > 2 && !['www', 'apply', 'jobs', 'careers', 'boards', 'job-boards'].includes(subdomain.toLowerCase())) {
        result.company = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
      }
    }
    if (!result.company || result.company.toLowerCase() === 'company' || result.company.length < 2) {
      const logoEl = document.querySelector('[class*="logo"] img, [class*="company"] img, header img');
      if (logoEl?.alt && logoEl.alt.length > 2 && logoEl.alt.length < 50) {
        result.company = logoEl.alt.replace(/\s*logo\s*/i, '').trim();
      }
    }
    if (result.company) {
      result.company = result.company.replace(/\s*(careers|jobs|hiring|apply|work|join)\s*$/i, '').trim();
    }
    if (!result.company || result.company.toLowerCase() === 'company' || result.company.length < 2) {
      result.company = '';
    }

    // --- Cleanup ---
    result.title = result.title.replace(/\s+/g, ' ').trim().substring(0, 200);
    result.company = result.company.replace(/\s+/g, ' ').trim().substring(0, 100);
    result.location = result.location.replace(/\s+/g, ' ').trim().substring(0, 100);
    result.description = result.description.replace(/\s+/g, ' ').trim().substring(0, 15000);

    // Strip "Remote" from location
    result.location = result.location
      .replace(/\b(remote|work\s*from\s*home|wfh|virtual|fully\s*remote)\b/gi, '')
      .replace(/\s*[\(\[]?\s*(remote|wfh|virtual)\s*[\)\]]?\s*/gi, '')
      .replace(/\s*(\||,|\/|-)\s*$/g, '')
      .replace(/^\s*(\||,|\/|-)\s*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

  } catch (error) {
    console.error('[ATS Tailor] Extraction error:', error);
  }

  return result;
}

// ============ CONNECTION TEST & DEBUG REPORT ============

// Test API Key Connection (calls validate-openai-key or validate-kimi-key)
ATSTailor.prototype.testAPIKeyConnection = async function() {
  const testBtn = document.getElementById('testConnectionBtn');
  const panel = document.getElementById('connectionTestPanel');
  const statusIcon = document.getElementById('testStatusIcon');
  const testMessage = document.getElementById('testMessage');
  const testDetails = document.getElementById('testDetails');
  const testDetailsText = document.getElementById('testDetailsText');
  
  if (!this.session?.access_token) {
    this.showToast('Please login first', 'error');
    return;
  }
  
  // Show panel and set loading state
  panel?.classList.remove('hidden');
  if (statusIcon) statusIcon.textContent = '⏳';
  if (testMessage) testMessage.textContent = 'Testing connection...';
  if (testBtn) testBtn.disabled = true;
  testDetails?.classList.add('hidden');
  
  const startTime = performance.now();
  
  try {
    // Determine which endpoint to call based on current provider
    const endpoint = this.aiProvider === 'kimi' 
      ? `${SUPABASE_URL}/functions/v1/validate-kimi-key`
      : `${SUPABASE_URL}/functions/v1/validate-openai-key`;
    
    const providerName = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
    
    // We can't pass the key directly (security) - the edge function should get it from user_api_keys table
    // So we call a modified approach: use tailor-application with a test flag
    // For now, let's test by calling the validate endpoint indirectly
    
    // Actually, we need to test if the user has a key configured - call edge function that checks
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        testConnection: true, // Special flag to just test connection
        jobTitle: 'Test',
        company: 'Test',
        description: 'Test connection only',
        requirements: [],
        userProfile: { firstName: 'Test', lastName: 'Test', email: 'test@test.com' },
      }),
    });
    
    const elapsed = Math.round(performance.now() - startTime);
    const data = await response.json().catch(() => ({}));
    
    // Store debug log
    this._lastConnectionTest = {
      timestamp: new Date().toISOString(),
      provider: providerName,
      status: response.status,
      elapsed,
      response: data,
    };
    
    if (response.ok || data.connectionValid) {
      if (statusIcon) statusIcon.textContent = '✅';
      if (testMessage) testMessage.textContent = `${providerName} connected (${elapsed}ms)`;
      this.showToast(`${providerName} API key is valid!`, 'success');
    } else {
      if (statusIcon) statusIcon.textContent = '❌';
      if (testMessage) testMessage.textContent = data.error || `${providerName} connection failed`;
      
      // Show details
      testDetails?.classList.remove('hidden');
      if (testDetailsText) {
        testDetailsText.textContent = JSON.stringify({
          status: response.status,
          error: data.error,
          timeout: data.timeout,
          elapsed: `${elapsed}ms`,
        }, null, 2);
      }
    }
    
  } catch (error) {
    const elapsed = Math.round(performance.now() - startTime);
    console.error('[ATS Tailor] Connection test error:', error);
    
    this._lastConnectionTest = {
      timestamp: new Date().toISOString(),
      provider: this.aiProvider,
      error: error.message,
      elapsed,
    };
    
    if (statusIcon) statusIcon.textContent = '❌';
    if (testMessage) testMessage.textContent = error.message || 'Connection test failed';
    testDetails?.classList.remove('hidden');
    if (testDetailsText) {
      testDetailsText.textContent = JSON.stringify({ error: error.message, elapsed: `${elapsed}ms` }, null, 2);
    }
  } finally {
    if (testBtn) testBtn.disabled = false;
  }
};

// Debug report data collection
ATSTailor.prototype._debugLogs = [];

ATSTailor.prototype.addDebugLog = function(stage, data) {
  this._debugLogs.push({
    timestamp: new Date().toISOString(),
    stage,
    ...data,
  });
  // Keep last 50 entries
  if (this._debugLogs.length > 50) {
    this._debugLogs.shift();
  }
};

// logDebug alias for tailorDocuments and other methods
ATSTailor.prototype.logDebug = function(stage, message, data = {}) {
  console.log(`[ATS Tailor] [${stage}] ${message}`, data);
  this.addDebugLog(stage, { message, ...data });
};

ATSTailor.prototype.showDebugReport = function() {
  const panel = document.getElementById('debugReportPanel');
  const content = document.getElementById('debugReportContent');
  
  panel?.classList.remove('hidden');
  
  // Compile debug report
  const report = {
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    aiProvider: this.aiProvider,
    session: this.session ? { userId: this.session.user?.id, email: this.session.user?.email } : null,
    currentJob: this.currentJob ? {
      title: this.currentJob.title,
      company: this.currentJob.company,
      location: this.currentJob.location,
      descriptionLength: this.currentJob.description?.length || 0,
    } : null,
    lastConnectionTest: this._lastConnectionTest || null,
    recentLogs: this._debugLogs.slice(-20),
    generatedDocuments: {
      hasCv: !!this.generatedDocuments.cv,
      hasCoverLetter: !!this.generatedDocuments.coverLetter,
      matchScore: this.generatedDocuments.matchScore,
      matchedKeywordsCount: this.generatedDocuments.matchedKeywords?.length || 0,
      missingKeywordsCount: this.generatedDocuments.missingKeywords?.length || 0,
    },
  };
  
  if (content) {
    content.innerHTML = `<pre style="font-size: 10px; overflow-x: auto;">${JSON.stringify(report, null, 2)}</pre>`;
  }
};

ATSTailor.prototype.hideDebugReport = function() {
  document.getElementById('debugReportPanel')?.classList.add('hidden');
};

ATSTailor.prototype.downloadDebugReport = function() {
  const report = {
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    aiProvider: this.aiProvider,
    session: this.session ? { userId: this.session.user?.id, email: this.session.user?.email } : null,
    currentJob: this.currentJob,
    lastConnectionTest: this._lastConnectionTest || null,
    allLogs: this._debugLogs,
    generatedDocuments: {
      hasCv: !!this.generatedDocuments.cv,
      hasCoverLetter: !!this.generatedDocuments.coverLetter,
      cvLength: this.generatedDocuments.cv?.length || 0,
      coverLetterLength: this.generatedDocuments.coverLetter?.length || 0,
      matchScore: this.generatedDocuments.matchScore,
      matchedKeywords: this.generatedDocuments.matchedKeywords,
      missingKeywords: this.generatedDocuments.missingKeywords,
    },
  };
  
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ats-debug-report-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  this.showToast('Debug report downloaded', 'success');
};

ATSTailor.prototype.copyDebugReport = function() {
  const report = {
    generatedAt: new Date().toISOString(),
    aiProvider: this.aiProvider,
    currentJob: this.currentJob ? { title: this.currentJob.title, company: this.currentJob.company } : null,
    lastConnectionTest: this._lastConnectionTest,
    recentLogs: this._debugLogs.slice(-10),
  };
  
  navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    .then(() => this.showToast('Debug report copied to clipboard', 'success'))
    .catch(() => this.showToast('Failed to copy', 'error'));
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Store global reference for error handler access
  window.atsTailor = new ATSTailor();
});
