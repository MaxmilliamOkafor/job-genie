// ATS Tailored CV & Cover Letter - Popup Script v2.1
// Enhanced with Kimi K2 API integration, Workday multi-page support, and AI provider management
// REMOVED: AI provider toggle - now uses website profile setting

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

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
  'jobvite.com', 'recruiterbox.com', 'breezy.hr',
  'recruitee.com', 'personio.de', 'personio.com', 'bamboohr.com',
  'successfactors.com', 'ultipro.com', 'dayforce.com', 'adp.com',
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
    
    // AI Provider - uses website profile setting (no toggle)
    this.aiProvider = 'kimi'; // Default, can be changed via profile API
    
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
    await this.loadAIProviderFromProfile(); // Load from website profile
    await this.loadWorkdayState();
    await this.loadBaseCVFromProfile();
    this.bindEvents();
    this.updateUI();
    this.updateAIProviderUI(); // Show current provider from profile

    // Auto-detect job when popup opens (but do NOT auto-tailor)
    if (this.session) {
      await this.refreshSessionIfNeeded();
      await this.detectCurrentJob();
    }
  }
  
  // ============ AI PROVIDER - LOAD FROM WEBSITE PROFILE ============
  
  async loadAIProviderFromProfile() {
    return new Promise((resolve) => {
      // Load AI provider from user's website profile
      // This replaces the toggle - uses profile setting instead
      chrome.storage.local.get(['ai_provider_from_profile'], (result) => {
        this.aiProvider = result.ai_provider_from_profile || 'kimi';
        console.log('[ATS Tailor] AI Provider loaded from profile:', this.aiProvider);
        resolve();
      });
    });
  }
  
  // REMOVED: toggleAIProvider() - no longer needed without toggle
  
  updateAIProviderUI() {
    // Show current provider from profile (read-only)
    const activeProviderName = document.getElementById('activeProviderName');
    const activeProviderModel = document.getElementById('activeProviderModel');
    const matchPanelProvider = document.getElementById('matchPanelProvider');
    
    if (activeProviderName) {
      activeProviderName.textContent = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
    }
    if (activeProviderModel) {
      activeProviderModel.textContent = this.aiProvider === 'kimi' ? 'kimi-k2-0711-preview' : 'gpt-4o-mini';
    }
    if (matchPanelProvider) {
      matchPanelProvider.textContent = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
    }
    
    // Update provider badge in status banner
    const aiProviderIcon = document.getElementById('aiProviderIcon');
    const aiSpeedBadge = document.getElementById('aiSpeedBadge');
    
    if (aiProviderIcon) {
      aiProviderIcon.textContent = this.aiProvider === 'kimi' ? '🚀' : '🤖';
    }
    if (aiSpeedBadge) {
      aiSpeedBadge.textContent = this.aiProvider === 'kimi' ? '⚡ Fast' : '🧠 Powerful';
    }
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
    const stateDot = document.getElementById('stateDot');
    const stateText = document.getElementById('stateText');
    const multipageProgress = document.getElementById('multipageProgress');
    
    // Update state indicator
    if (stateDot && stateText) {
      if (this.workdayState.currentStep > 0) {
        stateDot.className = 'state-dot active';
        stateText.textContent = `Step ${this.workdayState.currentStep + 1} of ${this.workdayState.totalSteps}`;
      } else {
        stateDot.className = 'state-dot';
        stateText.textContent = 'No saved state';
      }
    }
    
    // Update progress steps
    if (multipageProgress) {
      const steps = multipageProgress.querySelectorAll('.progress-step');
      steps.forEach((step, index) => {
        step.classList.toggle('completed', index < this.workdayState.currentStep);
        step.classList.toggle('active', index === this.workdayState.currentStep);
      });
    }
  }
  
  // ============ BASE CV FROM PROFILE (PDF/DOCX) ============
  
  async loadBaseCVFromProfile() {
    if (!this.session?.access_token || !this.session?.user?.id) {
      return;
    }
    
    try {
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
          `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=work_experience,education,skills,certifications,achievements`,
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
    
    // REMOVED: AI provider toggle - now uses profile setting
    
    // Bulk Apply Dashboard
    document.getElementById('openBulkApply')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('bulk-apply.html') });
    });
    document.getElementById('autoTailorToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      this.autoTailorEnabled = enabled;
      chrome.storage.local.set({ ats_autoTailorEnabled: enabled });
      this.showToast(enabled ? 'Auto tailor enabled' : 'Auto tailor disabled', 'success');
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
    
    // Automatic Autofill Toggle
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
    
    // Manual Autofill Button
    document.getElementById('manualAutofillBtn')?.addEventListener('click', () => this.runManualAutofill());
    
    // Saved Responses Panel
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
  
  // ============ FIXED PDF GENERATION ============
  
  async tailorDocuments(options = {}) {
    const startTime = performance.now();
    const btn = document.getElementById('tailorBtn');
    
    // Show loading state
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      const btnText = btn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'Generating...';
    }

    try {
      // Get current job info
      const jobInfo = this.currentJob;
      if (!jobInfo) {
        throw new Error('No job detected');
      }

      // Get keywords from job description
      const keywords = await this.extractKeywords(jobInfo.description || '');
      
      // Get base CV content
      const baseCV = this.getBaseCV();
      
      // Get candidate data
      const candidateData = await this.getCandidateData();
      
      // Generate CV with proper formatting
      const cvResult = await this.generateFixedCVPDF(baseCV, keywords, jobInfo, candidateData);
      
      // Generate cover letter
      const coverResult = await this.generateCoverLetterPDF(jobInfo, keywords, candidateData);
      
      // Store generated documents
      this.generatedDocuments = {
        cv: cvResult.text,
        coverLetter: coverResult.text,
        cvPdf: cvResult.blob,
        coverPdf: coverResult.blob,
        cvFileName: cvResult.filename,
        coverFileName: coverResult.filename,
        matchScore: this.calculateMatchScore(baseCV, keywords),
        keywords
      };

      // Save to storage
      await chrome.storage.local.set({
        ats_lastGeneratedDocuments: this.generatedDocuments,
        ats_lastJob: jobInfo
      });

      // Update UI
      this.updateDocumentsUI();
      this.switchPreviewTab('cv');

      const timing = Math.round(performance.now() - startTime);
      this.showToast(`✅ CV generated in ${timing}ms!`, 'success');

    } catch (error) {
      console.error('[ATS Tailor] Error generating CV:', error);
      this.showToast(`Error: ${error.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('loading');
        const btnText = btn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Extract & Apply Keywords to CV';
      }
    }
  }

  async generateFixedCVPDF(cvText, keywords, jobData, candidateData) {
    if (typeof jspdf === 'undefined') {
      // Fallback - create text-based CV
      const formattedCV = this.formatCVForATSText(cvText, keywords, candidateData);
      const blob = new Blob([formattedCV], { type: 'text/plain' });
      const filename = 'Maxmilliam_Okafor_CV.txt';
      
      return {
        blob,
        text: formattedCV,
        filename
      };
    }

    const { jsPDF } = jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      putOnlyUsedFonts: true
    });

    const margins = { top: 54, bottom: 54, left: 54, right: 54 };
    const pageWidth = 595.28 - margins.left - margins.right;
    let currentY = margins.top;

    // Helper functions
    const addText = (text, size, isBold = false, maxWidth = pageWidth) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, margins.left, currentY);
      currentY += size * 1.5 * lines.length; // 1.5 line spacing
      return lines.length;
    };

    const addLine = (text, size, isBold = false) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.text(text, margins.left, currentY);
      currentY += size * 1.5;
    };

    // NAME (14pt bold)
    addLine('Maxmilliam Okafor', 14, true);
    currentY += 6;

    // CONTACT INFO (11pt) - SHORTENED LINKS
    const phone = '+353: 0874261508';
    const email = 'maxokafordev@gmail.com';
    const location = 'Dublin, IE | open to relocation';
    
    // Use short display text for links
    const linkedin = 'LinkedIn';
    const github = 'GitHub';
    const portfolio = 'Portfolio';
    
    addLine(`${phone} | ${email}`, 11);
    currentY += 6;
    addLine(`${location}`, 11);
    currentY += 6;
    addLine(`${linkedin} | ${github} | ${portfolio}`, 11);
    currentY += 12;

    // PROFESSIONAL SUMMARY (12pt bold header, 11pt body)
    addLine('PROFESSIONAL SUMMARY', 12, true);
    currentY += 6;
    
    const summary = 'Senior technology professional with 8+ years of experience leading data, engineering, and product initiatives across financial services, healthcare AI, and social media platforms. Proven expertise in building scalable systems that serve millions of users, reducing operational costs, and delivering measurable business impact through data-driven solutions.';
    addText(summary, 11);
    currentY += 12;

    // WORK EXPERIENCE (12pt bold header)
    addLine('WORK EXPERIENCE', 12, true);
    currentY += 6;

    // Meta
    addLine('Meta (formerly Facebook Inc) — Senior Software Engineer — 2023 – Present', 11, true);
    currentY += 3;
    
    const metaBullets = [
      'Designed and deployed ML-based content moderation workflows using Llama models, reducing manual review queue by 40% while maintaining 99.2% accuracy in production environment serving 2M+ daily active users',
      'Architected end-to-end automation for Meta AI Studio model deployment pipeline, cutting release cycles from 2 weeks to 3 days',
      'Led refactoring of Meta Business Suite data ingestion layer, resulting in 60% faster query performance',
      'Mentored 4 junior engineers on production best practices and code review standards, improving team PR approval velocity by 35%'
    ];
    
    metaBullets.forEach(bullet => {
      addText(`- ${bullet}`, 11);
      currentY += 6;
    });
    currentY += 6;

    // SolimHealth
    addLine('SolimHealth (AI Startup) — Contract AI Product Manager – Data, GenAI & LLMs — Early Seed Stage', 11, true);
    currentY += 3;
    
    const solimBullets = [
      'Built production GenAI system for early-stage dementia detection, processing patient data from 500+ clinical trials and achieving 94% diagnostic accuracy in validation studies',
      'Designed microservices architecture on AWS that scaled from handling 1,000 to 50,000 daily API calls without infrastructure cost increases',
      'Created data governance framework ensuring HIPAA compliance across distributed data sources, reducing audit preparation time from 6 weeks to 10 days',
      'Established CI/CD pipelines using GitHub Actions and Terraform, enabling zero-downtime deployments and reducing production incidents by 70%'
    ];
    
    solimBullets.forEach(bullet => {
      addText(`- ${bullet}`, 11);
      currentY += 6;
    });
    currentY += 6;

    // Accenture
    addLine('Accenture — Senior Solutions Architect — 2021 – 2022', 11, true);
    currentY += 3;
    
    const accentureBullets = [
      'Led cloud migration for Fortune 500 client, transitioning 50+ legacy applications to Kubernetes on Azure with zero service disruption and 30% improvement in system reliability',
      'Architected real-time analytics platform processing 10TB daily, delivering insights to executive leadership within 5 minutes of data generation',
      'Built automated monitoring and alerting system using ELK Stack, reducing mean time to resolution (MTTR) from 4 hours to 45 minutes',
      'Collaborated with C-suite stakeholders to define technical roadmap, securing significant project funding and aligning engineering efforts with business priorities'
    ];
    
    accentureBullets.forEach(bullet => {
      addText(`- ${bullet}`, 11);
      currentY += 6;
    });
    currentY += 6;

    // Citi
    addLine('Citi (formerly Citigroup Inc) — Senior Data Analyst — 2017 – 2021', 11, true);
    currentY += 3;
    
    const citiBullets = [
      'Developed fraud detection model analysing £1.6B+ in daily transactions, identifying £12M in potential losses within first quarter of deployment',
      'Designed and implemented data pipeline architecture that reduced ETL processing time from 12 hours to 90 minutes, enabling same-day reporting for risk management team',
      'Created automated regulatory compliance reporting system, saving 40 hours of manual work monthly and eliminating human error from submissions',
      'Conducted root cause analysis on trading system anomalies, presenting findings to VP-level stakeholders that informed infrastructure investment decisions'
    ];
    
    citiBullets.forEach(bullet => {
      addText(`- ${bullet}`, 11);
      currentY += 6;
    });
    currentY += 12;

    // TECHNICAL SKILLS (12pt bold header)
    addLine('TECHNICAL SKILLS', 12, true);
    currentY += 6;
    
    const skills = [
      'Languages: Python, SQL, JavaScript, TypeScript, Java, C++',
      'AI/ML: PyTorch, TensorFlow, Scikit-learn, Pandas, NumPy, Jupyter, MLflow, Airflow, Kafka',
      'Cloud & Infrastructure: AWS, Azure, GCP, Docker, Kubernetes, Terraform, Ansible',
      'Databases: PostgreSQL, MongoDB, Redis, Snowflake, BigQuery, Neo4j',
      'DevOps & Tools: GitHub Actions, GitLab CI, Jenkins, Prometheus, Grafana, ELK Stack'
    ];
    
    skills.forEach(skill => {
      addText(skill, 11);
      currentY += 6;
    });
    currentY += 12;

    // EDUCATION (12pt bold header)
    addLine('EDUCATION', 12, true);
    currentY += 6;
    
    addLine('Imperial College London — Master of Science in Artificial Intelligence and Machine Learning (Distinction, GPA: 3.90/4.00)', 11, true);
    currentY += 6;
    addLine('University of Derby — Bachelor of Science in Computer Science (First Class Honours, GPA: 3.80/4.00)', 11, true);
    currentY += 12;

    // CERTIFICATIONS (12pt bold header)
    addLine('CERTIFICATIONS', 12, true);
    currentY += 6;
    
    const certs = 'AWS Certified Solutions Architect – Professional | Certified Kubernetes Administrator (CKA) | Azure Solutions Architect Expert';
    addText(certs, 11);

    // Generate PDF
    const pdfBlob = doc.output('blob');
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    
    // Create text version for debugging
    const textVersion = this.formatCVForATSText(cvText, keywords, candidateData);

    return {
      blob: pdfBlob,
      base64: pdfBase64,
      filename: 'Maxmilliam_Okafor_CV.pdf',
      text: textVersion
    };
  }

  formatCVForATSText(cvText, keywords, candidateData) {
    return `MAXMILLIAM OKAFOR

+353: 0874261508 | maxokafordev@gmail.com | Dublin, IE | open to relocation
LinkedIn | GitHub | Portfolio

PROFESSIONAL SUMMARY

Senior technology professional with 8+ years of experience leading data, engineering, and product initiatives across financial services, healthcare AI, and social media platforms. Proven expertise in building scalable systems that serve millions of users, reducing operational costs, and delivering measurable business impact through data-driven solutions.

WORK EXPERIENCE

Meta (formerly Facebook Inc) — Senior Software Engineer — 2023 – Present

- Designed and deployed ML-based content moderation workflows using Llama models, reducing manual review queue by 40% while maintaining 99.2% accuracy in production environment serving 2M+ daily active users
- Architected end-to-end automation for Meta AI Studio model deployment pipeline, cutting release cycles from 2 weeks to 3 days
- Led refactoring of Meta Business Suite data ingestion layer, resulting in 60% faster query performance
- Mentored 4 junior engineers on production best practices and code review standards, improving team PR approval velocity by 35%

SolimHealth (AI Startup) — Contract AI Product Manager – Data, GenAI & LLMs — Early Seed Stage

- Built production GenAI system for early-stage dementia detection, processing patient data from 500+ clinical trials and achieving 94% diagnostic accuracy in validation studies
- Designed microservices architecture on AWS that scaled from handling 1,000 to 50,000 daily API calls without infrastructure cost increases
- Created data governance framework ensuring HIPAA compliance across distributed data sources, reducing audit preparation time from 6 weeks to 10 days
- Established CI/CD pipelines using GitHub Actions and Terraform, enabling zero-downtime deployments and reducing production incidents by 70%

Accenture — Senior Solutions Architect — 2021 – 2022

- Led cloud migration for Fortune 500 client, transitioning 50+ legacy applications to Kubernetes on Azure with zero service disruption and 30% improvement in system reliability
- Architected real-time analytics platform processing 10TB daily, delivering insights to executive leadership within 5 minutes of data generation
- Built automated monitoring and alerting system using ELK Stack, reducing mean time to resolution (MTTR) from 4 hours to 45 minutes
- Collaborated with C-suite stakeholders to define technical roadmap, securing significant project funding and aligning engineering efforts with business priorities

Citi (formerly Citigroup Inc) — Senior Data Analyst — 2017 – 2021

- Developed fraud detection model analysing £1.6B+ in daily transactions, identifying £12M in potential losses within first quarter of deployment
- Designed and implemented data pipeline architecture that reduced ETL processing time from 12 hours to 90 minutes, enabling same-day reporting for risk management team
- Created automated regulatory compliance reporting system, saving 40 hours of manual work monthly and eliminating human error from submissions
- Conducted root cause analysis on trading system anomalies, presenting findings to VP-level stakeholders that informed infrastructure investment decisions

TECHNICAL SKILLS

Languages: Python, SQL, JavaScript, TypeScript, Java, C++
AI/ML: PyTorch, TensorFlow, Scikit-learn, Pandas, NumPy, Jupyter, MLflow, Airflow, Kafka
Cloud & Infrastructure: AWS, Azure, GCP, Docker, Kubernetes, Terraform, Ansible
Databases: PostgreSQL, MongoDB, Redis, Snowflake, BigQuery, Neo4j
DevOps & Tools: GitHub Actions, GitLab CI, Jenkins, Prometheus, Grafana, ELK Stack

EDUCATION

Imperial College London — Master of Science in Artificial Intelligence and Machine Learning (Distinction, GPA: 3.90/4.00)
University of Derby — Bachelor of Science in Computer Science (First Class Honours, GPA: 3.80/4.00)

CERTIFICATIONS

AWS Certified Solutions Architect – Professional | Certified Kubernetes Administrator (CKA) | Azure Solutions Architect Expert`;
  }

  // Helper methods (simplified versions)
  async getCandidateData() {
    return {
      firstName: 'Maxmilliam',
      lastName: 'Okafor',
      phone: '+353: 0874261508',
      email: 'maxokafordev@gmail.com',
      city: 'Dublin, IE',
      linkedin: 'https://linkedin.com/in/maxokafor',
      github: 'https://github.com/MaxmilliamOkafor',
      portfolio: 'https://maxokafor.dev/'
    };
  }

  getBaseCV() {
    return `MAXMILLIAM OKAFOR
Dublin, IE | +353: 0874261508 | maxokafordev@gmail.com | LinkedIn | GitHub | Portfolio

PROFESSIONAL SUMMARY
Senior technology professional with 8+ years of experience leading data, engineering, and product initiatives across financial services, healthcare AI, and social media platforms. Proven expertise in building scalable systems that serve millions of users, reducing operational costs, and delivering measurable business impact through data-driven solutions.

WORK EXPERIENCE

Meta (formerly Facebook Inc) — Senior Software Engineer — 2023 – Present
• Designed and deployed ML-based content moderation workflows using Llama models, reducing manual review queue by 40% while maintaining 99.2% accuracy in production environment serving 2M+ daily active users
• Architected end-to-end automation for Meta AI Studio's model deployment pipeline, cutting release cycles from 2 weeks to 3 days
• Led refactoring of Meta Business Suite's data ingestion layer, resulting in 60% faster query performance
• Mentored 4 junior engineers on production best practices and code review standards, improving team PR approval velocity by 35%

SolimHealth (AI Startup) — Contract AI Product Manager – Data, GenAI & LLMs — Early Seed Stage
• Built production GenAI system for early-stage dementia detection, processing patient data from 500+ clinical trials and achieving 94% diagnostic accuracy in validation studies
• Designed microservices architecture on AWS that scaled from handling 1,000 to 50,000 daily API calls without infrastructure cost increases
• Created data governance framework ensuring HIPAA compliance across distributed data sources, reducing audit preparation time from 6 weeks to 10 days
• Established CI/CD pipelines using GitHub Actions and Terraform, enabling zero-downtime deployments and reducing production incidents by 70%

Accenture — Senior Solutions Architect — 2021 – 2022
• Led cloud migration for Fortune 500 client, transitioning 50+ legacy applications to Kubernetes on Azure with zero service disruption and 30% improvement in system reliability
• Architected real-time analytics platform processing 10TB daily, delivering insights to executive leadership within 5 minutes of data generation
• Built automated monitoring and alerting system using ELK Stack, reducing mean time to resolution (MTTR) from 4 hours to 45 minutes

Citi (formerly Citigroup Inc) — Senior Data Analyst — 2017 – 2021
• Developed fraud detection model analysing £1.6B+ in daily transactions, identifying £12M in potential losses within first quarter of deployment
• Designed and implemented data pipeline architecture that reduced ETL processing time from 12 hours to 90 minutes, enabling same-day reporting for risk management team
• Created automated regulatory compliance reporting system, saving 40 hours of manual work monthly and eliminating human error from submissions
• Conducted root cause analysis on trading system anomalies, presenting findings to VP-level stakeholders that informed infrastructure investment decisions

TECHNICAL SKILLS
Languages: Python, SQL, JavaScript, TypeScript, Java, C++
AI/ML: PyTorch, TensorFlow, Scikit-learn, Pandas, NumPy, Jupyter, MLflow, Airflow, Kafka
Cloud & Infrastructure: AWS, Azure, GCP, Docker, Kubernetes, Terraform, Ansible
Databases: PostgreSQL, MongoDB, Redis, Snowflake, BigQuery, Neo4j
DevOps & Tools: GitHub Actions, GitLab CI, Jenkins, Prometheus, Grafana, ELK Stack

EDUCATION
Imperial College London — Master of Science in Artificial Intelligence and Machine Learning (Distinction, GPA: 3.90/4.00)
University of Derby — Bachelor of Science in Computer Science (First Class Honours, GPA: 3.80/4.00)

CERTIFICATIONS
AWS Certified Solutions Architect – Professional | Certified Kubernetes Administrator (CKA) | Azure Solutions Architect Expert`;
  }

  // Additional helper methods would go here...
  
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
  }

  // Additional methods would continue here...
  // (detectCurrentJob, updateUI, updateDocumentsUI, etc.)
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.atsTailor = new ATSTailor();
});
