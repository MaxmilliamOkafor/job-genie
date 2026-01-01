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
      missingKeywords: []
    };
    this.stats = { today: 0, total: 0, avgTime: 0, times: [] };
    this.currentPreviewTab = 'cv';
    this.autoTailorEnabled = true;
    this.jobCache = {};

    this.init();
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

      // If we don't have expiry info, do a lightweight call to validate token first.
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${this.session.access_token}`,
        },
      });

      if (res.ok) return;

      // Refresh
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
        ['ats_session', 'ats_stats', 'ats_todayDate', 'ats_autoTailorEnabled', 'ats_jobCache', 'ats_lastGeneratedDocuments', 'ats_lastJob'],
        (result) => {
          this.session = result.ats_session || null;

          this.autoTailorEnabled = typeof result.ats_autoTailorEnabled === 'boolean' ? result.ats_autoTailorEnabled : true;
          this.jobCache = result.ats_jobCache || {};

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
    
    // Boost Match Button
    document.getElementById('boostMatchBtn')?.addEventListener('click', () => this.boostMatchScore());
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
    
    // Update the display
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

    // Get current tab to check if on Workday
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes('workday')) {
      this.showToast('Navigate to a Workday job page first', 'error');
      return;
    }

    this.showToast('Starting Workday automation...', 'success');
    this.setStatus('Running Workday Flow...', 'working');

    // Get user profile for autofill
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

    // Trigger Workday flow via background script
    chrome.runtime.sendMessage({
      action: 'TRIGGER_WORKDAY_FLOW',
      candidateData: candidateData
    });

    // Close popup after a moment
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
    
    // Update tab buttons
    document.getElementById('previewCvTab')?.classList.toggle('active', tab === 'cv');
    document.getElementById('previewCoverTab')?.classList.toggle('active', tab === 'cover');
    
    // Update preview content
    this.updatePreviewContent();
  }

  updatePreviewContent() {
    const previewContent = document.getElementById('previewContent');
    if (!previewContent) return;
    
    const content = this.currentPreviewTab === 'cv' 
      ? this.generatedDocuments.cv 
      : this.generatedDocuments.coverLetter;
    
    // Also check if we have PDFs even if text content is missing
    const hasPdf = this.currentPreviewTab === 'cv' 
      ? this.generatedDocuments.cvPdf 
      : this.generatedDocuments.coverPdf;
    
    if (content) {
      // Format content for better readability
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
    
    // Escape HTML
    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };
    
    let formatted = escapeHtml(content);
    
    if (type === 'cv') {
      // Format resume sections
      formatted = formatted
        .replace(/^(PROFESSIONAL SUMMARY|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|ACHIEVEMENTS|PROJECTS)/gm, 
          '<span class="section-header">$1</span>')
        .replace(/^([A-Z][A-Za-z\s&]+)\s*\|\s*(.+)$/gm, 
          '<strong>$1</strong> | <span class="date-line">$2</span>')
        .replace(/^•\s*/gm, '• ');
    } else {
      // Format cover letter with date header
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
    
    // Initialize auto-tailor toggle from stored state
    const autoTailorToggle = document.getElementById('autoTailorToggle');
    if (autoTailorToggle) {
      autoTailorToggle.checked = this.autoTailorEnabled;
    }
    
    // Show documents card if we have previously generated documents (text or PDF)
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
    // Update filenames
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
    
    // Update file sizes
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
    
    // Update AI Match Analysis Panel with new UI
    this.updateMatchAnalysisUI();
  }

  updateMatchAnalysisUI() {
    const matchScore = this.generatedDocuments.matchScore || 0;
    const matchedKeywords = this.generatedDocuments.matchedKeywords || [];
    const missingKeywords = this.generatedDocuments.missingKeywords || [];
    const keywords = this.generatedDocuments.keywords || null;
    const totalKeywords = matchedKeywords.length + missingKeywords.length;
    
    // Update gauge using KeywordChips or fallback
    if (window.KeywordChips) {
      window.KeywordChips.updateMatchGauge(matchScore, matchedKeywords.length, totalKeywords);
    } else {
      // Fallback: Update gauge circle (SVG-safe using setAttribute)
      const gaugeCircle = document.getElementById('matchGaugeCircle');
      if (gaugeCircle) {
        const circumference = 2 * Math.PI * 45; // ~283
        const dashOffset = circumference - (matchScore / 100) * circumference;
        gaugeCircle.setAttribute('stroke-dashoffset', dashOffset.toString());
        
        // Update color based on score
        let strokeColor = '#ff4757'; // red < 50%
        if (matchScore >= 90) strokeColor = '#2ed573';
        else if (matchScore >= 70) strokeColor = '#00d4ff';
        else if (matchScore >= 50) strokeColor = '#ffa502';
        gaugeCircle.setAttribute('stroke', strokeColor);
      }
      
      // Update percentage text
      const matchPercentage = document.getElementById('matchPercentage');
      if (matchPercentage) matchPercentage.textContent = `${matchScore}%`;
      
      // Update subtitle and badge
      const matchSubtitle = document.getElementById('matchSubtitle');
      if (matchSubtitle && totalKeywords > 0) {
        matchSubtitle.textContent = matchScore >= 90 ? 'Excellent match!' : 
                                     matchScore >= 70 ? 'Good match' : 
                                     matchScore >= 50 ? 'Fair match - consider improvements' : 
                                     'Needs improvement';
      }
      
      if (keywordCountBadge) {
        keywordCountBadge.textContent = `${matchedKeywords.length} of ${totalKeywords} keywords matched`;
      }
    }
    
    // Render keyword chips - build keywords object if not present
    const cvText = this.generatedDocuments.cv || '';
    let keywordsObj = keywords;
    
    // If no structured keywords, build from matched/missing arrays
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
    
    // Use KeywordChips module for chips if available
    if (window.KeywordChips && keywordsObj && (keywordsObj.highPriority || keywordsObj.all)) {
      window.KeywordChips.updateAllKeywordSections(keywordsObj, cvText);
      console.log('[ATS Tailor] Updated keyword chips:', {
        high: keywordsObj.highPriority?.length || 0,
        medium: keywordsObj.mediumPriority?.length || 0,
        low: keywordsObj.lowPriority?.length || 0
      });
    } else if (totalKeywords > 0) {
      // Fallback: manual chip rendering
      const highCount = Math.ceil(totalKeywords * 0.4);
      const medCount = Math.ceil(totalKeywords * 0.35);
      
      const allKeywords = [...matchedKeywords, ...missingKeywords];
      const highPriority = allKeywords.slice(0, highCount);
      const mediumPriority = allKeywords.slice(highCount, highCount + medCount);
      const lowPriority = allKeywords.slice(highCount + medCount);
      
      // Update keyword chips
      this.updateKeywordChips('highPriorityChips', 'highPriorityCount', highPriority, matchedKeywords);
      this.updateKeywordChips('mediumPriorityChips', 'mediumPriorityCount', mediumPriority, matchedKeywords);
      this.updateKeywordChips('lowPriorityChips', 'lowPriorityCount', lowPriority, matchedKeywords);
    }
  }

  updateKeywordChips(containerId, countId, keywords, matchedKeywords) {
    const container = document.getElementById(containerId);
    const countEl = document.getElementById(countId);
    if (!container) return;
    
    container.innerHTML = '';
    let matchCount = 0;
    
    keywords.forEach(kw => {
      const isMatched = matchedKeywords.includes(kw);
      if (isMatched) matchCount++;
      
      const chip = document.createElement('span');
      chip.className = `keyword-chip ${isMatched ? 'matched' : 'missing'}`;
      chip.innerHTML = `<span class="chip-text">${kw}</span><span class="chip-icon">${isMatched ? '✓' : '✗'}</span>`;
      container.appendChild(chip);
    });
    
    if (countEl) {
      countEl.textContent = `${matchCount}/${keywords.length}`;
    }
  }

  setStatus(text, type = 'ready') {
    const indicator = document.getElementById('statusIndicator');
    const statusText = indicator?.querySelector('.status-text');
    
    if (indicator) {
      // SVG-safe class manipulation - use classList instead of direct className assignment
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
      
      // Auto-detect and tailor
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

      // Skip restricted URLs
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

      // Check if on supported ATS platform
      const url = new URL(tab.url);
      if (!this.isSupportedHost(url.hostname)) {
        this.currentJob = null;
        this.updateJobDisplay();
        this.setStatus(`Unsupported: ${url.hostname}`, 'error');
        return false;
      }

      // Execute extraction script in the page context
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractJobInfoFromPageInjected,
      });

      if (results?.[0]?.result) {
        this.currentJob = results[0].result;
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
   * Full automatic tailoring pipeline:
   * 1. Extract keywords from JD
   * 2. Boost CV to 95-100% match
   * 3. Generate ATS-tailored CV & Cover Letter
   * 4. Replace any LazyApply CV with the new one
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
      // ============ STEP 1: Extract Keywords ============
      updateStep(1, 'working');
      updateProgress(10, 'Step 1/3: Extracting keywords from job description...');

      await this.refreshSessionIfNeeded();
      if (!this.session?.access_token || !this.session?.user?.id) {
        throw new Error('Please sign in again');
      }

      // Extract keywords from job description
      let keywords = { all: [], highPriority: [], mediumPriority: [], lowPriority: [] };
      if (this.currentJob?.description) {
        if (window.ReliableExtractor) {
          keywords = window.ReliableExtractor.extractReliableKeywords(this.currentJob.description, 35);
        } else if (window.KeywordExtractor) {
          keywords = window.KeywordExtractor.extractKeywords(this.currentJob.description, 35);
        }
      }

      console.log('[ATS Tailor] Step 1 - Extracted keywords:', keywords.all?.length || 0);
      updateStep(1, 'complete');

      // ============ STEP 2: Load Profile & Generate Base CV ============
      updateStep(2, 'working');
      updateProgress(25, 'Step 2/3: Loading profile and generating base CV...');

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

      updateProgress(40, 'Step 2/3: Generating tailored documents...');

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

      const fallbackName = `${(p.first_name || '').trim()}_${(p.last_name || '').trim()}`.replace(/\s+/g, '_') || 'Applicant';

      this.generatedDocuments = {
        cv: result.tailoredResume,
        coverLetter: result.tailoredCoverLetter || result.coverLetter,
        cvPdf: result.resumePdf,
        coverPdf: result.coverLetterPdf,
        cvFileName: result.cvFileName || result.resumePdfFileName || `${fallbackName}_CV.pdf`,
        coverFileName: result.coverLetterFileName || result.coverLetterPdfFileName || `${fallbackName}_Cover_Letter.pdf`,
        matchScore: result.matchScore || 0,
        matchedKeywords: result.keywordsMatched || result.matchedKeywords || [],
        missingKeywords: result.keywordsMissing || result.missingKeywords || [],
        keywords: keywords
      };

      // Calculate initial match score
      if (keywords.all?.length > 0 && this.generatedDocuments.cv) {
        const extractor = window.ReliableExtractor || window.KeywordExtractor;
        if (extractor) {
          const match = extractor.matchKeywords(this.generatedDocuments.cv, keywords.all);
          this.generatedDocuments.matchedKeywords = match.matched;
          this.generatedDocuments.missingKeywords = match.missing;
          this.generatedDocuments.matchScore = match.matchScore;
        }
      }

      console.log('[ATS Tailor] Step 2 - Initial match score:', this.generatedDocuments.matchScore + '%');
      updateStep(2, 'complete');

      // ============ STEP 3: Boost CV to 95%+ ============
      updateStep(3, 'working');
      updateProgress(60, 'Step 3/3: Boosting CV to 95-100% keyword match...');

      const currentScore = this.generatedDocuments.matchScore || 0;
      
      // Only boost if score is below target
      if (currentScore < 95 && keywords.all?.length > 0) {
        try {
          let tailorResult;

          if (window.TailorUniversal) {
            tailorResult = await window.TailorUniversal.tailorCV(
              this.generatedDocuments.cv,
              keywords.all,
              { targetScore: 95 }
            );
          } else if (window.AutoTailor95) {
            const tailor = new window.AutoTailor95({
              onProgress: (percent, text) => {
                updateProgress(60 + (percent * 0.2), `Step 3/3: ${text}`);
              },
              onScoreUpdate: (score) => {
                if (window.KeywordChips) {
                  window.KeywordChips.updateMatchGauge(score, 0, 0);
                }
              }
            });

            tailorResult = await tailor.autoTailorTo95Plus(
              this.currentJob.description,
              this.generatedDocuments.cv
            );
          } else if (window.CVTailor) {
            tailorResult = window.CVTailor.tailorCV(
              this.generatedDocuments.cv,
              keywords,
              { targetScore: 95 }
            );
          }

          if (tailorResult?.tailoredCV) {
            this.generatedDocuments.cv = tailorResult.tailoredCV;
            this.generatedDocuments.matchScore = tailorResult.finalScore || tailorResult.matchScore || currentScore;
            this.generatedDocuments.matchedKeywords = tailorResult.matchedKeywords || this.generatedDocuments.matchedKeywords;
            this.generatedDocuments.missingKeywords = tailorResult.missingKeywords || this.generatedDocuments.missingKeywords;
            
            console.log('[ATS Tailor] Step 3 - Boosted score:', this.generatedDocuments.matchScore + '%');
          }
        } catch (e) {
          console.warn('[ATS Tailor] Boost step failed, continuing with base CV:', e);
        }
      }

      updateProgress(80, 'Step 3/3: Applying location and regenerating PDF...');

      // Dynamic location tailoring
      try {
        const tailoredLocation = window.LocationTailor
          ? window.LocationTailor.extractFromJobData(this.currentJob)
          : (this.currentJob?.location || 'Open to relocation');

        const patchHeaderLocation = (cvText, newLoc) => {
          if (!cvText || !newLoc) return cvText;
          const lines = cvText.split('\n');
          const idx = lines.findIndex((l) => l.includes('|') && /@/.test(l) && /open to relocation/i.test(l));
          if (idx === -1) return cvText;

          const parts = lines[idx].split('|').map((p) => p.trim());
          if (parts.length >= 4) {
            parts[2] = newLoc;
            lines[idx] = parts.join(' | ');
            return lines.join('\n');
          }
          return cvText;
        };

        const patchedCV = patchHeaderLocation(this.generatedDocuments.cv, tailoredLocation);
        this.generatedDocuments.cv = patchedCV;
        this.currentJob.location = tailoredLocation;

        // Regenerate CV PDF with boosted content
        if (this.session?.access_token && this.generatedDocuments.cv) {
          const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.session.access_token}`,
              apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              content: this.generatedDocuments.cv,
              type: 'cv',
              tailoredLocation,
              jobTitle: this.currentJob?.title,
              company: this.currentJob?.company,
              fileName: this.generatedDocuments.cvFileName,
            }),
          });

          if (pdfRes.ok) {
            const pdfJson = await pdfRes.json();
            if (pdfJson?.pdf) {
              this.generatedDocuments.cvPdf = pdfJson.pdf;
              if (pdfJson.fileName) this.generatedDocuments.cvFileName = pdfJson.fileName;
            }
          }
        }
      } catch (e) {
        console.warn('[ATS Tailor] Dynamic location patch failed', e);
      }

      updateStep(3, 'complete');
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
        `Done in ${elapsed.toFixed(1)}s! ${finalScore}% keyword match from job description.`, 
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
        // Reset step icons
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
   * Boost match score using enhanced auto-tailor workflow
   * Injects missing keywords to achieve 95%+ ATS match with dynamic score updates
   */
  async boostMatchScore() {
    const btn = document.getElementById('boostMatchBtn');
    if (!btn) return;

    // Check prerequisites
    if (!this.generatedDocuments.cv) {
      this.showToast('Generate a tailored CV first', 'error');
      return;
    }

    // Try to get job description from multiple sources
    let jobDescription = this.currentJob?.description || '';
    if (!jobDescription || jobDescription.length < 50) {
      // Try to re-detect from page
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // Try multiple selectors for job description
              const selectors = [
                '[data-automation-id="jobPostingDescription"]',
                '#content', '.posting', '.job-description',
                '[class*="description"]', 'main', 'article'
              ];
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el?.textContent?.trim()?.length > 100) {
                  return el.textContent.trim().substring(0, 5000);
                }
              }
              return document.body?.textContent?.substring(0, 5000) || '';
            }
          });
          if (result?.[0]?.result) {
            jobDescription = result[0].result;
            this.currentJob = this.currentJob || {};
            this.currentJob.description = jobDescription;
          }
        }
      } catch (e) {
        console.warn('[ATS Tailor] Could not re-detect job description:', e);
      }
    }

    if (!jobDescription || jobDescription.length < 50) {
      this.showToast('No job description found. Navigate to a job page and refresh.', 'error');
      return;
    }

    const currentScore = this.generatedDocuments.matchScore || 0;
    if (currentScore >= 95) {
      this.showToast('Already at 95%+ match!', 'success');
      return;
    }

    // Set loading state using ButtonFixer if available
    if (window.ButtonFixer) {
      window.ButtonFixer.setButtonLoading(btn, true, 'Boosting...');
    } else {
      btn.disabled = true;
      const textEl = btn.querySelector('.btn-text');
      if (textEl) textEl.textContent = 'Boosting...';
      btn.classList.add('btn-loading');
    }
    this.setStatus('Boosting match score...', 'working');

    try {
      let tailorResult;

      // Try using AutoTailor95 module first
      if (window.AutoTailor95) {
        const tailor = new window.AutoTailor95({
          onProgress: (percent, text) => {
            console.log(`[Boost] ${percent}%: ${text}`);
          },
          onScoreUpdate: (score, phase) => {
            // Animate score change in real-time
            if (window.KeywordChips) {
              const matched = Math.round((score / 100) * (this.generatedDocuments.matchedKeywords?.length + this.generatedDocuments.missingKeywords?.length || 0));
              window.KeywordChips.updateMatchGauge(score, matched, this.generatedDocuments.matchedKeywords?.length + this.generatedDocuments.missingKeywords?.length || 0);
            }
          },
          onChipsUpdate: (keywords, cvText, phase) => {
            // Update chips in real-time
            if (window.KeywordChips) {
              window.KeywordChips.updateAllKeywordSections(keywords, cvText);
            }
          }
        });

        tailorResult = await tailor.autoTailorTo95Plus(
          this.currentJob.description,
          this.generatedDocuments.cv
        );
      } 
      // Fallback to CVTailor if AutoTailor95 not available
      else if (window.CVTailor && window.KeywordExtractor) {
        const keywords = window.KeywordExtractor.extractKeywords(this.currentJob.description, 35);
        
        if (!keywords.all || keywords.all.length === 0) {
          throw new Error('Could not extract keywords from job description');
        }

        const cvResult = window.CVTailor.tailorCV(
          this.generatedDocuments.cv,
          keywords,
          { targetScore: 95 }
        );

        tailorResult = {
          tailoredCV: cvResult.tailoredCV,
          finalScore: cvResult.matchScore,
          matchedKeywords: cvResult.matchedKeywords,
          missingKeywords: cvResult.missingKeywords,
          injectedKeywords: cvResult.injectedKeywords || [],
          keywords: keywords
        };
      } else {
        throw new Error('Tailoring modules not loaded');
      }

      if (!tailorResult.tailoredCV) {
        throw new Error('Tailoring failed');
      }

      // Update documents with boosted CV
      this.generatedDocuments.cv = tailorResult.tailoredCV;
      this.generatedDocuments.matchScore = tailorResult.finalScore;
      this.generatedDocuments.matchedKeywords = tailorResult.matchedKeywords;
      this.generatedDocuments.missingKeywords = tailorResult.missingKeywords;
      this.generatedDocuments.keywords = tailorResult.keywords;

      // Auto-regenerate PDF with boosted CV and dynamic location
      await this.regeneratePDFAfterBoost();

      // Save updated documents
      await chrome.storage.local.set({ ats_lastGeneratedDocuments: this.generatedDocuments });

      // Final UI update with animation
      if (window.DynamicScore) {
        window.DynamicScore.animateScore(currentScore, tailorResult.finalScore, (score) => {
          const matchPercentage = document.getElementById('matchPercentage');
          if (matchPercentage) matchPercentage.textContent = `${score}%`;
        });
      }

      // Update all UI elements
      this.updateDocumentDisplay();
      this.updatePreviewContent();
      
      const improvement = tailorResult.finalScore - currentScore;
      const injectedCount = tailorResult.injectedKeywords?.length || 0;

      this.showToast(
        `Boosted to ${tailorResult.finalScore}%! (+${improvement}%, ${injectedCount} keywords added, PDF regenerated)`, 
        'success'
      );
      this.setStatus('Boost complete', 'ready');

      // Log stats for debugging
      console.log('[ATS Tailor] Boost result:', {
        originalScore: currentScore,
        newScore: tailorResult.finalScore,
        injectedKeywords: tailorResult.injectedKeywords,
        stats: tailorResult.stats
      });

    } catch (error) {
      console.error('Boost error:', error);
      this.showToast(error.message || 'Boost failed', 'error');
      this.setStatus('Error', 'error');
    } finally {
      // Reset button state
      if (window.ButtonFixer) {
        window.ButtonFixer.setButtonLoading(btn, false);
      } else {
        btn.disabled = false;
        const textEl = btn.querySelector('.btn-text');
        if (textEl) textEl.textContent = 'Boost to 95%+';
        btn.classList.remove('btn-loading');
      }
    }
  }

  /**
   * Regenerate PDF after CV boost with dynamic location tailoring
   * Automatically called after boostMatchScore modifies CV text
   */
  async regeneratePDFAfterBoost() {
    try {
      console.log('[ATS Tailor] Regenerating PDF after boost...');
      
      // Get tailored location from job data
      let tailoredLocation = 'Open to relocation';
      if (window.LocationTailor && this.currentJob) {
        tailoredLocation = window.LocationTailor.extractFromJobData(this.currentJob);
        console.log('[ATS Tailor] Tailored location:', tailoredLocation);
      }

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
          // Need to call backend for PDF generation
          await this.regeneratePDFViaBackend(pdfResult, tailoredLocation);
        }
      } else {
        // Fallback: Call backend generate-pdf function
        await this.regeneratePDFViaBackend(null, tailoredLocation);
      }
    } catch (error) {
      console.error('[ATS Tailor] PDF regeneration failed:', error);
      // Don't throw - boost was successful, just PDF failed
      this.generatedDocuments.cvPdf = null;
    }
  }

  /**
   * Regenerate PDF via Supabase edge function
   * @param {Object} textFormat - Pre-formatted text from PDFATSPerfect
   * @param {string} tailoredLocation - Location for CV header
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
          fileName: textFormat?.fileName
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.pdf) {
          this.generatedDocuments.cvPdf = result.pdf;
          this.generatedDocuments.cvFileName = result.fileName || textFormat?.fileName;
          console.log('[ATS Tailor] PDF regenerated via backend');
        }
      }
    } catch (error) {
      console.error('[ATS Tailor] Backend PDF generation failed:', error);
    }
  }

  downloadDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    // Use the filename from backend which includes user's name with proper format
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
    // Use filename from backend which includes user's name with proper format
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
        // Common for Greenhouse: cover letter may be a button/text flow rather than file upload.
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

// This function is injected into the page context - it must be self-contained
function extractJobInfoFromPageInjected() {
  const hostname = window.location.hostname;

  const getText = (selectors) => {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      } catch {
        // ignore
      }
    }
    return '';
  };

  const getMeta = (name) =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
    document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
    '';

  const normalizeLocation = (raw) => {
    const t = (raw || '').toString().trim();
    if (!t) return '';
    const lower = t.toLowerCase();

    // REMOTE (anywhere in US) -> United States
    if (lower.includes('remote') && (lower.includes('us') || lower.includes('united states') || lower.includes('usa'))) {
      return 'United States';
    }

    // Any US hint -> United States (or City, United States)
    if (/(\bUS\b|\bUSA\b|united\s*states)/i.test(t)) {
      const cityMatch = t.match(/(.+?)(?:,\s*)(?:US|USA|United\s*States)/i);
      const city = cityMatch?.[1]?.trim();
      return city && city.length > 1 ? `${city}, United States` : 'United States';
    }

    // UK -> United Kingdom
    if (/(\bUK\b|united\s*kingdom|great\s*britain|england)/i.test(t)) {
      const cityMatch = t.match(/(.+?)(?:,\s*)(?:UK|United\s*Kingdom)/i);
      const city = cityMatch?.[1]?.trim();
      return city && city.length > 1 ? `${city}, United Kingdom` : 'United Kingdom';
    }

    return t;
  };

  // Platform-specific selectors
  const platformSelectors = {
    greenhouse: {
      title: ['h1.app-title', 'h1.posting-headline', 'h1', '[data-test="posting-title"]'],
      company: ['#company-name', '.company-name', '.posting-categories strong', '[data-test="company-name"]', 'a[href*="/jobs"] span'],
      location: ['.location', '.posting-categories .location', '[data-test="location"]'],
      description: ['#content', '.posting', '.posting-description', '[data-test="description"]'],
    },
    workday: {
      title: ['h1[data-automation-id="jobPostingHeader"]', 'h1[data-automation-id="jobPostingTitle"]', 'h1', '[data-automation-id="job-title"]'],
      company: ['div[data-automation-id="jobPostingCompany"]', '[data-automation-id="companyName"]', '.css-1f9qtsv'],
      location: ['div[data-automation-id="locations"]', '[data-automation-id="jobPostingLocation"]', '[data-automation-id="location"]'],
      description: ['div[data-automation-id="jobPostingDescription"]', '[data-automation-id="jobDescription"]', '.jobPostingDescription'],
    },
    smartrecruiters: {
      title: ['h1[data-test="job-title"]', 'h1', '.job-title'],
      company: ['[data-test="job-company-name"]', '[class*="company" i]', '.company-name'],
      location: ['[data-test="job-location"]', '[class*="location" i]', '.job-location'],
      description: ['[data-test="job-description"]', '[class*="job-description" i]', '.job-description'],
    },
    teamtailor: {
      title: ['h1', '[data-qa="job-title"]', '.job-title'],
      company: ['[data-qa="job-company"]', '[class*="company" i]', '.department-name'],
      location: ['[data-qa="job-location"]', '[class*="location" i]', '.location'],
      description: ['[data-qa="job-description"]', 'main', '.job-description'],
    },
    workable: {
      title: ['h1', '[data-ui="job-title"]', '.job-title'],
      company: ['[data-ui="company-name"]', '[class*="company" i]', 'header a'],
      location: ['[data-ui="job-location"]', '[class*="location" i]', '.location'],
      description: ['[data-ui="job-description"]', '[class*="description" i]', 'section'],
    },
    icims: {
      title: ['h1', '.iCIMS_Header', '[class*="header" i] h1', '.job-title'],
      company: ['[class*="company" i]', '.company'],
      location: ['[class*="location" i]', '.location'],
      description: ['#job-content', '[class*="description" i]', 'main', '.job-description'],
    },
    oracle: {
      title: ['h1', '[class*="job-title" i]', '.job-title'],
      company: ['[class*="company" i]', '.company'],
      location: ['[class*="location" i]', '.location'],
      description: ['[class*="description" i]', 'main', '.job-description'],
    },
    bullhorn: {
      title: ['h1', '[class*="job-title" i]', '.job-title'],
      company: ['[class*="company" i]', '.company'],
      location: ['[class*="location" i]', '.location'],
      description: ['[class*="description" i]', 'main', '.job-description'],
    },
  };

  const detectPlatformKey = () => {
    if (hostname.includes('greenhouse.io')) return 'greenhouse';
    if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
    if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
    if (hostname.includes('teamtailor.com')) return 'teamtailor';
    if (hostname.includes('workable.com')) return 'workable';
    if (hostname.includes('icims.com')) return 'icims';
    if (hostname.includes('bullhorn')) return 'bullhorn';
    if (hostname.includes('oracle') || hostname.includes('taleo.net') || hostname.includes('oraclecloud')) return 'oracle';
    return null;
  };

  const platformKey = detectPlatformKey();
  const selectors = platformKey ? platformSelectors[platformKey] : null;

  // Try platform-specific selectors first, then fallback to meta tags and document title
  let title = selectors ? getText(selectors.title) : '';
  if (!title) title = getMeta('og:title') || '';
  if (!title) title = document.title?.split('|')?.[0]?.split('-')?.[0]?.split('at ')?.[0]?.trim() || '';

  if (!title || title.length < 2) return null;

  let company = selectors ? getText(selectors.company) : '';
  if (!company) company = getMeta('og:site_name') || '';

  // Try to extract company from title if format is "Role at Company"
  if (!company && document.title?.includes(' at ')) {
    const parts = document.title.split(' at ');
    if (parts.length > 1) {
      company = parts[parts.length - 1].split('|')[0].split('-')[0].trim();
    }
  }

  const rawLocation = selectors ? getText(selectors.location) : '';
  const location = normalizeLocation(rawLocation);

  // Description: platform selectors first, then meta/LD+JSON/body heuristics.
  let rawDesc = selectors ? getText(selectors.description) : '';

  if (!rawDesc || rawDesc.trim().length < 80) {
    const metaDesc = getMeta('description') || getMeta('og:description') || '';
    if (metaDesc && metaDesc.trim().length >= 80) rawDesc = metaDesc;
  }

  if (!rawDesc || rawDesc.trim().length < 80) {
    // Try JSON-LD jobPosting description
    const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const s of ldScripts) {
      try {
        const json = JSON.parse(s.textContent || '{}');
        const items = Array.isArray(json) ? json : [json];
        for (const it of items) {
          if (it && (it['@type'] === 'JobPosting' || (Array.isArray(it['@type']) && it['@type'].includes('JobPosting')))) {
            const desc = it.description || it.responsibilities || '';
            if (typeof desc === 'string' && desc.trim().length >= 80) {
              rawDesc = desc;
              break;
            }
          }
        }
      } catch {
        // ignore
      }
      if (rawDesc && rawDesc.trim().length >= 80) break;
    }
  }

  if (!rawDesc || rawDesc.trim().length < 80) {
    // Last resort: pull from main/article/role=main
    const mainEl = document.querySelector('main, article, [role="main"], #content');
    const txt = mainEl?.textContent?.trim() || '';
    if (txt.length >= 120) rawDesc = txt;
  }

  const description = rawDesc?.trim()?.length >= 80 ? rawDesc.trim().substring(0, 5000) : '';

  return {
    title: title.substring(0, 200),
    company: company.substring(0, 100),
    location: location.substring(0, 100),
    description,
    url: window.location.href,
    platform: platformKey || hostname.replace('www.', '').split('.')[0],
  };
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new ATSTailor();
});
