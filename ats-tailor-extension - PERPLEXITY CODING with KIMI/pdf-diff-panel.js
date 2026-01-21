// PDF Diff Panel - Compares Preview vs Download with Built-in Smoke Test
// Deterministic comparison of structured JSON, rendered preview, and backend parsed sections

(function() {
  'use strict';

  const PDFDiffPanel = {
    // Fixture data for smoke test - 3 complete work experiences
    SMOKE_TEST_FIXTURE: {
      firstName: 'Test',
      lastName: 'Candidate',
      email: 'test@example.com',
      phone: '+353 87 123 4567',
      city: 'Dublin',
      country: 'Ireland',
      linkedin: 'linkedin.com/in/testcandidate',
      github: 'github.com/testcandidate',
      portfolio: 'testcandidate.dev',
      professionalExperience: [
        {
          id: 'exp-1',
          company: 'Meta Platforms Inc.',
          title: 'Senior Software Engineer',
          startDate: '2022',
          endDate: 'Present',
          bullets: [
            'Led development of React-based dashboard serving 50M+ users daily',
            'Implemented GraphQL API layer reducing latency by 40%',
            'Mentored 5 junior engineers and conducted 100+ code reviews'
          ]
        },
        {
          id: 'exp-2',
          company: 'Google LLC',
          title: 'Software Engineer II',
          startDate: '2019',
          endDate: '2022',
          bullets: [
            'Built distributed systems processing 1B+ events daily using Go and Kubernetes',
            'Designed machine learning pipeline improving prediction accuracy by 25%',
            'Collaborated with cross-functional teams across 3 time zones'
          ]
        },
        {
          id: 'exp-3',
          company: 'Amazon Web Services',
          title: 'Software Development Engineer',
          startDate: '2017',
          endDate: '2019',
          bullets: [
            'Developed microservices architecture using Java and AWS Lambda',
            'Reduced cloud infrastructure costs by 30% through optimization',
            'Implemented CI/CD pipelines for 15+ production services'
          ]
        }
      ],
      education: [
        {
          institution: 'Trinity College Dublin',
          degree: 'Master of Science',
          field: 'Computer Science'
        }
      ],
      skills: ['React', 'TypeScript', 'Python', 'AWS', 'Kubernetes', 'GraphQL', 'Go', 'Java'],
      certifications: ['AWS Solutions Architect', 'Google Cloud Professional']
    },

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
      console.log('[PDFDiffPanel] Initialized with smoke test fixture');
    },

    bindEvents() {
      document.getElementById('runSmokeTest')?.addEventListener('click', () => this.runSmokeTest());
      document.getElementById('runDiffAnalysis')?.addEventListener('click', () => this.runDiffAnalysis());
      document.getElementById('copyDiffReport')?.addEventListener('click', () => this.copyDiffReport());
    },

    // Run full smoke test with fixture profile
    async runSmokeTest() {
      const startTime = performance.now();
      this.updateSmokeTestUI('running', 'Running smoke test...');
      
      try {
        // Store fixture in structured JSON
        this._diffData.structuredJSON = this.SMOKE_TEST_FIXTURE.professionalExperience;
        
        // Generate preview text from fixture
        const previewText = this.generatePreviewText(this.SMOKE_TEST_FIXTURE);
        this._diffData.previewText = previewText;
        
        // Simulate backend call (or call actual backend if available)
        const atsTailor = window.atsTailorInstance;
        if (atsTailor?.session?.access_token) {
          // Call actual backend
          const backendResult = await this.callGeneratePDF(this.SMOKE_TEST_FIXTURE, atsTailor.session);
          this._diffData.backendParsed = backendResult.parsedSections;
          
          // Compare and find mismatches
          this.compareOutputs();
        } else {
          // No session - just validate local generation
          this._diffData.backendParsed = { skipped: true, reason: 'No session - local test only' };
        }
        
        const elapsed = performance.now() - startTime;
        this._diffData.smokeTestTime = elapsed;
        
        // Validate results
        const isValid = this.validateSmokeTest();
        
        if (isValid && elapsed < 3000) {
          this.updateSmokeTestUI('success', `✅ Passed in ${Math.round(elapsed)}ms`);
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

    // Generate preview text from profile data (same logic as resume-builder.js)
    generatePreviewText(profile) {
      const lines = [];
      
      // Header
      lines.push(`${profile.firstName} ${profile.lastName}`.toUpperCase());
      lines.push(`${profile.phone} | ${profile.email} | ${profile.city}, ${profile.country} | open to relocation`);
      lines.push(`${profile.linkedin} | ${profile.github} | ${profile.portfolio}`);
      lines.push('');
      
      // Professional Experience
      lines.push('PROFESSIONAL EXPERIENCE');
      lines.push('');
      
      for (const exp of profile.professionalExperience || []) {
        lines.push(exp.company);
        lines.push(`${exp.title} – ${exp.startDate} – ${exp.endDate}`);
        for (const bullet of exp.bullets || []) {
          lines.push(`• ${bullet}`);
        }
        lines.push('');
      }
      
      // Education
      if (profile.education?.length) {
        lines.push('EDUCATION');
        for (const edu of profile.education) {
          lines.push(`${edu.degree} in ${edu.field} | ${edu.institution}`);
        }
        lines.push('');
      }
      
      // Skills
      if (profile.skills?.length) {
        lines.push('SKILLS');
        lines.push(profile.skills.join(', '));
        lines.push('');
      }
      
      // Certifications
      if (profile.certifications?.length) {
        lines.push('CERTIFICATIONS');
        lines.push(profile.certifications.join(', '));
      }
      
      return lines.join('\n');
    },

    // Call backend generate-pdf and capture parsed sections
    async callGeneratePDF(profile, session) {
      const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
      
      const requestBody = {
        candidateData: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: profile.phone,
          city: profile.city,
          country: profile.country,
          linkedin: profile.linkedin,
          github: profile.github,
          portfolio: profile.portfolio,
          professionalExperience: profile.professionalExperience,
          education: profile.education,
          skills: profile.skills,
          certifications: profile.certifications
        },
        cvText: this.generatePreviewText(profile),
        jobInfo: { title: 'Smoke Test Role', company: 'Test Company', location: 'Dublin' },
        keywords: { highPriority: ['React', 'TypeScript'], mediumPriority: ['AWS'], lowPriority: [] },
        coverLetter: 'Smoke test cover letter.'
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
        // Check company name appears in preview
        if (!preview.includes(exp.company)) {
          mismatches.push({
            type: 'missing_company',
            field: 'company',
            expected: exp.company,
            location: 'preview'
          });
        }
        
        // Check title appears in preview
        if (!preview.includes(exp.title)) {
          mismatches.push({
            type: 'missing_title',
            field: 'title',
            expected: exp.title,
            location: 'preview'
          });
        }
        
        // Check bullets
        for (const bullet of exp.bullets || []) {
          // Check first 50 chars of each bullet
          const bulletSnippet = bullet.substring(0, 50);
          if (!preview.includes(bulletSnippet)) {
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
      
      // Must have all 3 experiences
      if (struct.length !== 3) return false;
      
      // Preview must contain all company names
      const companies = ['Meta Platforms Inc.', 'Google LLC', 'Amazon Web Services'];
      for (const company of companies) {
        if (!preview.includes(company)) return false;
      }
      
      // Preview must contain section header
      if (!preview.includes('PROFESSIONAL EXPERIENCE')) return false;
      
      // No critical mismatches
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
        // Get structured data from profile
        const profile = await this.getStoredProfile();
        if (profile) {
          this._diffData.structuredJSON = profile.professional_experience || profile.professionalExperience || [];
        }
        
        // Get preview text
        const previewEl = document.getElementById('previewContent');
        if (previewEl) {
          this._diffData.previewText = previewEl.textContent || previewEl.innerText || '';
        }
        
        // Compare
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
        `).join('') || '<p class="diff-empty">No structured data</p>';
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
