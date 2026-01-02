// ATS Tailored CV & Cover Letter - Popup Script
// Uses same approach as chrome-extension for reliable job detection

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

// Supported ATS platforms (excluding Lever and Ashby)
const SUPPORTED_HOSTS = [
  'greenhouse.io',
  'job-boards.greenhouse.io',
  'boards.greenhouse.io',
  'workday.com',
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'bullhornstaffing.com',
  'bullhorn.com',
  'teamtailor.com',
  'workable.com',
  'apply.workable.com',
  'icims.com',
  'oracle.com',
  'oraclecloud.com',
  'taleo.net',
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
    
    // Performance: Caches for JD text and keywords per job URL
    this.jdCache = new Map(); // url -> { jd, timestamp }
    this.keywordCache = new Map(); // url -> { keywords, timestamp }
    
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
    this.bindEvents();
    this.updateUI();

    // Auto-detect job when popup opens (but do NOT auto-tailor)
    if (this.session) {
      await this.refreshSessionIfNeeded();
      await this.detectCurrentJob();
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
        ['ats_session', 'ats_stats', 'ats_todayDate', 'ats_autoTailorEnabled', 'ats_lastGeneratedDocuments', 'ats_lastJob'],
        (result) => {
          this.session = result.ats_session || null;
          this.autoTailorEnabled = typeof result.ats_autoTailorEnabled === 'boolean' ? result.ats_autoTailorEnabled : true;

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
    document.getElementById('downloadCv')?.addEventListener('click', () => this.downloadDocument('cv'));
    document.getElementById('downloadCover')?.addEventListener('click', () => this.downloadDocument('cover'));
    document.getElementById('attachBoth')?.addEventListener('click', () => this.attachBothDocuments());
    document.getElementById('copyContent')?.addEventListener('click', () => this.copyCurrentContent());
    
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
    
    // View Extracted Keywords Button (fast local extraction)
    document.getElementById('viewKeywordsBtn')?.addEventListener('click', () => this.viewExtractedKeywords());
    
    // AI Extract Keywords Button (GPT-4o-mini powered)
    document.getElementById('aiExtractBtn')?.addEventListener('click', () => this.aiExtractKeywords());

    // Workday Full Flow
    document.getElementById('runWorkdayFlow')?.addEventListener('click', () => this.runWorkdayFlow());
    document.getElementById('workdayAutoToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ workday_auto_enabled: enabled });
      this.showToast(enabled ? 'Workday automation enabled' : 'Workday automation disabled', 'success');
    });
    document.getElementById('saveWorkdayCreds')?.addEventListener('click', () => this.saveWorkdayCredentials());
    
    // Load Workday settings
    this.loadWorkdaySettings();

    // Preview tabs
    document.getElementById('previewCvTab')?.addEventListener('click', () => this.switchPreviewTab('cv'));
    document.getElementById('previewCoverTab')?.addEventListener('click', () => this.switchPreviewTab('cover'));

    // Enter key for login
    document.getElementById('password')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.login();
    });
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

  async runWorkdayFlow() {
    if (!this.session) {
      this.showToast('Please login first', 'error');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('workday')) {
      this.showToast('Navigate to a Workday job page first', 'error');
      return;
    }

    this.showToast('Starting Workday automation...', 'success');
    this.setStatus('Running Workday Flow...', 'working');

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

    chrome.runtime.sendMessage({
      action: 'TRIGGER_WORKDAY_FLOW',
      candidateData: candidateData
    });

    setTimeout(() => {
      window.close();
    }, 1000);
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
    
    this.updatePreviewContent();
  }

  updatePreviewContent() {
    const previewContent = document.getElementById('previewContent');
    if (!previewContent) return;
    
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
        .replace(/^(PROFESSIONAL SUMMARY|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|ACHIEVEMENTS|PROJECTS)/gm, 
          '<span class="section-header">$1</span>')
        .replace(/^([A-Z][A-Za-z\s&]+)\s*\|\s*(.+)$/gm, 
          '<strong>$1</strong> | <span class="date-line">$2</span>')
        .replace(/^•\s*/gm, '• ');
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
    
    document.getElementById('todayCount').textContent = this.stats.today;
    document.getElementById('totalCount').textContent = this.stats.total;
    document.getElementById('avgTime').textContent = this.stats.avgTime > 0 ? `${Math.round(this.stats.avgTime)}s` : '0s';
    
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
  updateMatchAnalysisUI() {
    const matchScore = this.generatedDocuments.matchScore || 0;
    const matchedKeywords = this.generatedDocuments.matchedKeywords || [];
    const missingKeywords = this.generatedDocuments.missingKeywords || [];
    const keywords = this.generatedDocuments.keywords || null;
    const totalKeywords = matchedKeywords.length + missingKeywords.length;
    
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
      
      let strokeColor = '#ff4757';
      if (score >= 90) strokeColor = '#2ed573';
      else if (score >= 70) strokeColor = '#00d4ff';
      else if (score >= 50) strokeColor = '#ffa502';
      gaugeCircle.setAttribute('stroke', strokeColor);
    }
    
    const matchPercentage = document.getElementById('matchPercentage');
    if (matchPercentage) matchPercentage.textContent = `${score}%`;
    
    const matchSubtitle = document.getElementById('matchSubtitle');
    if (matchSubtitle) {
      matchSubtitle.textContent = score >= 90 ? 'Excellent match!' : 
                                   score >= 70 ? 'Good match' : 
                                   score >= 50 ? 'Fair match - consider improvements' : 
                                   'Needs improvement';
    }
    
    const keywordCountBadge = document.getElementById('keywordCountBadge');
    if (keywordCountBadge) {
      keywordCountBadge.textContent = `${matched} of ${total} keywords matched`;
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
    
    if (this.currentJob) {
      if (titleEl) titleEl.textContent = this.currentJob.title || 'Job Position';
      if (companyEl) companyEl.textContent = this.currentJob.company || '';
      if (locationEl) locationEl.textContent = this.currentJob.location || '';
      if (noJobBadge) noJobBadge.classList.add('hidden');
    } else {
      if (titleEl) titleEl.textContent = 'No job detected';
      if (companyEl) companyEl.textContent = 'Navigate to a job posting';
      if (locationEl) locationEl.textContent = '';
      if (noJobBadge) noJobBadge.classList.remove('hidden');
    }
  }

  /**
   * OPTIMIZED: Extract keywords with caching and single-pass processing
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
    
    let keywords = { all: [], highPriority: [], mediumPriority: [], lowPriority: [] };
    
    // Use optimized extractor modules
    if (window.ReliableExtractor) {
      keywords = window.ReliableExtractor.extractReliableKeywords(jobDescription, 35);
    } else if (window.KeywordExtractor) {
      keywords = window.KeywordExtractor.extractKeywords(jobDescription, 35);
    } else {
      // FAST fallback: Single-pass frequency map
      keywords = this.fastKeywordExtraction(jobDescription);
    }
    
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
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }
      
      const result = await response.json();
      
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
      tailorResult = await window.TailorUniversal.tailorCV(cvText, keywords.all, { targetScore: 95 });
    } else if (window.AutoTailor95) {
      const tailor = new window.AutoTailor95({
        onProgress: updateProgress,
        onScoreUpdate: (score) => {
          this.updateMatchGauge(score, 0, keywords.all.length);
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
   * FAST fallback: Simple keyword injection into CV summary
   */
  fastKeywordInjection(cvText, keywords, missingKeywords) {
    if (!missingKeywords || missingKeywords.length === 0) {
      return { tailoredCV: cvText, injectedKeywords: [] };
    }
    
    // Find summary section and inject missing keywords
    const summaryMatch = cvText.match(/(PROFESSIONAL SUMMARY|SUMMARY|PROFILE)\s*\n([\s\S]*?)(?=\n[A-Z]{3,}|\n\n|$)/i);
    
    if (summaryMatch) {
      const summaryStart = summaryMatch.index;
      const summaryEnd = summaryStart + summaryMatch[0].length;
      const summaryText = summaryMatch[2];
      
      // Add top missing keywords naturally
      const toInject = missingKeywords.slice(0, Math.min(10, missingKeywords.length));
      const injectionPhrase = toInject.length > 0 
        ? ` Proficient in ${toInject.join(', ')}.`
        : '';
      
      const newSummary = summaryText.trim() + injectionPhrase;
      const tailoredCV = cvText.substring(0, summaryStart) + 
                         summaryMatch[1] + '\n' + newSummary + 
                         cvText.substring(summaryEnd);
      
      return { tailoredCV, injectedKeywords: toInject };
    }
    
    // Fallback: append to end of CV
    const toInject = missingKeywords.slice(0, 5);
    const tailoredCV = cvText + `\n\nAdditional Skills: ${toInject.join(', ')}`;
    return { tailoredCV, injectedKeywords: toInject };
  }

  /**
   * OPTIMIZED: Full automatic tailoring pipeline
   * 1. Extract keywords from JD (with caching)
   * 2. Generate base CV via backend
   * 3. Boost CV to 95-100% match (internal, no button)
   * 4. Generate PDFs & attach CV
   * 
   * UI updates at each stage for responsiveness
   */
  async tailorDocuments() {
    if (!this.currentJob) {
      this.showToast('No job detected', 'error');
      return;
    }

    const startTime = Date.now();
    const btn = document.getElementById('tailorBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const pipelineSteps = document.getElementById('pipelineSteps');
    
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Tailoring...';
    progressContainer?.classList.remove('hidden');
    pipelineSteps?.classList.remove('hidden');
    this.setStatus('Tailoring...', 'working');

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
      // ============ STEP 1: Extract Keywords (OPTIMIZED with caching) ============
      updateStep(1, 'working');
      updateProgress(5, 'Step 1/3: Extracting keywords from job description...');

      await this.refreshSessionIfNeeded();
      if (!this.session?.access_token || !this.session?.user?.id) {
        throw new Error('Please sign in again');
      }

      // OPTIMIZED: Extract keywords with caching
      const keywords = this.extractKeywordsOptimized(this.currentJob?.description || '');
      
      // Store keywords immediately for UI
      this.generatedDocuments.keywords = keywords;
      
      // UPDATE UI: Show extracted keywords immediately (before boost)
      if (keywords.all.length > 0) {
        this.generatedDocuments.matchedKeywords = [];
        this.generatedDocuments.missingKeywords = keywords.all;
        this.generatedDocuments.matchScore = 0;
        this.updateMatchAnalysisUI(); // Show all keywords as "missing" initially
      }

      console.log('[ATS Tailor] Step 1 - Extracted keywords:', keywords.all?.length || 0);
      updateStep(1, 'complete');

      // ============ STEP 2: Load Profile & Generate Base CV ============
      updateStep(2, 'working');
      updateProgress(20, 'Step 2/3: Generating tailored CV & Cover Letter...');

      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=first_name,last_name,email,phone,linkedin,github,portfolio,cover_letter,work_experience,education,skills,certifications,achievements,ats_strategy,city,country,address,state,zip_code`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${this.session.access_token}`,
          },
        }
      );

      if (!profileRes.ok) {
        throw new Error('Could not load profile. Open the QuantumHire app and complete your profile.');
      }

      const profileRows = await profileRes.json();
      const p = profileRows?.[0] || {};

      updateProgress(35, 'Step 2/3: AI generating tailored documents...');

      const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          jobTitle: this.currentJob.title || '',
          company: this.currentJob.company || '',
          location: this.currentJob.location || '',
          description: this.currentJob.description || '',
          requirements: [],
          userProfile: {
            firstName: p.first_name || '',
            lastName: p.last_name || '',
            email: p.email || this.session.user.email || '',
            phone: p.phone || '',
            linkedin: p.linkedin || '',
            github: p.github || '',
            portfolio: p.portfolio || '',
            coverLetter: p.cover_letter || '',
            workExperience: Array.isArray(p.work_experience) ? p.work_experience : [],
            education: Array.isArray(p.education) ? p.education : [],
            skills: Array.isArray(p.skills) ? p.skills : [],
            certifications: Array.isArray(p.certifications) ? p.certifications : [],
            achievements: Array.isArray(p.achievements) ? p.achievements : [],
            atsStrategy: p.ats_strategy || '',
            city: p.city || undefined,
            country: p.country || undefined,
            address: p.address || undefined,
            state: p.state || undefined,
            zipCode: p.zip_code || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Server error');
      }

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      // Filename format: [FirstName]_[LastName]_CV.pdf
      const firstName = (p.first_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const lastName = (p.last_name || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const fallbackName = (firstName && lastName) ? `${firstName}_${lastName}` : 'Applicant';
      
      this.profileInfo = { firstName: p.first_name, lastName: p.last_name };

      this.generatedDocuments = {
        cv: result.tailoredResume,
        coverLetter: result.tailoredCoverLetter || result.coverLetter,
        cvPdf: result.resumePdf,
        coverPdf: result.coverLetterPdf,
        cvFileName: `${fallbackName}_CV.pdf`,
        coverFileName: `${fallbackName}_Cover_Letter.pdf`,
        matchScore: result.matchScore || 0,
        matchedKeywords: result.keywordsMatched || result.matchedKeywords || [],
        missingKeywords: result.keywordsMissing || result.missingKeywords || [],
        keywords: keywords
      };

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

      // ============ STEP 3: INTERNAL BOOST to 95%+ (no button required) ============
      updateStep(3, 'working');
      updateProgress(55, 'Step 3/3: Boosting CV to 95-100% keyword match...');

      const currentScore = this.generatedDocuments.matchScore || 0;
      
      // INTERNAL BOOST: Always attempt to boost if below target
      if (currentScore < 95 && keywords.all?.length > 0) {
        try {
          const boostResult = await this.boostCVTo95Plus(
            this.generatedDocuments.cv,
            keywords,
            (percent, text) => {
              updateProgress(55 + (percent * 0.25), `Step 3/3: ${text}`);
            }
          );

          if (boostResult.tailoredCV) {
            this.generatedDocuments.cv = boostResult.tailoredCV;
            this.generatedDocuments.matchScore = boostResult.finalScore;
            this.generatedDocuments.matchedKeywords = boostResult.matchedKeywords;
            this.generatedDocuments.missingKeywords = boostResult.missingKeywords;
            
            // UPDATE UI: Show boosted match score and updated chips
            this.updateMatchAnalysisUI();
            
            console.log('[ATS Tailor] Step 3 - Boosted to:', boostResult.finalScore + '%', 
                        'injected:', boostResult.injectedKeywords?.length || 0, 'keywords');
          }
        } catch (boostError) {
          console.warn('[ATS Tailor] Boost failed, continuing with base CV:', boostError);
          // Don't throw - continue with base CV
        }
      } else if (currentScore >= 95) {
        console.log('[ATS Tailor] Step 3 - Already at', currentScore + '%, skipping boost');
      }

      updateProgress(80, 'Step 3/3: Regenerating PDF with boosted CV...');

      // Regenerate PDF with boosted CV and dynamic location
      if (this.generatedDocuments.cv) {
        await this.regeneratePDFAfterBoost();
      }

      updateStep(3, 'complete');

      // ============ FINAL: Attach CV & Update UI ============
      updateProgress(90, 'Attaching tailored CV to application...');

      // Auto-attach CV to the page
      try {
        await this.attachDocument('cv');
      } catch (attachError) {
        console.warn('[ATS Tailor] Auto-attach failed:', attachError);
        // Don't throw - document generation was successful
      }

      updateProgress(100, 'Complete! ATS-tailored CV & Cover Letter ready.');

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

    } catch (error) {
      console.error('Tailoring error:', error);
      this.showToast(error.message || 'Failed', 'error');
      this.setStatus('Error', 'error');
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Tailor CV & Cover Letter';
      setTimeout(() => {
        progressContainer?.classList.add('hidden');
        [1, 2, 3].forEach(n => {
          const step = document.getElementById(`step${n}`);
          if (step) {
            step.classList.remove('active', 'complete');
            const icon = step.querySelector('.step-icon');
            if (icon) icon.textContent = '⏳';
          }
        });
      }, 3000);
    }
  }

  /**
   * Regenerate PDF after CV boost with dynamic location tailoring
   */
  async regeneratePDFAfterBoost() {
    try {
      console.log('[ATS Tailor] Regenerating PDF after boost...');
      
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
            `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=first_name,last_name,email,phone,linkedin,github,portfolio`,
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

      // Generate new PDF using PDFATSPerfect if available
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
        } else if (pdfResult.requiresBackendGeneration) {
          await this.regeneratePDFViaBackend(pdfResult, tailoredLocation);
        }
      } else {
        // Fallback: Call backend generate-pdf function
        await this.regeneratePDFViaBackend(null, tailoredLocation);
      }
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
          fileName: this.generatedDocuments.cvFileName
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.pdf) {
          this.generatedDocuments.cvPdf = result.pdf;
          this.generatedDocuments.cvFileName = result.fileName || this.generatedDocuments.cvFileName;
          console.log('[ATS Tailor] PDF regenerated via backend:', result.fileName);
        }
      }
    } catch (error) {
      console.error('[ATS Tailor] Backend PDF generation failed:', error);
    }
  }

  downloadDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const filename = type === 'cv' 
      ? (this.generatedDocuments.cvFileName || `Applicant_CV.pdf`)
      : (this.generatedDocuments.coverFileName || `Applicant_Cover_Letter.pdf`);
    
    if (doc) {
      const blob = this.base64ToBlob(doc, 'application/pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded!', 'success');
    } else if (textDoc) {
      const blob = new Blob([textDoc], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.pdf', '.txt');
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded!', 'success');
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

  async attachDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    const filename =
      type === 'cv'
        ? this.generatedDocuments.cvFileName || `Applicant_CV.pdf`
        : this.generatedDocuments.coverFileName || `Applicant_Cover_Letter.pdf`;

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
    await this.attachDocument('cv');
    await new Promise(r => setTimeout(r, 500));
    await this.attachDocument('cover');
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
}

/**
 * Injected function to extract job information from the current page
 * Runs in page context - self-contained with no external dependencies
 */
function extractJobInfoFromPageInjected() {
  const result = {
    title: '',
    company: '',
    location: '',
    description: '',
    url: window.location.href
  };

  try {
    const host = window.location.hostname.toLowerCase();

    // --- Helper: get text from first matching selector ---
    const getText = (...selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    };

    // --- Greenhouse ---
    if (host.includes('greenhouse')) {
      result.title = getText('h1.app-title', '.job-title h1', 'h1[class*="job"]', '.posting-headline h1', 'h1');
      result.company = getText('.company-name', '[class*="company"]') || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = getText('.location', '[class*="location"]', '.posting-categories .location');
      // Greenhouse uses #content or .content for full JD
      result.description = getText('#content', '.content', '.posting-content', '.job-post-content', '[class*="description"]', 'main');
    }
    // --- Workday / myworkdayjobs ---
    else if (host.includes('workday') || host.includes('myworkdayjobs')) {
      result.title = getText('[data-automation-id="jobPostingHeader"] h2', 'h2[data-automation-id="jobTitle"]', '[data-automation-id="jobPostingTitle"]', 'h1', 'h2');
      result.company = getText('[data-automation-id="company"]') || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = getText('[data-automation-id="locations"]', '[data-automation-id="location"]', '[class*="location"]');
      // Workday stores JD in data-automation-id="jobPostingDescription" or a large container
      const descEl = document.querySelector('[data-automation-id="jobPostingDescription"]');
      if (descEl) {
        result.description = descEl.innerText || descEl.textContent || '';
      } else {
        // Fallback: grab largest text block
        const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        result.description = main.innerText?.substring(0, 15000) || '';
      }
    }
    // --- SmartRecruiters ---
    else if (host.includes('smartrecruiters')) {
      result.title = getText('h1.job-title', 'h1[class*="title"]', 'h1');
      result.company = getText('.company-name', '[class*="company"]');
      result.location = getText('.job-location', '[class*="location"]');
      result.description = getText('.job-description', '.job-sections', '[class*="description"]', 'main');
    }
    // --- Workable ---
    else if (host.includes('workable')) {
      result.title = getText('h1[data-ui="job-title"]', 'h1');
      result.company = getText('[data-ui="company-name"]', '.company-name');
      result.location = getText('[data-ui="job-location"]', '.job-location');
      result.description = getText('[data-ui="job-description"]', '.job-description', 'main');
    }
    // --- Teamtailor ---
    else if (host.includes('teamtailor')) {
      result.title = getText('h1.job-title', 'h1');
      result.company = getText('.company-name', '[class*="company"]') || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = getText('.location', '[class*="location"]');
      result.description = getText('.job-ad-body', '.job-body', '.description', 'main');
    }
    // --- iCIMS ---
    else if (host.includes('icims')) {
      result.title = getText('.iCIMS_Header h1', 'h1.title', 'h1');
      result.company = getText('.iCIMS_CompanyName', '[class*="company"]');
      result.location = getText('.iCIMS_JobLocation', '[class*="location"]');
      result.description = getText('.iCIMS_JobContent', '.iCIMS_MainWrapper', 'main');
    }
    // --- Bullhorn ---
    else if (host.includes('bullhorn')) {
      result.title = getText('h1.job-title', 'h1');
      result.company = getText('.company-name');
      result.location = getText('.job-location', '[class*="location"]');
      result.description = getText('.job-description', '.job-details', 'main');
    }
    // --- Oracle / Taleo ---
    else if (host.includes('oracle') || host.includes('taleo')) {
      result.title = getText('h1.job-title', 'h1');
      result.company = getText('.company-name') || document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = getText('.job-location', '[class*="location"]');
      result.description = getText('.job-description', '#requisitionDescriptionInterface', 'main');
    }
    // --- Generic fallback ---
    else {
      result.title = getText('h1') || document.title.split('|')[0].split('-')[0].trim();
      result.company = document.querySelector('meta[property="og:site_name"]')?.content || '';
      result.location = getText('[class*="location"]', '[data-testid*="location"]');
      result.description = getText('main', 'article', '[class*="description"]', '#content', '[role="main"]');
    }

    // --- Fallback: Meta tags ---
    if (!result.title) {
      result.title = document.querySelector('meta[property="og:title"]')?.content || document.title;
    }
    if (!result.description || result.description.length < 100) {
      // Try grabbing full body text as last resort
      const fallbackDesc = document.querySelector('meta[property="og:description"]')?.content ||
                           document.querySelector('meta[name="description"]')?.content || '';
      if (fallbackDesc.length > result.description.length) {
        result.description = fallbackDesc;
      }
      // If still short, grab main content
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
        // Handle arrays
        if (Array.isArray(data)) data = data.find(d => d['@type'] === 'JobPosting');
        if (data?.['@type'] === 'JobPosting') {
          if (!result.title && data.title) result.title = data.title;
          if (!result.company && data.hiringOrganization?.name) result.company = data.hiringOrganization.name;
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
            // Strip HTML from structured data description
            const temp = document.createElement('div');
            temp.innerHTML = data.description;
            const cleanDesc = temp.textContent || temp.innerText || '';
            if (cleanDesc.length > result.description.length) result.description = cleanDesc;
          }
          break;
        }
      } catch (e) {}
    }

    // --- Cleanup ---
    result.title = result.title.replace(/\s+/g, ' ').trim().substring(0, 200);
    result.company = result.company.replace(/\s+/g, ' ').trim().substring(0, 100);
    result.location = result.location.replace(/\s+/g, ' ').trim().substring(0, 100);
    result.description = result.description.replace(/\s+/g, ' ').trim().substring(0, 15000);

  } catch (error) {
    console.error('[ATS Tailor] Extraction error:', error);
  }

  return result;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ATSTailor();
});
