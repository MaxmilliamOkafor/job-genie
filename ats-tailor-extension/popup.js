// ATS Tailored CV & Cover Letter - Popup Script
// Streamlined for speed - only tailoring, no autofill

class ATSTailor {
  constructor() {
    this.supabaseUrl = '';
    this.supabaseKey = '';
    this.currentJob = null;
    this.generatedDocuments = {
      cv: null,
      coverLetter: null
    };
    this.stats = {
      today: 0,
      total: 0,
      avgTime: 0,
      times: []
    };
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
    this.updateUI();
    
    if (this.supabaseUrl && this.supabaseKey) {
      this.detectCurrentJob();
    }
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'ats_supabaseUrl', 
        'ats_supabaseKey', 
        'ats_stats',
        'ats_todayDate'
      ], (result) => {
        this.supabaseUrl = result.ats_supabaseUrl || '';
        this.supabaseKey = result.ats_supabaseKey || '';
        
        // Load stats
        if (result.ats_stats) {
          this.stats = result.ats_stats;
        }
        
        // Reset daily count if new day
        const today = new Date().toDateString();
        if (result.ats_todayDate !== today) {
          this.stats.today = 0;
          chrome.storage.local.set({ ats_todayDate: today });
        }
        
        resolve();
      });
    });
  }

  async saveSettings() {
    await chrome.storage.local.set({
      ats_supabaseUrl: this.supabaseUrl,
      ats_supabaseKey: this.supabaseKey
    });
  }

  async saveStats() {
    await chrome.storage.local.set({
      ats_stats: this.stats,
      ats_todayDate: new Date().toDateString()
    });
  }

  bindEvents() {
    // Setup
    document.getElementById('saveSetup')?.addEventListener('click', () => this.saveSetupAndConnect());
    
    // Main actions
    document.getElementById('tailorBtn')?.addEventListener('click', () => this.tailorDocuments());
    document.getElementById('refreshJob')?.addEventListener('click', () => this.detectCurrentJob());
    
    // Document actions
    document.getElementById('downloadCv')?.addEventListener('click', () => this.downloadDocument('cv'));
    document.getElementById('downloadCover')?.addEventListener('click', () => this.downloadDocument('cover'));
    document.getElementById('attachCv')?.addEventListener('click', () => this.attachDocument('cv'));
    document.getElementById('attachCover')?.addEventListener('click', () => this.attachDocument('cover'));
    document.getElementById('attachBoth')?.addEventListener('click', () => this.attachBothDocuments());
    
    // Settings
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.toggleSettings());
  }

  updateUI() {
    const setupSection = document.getElementById('setupSection');
    const mainSection = document.getElementById('mainSection');
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      setupSection?.classList.remove('hidden');
      mainSection?.classList.add('hidden');
      this.setStatus('Setup Required', 'error');
    } else {
      setupSection?.classList.add('hidden');
      mainSection?.classList.remove('hidden');
      this.setStatus('Ready', 'ready');
    }
    
    // Update stats
    document.getElementById('todayCount').textContent = this.stats.today;
    document.getElementById('totalCount').textContent = this.stats.total;
    document.getElementById('avgTime').textContent = this.stats.avgTime > 0 ? `${Math.round(this.stats.avgTime)}s` : '0s';
  }

  setStatus(text, type = 'ready') {
    const indicator = document.getElementById('statusIndicator');
    const statusText = indicator?.querySelector('.status-text');
    
    if (indicator) {
      indicator.className = `status-indicator ${type}`;
    }
    if (statusText) {
      statusText.textContent = text;
    }
  }

  async saveSetupAndConnect() {
    const urlInput = document.getElementById('supabaseUrl');
    const keyInput = document.getElementById('supabaseKey');
    
    this.supabaseUrl = urlInput?.value?.trim() || '';
    this.supabaseKey = keyInput?.value?.trim() || '';
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      this.showToast('Please fill in all fields', 'error');
      return;
    }
    
    await this.saveSettings();
    this.showToast('Connected successfully!', 'success');
    this.updateUI();
    this.detectCurrentJob();
  }

  async detectCurrentJob() {
    this.setStatus('Scanning...', 'working');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab?.id) {
        throw new Error('No active tab');
      }

      // Inject and execute job detection
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: this.extractJobInfoFromPage
      });

      if (results && results[0]?.result) {
        this.currentJob = results[0].result;
        this.updateJobDisplay();
        this.setStatus('Ready', 'ready');
      } else {
        this.currentJob = null;
        this.updateJobDisplay();
        this.setStatus('No job found', 'error');
      }
    } catch (error) {
      console.error('Job detection error:', error);
      this.currentJob = null;
      this.updateJobDisplay();
      this.setStatus('Detection failed', 'error');
    }
  }

  extractJobInfoFromPage() {
    // Comprehensive job info extraction
    const getText = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
      return '';
    };

    const getJobTitle = () => {
      return getText([
        'h1.t-24', // LinkedIn
        'h1.jobsearch-JobInfoHeader-title', // Indeed
        '[data-test="job-title"]', // Glassdoor
        'h1.app-title', // Greenhouse
        'h1.posting-headline', // Lever
        'h1[data-automation-id="jobPostingTitle"]', // Workday
        'h1.job-title',
        'h1[class*="title"]',
        '.job-title h1',
        'h1'
      ]);
    };

    const getCompany = () => {
      return getText([
        '.jobs-unified-top-card__company-name', // LinkedIn
        'div[data-testid="inlineHeader-companyName"]', // Indeed
        '[data-test="employer-name"]', // Glassdoor
        '.company-name', // Greenhouse
        '.posting-categories .sort-by-time', // Lever
        'div[data-automation-id="companyName"]', // Workday
        '[class*="company"]',
        '.employer-name'
      ]);
    };

    const getLocation = () => {
      return getText([
        '.jobs-unified-top-card__bullet', // LinkedIn
        'div[data-testid="job-location"]', // Indeed
        '[data-test="location"]', // Glassdoor
        '.location', // Greenhouse
        '.posting-categories .location', // Lever
        'div[data-automation-id="locations"]', // Workday
        '[class*="location"]'
      ]);
    };

    const getDescription = () => {
      const selectors = [
        '.jobs-description__content', // LinkedIn
        '#jobDescriptionText', // Indeed
        '[data-test="job-description"]', // Glassdoor
        '#content', // Greenhouse
        '.posting-description', // Lever
        '[data-automation-id="jobPostingDescription"]', // Workday
        '.job-description',
        '[class*="description"]'
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim() && el.textContent.length > 100) {
          return el.textContent.trim().substring(0, 5000);
        }
      }
      return '';
    };

    const title = getJobTitle();
    const company = getCompany();
    const location = getLocation();
    const description = getDescription();

    if (title) {
      return {
        title,
        company,
        location,
        description,
        url: window.location.href,
        platform: window.location.hostname.replace('www.', '').split('.')[0]
      };
    }

    return null;
  }

  updateJobDisplay() {
    const titleEl = document.getElementById('jobTitle');
    const companyEl = document.getElementById('jobCompany');
    const locationEl = document.getElementById('jobLocation');

    if (this.currentJob) {
      titleEl.textContent = this.currentJob.title || 'Unknown Title';
      companyEl.textContent = this.currentJob.company || 'Unknown Company';
      locationEl.textContent = this.currentJob.location || '';
    } else {
      titleEl.textContent = 'No job detected';
      companyEl.textContent = 'Navigate to a job posting';
      locationEl.textContent = '';
    }
  }

  async tailorDocuments() {
    if (!this.currentJob) {
      this.showToast('No job detected. Please navigate to a job posting.', 'error');
      return;
    }

    const startTime = Date.now();
    const btn = document.getElementById('tailorBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    btn.disabled = true;
    progressContainer?.classList.remove('hidden');
    this.setStatus('Tailoring...', 'working');

    const updateProgress = (percent, text) => {
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = text;
    };

    try {
      updateProgress(10, 'Connecting to server...');
      
      // Call the tailor-application edge function
      const response = await fetch(`${this.supabaseUrl}/functions/v1/tailor-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`,
          'apikey': this.supabaseKey
        },
        body: JSON.stringify({
          jobTitle: this.currentJob.title,
          company: this.currentJob.company,
          location: this.currentJob.location,
          jobDescription: this.currentJob.description,
          jobUrl: this.currentJob.url
        })
      });

      updateProgress(50, 'Generating tailored documents...');

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${errorText}`);
      }

      const result = await response.json();
      updateProgress(80, 'Processing results...');

      if (result.error) {
        throw new Error(result.error);
      }

      // Store generated documents
      this.generatedDocuments = {
        cv: result.tailoredResume,
        coverLetter: result.coverLetter,
        cvPdf: result.resumePdf,
        coverPdf: result.coverLetterPdf
      };

      updateProgress(100, 'Complete!');

      // Update stats
      const elapsed = (Date.now() - startTime) / 1000;
      this.stats.today++;
      this.stats.total++;
      this.stats.times.push(elapsed);
      if (this.stats.times.length > 10) this.stats.times.shift();
      this.stats.avgTime = this.stats.times.reduce((a, b) => a + b, 0) / this.stats.times.length;
      await this.saveStats();
      this.updateUI();

      // Show documents section
      document.getElementById('documentsCard')?.classList.remove('hidden');
      this.showToast(`Tailored in ${elapsed.toFixed(1)}s!`, 'success');
      this.setStatus('Complete', 'ready');

    } catch (error) {
      console.error('Tailoring error:', error);
      this.showToast(error.message || 'Failed to tailor documents', 'error');
      this.setStatus('Error', 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        progressContainer?.classList.add('hidden');
      }, 2000);
    }
  }

  downloadDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    
    if (doc) {
      // Download PDF
      const blob = this.base64ToBlob(doc, 'application/pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'cv' 
        ? `${this.currentJob?.company || 'Tailored'}_CV.pdf`
        : `${this.currentJob?.company || 'Tailored'}_Cover_Letter.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded!', 'success');
    } else if (textDoc) {
      // Download as text file if no PDF
      const blob = new Blob([textDoc], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'cv' 
        ? `${this.currentJob?.company || 'Tailored'}_CV.txt`
        : `${this.currentJob?.company || 'Tailored'}_Cover_Letter.txt`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded!', 'success');
    } else {
      this.showToast('No document available', 'error');
    }
  }

  base64ToBlob(base64, type) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type });
  }

  async attachDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    
    if (!doc && !textDoc) {
      this.showToast('No document available', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab?.id) {
        throw new Error('No active tab');
      }

      // Send document to content script for attachment
      await chrome.tabs.sendMessage(tab.id, {
        action: 'attachDocument',
        type: type,
        pdf: doc,
        text: textDoc,
        filename: type === 'cv' 
          ? `${this.currentJob?.company || 'Tailored'}_CV.pdf`
          : `${this.currentJob?.company || 'Tailored'}_Cover_Letter.pdf`
      });

      this.showToast(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached!`, 'success');
    } catch (error) {
      console.error('Attach error:', error);
      // If content script not available, download instead
      this.showToast('Please download and attach manually', 'error');
      this.downloadDocument(type);
    }
  }

  async attachBothDocuments() {
    this.setStatus('Attaching...', 'working');
    await this.attachDocument('cv');
    await new Promise(r => setTimeout(r, 500));
    await this.attachDocument('cover');
    this.setStatus('Ready', 'ready');
  }

  toggleSettings() {
    const setupSection = document.getElementById('setupSection');
    const mainSection = document.getElementById('mainSection');
    
    if (setupSection?.classList.contains('hidden')) {
      setupSection?.classList.remove('hidden');
      mainSection?.classList.add('hidden');
      
      // Prefill current values
      document.getElementById('supabaseUrl').value = this.supabaseUrl;
      document.getElementById('supabaseKey').value = this.supabaseKey;
    } else {
      this.updateUI();
    }
  }

  showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new ATSTailor();
});
