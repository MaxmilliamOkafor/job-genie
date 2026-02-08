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
@@ -192,75 +144,200 @@ class ATSTailor {
    
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
    this._eventsBound = false;

    this.init();
  }

  // Cache DOM references for performance
  getDomRef(id) {
    if (!this._domRefs[id]) {
      this._domRefs[id] = document.getElementById(id);
    }
    return this._domRefs[id];
  }

  // Normalize AI output into plain text so preview/download never shows raw JSON blobs
  normalizeDocumentText(input, type = 'cv') {
    if (input == null) return '';

    // Already plain text
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return '';

      // Parse JSON-like payloads returned as strings
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          return this.normalizeDocumentText(JSON.parse(trimmed), type);
        } catch {
          // Keep original if not valid JSON
        }
      }
      // Convert escaped newlines from AI payloads into real newlines
      const normalizedNewlines = trimmed.includes('\\n') && !trimmed.includes('\n')
        ? trimmed.replace(/\\n/g, '\n')
        : trimmed;

      return this.stripFormattingArtifacts(normalizedNewlines, type);
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.normalizeDocumentText(item, type)).filter(Boolean).join('\n');
    }

    if (typeof input === 'object') {
      // Common direct fields from backend
      const directText = input.text || input.content || input.body || input.plainText || input.tailoredResume || input.tailoredCoverLetter;
      if (typeof directText === 'string' && directText.trim()) {
        return this.normalizeDocumentText(directText, type);
      }

      if (type === 'cover') {
        const paragraphs = Array.isArray(input.paragraphs) ? input.paragraphs : [];
        if (paragraphs.length) {
          return paragraphs
            .map((p) => (typeof p === 'string' ? p : (p?.text || p?.content || '')))
            .filter(Boolean)
            .join('\n\n');
        }
      }

      // Resume structured object fallback
      const lines = [];
      const fullName = input.name || input.fullName || [input.firstName, input.lastName].filter(Boolean).join(' ');
      if (fullName) lines.push(String(fullName).toUpperCase());

      const summary = input.summary?.text || input.summary?.content || input.summary || input.professionalSummary;
      if (summary) lines.push('', 'PROFESSIONAL SUMMARY', String(summary));

      const experience = input.experience || input.workExperience || [];
      if (Array.isArray(experience) && experience.length) {
        lines.push('', 'WORK EXPERIENCE');
        for (const role of experience) {
          const title = role?.title || role?.jobTitle || role?.position || '';
          const company = role?.company || role?.companyName || '';
          const dates = role?.dates || [role?.startDate, role?.endDate].filter(Boolean).join(' - ');
          lines.push([title, company].filter(Boolean).join(' | ') + (dates ? ` | ${dates}` : ''));
          const bullets = role?.bullets || role?.achievements || role?.description || [];
          if (Array.isArray(bullets)) {
            bullets.forEach((b) => b && lines.push(`• ${String(b).replace(/^\s*[•▪-]\s*/, '')}`));
          } else if (bullets) {
            lines.push(`• ${String(bullets).replace(/^\s*[•▪-]\s*/, '')}`);
          }
        }
      }

      const skills = input.skills || input.coreSkills || [];
      if (Array.isArray(skills) && skills.length) {
        lines.push('', 'SKILLS', skills.map((s) => (typeof s === 'string' ? s : s?.name || s?.skill)).filter(Boolean).join(', '));
      }

      const built = lines.join('\n').trim();
      if (built) return built;

      // Last resort: never leak raw [object Object]
      return JSON.stringify(input, null, 2);
    }

    return String(input);
  }


  stripFormattingArtifacts(text, type = 'cv') {
    if (!text) return '';
    let cleaned = String(text).replace(/\r\n/g, '\n').trim();

    // Remove common leaked JSON object fragments appended after good text
    cleaned = cleaned.replace(/\n?\{\s*\"(?:tailoredResume|resumeStructured|structuredCv|coverLetter|keywordsMatched)\"[\s\S]*$/i, '');

    // Remove accidental [object Object] tokens
    cleaned = cleaned.replace(/\[object Object\]/g, '').trim();

    // If still looks like giant JSON, attempt one more parse + normalize
    if ((cleaned.startsWith('{') || cleaned.startsWith('[')) && /\"[A-Za-z0-9_]+\"\s*:/.test(cleaned)) {
      try {
        return this.normalizeDocumentText(JSON.parse(cleaned), type);
      } catch {
        // keep best-effort cleaned text
      }
    }

    return cleaned;
  }

  async init() {
    await this.loadSession();
    await this.loadAIProviderSettings();
    await this.loadWorkdayState();
    await this.loadBaseCVFromProfile();
    this.bindEvents();
    // Render login shell immediately; async bootstrapping continues in background
    this.updateUI();
    this.updateAIProviderUI();

    // Auto-detect job when popup opens (but do NOT auto-tailor)
    if (this.session) {
      await this.refreshSessionIfNeeded();
      await this.detectCurrentJob();
    try {
      await this.loadSession();
      await this.loadAIProviderSettings();
      await this.loadWorkdayState();
      await this.loadBaseCVFromProfile();

      if (!this._eventsBound) this.bindEvents();
      this.updateUI();
      this.updateAIProviderUI();

      // Auto-detect job when popup opens (but do NOT auto-tailor)
      if (this.session) {
        await this.refreshSessionIfNeeded();
        await this.detectCurrentJob();
      }
    } catch (error) {
      console.error('[ATS Tailor] Init failed:', error);
      // Keep popup usable even if bootstrapping partially fails
      if (!this._eventsBound) this.bindEvents();
      this.session = null;
      this.updateUI();
      this.setStatus('Ready (offline mode)', 'ready');
      this.showToast('Initialization recovered. Please login again.', 'warning');
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
@@ -281,50 +358,56 @@ class ATSTailor {
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
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        this.aiProvider = 'kimi';
        resolve();
        return;
      }

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
@@ -370,50 +453,55 @@ class ATSTailor {
    
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
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve();
        return;
      }

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
@@ -575,93 +663,101 @@ class ATSTailor {
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
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        this.session = null;
        resolve();
        return;
      }

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
    if (this._eventsBound) return;
    this._eventsBound = true;
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
@@ -774,66 +870,71 @@ class ATSTailor {
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
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'TRIGGER_EXTRACT_APPLY' || message.action === 'POPUP_TRIGGER_EXTRACT_APPLY') {
          console.log('[ATS Tailor Popup] Received trigger message:', message.action, 'with animation:', message.showButtonAnimation);
          this.triggerExtractApplyWithUI(message.jobInfo, message.showButtonAnimation !== false);
          sendResponse({ status: 'triggered' });
          return true;
        }
      });
    }
    
    // Check for pending automation trigger on popup open
    this.checkPendingAutomationTrigger();
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      this.checkPendingAutomationTrigger();
    }
  }
  
  // NEW: Download text version of CV/Cover Letter
  downloadTextVersion(type) {
    const content = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const rawContent = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const content = this.normalizeDocumentText(rawContent, type === 'cv' ? 'cv' : 'cover');
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
    
@@ -1525,94 +1626,94 @@ class ATSTailor {
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
    const content = this.currentPreviewTab === 'cv'
      ? this.normalizeDocumentText(this.generatedDocuments.cv, 'cv')
      : this.normalizeDocumentText(this.generatedDocuments.coverLetter, 'cover');
    
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
      const cvContent = this.normalizeDocumentText(this.generatedDocuments.cv || '', 'cv');
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
    const content = this.currentPreviewTab === 'cv'
      ? this.normalizeDocumentText(this.generatedDocuments.cv, 'cv')
      : this.normalizeDocumentText(this.generatedDocuments.coverLetter, 'cover');
    
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
@@ -3167,63 +3268,72 @@ class ATSTailor {
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

      const normalizedCvText = this.normalizeDocumentText(
        result.tailoredResume || result.resume || result.cv || result.resumeText || result.resumeStructured || result.structuredCv,
        'cv'
      );
      const normalizedCoverText = this.normalizeDocumentText(
        result.tailoredCoverLetter || result.coverLetter || result.cover || result.coverLetterText,
        'cover'
      );

      // Save original CV (before local boosting) for coverage report diffing
      this._coverageOriginalCV = normalizedCvText || '';

      this.generatedDocuments = {
        cv: result.tailoredResume,
        coverLetter: result.tailoredCoverLetter || result.coverLetter,
        cv: normalizedCvText,
        coverLetter: normalizedCoverText,
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
        professionalSummary: result.professionalSummary || result.extractedSummary || 
          (window.quantumhireStructuredCv?.summary?.text) || 
          (typeof window.quantumhireStructuredCv?.summary === 'string' ? window.quantumhireStructuredCv.summary : '')
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
@@ -3636,51 +3746,52 @@ class ATSTailor {
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
    const rawTextDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const textDoc = this.normalizeDocumentText(rawTextDoc, type === 'cv' ? 'cv' : 'cover');
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
@@ -3932,51 +4043,52 @@ class ATSTailor {
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
    const rawTextDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const textDoc = this.normalizeDocumentText(rawTextDoc, type === 'cv' ? 'cv' : 'cover');
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