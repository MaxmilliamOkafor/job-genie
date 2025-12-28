// ATS Tailored CV & Cover Letter - Popup Script
// Streamlined for speed - only tailoring, no autofill
// Uses existing QuantumHire account authentication

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

class ATSTailor {
  constructor() {
    this.session = null;
    this.currentJob = null;
    this.generatedDocuments = { cv: null, coverLetter: null };
    this.stats = { today: 0, total: 0, avgTime: 0, times: [] };
    
    this.init();
  }

  async init() {
    await this.loadSession();
    this.bindEvents();
    this.updateUI();
    
    if (this.session) {
      this.detectCurrentJob();
    }
  }

  async loadSession() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ats_session', 'ats_stats', 'ats_todayDate'], (result) => {
        this.session = result.ats_session || null;
        
        if (result.ats_stats) {
          this.stats = result.ats_stats;
        }
        
        const today = new Date().toDateString();
        if (result.ats_todayDate !== today) {
          this.stats.today = 0;
          chrome.storage.local.set({ ats_todayDate: today });
        }
        
        resolve();
      });
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
    document.getElementById('tailorBtn')?.addEventListener('click', () => this.tailorDocuments());
    document.getElementById('refreshJob')?.addEventListener('click', () => this.detectCurrentJob());
    document.getElementById('downloadCv')?.addEventListener('click', () => this.downloadDocument('cv'));
    document.getElementById('downloadCover')?.addEventListener('click', () => this.downloadDocument('cover'));
    document.getElementById('attachCv')?.addEventListener('click', () => this.attachDocument('cv'));
    document.getElementById('attachCover')?.addEventListener('click', () => this.attachDocument('cover'));
    document.getElementById('attachBoth')?.addEventListener('click', () => this.attachBothDocuments());
    
    // Enter key for login
    document.getElementById('password')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.login();
    });
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
  }

  setStatus(text, type = 'ready') {
    const indicator = document.getElementById('statusIndicator');
    const statusText = indicator?.querySelector('.status-text');
    
    if (indicator) indicator.className = `status-indicator ${type}`;
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
      this.detectCurrentJob();
      
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

  async detectCurrentJob() {
    this.setStatus('Scanning...', 'working');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab?.id) throw new Error('No active tab');

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: this.extractJobInfoFromPage
      });

      if (results?.[0]?.result) {
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
    const getText = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return '';
    };

    const getJobTitle = () => getText([
      'h1.t-24', 'h1.jobsearch-JobInfoHeader-title', '[data-test="job-title"]',
      'h1.app-title', 'h1.posting-headline', 'h1[data-automation-id="jobPostingTitle"]',
      'h1.job-title', 'h1[class*="title"]', '.job-title h1', 'h1'
    ]);

    const getCompany = () => getText([
      '.jobs-unified-top-card__company-name', 'div[data-testid="inlineHeader-companyName"]',
      '[data-test="employer-name"]', '.company-name', '.posting-categories .sort-by-time',
      'div[data-automation-id="companyName"]', '[class*="company"]', '.employer-name'
    ]);

    const getLocation = () => getText([
      '.jobs-unified-top-card__bullet', 'div[data-testid="job-location"]',
      '[data-test="location"]', '.location', '.posting-categories .location',
      'div[data-automation-id="locations"]', '[class*="location"]'
    ]);

    const getDescription = () => {
      const selectors = [
        '.jobs-description__content', '#jobDescriptionText', '[data-test="job-description"]',
        '#content', '.posting-description', '[data-automation-id="jobPostingDescription"]',
        '.job-description', '[class*="description"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()?.length > 100) {
          return el.textContent.trim().substring(0, 3000); // Reduced to save tokens
        }
      }
      return '';
    };

    const title = getJobTitle();
    if (title) {
      return {
        title,
        company: getCompany(),
        location: getLocation(),
        description: getDescription(),
        url: window.location.href,
        platform: window.location.hostname.replace('www.', '').split('.')[0]
      };
    }
    return null;
  }

  updateJobDisplay() {
    document.getElementById('jobTitle').textContent = this.currentJob?.title || 'No job detected';
    document.getElementById('jobCompany').textContent = this.currentJob?.company || 'Navigate to a job posting';
    document.getElementById('jobLocation').textContent = this.currentJob?.location || '';
  }

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
    
    btn.disabled = true;
    progressContainer?.classList.remove('hidden');
    this.setStatus('Tailoring...', 'working');

    const updateProgress = (percent, text) => {
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = text;
    };

    try {
      updateProgress(20, 'Generating tailored documents...');
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.session.access_token}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          jobTitle: this.currentJob.title,
          company: this.currentJob.company,
          location: this.currentJob.location,
          jobDescription: this.currentJob.description,
          jobUrl: this.currentJob.url
        })
      });

      updateProgress(70, 'Processing results...');

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Server error');
      }

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      this.generatedDocuments = {
        cv: result.tailoredResume,
        coverLetter: result.coverLetter,
        cvPdf: result.resumePdf,
        coverPdf: result.coverLetterPdf
      };

      updateProgress(100, 'Complete!');

      const elapsed = (Date.now() - startTime) / 1000;
      this.stats.today++;
      this.stats.total++;
      this.stats.times.push(elapsed);
      if (this.stats.times.length > 10) this.stats.times.shift();
      this.stats.avgTime = this.stats.times.reduce((a, b) => a + b, 0) / this.stats.times.length;
      await this.saveStats();
      this.updateUI();

      document.getElementById('documentsCard')?.classList.remove('hidden');
      this.showToast(`Done in ${elapsed.toFixed(1)}s!`, 'success');
      this.setStatus('Complete', 'ready');

    } catch (error) {
      console.error('Tailoring error:', error);
      this.showToast(error.message || 'Failed', 'error');
      this.setStatus('Error', 'error');
    } finally {
      btn.disabled = false;
      setTimeout(() => progressContainer?.classList.add('hidden'), 2000);
    }
  }

  downloadDocument(type) {
    const doc = type === 'cv' ? this.generatedDocuments.cvPdf : this.generatedDocuments.coverPdf;
    const textDoc = type === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    
    if (doc) {
      const blob = this.base64ToBlob(doc, 'application/pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentJob?.company || 'Tailored'}_${type === 'cv' ? 'CV' : 'Cover_Letter'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded!', 'success');
    } else if (textDoc) {
      const blob = new Blob([textDoc], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.currentJob?.company || 'Tailored'}_${type === 'cv' ? 'CV' : 'Cover_Letter'}.txt`;
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
    
    if (!doc && !textDoc) {
      this.showToast('No document available', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');

      await chrome.tabs.sendMessage(tab.id, {
        action: 'attachDocument',
        type,
        pdf: doc,
        text: textDoc,
        filename: `${this.currentJob?.company || 'Tailored'}_${type === 'cv' ? 'CV' : 'Cover_Letter'}.pdf`
      });

      this.showToast(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached!`, 'success');
    } catch (error) {
      this.showToast('Download and attach manually', 'error');
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

  showToast(message, type = 'success') {
    document.querySelector('.toast')?.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => new ATSTailor());
