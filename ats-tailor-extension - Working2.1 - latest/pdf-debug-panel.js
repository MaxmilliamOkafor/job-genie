// PDF Generation Debug Panel - Comprehensive debugging for PDF generation process
// Tracks every step from input data to final PDF output

(function() {
  'use strict';

  const PDFDebugPanel = {
    // Debug state
    _debugData: {
      status: 'idle',
      generator: null,
      startTime: null,
      endTime: null,
      inputData: {},
      parsedSections: {},
      professionalExp: [],
      outputData: {},
      errors: [],
      warnings: []
    },

    // Initialize debug panel
    init() {
      this.bindEvents();
      console.log('[PDFDebugPanel] Initialized');
    },

    bindEvents() {
      // Use event delegation or ensure elements exist
      const copyBtn = document.getElementById('copyDebugData');
      const clearBtn = document.getElementById('clearDebugLog');
      const testBtn = document.getElementById('testPdfDownload');
      
      if (copyBtn) copyBtn.addEventListener('click', () => this.copyDebugData());
      if (clearBtn) clearBtn.addEventListener('click', () => this.clearDebugLog());
      if (testBtn) testBtn.addEventListener('click', () => this.testPdfDownload());
      
      console.log('[PDFDebugPanel] Events bound:', { copyBtn: !!copyBtn, clearBtn: !!clearBtn, testBtn: !!testBtn });
    },

    // Reset debug data for new generation
    reset() {
      this._debugData = {
        status: 'idle',
        generator: null,
        startTime: null,
        endTime: null,
        inputData: {},
        parsedSections: {},
        professionalExp: [],
        outputData: {},
        errors: [],
        warnings: []
      };
      this.updateUI();
    },

    // Log generation start
    logStart(generator) {
      this._debugData.status = 'generating';
      this._debugData.generator = generator;
      this._debugData.startTime = performance.now();
      this._debugData.errors = [];
      this._debugData.warnings = [];
      this.updateBadge('Generating...', 'working');
      this.updateUI();
    },

    // Log input data
    logInputData(candidateData, cvText) {
      const exp = candidateData?.professionalExperience || candidateData?.professional_experience || [];
      const projects = candidateData?.relevantProjects || candidateData?.relevant_projects || [];
      
      this._debugData.inputData = {
        candidateName: `${candidateData?.firstName || candidateData?.first_name || ''} ${candidateData?.lastName || candidateData?.last_name || ''}`.trim() || 'Unknown',
        expCount: Array.isArray(exp) ? exp.length : 0,
        projectsCount: Array.isArray(projects) ? projects.length : 0,
        eduCount: Array.isArray(candidateData?.education) ? candidateData.education.length : 0,
        skillsCount: Array.isArray(candidateData?.skills) ? candidateData.skills.length : 0,
        cvTextLength: cvText?.length || 0
      };
      
      // Store professional experience details for debugging
      this._debugData.professionalExp = (Array.isArray(exp) ? exp : []).map((job, idx) => ({
        index: idx + 1,
        title: job?.title || job?.jobTitle || 'Unknown Title',
        company: job?.company || job?.companyName || 'Unknown Company',
        dates: `${job?.startDate || job?.start_date || '?'} - ${job?.endDate || job?.end_date || 'Present'}`,
        bulletCount: Array.isArray(job?.bullets || job?.description) ? 
          (Array.isArray(job.bullets) ? job.bullets.length : 1) : 0
      }));
      
      this.updateUI();
    },

    // Log parsed sections
    logParsedSections(sections) {
      this._debugData.parsedSections = {
        summaryLen: sections?.summary?.length || 0,
        expLen: sections?.experience?.length || 0,
        eduLen: sections?.education?.length || 0,
        skillsLen: sections?.skills?.length || 0,
        certsLen: sections?.certifications?.length || 0
      };
      
      // Parse experience entries from text if available
      if (sections?.experience && typeof sections.experience === 'string') {
        const expLines = sections.experience.split('\n').filter(l => l.includes('|'));
        this._debugData.parsedSections.expEntries = expLines.length;
      }
      
      this.updateUI();
    },

    // Log output data (SINGLE unified method)
    logOutputData(outputData) {
      if (typeof outputData === 'object' && !Array.isArray(outputData)) {
        // New signature: single object
        this._debugData.outputData = {
          cvPdfLen: outputData.cvBase64Length ? `${Math.round(outputData.cvBase64Length * 0.75 / 1024)} KB` : 'None',
          coverPdfLen: outputData.coverBase64Length ? `${Math.round(outputData.coverBase64Length * 0.75 / 1024)} KB` : 'None',
          cvFileName: outputData.cvFilename || 'Not set',
          coverFileName: outputData.coverFilename || 'Not set'
        };
      } else {
        // Legacy signature: individual params (cvPdf, coverPdf, cvFileName, coverFileName)
        const cvPdf = arguments[0];
        const coverPdf = arguments[1];
        const cvFileName = arguments[2];
        const coverFileName = arguments[3];
        this._debugData.outputData = {
          cvPdfLen: cvPdf ? `${Math.round(cvPdf.length * 0.75 / 1024)} KB` : 'None',
          coverPdfLen: coverPdf ? `${Math.round(coverPdf.length * 0.75 / 1024)} KB` : 'None',
          cvFileName: cvFileName || 'Not set',
          coverFileName: coverFileName || 'Not set'
        };
      }
      this.updateUI();
    },

    // Log completion (SINGLE unified method)
    logComplete(success = true) {
      this._debugData.endTime = performance.now();
      this._debugData.status = success ? 'complete' : 'error';
      const duration = Math.round(this._debugData.endTime - this._debugData.startTime);
      this._debugData.generationTime = `${duration}ms`;
      this.updateBadge(success ? `Done (${duration}ms)` : 'Error', success ? 'success' : 'error');
      this.updateUI();
    },

    // Log error
    logError(error, context = '') {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        context,
        message: error?.message || String(error),
        stack: error?.stack?.split('\n').slice(0, 3).join('\n') || ''
      };
      this._debugData.errors.push(errorEntry);
      this.updateErrorLog();
    },

    // Log warning
    logWarning(warning, context = '') {
      this._debugData.warnings.push({
        timestamp: new Date().toISOString(),
        context,
        message: warning
      });
      this.updateErrorLog();
    },

    // Update badge status
    updateBadge(text, type) {
      const badge = document.getElementById('pdfDebugBadge');
      if (badge) {
        badge.textContent = text;
        badge.className = `debug-badge ${type}`;
      }
    },

    // Update all UI elements
    updateUI() {
      const data = this._debugData;
      
      // Status
      this.setDebugValue('pdfGenStatus', data.status);
      this.setDebugValue('pdfGenGenerator', data.generator || '—');
      this.setDebugValue('pdfGenTime', data.generationTime || '—');
      this.setDebugValue('pdfGenSize', data.outputData?.cvPdfLen || '—');
      
      // Input data
      this.setDebugValue('debugCandidateName', data.inputData?.candidateName || '—');
      this.setDebugValue('debugExpCount', data.inputData?.expCount ?? '—');
      this.setDebugValue('debugEduCount', data.inputData?.eduCount ?? '—');
      this.setDebugValue('debugSkillsCount', data.inputData?.skillsCount ?? '—');
      this.setDebugValue('debugCVLength', data.inputData?.cvTextLength ? 
        `${data.inputData.cvTextLength} chars` : '—');
      
      // Parsed sections
      this.setDebugValue('debugSummaryLen', data.parsedSections?.summaryLen ? 
        `${data.parsedSections.summaryLen} chars` : '—');
      this.setDebugValue('debugExpLen', data.parsedSections?.expLen ? 
        `${data.parsedSections.expLen} chars (${data.parsedSections.expEntries || '?'} entries)` : '—');
      this.setDebugValue('debugEduLen', data.parsedSections?.eduLen ? 
        `${data.parsedSections.eduLen} chars` : '—');
      this.setDebugValue('debugSkillsLen', data.parsedSections?.skillsLen ? 
        `${data.parsedSections.skillsLen} chars` : '—');
      this.setDebugValue('debugCertsLen', data.parsedSections?.certsLen ? 
        `${data.parsedSections.certsLen} chars` : '—');
      
      // Professional Experience list
      this.updateExpList();
      
      // Output data
      this.setDebugValue('debugCVPdfLen', data.outputData?.cvPdfLen || '—');
      this.setDebugValue('debugCoverPdfLen', data.outputData?.coverPdfLen || '—');
      this.setDebugValue('debugCVFilename', data.outputData?.cvFileName || '—');
      this.setDebugValue('debugCoverFilename', data.outputData?.coverFileName || '—');
    },

    setDebugValue(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    },

    updateExpList() {
      const list = document.getElementById('debugExpList');
      if (!list) return;
      
      const exp = this._debugData.professionalExp;
      if (!exp || exp.length === 0) {
        list.innerHTML = '<p class="debug-empty">No professional experience data</p>';
        return;
      }
      
      list.innerHTML = exp.map(job => `
        <div class="debug-exp-item">
          <div class="debug-exp-header">
            <span class="debug-exp-num">#${job.index}</span>
            <span class="debug-exp-title">${this.escapeHtml(job.title)}</span>
          </div>
          <div class="debug-exp-meta">
            <span class="debug-exp-company">${this.escapeHtml(job.company)}</span>
            <span class="debug-exp-dates">${this.escapeHtml(job.dates)}</span>
          </div>
          <div class="debug-exp-bullets">${job.bulletCount} bullets</div>
        </div>
      `).join('');
    },

    updateErrorLog() {
      const log = document.getElementById('debugErrorLog');
      if (!log) return;
      
      const errors = this._debugData.errors;
      const warnings = this._debugData.warnings;
      
      if (errors.length === 0 && warnings.length === 0) {
        log.innerHTML = '<p class="debug-empty">No errors or warnings</p>';
        return;
      }
      
      const html = [
        ...errors.map(e => `
          <div class="debug-log-entry error">
            <span class="log-icon">X</span>
            <div class="log-content">
              <div class="log-context">${this.escapeHtml(e.context)}</div>
              <div class="log-message">${this.escapeHtml(e.message)}</div>
            </div>
          </div>
        `),
        ...warnings.map(w => `
          <div class="debug-log-entry warning">
            <span class="log-icon">!</span>
            <div class="log-content">
              <div class="log-context">${this.escapeHtml(w.context)}</div>
              <div class="log-message">${this.escapeHtml(w.message)}</div>
            </div>
          </div>
        `)
      ].join('');
      
      log.innerHTML = html;
    },

    escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    // Copy full debug data to clipboard
    async copyDebugData() {
      try {
        const data = JSON.stringify(this._debugData, null, 2);
        await navigator.clipboard.writeText(data);
        this.showToast('Debug data copied!', 'success');
      } catch (e) {
        console.error('[PDFDebugPanel] Copy failed:', e);
        this.showToast('Failed to copy', 'error');
      }
    },

    clearDebugLog() {
      this._debugData.errors = [];
      this._debugData.warnings = [];
      this.updateErrorLog();
      this.showToast('Debug log cleared', 'success');
    },

    // Test PDF download flow
    async testPdfDownload() {
      try {
        const atsTailor = window.atsTailorInstance;
        if (!atsTailor?.generatedDocuments?.cvPdf) {
          this.showToast('No PDF generated yet - run tailoring first', 'error');
          return;
        }
        
        this.logStart('Test Download');
        
        // Get the stored PDF
        const cvPdf = atsTailor.generatedDocuments.cvPdf;
        const fileName = atsTailor.generatedDocuments.cvFileName || 'Test_CV.pdf';
        
        // Validate base64
        if (!cvPdf || cvPdf.length < 100) {
          this.logError(new Error('PDF base64 is empty or too short'), 'Validation');
          this.logComplete(false);
          return;
        }
        
        this.logWarning(`Testing download of ${Math.round(cvPdf.length * 0.75 / 1024)} KB PDF`, 'Test');
        
        // Attempt download
        const byteCharacters = atob(cvPdf);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TEST_${fileName}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.logComplete(true);
        this.showToast('Test download initiated', 'success');
        
      } catch (e) {
        this.logError(e, 'Test Download');
        this.logComplete(false);
        this.showToast(`Test failed: ${e.message}`, 'error');
      }
    },

    showToast(message, type) {
      // Use ATSTailor's toast if available
      if (window.atsTailorInstance?.showToast) {
        window.atsTailorInstance.showToast(message, type);
      } else {
        console.log(`[PDFDebug] ${type}: ${message}`);
      }
    },

    // Update Parse CV Debug panel
    updateParseCVDebug(data) {
      this.setDebugValue('parseCVStatus', data.status || 'Idle');
      this.setDebugValue('parsedCVFileType', data.fileType || '—');
      this.setDebugValue('parsedCVFileSize', data.fileSize || '—');
      this.setDebugValue('parsedCVTextLength', data.textLength ? `${data.textLength} chars` : '—');
      this.setDebugValue('parsedCVTime', data.parseTime || '—');
      
      const snippetEl = document.getElementById('parsedCVSnippet');
      if (snippetEl) {
        if (data.textSnippet) {
          snippetEl.innerHTML = `<pre class="debug-snippet-text">${this.escapeHtml(data.textSnippet.substring(0, 500))}</pre>`;
        } else {
          snippetEl.innerHTML = '<p class="debug-empty">No CV parsed yet</p>';
        }
      }
      
      // Update badge
      const badge = document.getElementById('parseCVStatus');
      if (badge) {
        badge.textContent = data.status || 'Idle';
        badge.className = `debug-badge ${data.status === 'Parsed' ? 'success' : ''}`;
      }
    }
  };

  // Export globally
  window.PDFDebugPanel = PDFDebugPanel;
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PDFDebugPanel.init());
  } else {
    PDFDebugPanel.init();
  }
})();
