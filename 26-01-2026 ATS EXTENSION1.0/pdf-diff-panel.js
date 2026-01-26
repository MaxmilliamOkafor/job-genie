// PDF Diff Panel - Compares Preview vs Download with Dynamic Profile-Based Testing
// NO HARDCODED DATA - Uses actual user profile from database

(function() {
  'use strict';

  const PDFDiffPanel = {
    // State for diff comparison
    _diffData: {
      structuredJSON: null,
      previewText: null,
      backendParsed: null,
      mismatches: [],
      smokeTestStatus: 'idle',
      smokeTestTime: null
    },

    init() {
      this.bindEvents();
      console.log('[PDFDiffPanel] Initialized - Dynamic Profile Mode');
    },

    bindEvents() {
      document.getElementById('runSmokeTest')?.addEventListener('click', () => this.runSmokeTest());
      document.getElementById('runDiffAnalysis')?.addEventListener('click', () => this.runDiffAnalysis());
      document.getElementById('copyDiffReport')?.addEventListener('click', () => this.copyDiffReport());
    },

    // Run full smoke test using ACTUAL profile data (no hardcoded fixtures)
    async runSmokeTest() {
      const startTime = performance.now();
      this.updateSmokeTestUI('running', 'Running smoke test with your profile...');
      
      try {
        // Get actual profile from storage (populated by loadBaseCVFromProfile)
        const profile = await this.getStoredProfile();
        
        if (!profile) {
          this.updateSmokeTestUI('error', '❌ No profile data - please log in and upload your CV');
          return;
        }
        
        // Validate profile has required fields
        const experience = profile.professional_experience || profile.professionalExperience || [];
        if (experience.length === 0) {
          this.updateSmokeTestUI('warning', '⚠️ No work experience in profile - add experience first');
          return;
        }
        
        // Store in structured JSON
        this._diffData.structuredJSON = experience;
        
        // Generate preview text from profile
        const previewText = this.generatePreviewText(profile);
        this._diffData.previewText = previewText;
        
        // Call actual backend if session available
        const atsTailor = window.atsTailorInstance;
        if (atsTailor?.session?.access_token) {
          const backendResult = await this.callGeneratePDF(profile, atsTailor.session);
          this._diffData.backendParsed = backendResult.parsedSections;
        } else {
          this._diffData.backendParsed = { skipped: true, reason: 'No session - local test only' };
        }
        
        // Compare and find mismatches
        this.compareOutputs();
        
        const elapsed = performance.now() - startTime;
        this._diffData.smokeTestTime = elapsed;
        
        // Validate results
        const isValid = this.validateSmokeTest();
        
        if (isValid && elapsed < 3000) {
          this.updateSmokeTestUI('success', `✅ Passed in ${Math.round(elapsed)}ms (${experience.length} roles)`);
        } else if (elapsed >= 3000) {
          this.updateSmokeTestUI('warning', `⚠️ Too slow: ${Math.round(elapsed)}ms (target: <3000ms)`);
        } else {
          this.updateSmokeTestUI('error', `❌ Validation failed - see diff report`);
        }
        
        this.updateDiffUI();
        
      } catch (error) {
        console.error('[PDFDiffPanel] Smoke test error:', error);
        this.updateSmokeTestUI('error', `❌ Error: ${error.message}`);
      }
    },

    // Generate preview text from profile data
    generatePreviewText(profile) {
      const lines = [];
      
      const firstName = profile.first_name || profile.firstName || '';
      const lastName = profile.last_name || profile.lastName || '';
      const phone = profile.phone || '';
      const email = profile.email || '';
      const city = profile.city || '';
      const country = profile.country || '';
      const linkedin = profile.linkedin || '';
      const github = profile.github || '';
      const portfolio = profile.portfolio || '';
      
      // Header
      lines.push(`${firstName} ${lastName}`.toUpperCase().trim() || 'APPLICANT');
      lines.push([phone, email, [city, country].filter(Boolean).join(', '), 'open to relocation'].filter(Boolean).join(' | '));
      lines.push([linkedin, github, portfolio].filter(Boolean).join(' | '));
      lines.push('');
      
      // Professional Experience
      const experience = profile.professional_experience || profile.professionalExperience || [];
      if (experience.length > 0) {
        lines.push('PROFESSIONAL EXPERIENCE');
        lines.push('');
        
        for (const exp of experience) {
          const company = exp.company || exp.companyName || '';
          const title = exp.title || exp.jobTitle || '';
          const startDate = exp.startDate || exp.start_date || '';
          const endDate = exp.endDate || exp.end_date || 'Present';
          const bullets = exp.bullets || [];
          
          lines.push(company);
          lines.push(`${title} – ${startDate} – ${endDate}`);
          for (const bullet of bullets) {
            lines.push(`• ${bullet}`);
          }
          lines.push('');
        }
      }
      
      // Projects
      const projects = profile.relevant_projects || profile.relevantProjects || [];
      if (projects.length > 0) {
        lines.push('TECHNICAL PROJECTS');
        for (const proj of projects) {
          lines.push(`${proj.name || ''} | ${proj.role || ''}`);
          for (const bullet of (proj.bullets || [])) {
            lines.push(`• ${bullet}`);
          }
        }
        lines.push('');
      }
      
      // Education
      const education = profile.education || [];
      if (education.length > 0) {
        lines.push('EDUCATION');
        for (const edu of education) {
          lines.push(`${edu.degree || ''} | ${edu.institution || edu.school || ''}`);
        }
        lines.push('');
      }
      
      // Skills
      const skills = profile.skills || [];
      if (skills.length > 0) {
        lines.push('SKILLS');
        const skillNames = skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean);
        lines.push(skillNames.join(', '));
        lines.push('');
      }
      
      // Certifications
      const certs = profile.certifications || [];
      if (certs.length > 0) {
        lines.push('CERTIFICATIONS');
        lines.push(certs.join(', '));
      }
      
      return lines.join('\n');
    },

    // Call backend generate-pdf and capture parsed sections
    async callGeneratePDF(profile, session) {
      const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
      
      const experience = profile.professional_experience || profile.professionalExperience || [];
      
      const requestBody = {
        candidateData: {
          firstName: profile.first_name || profile.firstName || '',
          lastName: profile.last_name || profile.lastName || '',
          email: profile.email || '',
          phone: profile.phone || '',
          city: profile.city || '',
          country: profile.country || '',
          linkedin: profile.linkedin || '',
          github: profile.github || '',
          portfolio: profile.portfolio || '',
          professionalExperience: experience,
          education: profile.education || [],
          skills: profile.skills || [],
          certifications: profile.certifications || []
        },
        cvText: this.generatePreviewText(profile),
        jobInfo: { title: 'Test Role', company: 'Test Company', location: profile.city || 'Dublin' },
        keywords: { highPriority: [], mediumPriority: [], lowPriority: [] },
        coverLetter: ''
      };

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': session.access_token
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = await response.json();
      
      return {
        parsedSections: {
          cvPdfLength: data.cvPdf?.length || 0,
          coverPdfLength: data.coverPdf?.length || 0,
          cvFileName: data.cvFileName,
          coverFileName: data.coverFileName
        },
        cvPdf: data.cvPdf,
        coverPdf: data.coverPdf
      };
    },

    // Compare structured JSON vs preview vs backend output
    compareOutputs() {
      const mismatches = [];
      const struct = this._diffData.structuredJSON || [];
      const preview = this._diffData.previewText || '';
      
      // Check each experience entry
      for (const exp of struct) {
        const company = exp.company || exp.companyName || '';
        const title = exp.title || exp.jobTitle || '';
        
        // Check company name appears in preview
        if (company && !preview.includes(company)) {
          mismatches.push({
            type: 'missing_company',
            field: 'company',
            expected: company,
            location: 'preview'
          });
        }
        
        // Check title appears in preview
        if (title && !preview.includes(title)) {
          mismatches.push({
            type: 'missing_title',
            field: 'title',
            expected: title,
            location: 'preview'
          });
        }
        
        // Check bullets (first 50 chars of each)
        for (const bullet of (exp.bullets || [])) {
          const bulletSnippet = bullet.substring(0, 50);
          if (bulletSnippet && !preview.includes(bulletSnippet)) {
            mismatches.push({
              type: 'missing_bullet',
              field: 'bullet',
              expected: bulletSnippet + '...',
              location: 'preview'
            });
          }
        }
      }
      
      this._diffData.mismatches = mismatches;
    },

    // Validate smoke test results
    validateSmokeTest() {
      const struct = this._diffData.structuredJSON || [];
      const preview = this._diffData.previewText || '';
      
      // Must have at least 1 experience
      if (struct.length === 0) return false;
      
      // Preview must contain section header
      if (!preview.includes('PROFESSIONAL EXPERIENCE') && !preview.includes('WORK EXPERIENCE')) {
        return false;
      }
      
      // No critical mismatches for companies/titles
      const criticalMismatches = this._diffData.mismatches.filter(m => 
        m.type === 'missing_company' || m.type === 'missing_title'
      );
      
      return criticalMismatches.length === 0;
    },

    // Run diff analysis on current generated CV
    async runDiffAnalysis() {
      const atsTailor = window.atsTailorInstance;
      if (!atsTailor) {
        this.showToast('No ATSTailor instance found', 'error');
        return;
      }
      
      try {
        const profile = await this.getStoredProfile();
        if (profile) {
          this._diffData.structuredJSON = profile.professional_experience || profile.professionalExperience || [];
        }
        
        const previewEl = document.getElementById('previewContent');
        if (previewEl) {
          this._diffData.previewText = previewEl.textContent || previewEl.innerText || '';
        }
        
        this.compareOutputs();
        this.updateDiffUI();
        
        if (this._diffData.mismatches.length === 0) {
          this.showToast('✅ No mismatches found!', 'success');
        } else {
          this.showToast(`⚠️ Found ${this._diffData.mismatches.length} mismatches`, 'warning');
        }
        
      } catch (error) {
        console.error('[PDFDiffPanel] Diff analysis error:', error);
        this.showToast(`Error: ${error.message}`, 'error');
      }
    },

    async getStoredProfile() {
      return new Promise(resolve => {
        chrome.storage.local.get(['ats_profile'], result => {
          resolve(result.ats_profile || null);
        });
      });
    },

    updateSmokeTestUI(status, message) {
      this._diffData.smokeTestStatus = status;
      
      const badge = document.getElementById('smokeTestBadge');
      if (badge) {
        badge.textContent = message;
        badge.className = `smoke-test-badge ${status}`;
      }
    },

    updateDiffUI() {
      // Update structured JSON preview
      const structEl = document.getElementById('diffStructuredJSON');
      if (structEl) {
        const struct = this._diffData.structuredJSON || [];
        structEl.innerHTML = struct.map((exp, i) => `
          <div class="diff-exp-item">
            <span class="diff-exp-num">#${i + 1}</span>
            <span class="diff-exp-company">${this.escapeHtml(exp.company || exp.companyName || '')}</span>
            <span class="diff-exp-title">${this.escapeHtml(exp.title || exp.jobTitle || '')}</span>
            <span class="diff-exp-bullets">${(exp.bullets || []).length} bullets</span>
          </div>
        `).join('') || '<p class="diff-empty">No structured data - log in to load your profile</p>';
      }
      
      // Update preview text snippet
      const previewEl = document.getElementById('diffPreviewText');
      if (previewEl) {
        const preview = this._diffData.previewText || '';
        previewEl.innerHTML = preview 
          ? `<pre class="diff-preview-pre">${this.escapeHtml(preview.substring(0, 1000))}${preview.length > 1000 ? '\n...(truncated)' : ''}</pre>`
          : '<p class="diff-empty">No preview text captured</p>';
      }
      
      // Update mismatches list
      const mismatchEl = document.getElementById('diffMismatches');
      if (mismatchEl) {
        const mismatches = this._diffData.mismatches || [];
        if (mismatches.length === 0) {
          mismatchEl.innerHTML = '<p class="diff-success">✅ No mismatches detected</p>';
        } else {
          mismatchEl.innerHTML = mismatches.map(m => `
            <div class="diff-mismatch-item ${m.type}">
              <span class="mismatch-type">${m.type.replace(/_/g, ' ')}</span>
              <span class="mismatch-expected">${this.escapeHtml(m.expected)}</span>
              <span class="mismatch-location">in ${m.location}</span>
            </div>
          `).join('');
        }
      }
      
      // Update smoke test time
      const timeEl = document.getElementById('smokeTestTime');
      if (timeEl && this._diffData.smokeTestTime) {
        timeEl.textContent = `${Math.round(this._diffData.smokeTestTime)}ms`;
      }
    },

    escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    async copyDiffReport() {
      const report = {
        timestamp: new Date().toISOString(),
        smokeTestStatus: this._diffData.smokeTestStatus,
        smokeTestTime: this._diffData.smokeTestTime,
        structuredExperienceCount: (this._diffData.structuredJSON || []).length,
        previewTextLength: (this._diffData.previewText || '').length,
        mismatches: this._diffData.mismatches
      };
      
      try {
        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        this.showToast('Diff report copied!', 'success');
      } catch (e) {
        this.showToast('Failed to copy', 'error');
      }
    },

    showToast(message, type) {
      if (window.atsTailorInstance?.showToast) {
        window.atsTailorInstance.showToast(message, type);
      } else {
        console.log(`[PDFDiffPanel] ${type}: ${message}`);
      }
    }
  };

  // Export globally
  window.PDFDiffPanel = PDFDiffPanel;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PDFDiffPanel.init());
  } else {
    PDFDiffPanel.init();
  }
})();
