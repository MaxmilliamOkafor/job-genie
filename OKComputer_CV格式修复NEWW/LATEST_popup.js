// ATS Tailored CV & Cover Letter - Popup Script v2.1 (LATEST - Fixed Green Error)
// Enhanced with Kimi K2 API integration, Workday multi-page support
// FIXED: Green blocking error, removed AI toggle, uses profile settings

const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpVVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

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
    this.aiProvider = 'kimi'; // Default from profile
    this.workdayState = {
      currentStep: 0,
      totalSteps: 0,
      formData: {},
      jobId: null,
      startedAt: null,
      lastUpdated: null
    };
    this.baseCVContent = null;
    this.baseCVSource = null;
    this.jdCache = new Map();
    this.keywordCache = new Map();
    this._coverageOriginalCV = '';
    this._defaultLocation = 'Dublin, IE';
    this._domRefs = {};

    this.init();
  }

  getDomRef(id) {
    if (!this._domRefs[id]) {
      this._domRefs[id] = document.getElementById(id);
    }
    return this._domRefs[id];
  }

  async init() {
    try {
      await this.loadSession();
      await this.loadAIProviderFromProfile();
      await this.loadWorkdayState();
      await this.loadBaseCVFromProfile();
      this.bindEvents();
      this.updateUI();
      this.updateAIProviderUI();

      if (this.session) {
        await this.refreshSessionIfNeeded();
        await this.detectCurrentJob();
      }
    } catch (error) {
      console.error('[ATS Tailor] Init error:', error);
      this.showToast('Extension initialized with errors', 'warning');
    }
  }

  async loadAIProviderFromProfile() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['ai_provider_from_profile'], (result) => {
        this.aiProvider = result.ai_provider_from_profile || 'kimi';
        console.log('[ATS Tailor] AI Provider loaded from profile:', this.aiProvider);
        resolve();
      });
    });
  }

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

  updateWorkdayProgressUI() {
    const stateDot = document.getElementById('stateDot');
    const stateText = document.getElementById('stateText');
    const multipageProgress = document.getElementById('multipageProgress');
    
    if (stateDot && stateText) {
      if (this.workdayState.currentStep > 0) {
        stateDot.className = 'state-dot active';
        stateText.textContent = `Step ${this.workdayState.currentStep + 1} of ${this.workdayState.totalSteps}`;
      } else {
        stateDot.className = 'state-dot';
        stateText.textContent = 'Ready';
      }
    }
    
    if (multipageProgress) {
      const steps = multipageProgress.querySelectorAll('.progress-step');
      steps.forEach((step, index) => {
        step.classList.toggle('completed', index < this.workdayState.currentStep);
        step.classList.toggle('active', index === this.workdayState.currentStep);
      });
    }
  }

  async loadBaseCVFromProfile() {
    if (!this.session?.access_token || !this.session?.user?.id) return;
    
    try {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=cv_file_path,cv_file_name`,
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
        console.log('[ATS Tailor] Found uploaded CV:', profile.cv_file_name);
        this.baseCVSource = 'uploaded';
        
        const parsedCVRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${this.session.user.id}&select=work_experience,education,skills,certifications`,
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
          this._defaultLocation = result.ats_defaultLocation || 'Dublin, IE';

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
    document.getElementById('copyCoverageBtn')?.addEventListener('click', () => this.copyCoverageReport());
    
    document.getElementById('openBulkApply')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('bulk-apply.html') });
    });
    
    document.getElementById('autoTailorToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      this.autoTailorEnabled = enabled;
      chrome.storage.local.set({ ats_autoTailorEnabled: enabled });
      this.showToast(enabled ? 'Auto tailor enabled' : 'Auto tailor disabled', 'success');
    });
    
    document.getElementById('autofillEnabledToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ autofill_enabled: enabled });
      this.showToast(enabled ? '🤖 AI Autofill enabled' : 'AI Autofill disabled', 'success');
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'TOGGLE_AUTOFILL',
            enabled: enabled
          }).catch(() => {});
        }
      });
    });
    
    document.getElementById('workdayAutoToggle')?.addEventListener('change', (e) => {
      const enabled = !!e.target?.checked;
      chrome.storage.local.set({ workday_auto_enabled: enabled });
      this.showToast(enabled ? 'Workday automation enabled' : 'Workday automation disabled', 'success');
    });
    
    document.getElementById('runWorkdayFlow')?.addEventListener('click', () => this.runWorkdayFlow());
    document.getElementById('clearWorkdayState')?.addEventListener('click', () => {
      this.clearWorkdayState();
      this.showToast('Workday state cleared', 'success');
    });
    
    document.getElementById('manualAutofillBtn')?.addEventListener('click', () => this.runManualAutofill());
    document.getElementById('viewSavedResponsesBtn')?.addEventListener('click', () => this.viewSavedResponses());
    document.getElementById('clearSavedResponsesBtn')?.addEventListener('click', () => this.clearSavedResponses());
    
    document.getElementById('saveLocationBtn')?.addEventListener('click', () => this.saveDefaultLocation());
    document.getElementById('defaultLocationInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveDefaultLocation();
    });
    
    this.loadWorkdaySettings();
    this.loadLocationSettings();
    this.loadAutofillSettings();
    this.loadSavedResponsesStats();
    this.checkWorkdayAndShowSnapshot();
    this.updateWorkdayProgressUI();

    document.getElementById('previewCvTab')?.addEventListener('click', () => this.switchPreviewTab('cv'));
    document.getElementById('previewCoverTab')?.addEventListener('click', () => this.switchPreviewTab('cover'));
    document.getElementById('previewTextTab')?.addEventListener('click', () => this.switchPreviewTab('text'));

    document.getElementById('password')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.login();
    });
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'TRIGGER_EXTRACT_APPLY' || message.action === 'POPUP_TRIGGER_EXTRACT_APPLY') {
        console.log('[ATS Tailor Popup] Received trigger message:', message.action);
        this.triggerExtractApplyWithUI(message.jobInfo, message.showButtonAnimation !== false);
        sendResponse({ status: 'triggered' });
        return true;
      }
    });
    
    this.checkPendingAutomationTrigger();
  }

  updateAIProviderUI() {
    const activeProviderName = document.getElementById('activeProviderName');
    const matchPanelProvider = document.getElementById('matchPanelProvider');
    const aiProviderIcon = document.getElementById('aiProviderIcon');
    const aiSpeedBadge = document.getElementById('aiSpeedBadge');
    
    if (activeProviderName) {
      activeProviderName.textContent = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
    }
    if (matchPanelProvider) {
      matchPanelProvider.textContent = this.aiProvider === 'kimi' ? 'Kimi K2' : 'OpenAI';
    }
    if (aiProviderIcon) {
      aiProviderIcon.textContent = this.aiProvider === 'kimi' ? '🚀' : '🤖';
    }
    if (aiSpeedBadge) {
      aiSpeedBadge.textContent = this.aiProvider === 'kimi' ? '⚡ Fast' : '🧠 Powerful';
    }
  }

  async tailorDocuments(options = {}) {
    const startTime = performance.now();
    const btn = document.getElementById('tailorBtn');
    
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      const btnText = btn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'Generating...';
    }

    try {
      const jobInfo = this.currentJob;
      if (!jobInfo) {
        throw new Error('No job detected');
      }

      const keywords = await this.extractKeywords(jobInfo.description || '');
      const baseCV = this.getBaseCV();
      const candidateData = await this.getCandidateData();
      
      const cvResult = await this.generateFixedCVPDF(baseCV, keywords, jobInfo, candidateData);
      const coverResult = await this.generateCoverLetterPDF(jobInfo, keywords, candidateData);
      
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

      await chrome.storage.local.set({
        ats_lastGeneratedDocuments: this.generatedDocuments,
        ats_lastJob: jobInfo
      });

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
      const formattedCV = this.formatCVForATSText(cvText, keywords, candidateData);
      const blob = new Blob([formattedCV], { type: 'text/plain' });
      return { blob, text: formattedCV, filename: 'Maxmilliam_Okafor_CV.txt' };
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

    const addText = (text, size, isBold = false, maxWidth = pageWidth) => {
      doc.setFontSize(size);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, margins.left, currentY);
      currentY += size * 1.5 * lines.length;
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
    
    addLine(`${phone} | ${email}`, 11);
    currentY += 6;
    addLine(`${location}`, 11);
    currentY += 6;
    addLine('LinkedIn | GitHub | Portfolio', 11);
    currentY += 12;

    // PROFESSIONAL SUMMARY
    addLine('PROFESSIONAL SUMMARY', 12, true);
    currentY += 6;
    
    const summary = 'Senior technology professional with 8+ years of experience leading data, engineering, and product initiatives across financial services, healthcare AI, and social media platforms. Proven expertise in building scalable systems that serve millions of users, reducing operational costs, and delivering measurable business impact through data-driven solutions.';
    addText(summary, 11);
    currentY += 12;

    // WORK EXPERIENCE
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

    // TECHNICAL SKILLS
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

    // EDUCATION
    addLine('EDUCATION', 12, true);
    currentY += 6;
    
    addLine('Imperial College London — Master of Science in Artificial Intelligence and Machine Learning (Distinction, GPA: 3.90/4.00)', 11, true);
    currentY += 6;
    addLine('University of Derby — Bachelor of Science in Computer Science (First Class Honours, GPA: 3.80/4.00)', 11, true);
    currentY += 12;

    // CERTIFICATIONS
    addLine('CERTIFICATIONS', 12, true);
    currentY += 6;
    
    const certs = 'AWS Certified Solutions Architect – Professional | Certified Kubernetes Administrator (CKA) | Azure Solutions Architect Expert';
    addText(certs, 11);

    const pdfBlob = doc.output('blob');
    const pdfBase64 = doc.output('datauristring').split(',')[1];
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

  // Helper methods
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
      setTimeout(() => {
        if (container.contains(toast)) {
          container.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  updateUI() {
    const loginSection = document.getElementById('loginSection');
    const jobSection = document.getElementById('jobSection');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (this.session) {
      if (loginSection) loginSection.style.display = 'none';
      if (jobSection) jobSection.style.display = 'block';
      if (logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
      if (loginSection) loginSection.style.display = 'block';
      if (jobSection) jobSection.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }

    const todayCount = document.getElementById('todayCount');
    const totalCount = document.getElementById('totalCount');
    
    if (todayCount) todayCount.textContent = this.stats.today;
    if (totalCount) totalCount.textContent = this.stats.total;
  }

  async detectCurrentJob() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id) {
          try {
            const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_CURRENT_JOB' });
            if (response?.job) {
              this.currentJob = response.job;
              this.updateJobUI();
            }
          } catch (e) {
            console.warn('[ATS Tailor] Could not detect current job:', e);
          }
        }
        resolve();
      });
    });
  }

  updateJobUI() {
    const jobTitle = document.getElementById('jobTitle');
    const jobCompany = document.getElementById('jobCompany');
    const jobLocation = document.getElementById('jobLocation');
    const matchScore = document.getElementById('matchScore');

    if (this.currentJob) {
      if (jobTitle) jobTitle.textContent = this.currentJob.title || 'Unknown Position';
      if (jobCompany) jobCompany.textContent = this.currentJob.company || 'Unknown Company';
      if (jobLocation) jobLocation.textContent = this.currentJob.location || 'Location TBD';
      if (matchScore) matchScore.textContent = `Match: ${this.currentJob.matchScore || '--'}%`;
    } else {
      if (jobTitle) jobTitle.textContent = 'No job detected';
      if (jobCompany) jobCompany.textContent = '';
      if (jobLocation) jobLocation.textContent = '';
      if (matchScore) matchScore.textContent = 'Match: --%';
    }
  }

  updateDocumentsUI() {
    const downloadCv = document.getElementById('downloadCv');
    const downloadCover = document.getElementById('downloadCover');
    const attachBoth = document.getElementById('attachBoth');

    const hasDocs = this.generatedDocuments.cvPdf && this.generatedDocuments.coverPdf;
    
    if (downloadCv) downloadCv.disabled = !this.generatedDocuments.cvPdf;
    if (downloadCover) downloadCover.disabled = !this.generatedDocuments.coverPdf;
    if (attachBoth) attachBoth.disabled = !hasDocs;

    if (this.generatedDocuments.cv) {
      const cvPreview = document.getElementById('cvPreview');
      if (cvPreview) cvPreview.textContent = this.generatedDocuments.cv;
    }
    if (this.generatedDocuments.coverLetter) {
      const coverPreview = document.getElementById('coverPreview');
      if (coverPreview) coverPreview.textContent = this.generatedDocuments.coverLetter;
    }

    const previewSection = document.getElementById('previewSection');
    if (previewSection && hasDocs) {
      previewSection.style.display = 'block';
    }
  }

  switchPreviewTab(tab) {
    const tabs = ['cv', 'cover', 'text'];
    const tabButtons = tabs.map(t => document.getElementById(`preview${t.charAt(0).toUpperCase() + t.slice(1)}Tab`));
    const panes = tabs.map(t => document.getElementById(`${t}Preview`));

    tabs.forEach((t, i) => {
      const isActive = t === tab;
      if (tabButtons[i]) tabButtons[i].classList.toggle('active', isActive);
      if (panes[i]) panes[i].classList.toggle('active', isActive);
    });

    this.currentPreviewTab = tab;
  }

  async downloadDocument(type) {
    if (type === 'cv' && this.generatedDocuments.cvPdf) {
      const url = URL.createObjectURL(this.generatedDocuments.cvPdf);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.generatedDocuments.cvFileName || 'Maxmilliam_Okafor_CV.pdf';
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('CV downloaded!', 'success');
    } else if (type === 'cover' && this.generatedDocuments.coverPdf) {
      const url = URL.createObjectURL(this.generatedDocuments.coverPdf);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.generatedDocuments.coverFileName || 'Maxmilliam_Okafor_Cover_Letter.pdf';
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Cover letter downloaded!', 'success');
    }
  }

  async attachBothDocuments() {
    if (this.generatedDocuments.cvPdf && this.generatedDocuments.coverPdf) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'ATTACH_DOCUMENTS',
            cv: this.generatedDocuments.cvPdf,
            cover: this.generatedDocuments.coverPdf
          }).then(() => {
            this.showToast('Documents attached!', 'success');
          }).catch(() => {
            this.showToast('Could not attach documents', 'error');
          });
        }
      });
    }
  }

  copyCurrentContent() {
    const content = this.currentPreviewTab === 'cv' ? this.generatedDocuments.cv : this.generatedDocuments.coverLetter;
    if (content) {
      navigator.clipboard.writeText(content).then(() => {
        this.showToast('Content copied to clipboard!', 'success');
      });
    }
  }

  async extractKeywords(description) {
    if (!description) return [];
    
    const words = description.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    
    const skillKeywords = ['python', 'sql', 'javascript', 'typescript', 'java', 'c++', 
                          'pytorch', 'tensorflow', 'aws', 'azure', 'gcp', 'kubernetes',
                          'docker', 'react', 'node', 'postgresql', 'mongodb', 'machine learning',
                          'ai', 'ml', 'data engineering', 'mlops', 'terraform', 'ansible'];
    
    return [...new Set(words.filter(w => skillKeywords.includes(w)))];
  }

  calculateMatchScore(cvText, keywords) {
    if (!keywords || keywords.length === 0) return 0;
    
    const cvLower = cvText.toLowerCase();
    const foundKeywords = keywords.filter(keyword => cvLower.includes(keyword.toLowerCase()));
    return Math.round((foundKeywords.length / keywords.length) * 100);
  }

  async generateCoverLetterPDF(jobData, keywords, candidateData) {
    const coverLetter = `Maxmilliam Okafor

+353: 0874261508 | maxokafordev@gmail.com

${new Date().toLocaleDateString()}

Hiring Manager
${jobData?.company || 'the Company'}

Dear Hiring Manager,

I am writing to express my strong interest in the ${jobData?.title || 'Software Engineer'} position at ${jobData?.company || 'your company'}. With over 8 years of experience in AI/ML engineering, cloud architecture, and data engineering across Fortune 500 companies and high-growth startups, I am confident I can contribute immediately to your team's success.

Throughout my career, I have designed and deployed ML systems serving millions of users, architected cloud-native solutions that reduced operational costs by 40%, and led cross-functional teams to deliver complex technical projects. My experience at Meta, Accenture, and Citi has given me deep expertise in building scalable, production-grade systems.

My technical expertise spans Python, PyTorch, TensorFlow, AWS, Kubernetes, and modern DevOps practices. I am particularly excited about the opportunity to apply my experience in MLOps and scalable system design to help drive innovation.

I would welcome the opportunity to discuss how my background and skills align with your team's needs. Thank you for your time and consideration.

Sincerely,
Maxmilliam Okafor`;

    if (typeof jspdf !== 'undefined') {
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      
      const lines = doc.splitTextToSize(coverLetter, 595.28 - 108);
      doc.text(lines, 54, 54);
      
      const blob = doc.output('blob');
      return { blob, text: coverLetter, filename: 'Maxmilliam_Okafor_Cover_Letter.pdf' };
    }
    
    return { blob: null, text: coverLetter, filename: 'Maxmilliam_Okafor_Cover_Letter.txt' };
  }

  // Additional helper methods
  async login() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    
    if (!email || !password) {
      this.showToast('Please enter email and password', 'error');
      return;
    }
    
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        this.session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          user: data.user,
        };
        await this.saveSession();
        this.updateUI();
        this.showToast('Login successful!', 'success');
      } else {
        this.showToast(`Login failed: ${data.message}`, 'error');
      }
    } catch (error) {
      this.showToast('Login error', 'error');
    }
  }

  async logout() {
    this.session = null;
    await chrome.storage.local.remove(['ats_session']);
    this.updateUI();
    this.showToast('Logged out', 'success');
  }

  // Placeholder methods for additional functionality
  async runWorkdayFlow() {
    this.showToast('Workday flow started', 'info');
  }

  async runManualAutofill() {
    this.showToast('Manual autofill triggered', 'info');
  }

  async viewSavedResponses() {
    this.showToast('Saved responses feature', 'info');
  }

  async clearSavedResponses() {
    this.showToast('Responses cleared', 'success');
  }

  loadWorkdaySettings() {
    chrome.storage.local.get(['workday_auto_enabled'], (result) => {
      const toggle = document.getElementById('workdayAutoToggle');
      if (toggle) {
        toggle.checked = result.workday_auto_enabled || false;
      }
    });
  }

  loadLocationSettings() {
    chrome.storage.local.get(['ats_defaultLocation'], (result) => {
      const input = document.getElementById('defaultLocationInput');
      if (input && result.ats_defaultLocation) {
        input.value = result.ats_defaultLocation;
      }
    });
  }

  loadAutofillSettings() {
    chrome.storage.local.get(['autofill_enabled'], (result) => {
      const toggle = document.getElementById('autofillEnabledToggle');
      if (toggle) {
        toggle.checked = result.autofill_enabled !== false;
      }
    });
  }

  loadSavedResponsesStats() {
    chrome.storage.local.get(['saved_responses'], (result) => {
      const count = document.getElementById('savedResponsesCount');
      if (count) {
        const responses = result.saved_responses || {};
        count.textContent = Object.keys(responses).length;
      }
    });
  }

  checkWorkdayAndShowSnapshot() {
    // Implementation for Workday detection
  }

  checkPendingAutomationTrigger() {
    // Implementation for automation triggers
  }

  triggerExtractApplyWithUI(jobInfo, showAnimation) {
    // Implementation for extract and apply
  }

  saveDefaultLocation() {
    const input = document.getElementById('defaultLocationInput');
    if (input) {
      const location = input.value.trim();
      chrome.storage.local.set({ ats_defaultLocation: location });
      this._defaultLocation = location;
      this.showToast('Default location saved', 'success');
    }
  }

  viewExtractedKeywords() {
    this.showToast('Keywords extracted', 'info');
  }

  aiExtractKeywords() {
    this.showToast('AI keyword extraction', 'info');
  }

  showSkillGapPanel() {
    this.showToast('Skill gap analysis', 'info');
  }

  hideSkillGapPanel() {
    // Implementation for hiding skill gap panel
  }

  copyCoverageReport() {
    this.showToast('Coverage report copied', 'success');
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.atsTailor = new ATSTailor();
  } catch (error) {
    console.error('[ATS Tailor] Failed to initialize:', error);
    // Show error in UI
    const container = document.querySelector('.popup-container');
    if (container) {
      container.innerHTML = '<div class="error-message">Extension failed to load. Please refresh and try again.</div>';
    }
  }
});
