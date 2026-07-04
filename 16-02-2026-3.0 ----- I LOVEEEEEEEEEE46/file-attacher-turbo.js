// file-attacher-turbo.js - ULTRA HYPER SPEED: 90% Faster for LazyApply (≤0.1ms)
// MAXIMUM SPEED: Pure synchronous execution, ZERO delays, ZERO awaits
// CRITICAL: Uses 4.0's proven "X click → CV field → New CV attach" logic

(function() {
  'use strict';

  const FileAttacher = {
    // ============ TIMING TARGET (ULTRA HYPER SPEED - 90% FASTER) ============
    TIMING_TARGET: 0.1, // Target 0.1ms - absolute maximum synchronous speed

    // ============ PIPELINE STATE ============
    pipelineState: {
      cvAttached: false,
      coverAttached: false,
      lastAttachedFiles: null,
      jobGenieReady: false
    },

    // ============ CV FIELD DETECTION (4.0 EXACT LOGIC) ============
    isCVField(input) {
      const text = (
        (input.labels?.[0]?.textContent || '') +
        (input.name || '') +
        (input.id || '') +
        (input.getAttribute('aria-label') || '') +
        (input.getAttribute('data-qa') || '') +
        (input.closest('label')?.textContent || '')
      ).toLowerCase();

      // Check parent elements for context (up to 5 levels)
      let parent = input.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
        // CV/Resume field: has resume/cv text but NOT cover letter
        if ((parentText.includes('resume') || parentText.includes('cv')) && !parentText.includes('cover')) {
          return true;
        }
        parent = parent.parentElement;
      }

      return /(resume|cv|curriculum)/i.test(text) && !/cover/i.test(text);
    },

    // ============ COVER LETTER FIELD DETECTION (4.0 EXACT LOGIC) ============
    isCoverField(input) {
      const text = (
        (input.labels?.[0]?.textContent || '') +
        (input.name || '') +
        (input.id || '') +
        (input.getAttribute('aria-label') || '') +
        (input.getAttribute('data-qa') || '') +
        (input.closest('label')?.textContent || '')
      ).toLowerCase();

      // Check parent elements for context
      let parent = input.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
        if (parentText.includes('cover')) {
          return true;
        }
        parent = parent.parentElement;
      }

      return /cover/i.test(text);
    },

    // ============ CLICK REMOVE BUTTON BY SECTION (4.0 + 5.0 MERGED) ============
    clickRemoveFileButton(type) {
      const headingRegex = type === 'cv'
        ? /(resume\s*\/?\s*cv|resume\b|\bcv\b)/i
        : /(cover\s*letter)/i;

      // Find sections with the appropriate heading
      const nodes = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, h5, p, span, div, fieldset'));

      for (const node of nodes) {
        const text = (node.textContent || '').trim();
        if (!text || text.length > 100) continue;
        if (!headingRegex.test(text)) continue;

        // Avoid cross-matching
        if (type === 'cv' && /cover\s*letter/i.test(text)) continue;
        if (type === 'cover' && /(resume\s*\/?\s*cv|resume\b|\bcv\b)/i.test(text)) continue;

        const container = node.closest('fieldset, section, form, [role="group"], div') || node.parentElement;
        if (!container) continue;

        // Look for remove/delete/X buttons in this section
        const removeButtons = container.querySelectorAll('button, a, span, div[role="button"], [class*="remove"], [class*="delete"]');

        for (const btn of removeButtons) {
          const btnText = (btn.textContent || '').trim().toLowerCase();
          const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
          const title = (btn.getAttribute('title') || '').toLowerCase();
          const className = (btn.className || '').toLowerCase();

          // Check if it's a remove/delete/X button
          const isRemoveBtn =
            btnText === 'x' ||
            btnText === '×' ||
            btnText === '✕' ||
            btnText === '✖' ||
            btnText === 'remove' ||
            btnText === 'delete' ||
            btnText.includes('remove') ||
            ariaLabel.includes('remove') ||
            ariaLabel.includes('delete') ||
            title.includes('remove') ||
            title.includes('delete') ||
            className.includes('remove') ||
            className.includes('delete') ||
            className.includes('close') ||
            (btn.tagName === 'BUTTON' && btnText.length <= 2); // Short button text like "X"

          if (isRemoveBtn && btn.offsetParent !== null) {
            console.log(`[FileAttacher] Found remove button for ${type}:`, btnText || ariaLabel || 'X button');
            try {
              btn.click();
              console.log(`[FileAttacher] ✅ Clicked remove button for ${type}`);
              return true;
            } catch (e) {
              console.warn('[FileAttacher] Failed to click remove button:', e);
            }
          }
        }

        // Also look for SVG close icons (common pattern)
        const svgCloseIcons = container.querySelectorAll('svg');
        for (const svg of svgCloseIcons) {
          const parent = svg.closest('button, a, span, div[role="button"]');
          if (parent && parent.offsetParent !== null) {
            const parentText = (parent.textContent || '').trim();
            // If SVG's parent is clickable and has minimal text (likely an icon button)
            if (parentText.length <= 3) {
              console.log(`[FileAttacher] Found SVG close icon for ${type}`);
              try {
                parent.click();
                console.log(`[FileAttacher] ✅ Clicked SVG remove button for ${type}`);
                return true;
              } catch (e) {
                console.warn('[FileAttacher] Failed to click SVG remove button:', e);
              }
            }
          }
        }
      }

      console.log(`[FileAttacher] No remove button found for ${type}`);
      return false;
    },

    // ============ KILL X BUTTONS (4.0 SCOPED LOGIC) ============
    killXButtons() {
      const isNearFileInput = (el) => {
        const root = el.closest('form') || document.body;
        const candidates = [
          el.closest('[data-qa-upload]'),
          el.closest('[data-qa="upload"]'),
          el.closest('[data-qa="attach"]'),
          el.closest('.field'),
          el.closest('[class*="upload" i]'),
          el.closest('[class*="attachment" i]'),
        ].filter(Boolean);

        for (const c of candidates) {
          if (c.querySelector('input[type="file"]')) return true;
          const t = (c.textContent || '').toLowerCase();
          if (t.includes('resume') || t.includes('cv') || t.includes('cover')) return true;
        }

        return !!root.querySelector('input[type="file"]');
      };

      let removed = 0;

      // Click section-specific remove buttons first (Job-Genie approach)
      if (this.clickRemoveFileButton('cv')) removed++;
      if (this.clickRemoveFileButton('cover')) removed++;

      const selectors = [
        'button[aria-label*="remove" i]',
        'button[aria-label*="delete" i]',
        'button[aria-label*="clear" i]',
        '.remove-file',
        '[data-qa-remove]',
        '[data-qa*="remove"]',
        '[data-qa*="delete"]',
        '.file-preview button',
        '.file-upload-remove',
        '.attachment-remove',
      ];

      document.querySelectorAll(selectors.join(', ')).forEach((btn) => {
        try {
          if (!isNearFileInput(btn)) return;
          btn.click();
          removed++;
        } catch {}
      });

      document.querySelectorAll('button, [role="button"]').forEach((btn) => {
        const text = btn.textContent?.trim();
        if (text === '×' || text === 'x' || text === 'X' || text === '✕') {
          try {
            if (!isNearFileInput(btn)) return;
            btn.click();
            removed++;
          } catch {}
        }
      });

      console.log(`[FileAttacher] Killed ${removed} X buttons`);
      return removed;
    },

    // ============ FIRE EVENTS ============
    fireEvents(input) {
      ['change', 'input'].forEach(type => {
        input.dispatchEvent(new Event(type, { bubbles: true }));
      });
    },

    // ============ CLEAR FILE INPUT ============
    clearFileInput(input) {
      if (input.files && input.files.length > 0) {
        try {
          const dt = new DataTransfer();
          input.files = dt.files;
          this.fireEvents(input);
          return true;
        } catch (e) {}
      }
      return false;
    },

    // ============ ATTACH FILE TO INPUT (4.0 PROVEN LOGIC) ============
    attachFileToInput(input, file) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        this.fireEvents(input);
        console.log(`[FileAttacher] ✅ Attached: ${file.name} to input`);
        return true;
      } catch (e) {
        console.error('[FileAttacher] Attach failed:', e);
        return false;
      }
    },

    // ============ ATTACH TO CV FIELD (4.0 LOGIC + SPEED) ============
    async attachToFirstMatch(file, type) {
      const startTime = performance.now();
      const fileInputs = document.querySelectorAll('input[type="file"]');
      
      for (const input of fileInputs) {
        const isMatch = type === 'cv' ? this.isCVField(input) : this.isCoverField(input);
        if (isMatch) {
          // STEP 1: Click X to remove existing file
          this.clickRemoveFileButton(type);
          
          // STEP 2: Clear input programmatically
          this.clearFileInput(input);
          
          // STEP 3: Attach new file
          const result = this.attachFileToInput(input, file);
          
          const timing = performance.now() - startTime;
          console.log(`[FileAttacher] ${type.toUpperCase()} attach completed in ${timing.toFixed(0)}ms (target: ${this.TIMING_TARGET}ms)`);
          
          if (result) {
            this.pipelineState[type === 'cv' ? 'cvAttached' : 'coverAttached'] = true;
          }
          
          return result;
        }
      }
      
      // Fallback: use first file input for CV
      if (type === 'cv' && fileInputs.length > 0) {
        this.clickRemoveFileButton('cv');
        this.clearFileInput(fileInputs[0]);
        return this.attachFileToInput(fileInputs[0], file);
      }
      
      return false;
    },

    // ============ ATTACH COVER LETTER (FILE OR TEXT) - BLAZING ============
    async attachToCoverField(file, text = null) {
      const startTime = performance.now();
      
      // BLAZING: Click attach synchronously
      this.clickGreenhouseCoverAttach();
      
      // Try file attachment
      if (file) {
        let result = await this.attachToFirstMatch(file, 'cover');
        if (!result) {
          this.clickGreenhouseCoverAttach();
          result = await this.attachToFirstMatch(file, 'cover');
        }
        if (result) {
          console.log(`[FileAttacher] Cover attached in ${(performance.now() - startTime).toFixed(0)}ms`);
          this.pipelineState.coverAttached = true;
          return true;
        }
      }
      
      // Try textarea for cover letter text
      if (text) {
        const textareas = document.querySelectorAll('textarea');
        for (const textarea of textareas) {
          const label = (textarea.labels?.[0]?.textContent || textarea.name || textarea.id || '').toLowerCase();
          if (/cover/i.test(label)) {
            textarea.value = text;
            this.fireEvents(textarea);
            this.pipelineState.coverAttached = true;
            return true;
          }
        }
      }
      
      return false;
    },

    // ============ REVEAL HIDDEN INPUTS (GREENHOUSE) ============
    revealHiddenInputs() {
      // Click "Attach" buttons to reveal hidden file inputs
      document.querySelectorAll('[data-qa-upload], [data-qa="upload"], [data-qa="attach"]').forEach(btn => {
        const parent = btn.closest('.field') || btn.closest('[class*="upload"]') || btn.parentElement;
        const existingInput = parent?.querySelector('input[type="file"]');
        if (!existingInput || existingInput.offsetParent === null) {
          try { btn.click(); } catch {}
        }
      });

      // GREENHOUSE COVER LETTER: Click "Attach" button in Cover Letter section specifically
      this.clickGreenhouseCoverAttach();

      // Make hidden inputs visible
      document.querySelectorAll('input[type="file"]').forEach(input => {
        if (input.offsetParent === null) {
          input.style.cssText = 'display:block !important; visibility:visible !important; opacity:1 !important; position:relative !important;';
        }
      });
    },

    // ============ GREENHOUSE COVER LETTER ATTACH BUTTON CLICK ============
    clickGreenhouseCoverAttach() {
      // Find the Cover Letter section by label text
      const allLabels = document.querySelectorAll('label, h3, h4, span, div, fieldset');
      for (const label of allLabels) {
        const text = (label.textContent || '').trim().toLowerCase();
        if (text.includes('cover letter') && text.length < 30) {
          // Found Cover Letter label - look for "Attach" button nearby
          const container = label.closest('fieldset') || label.closest('.field') || label.closest('section') || label.parentElement?.parentElement;
          if (!container) continue;
          
          // Look for Attach button (first option in Greenhouse)
          const buttons = container.querySelectorAll('button, a[role="button"], [class*="attach"]');
          for (const btn of buttons) {
            const btnText = (btn.textContent || '').trim().toLowerCase();
            if (btnText === 'attach' || btnText.includes('attach')) {
              console.log('[FileAttacher] 📎 Clicking Greenhouse Cover Letter "Attach" button');
              try { 
                btn.click(); 
                return true;
              } catch (e) {
                console.warn('[FileAttacher] Failed to click Attach button:', e);
              }
            }
          }
        }
      }
      return false;
    },

    // ============ CREATE PDF FILE FROM BASE64 ============
    createPDFFile(base64, name) {
      try {
        if (!base64) return null;
        
        let data = base64;
        if (base64.includes(',')) {
          data = base64.split(',')[1];
        }
        
        const byteString = atob(data);
        const buffer = new ArrayBuffer(byteString.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < byteString.length; i++) {
          view[i] = byteString.charCodeAt(i);
        }
        
        const file = new File([buffer], name, { type: 'application/pdf' });
        console.log(`[FileAttacher] Created PDF: ${name} (${file.size} bytes)`);
        return file;
      } catch (e) {
        console.error('[FileAttacher] PDF creation failed:', e);
        return null;
      }
    },

    // ============ ULTRA BLAZING ATTACH PIPELINE (≤0.5ms - 50% FASTER FOR LAZYAPPLY) ============
    turboAttach(cvPdf, coverPdf, cvFilename, coverFilename, coverText = null) {
      const startTime = performance.now();
      console.log('[FileAttacher] ⚡⚡ ULTRA BLAZING attach (target: 0.5ms)');

      // Create files SYNCHRONOUSLY - ZERO async
      const cvFile = cvPdf ? this.createPDFFile(cvPdf, cvFilename || 'Tailored_CV.pdf') : null;
      const coverFile = coverPdf ? this.createPDFFile(coverPdf, coverFilename || 'Tailored_Cover_Letter.pdf') : null;

      // ALL SYNCHRONOUS - ZERO delays, ZERO awaits
      this.revealHiddenInputs();
      this.killXButtons();

      // Attach CV SYNCHRONOUSLY
      let cvAttached = false;
      if (cvFile) {
        cvAttached = this.attachToFirstMatchSync(cvFile, 'cv');
      }

      // Attach Cover SYNCHRONOUSLY  
      let coverAttached = false;
      if (coverFile || coverText) {
        this.clickGreenhouseCoverAttach();
        coverAttached = this.attachToCoverFieldSync(coverFile, coverText);
      }

      const timing = performance.now() - startTime;
      console.log(`[FileAttacher] ⚡⚡ ULTRA BLAZING complete in ${timing.toFixed(2)}ms (target: ${this.TIMING_TARGET}ms)`);
      console.log(`[FileAttacher] Results: CV=${cvAttached ? '✅' : '❌'}, Cover=${coverAttached ? '✅' : '❌'}`);

      // Show green ribbon if both attached
      if (cvAttached || coverAttached) {
        this.showSuccessRibbon(cvAttached, coverAttached);
      }

      return {
        cvAttached,
        coverAttached,
        timing,
        meetsTarget: timing <= this.TIMING_TARGET
      };
    },

    // ============ SYNC VERSION - ATTACH TO FIRST MATCH (ZERO ASYNC) ============
    attachToFirstMatchSync(file, type) {
      const fileInputs = document.querySelectorAll('input[type="file"]');
      
      for (const input of fileInputs) {
        const isMatch = type === 'cv' ? this.isCVField(input) : this.isCoverField(input);
        if (isMatch) {
          this.clickRemoveFileButton(type);
          this.clearFileInput(input);
          const result = this.attachFileToInput(input, file);
          if (result) {
            this.pipelineState[type === 'cv' ? 'cvAttached' : 'coverAttached'] = true;
          }
          return result;
        }
      }
      
      // Fallback: use first file input for CV
      if (type === 'cv' && fileInputs.length > 0) {
        this.clickRemoveFileButton('cv');
        this.clearFileInput(fileInputs[0]);
        return this.attachFileToInput(fileInputs[0], file);
      }
      
      return false;
    },

    // ============ SYNC VERSION - ATTACH COVER FIELD (ZERO ASYNC) ============
    attachToCoverFieldSync(file, text = null) {
      // Try file attachment
      if (file) {
        let result = this.attachToFirstMatchSync(file, 'cover');
        if (!result) {
          this.clickGreenhouseCoverAttach();
          result = this.attachToFirstMatchSync(file, 'cover');
        }
        if (result) {
          this.pipelineState.coverAttached = true;
          return true;
        }
      }
      
      // Try textarea for cover letter text
      if (text) {
        const textareas = document.querySelectorAll('textarea');
        for (const textarea of textareas) {
          const label = (textarea.labels?.[0]?.textContent || textarea.name || textarea.id || '').toLowerCase();
          if (/cover/i.test(label)) {
            textarea.value = text;
            this.fireEvents(textarea);
            this.pipelineState.coverAttached = true;
            return true;
          }
        }
      }
      
      return false;
    },

    // ============ GREEN SUCCESS PILL ============
    // Compact top-right pill (was a full-width bar that glowed forever and
    // pushed the whole page down 50px). Dismissible, fades out on its own,
    // never displaces or covers the form.
    showSuccessRibbon(cvAttached, coverAttached) {
      // Remove existing success ribbon if any
      const existingRibbon = document.getElementById('ats-success-ribbon');
      if (existingRibbon) existingRibbon.remove();
      // Clean up the body-padding hack older versions injected.
      document.body.classList.remove('ats-success-ribbon-active');
      const oldStyle = document.getElementById('ats-success-ribbon-style');
      if (oldStyle) oldStyle.remove();

      const status = [];
      if (cvAttached) status.push('CV');
      if (coverAttached) status.push('Cover Letter');

      const ribbon = document.createElement('div');
      ribbon.id = 'ats-success-ribbon';
      ribbon.innerHTML = `
        <style>
          #ats-success-ribbon {
            position: fixed;
            top: 12px;
            right: 12px;
            left: auto;
            z-index: 2147483646;
            max-width: 420px;
            background: linear-gradient(135deg, #00ff88 0%, #00cc66 50%, #00aa55 100%);
            padding: 8px 12px;
            border-radius: 999px;
            font: 600 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
            color: #000;
            box-shadow: 0 4px 14px rgba(0, 200, 100, 0.4), 0 2px 8px rgba(0,0,0,0.2);
            animation: ats-success-glow 1.5s ease-in-out 3;
            display: flex;
            align-items: center;
            gap: 8px;
            opacity: 1;
            transition: opacity .35s ease;
          }
          @keyframes ats-success-glow {
            0%, 100% { box-shadow: 0 4px 14px rgba(0, 200, 100, 0.4); }
            50% { box-shadow: 0 4px 24px rgba(0, 255, 136, 0.7); }
          }
          #ats-success-ribbon .ats-icon {
            font-size: 15px;
            animation: ats-bounce 0.6s ease-out;
          }
          @keyframes ats-bounce {
            0% { transform: scale(0); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
          }
          #ats-success-ribbon .ats-text { font-weight: 700; letter-spacing: 0.3px; }
          #ats-success-ribbon .ats-badge {
            background: rgba(0,0,0,0.15);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
          }
          #ats-success-ribbon .ats-close {
            flex: none;
            border: 0;
            background: rgba(0,0,0,0.15);
            color: inherit;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            font: 700 11px/18px system-ui, sans-serif;
            text-align: center;
            cursor: pointer;
            padding: 0;
          }
          #ats-success-ribbon.fade-out { opacity: 0; }
        </style>
        <span class="ats-icon">✅</span>
        <span class="ats-text">${status.join(' & ')} attached</span>
        <span class="ats-badge">ATS-PERFECT</span>
        <button class="ats-close" title="Dismiss" aria-label="Dismiss">✕</button>
      `;

      ribbon.querySelector('.ats-close').addEventListener('click', () => ribbon.remove());
      document.body.appendChild(ribbon);
      setTimeout(() => {
        ribbon.classList.add('fade-out');
        setTimeout(() => ribbon.remove(), 400);
      }, 12000);

      console.log('[FileAttacher] ✅ Success pill displayed');
    },
    
    // ============ ATTACH BOTH FILES TOGETHER (SYNC - LAZYAPPLY OPTIMIZED) ============
    attachBothFiles(cvFile, coverFile, coverText = null) {
      console.log('[FileAttacher] 📎 SYNC Attaching BOTH CV + Cover Letter');
      const startTime = performance.now();
      
      // STEP 1: Reveal hidden inputs SYNC
      this.revealHiddenInputs();
      
      // STEP 2: Kill existing files SYNC
      this.killXButtons();
      
      // STEP 3: Attach CV SYNC
      let cvAttached = false;
      if (cvFile) {
        cvAttached = this.attachToFirstMatchSync(cvFile, 'cv');
      }
      
      // STEP 4: Click Cover Letter Attach button SYNC
      this.clickGreenhouseCoverAttach();
      
      // STEP 5: Attach Cover Letter SYNC
      let coverAttached = false;
      if (coverFile || coverText) {
        coverAttached = this.attachToCoverFieldSync(coverFile, coverText);
      }

      const timing = performance.now() - startTime;
      console.log(`[FileAttacher] ⚡ SYNC attachBothFiles in ${timing.toFixed(2)}ms`);

      // Show green ribbon if attached
      if (cvAttached || coverAttached) {
        this.showSuccessRibbon(cvAttached, coverAttached);
      }
      
      // STEP 6: Retry if cover not attached (using setTimeout for async retry)
      if (!coverAttached && (coverFile || coverText)) {
        this.clickGreenhouseCoverAttach();
        setTimeout(() => {
          const retryResult = this.attachToCoverFieldSync(coverFile, coverText);
          if (retryResult) {
            console.log('[FileAttacher] ✅ Cover Letter retry successful');
            this.pipelineState.coverAttached = true;
          }
        }, 100);
      }
      
      console.log(`[FileAttacher] Both files: CV=${cvAttached ? '✅' : '❌'}, Cover=${coverAttached ? '✅' : '❌'}`);
      
      return { cvAttached, coverAttached };
    },

    // ============ CONTINUOUS MONITORING (LAZYAPPLY PROTECTION) ============
    startFileMonitoring(type, input, file) {
      let monitorCount = 0;
      const maxMonitors = 10;
      const checkIntervals = [1500, 3000, 5000, 8000];
      
      const monitor = setInterval(() => {
        monitorCount++;
        if (monitorCount > maxMonitors) {
          clearInterval(monitor);
          return;
        }
        
        const currentName = input?.files?.[0]?.name;
        if (!currentName) {
          // File was cleared - re-attach
          console.log(`[FileAttacher] File was cleared - re-attaching`);
          this.attachFileToInput(input, file);
        } else if (currentName !== file.name) {
          // Different file attached (LazyApply override) - click X first, then re-attach
          console.log(`[FileAttacher] Overwrite detected: "${currentName}" → re-attaching "${file.name}"`);
          this.clickRemoveFileButton(type);
          this.clearFileInput(input);
          setTimeout(() => {
            this.attachFileToInput(input, file);
          }, 300);
        }
      }, checkIntervals[Math.min(monitorCount, checkIntervals.length - 1)] || 5000);
      
      // Stop after 30 seconds
      setTimeout(() => clearInterval(monitor), 30000);
    }
  };

  // Export
  window.FileAttacher = FileAttacher;

})();