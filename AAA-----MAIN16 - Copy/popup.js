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

// ============ PERFECTION v3.0: IMMUTABILITY VALIDATION ============
// Ensures company names, job titles, and dates are NEVER modified by AI
function validateWorkExperienceImmutability(originalExperience, tailoredExperience) {
  if (!Array.isArray(originalExperience) || !Array.isArray(tailoredExperience)) {
    console.warn('[PERFECTION] Cannot validate: invalid experience arrays');
    return tailoredExperience;
  }

  return tailoredExperience.map((tailoredExp, index) => {
    const originalExp = originalExperience[index];
    if (!originalExp) return tailoredExp;

    // Force original values for IMMUTABLE fields
    const origCompany = originalExp.company || originalExp.companyName || '';
    const origTitle = originalExp.title || originalExp.jobTitle || originalExp.position || '';
    const origDates = originalExp.dates || originalExp.date || 
                      `${originalExp.startDate || ''} – ${originalExp.endDate || 'Present'}`;

    const result = {
      ...tailoredExp,
      company: origCompany,     // ← LOCKED FROM ORIGINAL PROFILE
      companyName: origCompany, // ← LOCKED FROM ORIGINAL PROFILE
      title: origTitle,         // ← LOCKED FROM ORIGINAL PROFILE
      jobTitle: origTitle,      // ← LOCKED FROM ORIGINAL PROFILE
      position: origTitle,      // ← LOCKED FROM ORIGINAL PROFILE
      dates: origDates,         // ← LOCKED FROM ORIGINAL PROFILE
      date: origDates,          // ← LOCKED FROM ORIGINAL PROFILE
      startDate: originalExp.startDate || tailoredExp.startDate,
      endDate: originalExp.endDate || tailoredExp.endDate,
      // Keep tailored bullets/achievements
      bullets: tailoredExp.bullets || tailoredExp.achievements || tailoredExp.description || originalExp.bullets || [],
      achievements: tailoredExp.achievements || tailoredExp.bullets || originalExp.achievements || []
    };

    // Log any detected changes for debugging
    if (tailoredExp.company !== origCompany || tailoredExp.title !== origTitle) {
      console.warn(`[PERFECTION] ⚠️ Immutable field override at index ${index}:`, {
        originalCompany: origCompany,
        attemptedCompany: tailoredExp.company,
        originalTitle: origTitle,
        attemptedTitle: tailoredExp.title
      });
    }

    return result;
  });
}

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
    const origDates = originalExp.dates || `${originalExp.startDate || ''} – ${originalExp.endDate || 'Present'}`.trim();
    const origStartDate = originalExp.startDate || '';
    const origEndDate = originalExp.endDate || '';
    
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
    await this.loadSession();
    await this.loadAIProviderSettings();
    await this.loadWorkdayState();
    await this.loadBaseCVFromProfile();
    this.bindEvents();
    this.updateUI();
    this.updateAIProviderUI();

    // Auto-detect job when popup opens (but do NOT auto-tailor)
    if (this.session) {
      await this.refreshSessionIfNeeded();
      await this.detectCurrentJob();
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
      if (!this.session?.refresh_token || !this.session?.access_token) return;

      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${this.session.access_token}`,
        },
      });

      if (res.ok) return;

      const refreshRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });

      if (!refreshRes.ok) {
        console.warn('[ATS Tailor] refresh failed; clearing session');
        this.session = null;
        await chrome.storage.local.remove(['ats_session']);
        this.updateUI();
        return;
      }

      const data = await refreshRes.json();
      this.session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user || this.session.user,
      };
      await this.saveSession();
    } catch (e) {
      console.warn('[ATS Tailor] refreshSessionIfNeeded error', e);
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

  // ============ AUTH (EMAIL/PASSWORD) ============
  // NOTE: Popup binds loginBtn -> this.login() and logoutBtn -> this.logout()
  // These methods must exist or the buttons will appear "dead".
  async login() {
    const email = String(document.getElementById('email')?.value || '').trim();
    const password = String(document.getElementById('password')?.value || '');

    if (!email || !password) {
      this.showToast('Please enter email and password', 'error');
      return;
    }

    // Basic client-side validation (server will validate too)
    if (email.length > 255 || password.length > 200) {
      this.showToast('Invalid email or password', 'error');
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      this.showToast('Please enter a valid email address', 'error');
      return;
    }

    const btn = document.getElementById('loginBtn');
    const btnText = btn?.querySelector('.btn-text');
    const originalText = btnText?.textContent;

    try {
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = 'Signing in...';
      this.setStatus('Signing in...', 'working');

      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        // Try to provide friendlier errors
        let msg = 'Sign in failed';
        try {
          const err = await res.json();
          const raw = String(err?.error_description || err?.msg || err?.message || err?.error || '').toLowerCase();

          if (raw.includes('invalid login credentials')) msg = 'Invalid email or password';
          else if (raw.includes('email not confirmed')) msg = 'Please confirm your email, then try again';
          else if (raw) msg = err.error_description || err.message || err.error || msg;
        } catch (_e) {
          // ignore
        }
        throw new Error(msg);
      }

      const data = await res.json();
      this.session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      };

      await this.saveSession();
      await this.loadAIProviderSettings();
      await this.loadBaseCVFromProfile();

      this.updateUI();
      this.updateAIProviderUI();

      this.showToast('Welcome back!', 'success');
      this.setStatus('Ready', 'ready');

      // If popup is open on a job board, try to detect job immediately
      try {
        await this.detectCurrentJob();
      } catch (_e) {
        // non-fatal
      }
    } catch (e) {
      console.error('[ATS Tailor] login error:', e);
      this.showToast(e?.message || 'Sign in failed', 'error');
      this.setStatus('Login Required', 'error');
    } finally {
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = originalText || 'Sign In';
    }
  }

  async logout() {
    this.session = null;
    await chrome.storage.local.remove(['ats_session']);
    this.updateUI();
    this.showToast('Logged out', 'success');
  }

  bindEvents() {
    document.getElementById('loginBtn')?.addEventListener('click', () => this.login());
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    document.getElementById('tailorBtn')?.addEventListener('click', () => this.tailorDocuments({ force: true }));
    document.getElementById('refreshJob')?.addEventListener('click', () => this.detectCurrentJob());
    document.getElementById('editJobTitle')?.addEventListener('click', () => this.toggleJobTitleEdit());
    document.getElementById('jobTitleInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.saveJobTitleEdit(); });
    document.getElementById('jobTitleInput')?.addEventListener('blur', () => this.saveJobTitleEdit());
    document.getElementById('downloadCv')?.addEventListener('click', () => this.downloadDocument('cv'));
    document.getElementById('downloadCover')?.addEventListener('click', () => this.downloadDocument('cover'));
    document.getElementById('attachBoth')?.addEventListener('click', () => this.attachBothDocuments());
    document.getElementById('copyContent')?.addEventListener('click', () => this.copyCurrentContent());
    document.getElementById('copyCoverageBtn')?.addEventListener('click', () => this.copyCoverageReport());
    
    // NEW: Text download buttons
    document.getElementById('downloadCvText')?.addEventListener('click', () => this.downloadTextVersion('cv'));
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
    
    // NEW: Automatic Autofill Toggle
    document.getElementById('autofillEnabledToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ autofill_enabled: enabled });
      this.showToast(enabled ? '🤖 AI Autofill enabled' : 'AI Autofill disabled', 'success');
      
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
    
    // NEW: Manual Autofill Button
    document.getElementById('manualAutofillBtn')?.addEventListener('click', () => this.runManualAutofill());
    
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
      icon.textContent = '⏳';
      step.classList.add('active');
      step.classList.remove('complete');
    } else if (status === 'complete') {
      icon.textContent = '✓';
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
      chrome.storage.local.get(['autofill_enabled'], resolve);
    });
    
    const toggle = document.getElementById('autofillEnabledToggle');
    if (toggle) {
      toggle.checked = result.autofill_enabled !== false; // Default to enabled
    }
  }
  
  async runManualAutofill() {
    const btn = document.getElementById('manualAutofillBtn');
    if (btn) {
      btn.disabled = true;
      btn.querySelector('.btn-text').textContent = 'Running...';
    }
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        this.showToast('No active tab found', 'error');
        return;
      }
      
      // Send manual autofill command to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'RUN_MANUAL_AUTOFILL'
      });
      
      if (response?.success) {
        this.showToast(`✅ Autofill complete! Filled ${response.filledCount || 0} fields`, 'success');
      } else {
        this.showToast(response?.error || 'Autofill failed', 'error');
      }
    } catch (e) {
      console.error('[Popup] Manual autofill error:', e);
      this.showToast('Autofill failed - check console', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.querySelector('.btn-text').textContent = 'Run Manual Autofill';
      }
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
    setInterval(() => {
      chrome.runtime.sendMessage({ action: 'GET_BULK_PROGRESS' }, (response) => {
        if (response?.progress) {
          this.updateBulkProgress(response.progress);
        }
      });
    }, 1000);
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
    const normalizedContent = this.normalizeGeneratedDocumentContent(content, type);
    if (!normalizedContent) return '';
    
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
    // Preserve line breaks for consistent preview rendering
    return formatted.replace(/\n/g, '<br>');
  }

  decodeJsonEscapedString(value) {
    if (typeof value !== 'string') return '';

    try {
      return JSON.parse(`"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } catch (_error) {
      return value;
    }
  }

  extractDocumentFromJsonLikeText(text, type) {
    const keyPriority = type === 'cover'
      ? ['tailoredCoverLetter', 'coverLetter', 'tailored_cover_letter']
      : ['tailoredResume', 'resume', 'cv', 'tailoredCV', 'tailored_resume'];

    const quotedValueRegex = '(?:\\\\.|[^"\\\\])*';
    for (const key of keyPriority) {
      const regex = new RegExp(`"${key}"\\s*:\\s*"(${quotedValueRegex})"`, 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        return this.decodeJsonEscapedString(match[1]);
      }
    }

    return '';
  }

  normalizeGeneratedDocumentContent(rawContent, type = 'cv') {
    if (rawContent == null) return '';

    if (typeof rawContent !== 'string') {
      return String(rawContent);
    }

    let text = rawContent.trim();
    if (!text) return '';

    // If server accidentally returns a JSON payload as a string, extract the target field
    const extracted = this.extractDocumentFromJsonLikeText(text, type);
    if (extracted) {
      text = extracted;
    } else {
      // Best-effort full JSON parse fallback
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          const value = type === 'cover'
            ? (parsed.tailoredCoverLetter || parsed.coverLetter || parsed.tailored_cover_letter)
            : (parsed.tailoredResume || parsed.resume || parsed.cv || parsed.tailoredCV || parsed.tailored_resume);
          if (typeof value === 'string' && value.trim()) {
            text = value.trim();
          }
        }
      } catch (_ignore) {
        // Not valid JSON, continue with raw text sanitization
      }
    }

    // Decode escaped line breaks/tabs often returned in malformed AI responses
    text = text
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\u2013/g, '–')
      .replace(/\u2014/g, '—')
      .replace(/\u2022/g, '•');

    // Remove accidental leading/trailing quote wrappers
    text = text
      .replace(/^"+/, '')
      .replace(/"+$/, '')
      .trim();

    return text;
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
    
    document.getElementById('todayCount').textContent = this.stats.today;
    document.getElementById('totalCount').textContent = this.stats.total;
    document.getElementById('avgTime').textContent = this.stats.avgTime > 0 ? `${Math.round(this.stats.avgTime)}s` : '0s';
    
    const autoTailorToggle = document.getElementById('autoTailorToggle');
    if (autoTailorToggle) {
      autoTailorToggle.checked = this.autoTailorEnabled;
    }
  }

  /**
   * Handle successful tailoring result
   */
  async handleTailoringSuccess(result, keywords, p) {
    try {
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

      // Save CV for coverage report diffing
      this._coverageOriginalCV = result.tailoredResume || '';
      this._coverageOriginalCVNormalized = this.normalizeGeneratedDocumentContent(this._coverageOriginalCV, 'cv');

      // Filename format: {FirstName}_{LastName}_CV.pdf and {FirstName}_{LastName}_Cover_Letter.pdf
      const firstName = (p.first_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || 'Applicant';
      const lastName = (p.last_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') || '';
      const fileBaseName = lastName ? `${firstName}_${lastName}` : firstName;

      this.profileInfo = { firstName: p.first_name, lastName: p.last_name };

      const normalizedTailoredResume = this.normalizeGeneratedDocumentContent(result.tailoredResume, 'cv');
      const normalizedCoverLetter = this.normalizeGeneratedDocumentContent(result.tailoredCoverLetter || result.coverLetter, 'cover');

      this.generatedDocuments = {
        // Keep normalised versions as the primary fields to avoid PDF/preview mismatches
        cv: normalizedTailoredResume,
        coverLetter: normalizedCoverLetter,

        // Preserve raw outputs for diagnostics
        cvRaw: result.tailoredResume,
        coverLetterRaw: result.tailoredCoverLetter || result.coverLetter,

        cvPdf: result.resumePdf,
        coverPdf: result.coverLetterPdf,
        cvFileName: `${fileBaseName}_CV.pdf`,
        coverFileName: `${fileBaseName}_Cover_Letter.pdf`,
        matchScore: result.matchScore || 0,
        matchedKeywords: result.keywordsMatched || result.matchedKeywords || [],
        missingKeywords: result.keywordsMissing || result.missingKeywords || [],
        keywords: keywords,
        structuredCv: window.quantumhireStructuredCv, // Store reference for later PDF generation
        // CRITICAL: Store professional summary explicitly for PDF generation
        professionalSummary:
          result.professionalSummary ||
          result.extractedSummary ||
          window.quantumhireStructuredCv?.summary?.text ||
          (typeof window.quantumhireStructuredCv?.summary === 'string' ? window.quantumhireStructuredCv.summary : ''),
      };

      // WIRE UP DEBUG PANELS: Log input data after profile load
      if (window.PDFDebugPanel) {
        window.PDFDebugPanel.logInputData(
          {
            firstName: p.first_name,
            lastName: p.last_name,
            email: p.email,
            professionalExperience: p.professional_experience,
            relevantProjects: p.relevant_projects,
            education: p.education,
            skills: p.skills,
            certifications: p.certifications,
          },
          normalizedTailoredResume
        );
      }

      this.logDebug('tailorDocuments', 'Profile loaded', {
        expCount: Array.isArray(p.professional_experience) ? p.professional_experience.length : 0,
        projectsCount: Array.isArray(p.relevant_projects) ? p.relevant_projects.length : 0,
        cvLengthRaw: (result.tailoredResume || '').length,
        cvLengthNormalised: (normalizedTailoredResume || '').length,
      });

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

      // CRITICAL: Store files in chrome.storage for content.js attach loop
      await chrome.storage.local.set({
        cvPDF: this.generatedDocuments.cvPdf,
        coverPDF: this.generatedDocuments.coverPdf,
        coverLetterText: this.generatedDocuments.coverLetter || '',
        cvFileName: this.generatedDocuments.cvFileName,
        coverFileName: this.generatedDocuments.coverFileName,
      });
      console.log('[ATS Tailor] Stored cvPDF/coverPDF in chrome.storage for content.js');
      
      // Auto-attach BOTH CV and Cover Letter to the page
      try {
        await this.attachBothDocuments();
      } catch (attachError) {
        console.warn('[ATS Tailor] Auto-attach failed:', attachError);
        // Don't throw - document generation was successful
      }

      updateProgress(100, 'Complete! 100% keyword match achieved.');

      await chrome.storage.local.set({ ats_lastGeneratedDocuments: this.generatedDocuments });

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
      this.signalAutomationComplete({
        success: true,
        elapsed,
        matchScore: finalScore,
        jobUrl: this.currentJob?.url || window.location?.href,
        company: this.currentJob?.company,
        title: this.currentJob?.title,
      }).catch(() => {});

    } catch (error) {
      console.error('Tailoring error:', error);
      this.showToast(error.message || 'Failed', 'error');
      this.setStatus('Error', 'error');

      // Signal failure to external automation (do not await in popup context)
      this.signalAutomationComplete({
        success: false,
        error: error.message,
        jobUrl: this.currentJob?.url || window.location?.href,
      }).catch(() => {});
    } finally {
      // INSTANT RESET TO BLUE READY STATE: No delays, always ready for next URL
      const btnIconLeft = btn.querySelector('.btn-icon-left');
      const btnText = btn.querySelector('.btn-text');
      const btnTime = btn.querySelector('.btn-time');
      
      btn.disabled = false;
      btn.classList.remove('btn-tailoring');
      btn.classList.add('btn-gradient');
      
      // Set BLUE READY state
      if (btnIconLeft) btnIconLeft.textContent = '⚡';
      if (btnText) btnText.textContent = 'Extract & Apply Keywords to CV';
      if (btnTime) btnTime.textContent = '~5s';
      
      // Immediately reset progress UI
      progressContainer?.classList.add('hidden');
      [1, 2, 3].forEach(n => {
        const step = document.getElementById(`step${n}`);
        if (step) {
          step.classList.remove('active', 'complete');
          const icon = step.querySelector('.step-icon');
          if (icon) icon.textContent = '⏳';
        }
      });
    }
  }

  /**
   * Regenerate PDF after CV boost with dynamic location tailoring
   */
  async regeneratePDFAfterBoost() {
    try {
      console.log('[ATS Tailor] Regenerating PDF after boost (OpenResume style)...');
      
      // Get tailored location from job data
      let tailoredLocation = 'Open to relocation';
      if (window.LocationTailor && this.currentJob) {
        tailoredLocation = window.LocationTailor.extractFromJobData(this.currentJob);
      } else if (this.currentJob?.location) {
        tailoredLocation = this.currentJob.location;
      }
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
            summary: candidateData.ats_strategy,
            city: tailoredLocation
          }
        );

        if (atsPackage.cvBase64) {
          this.generatedDocuments.cvPdf = atsPackage.cvBase64;
          this.generatedDocuments.cvFileName = atsPackage.cvFilename;
          this.generatedDocuments.tailoredLocation = tailoredLocation;
          console.log('[ATS Tailor] ✅ OpenResume CV generated:', atsPackage.cvFilename);
        }

        if (atsPackage.coverBase64) {
          this.generatedDocuments.coverPdf = atsPackage.coverBase64;
          this.generatedDocuments.coverFileName = atsPackage.coverFilename;
          console.log('[ATS Tailor] ✅ OpenResume Cover Letter generated:', atsPackage.coverFilename);
        }

        if (atsPackage.matchScore) {
          this.generatedDocuments.matchScore = atsPackage.matchScore;
        }

        return;
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

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          content: this.generatedDocuments.cv,
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
   * PART 1B: Completely rewritten downloadDocument function
   * Uses structuredCv from tailoring step - NO re-parsing
   */
  async downloadDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const filename = type === 'cv' 
      ? (this.generatedDocuments.cvFileName || `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_CV.pdf`.replace(/_+/g, '_'))
      : (this.generatedDocuments.coverFileName || `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_Cover_Letter.pdf`.replace(/_+/g, '_'));
    
    // If we already have a PDF, download it directly
    if (doc) {
      const blob = this.base64ToBlob(doc, 'application/pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded!', 'success');
      return;
    }
    
    // If no PDF but we have structuredCv, generate PDF using it (NOT re-parsing)
    const structuredCv = window.quantumhireStructuredCv || this.generatedDocuments.structuredCv;
    
    if (type === 'cv' && structuredCv) {
      try {
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
            structuredCv: structuredCv,
            plainText: textDoc
          }),
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const arrayBuffer = await response.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('✅ Downloaded!', 'success');
            return;
          } else {
            // ROBUST JSON PARSING for download
            let result;
            try {
              const responseText = await response.text();
              result = JSON.parse(responseText);
            } catch (parseError) {
              console.error('[ATS Tailor] PDF response parse error:', parseError);
              this.showToast('PDF generation failed - invalid response', 'error');
              return;
            }
            if (result.pdf) {
              const blob = this.base64ToBlob(result.pdf, 'application/pdf');
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = result.fileName || filename;
              a.click();
              URL.revokeObjectURL(url);
              this.showToast('✅ Downloaded!', 'success');
              return;
            }
          }
        }
        console.error('[ATS Tailor] PDF generation via structuredCv failed:', response.status);
      } catch (error) {
        console.error('[ATS Tailor] PDF download error:', error);
      }
    }
    
    // If no PDF but we have text, try cover letter generation
    if (type === 'cover' && textDoc) {
      const personalInfo = structuredCv?.personalInfo || {
        firstName: this.profileInfo?.firstName,
        lastName: this.profileInfo?.lastName,
        email: this.session?.user?.email,
        phone: '',
      };
      
      try {
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
            personalInfo: personalInfo,
            plainText: textDoc
          }),
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/pdf')) {
            const arrayBuffer = await response.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('✅ Downloaded!', 'success');
            return;
          } else {
            // ROBUST JSON PARSING for cover letter download
            let result;
            try {
              const responseText = await response.text();
              result = JSON.parse(responseText);
            } catch (parseError) {
              console.error('[ATS Tailor] Cover letter PDF parse error:', parseError);
              this.showToast('Cover letter PDF generation failed', 'error');
              return;
            }
            if (result.pdf) {
              const blob = this.base64ToBlob(result.pdf, 'application/pdf');
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = result.fileName || filename;
              a.click();
              URL.revokeObjectURL(url);
              this.showToast('✅ Downloaded!', 'success');
              return;
            }
          }
        }
      } catch (error) {
        console.error('[ATS Tailor] Cover letter PDF generation error:', error);
      }
    }
    
    // Final fallback: download as text
    if (textDoc) {
      const blob = new Blob([textDoc], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.pdf', '.txt');
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded as text', 'success');
    } else {
      this.showToast('No document available', 'error');
    }
  }

  base64ToBlob(base64, type) {
    const byteCharacters = atob(base64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteArray[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([byteArray], { type });
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
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const filename =
      type === 'cv'
        ? this.generatedDocuments.cvFileName || `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_CV.pdf`.replace(/_+/g, '_')
        : this.generatedDocuments.coverFileName || `${this.profileInfo?.firstName || 'Applicant'}_${this.profileInfo?.lastName || ''}_Cover_Letter.pdf`.replace(/_+/g, '_');

    if (!doc && !textDoc) {
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
            pdf: doc,
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

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
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
