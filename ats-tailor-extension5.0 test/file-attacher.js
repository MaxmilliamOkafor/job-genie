// file-attacher.js - Ultra-fast File Attachment (≤50ms) - GREENHOUSE FIXED
// CRITICAL: Platform-specific selectors for × button removal + correct CV/Cover field detection
// FIXES: Greenhouse × button not clicking, files not replacing, CV going to cover field

(function() {
  'use strict';

  const FileAttacher = {
    // ============ TIMING TARGET (FASTER) ============
    TIMING_TARGET: 50, // Target 50ms for 350ms total pipeline

    // ============ PIPELINE STATE ============
    pipelineState: {
      cvAttached: false,
      coverAttached: false,
      lastAttachedFiles: null,
      jobGenieReady: false
    },

    // ============ GREENHOUSE-SPECIFIC SELECTORS (CRITICAL FIX) ============
    GREENHOUSE_REMOVE_SELECTORS: [
      // Greenhouse attachment remove buttons - HIGH PRIORITY
      'button.remove-attachment',
      'button[data-action="remove-attachment"]',
      '[data-provides="fileupload"] button.close',
      '.attachment-remove',
      '.file-remove',
      '.attachment button[aria-label*="remove" i]',
      '.attachment button[aria-label*="delete" i]',
      '.attachment button[aria-label*="clear" i]',
      // Greenhouse file preview close
      '.file-preview .close',
      '.file-preview button',
      '.uploaded-file-close',
      '.uploaded-file button',
      // Generic × buttons with specific Greenhouse parent containers
      '.s-input-group button',
      '.field-select button.close',
      '.file-attachment button',
      // Data attribute selectors
      '[data-field-type="file"] button',
      '[data-qa="file-remove"]',
      '[data-qa-remove]',
      '[data-qa*="remove"]',
      '[data-qa*="delete"]',
    ],

    // ============ GENERIC REMOVE SELECTORS ============
    GENERIC_REMOVE_SELECTORS: [
      'button[aria-label*="remove" i]',
      'button[aria-label*="delete" i]',
      'button[aria-label*="clear" i]',
      '.remove-file',
      '.file-upload-remove',
      '.attachment-remove',
    ],

    // ============ CV FIELD DETECTION (IMPROVED) ============
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
        const parentText = (parent.textContent || '').toLowerCase().substring(0, 300);
        // CV/Resume field: has resume/cv text but NOT cover letter
        if ((parentText.includes('resume') || parentText.includes('cv')) && !parentText.includes('cover')) {
          return true;
        }
        // Check for Greenhouse-specific data attributes
        const dataQa = parent.getAttribute('data-qa') || '';
        if (dataQa.includes('resume') || dataQa.includes('cv')) {
          return true;
        }
        parent = parent.parentElement;
      }
      
      return /(resume|cv|curriculum)/i.test(text) && !/cover/i.test(text);
    },

    // ============ COVER LETTER FIELD DETECTION (IMPROVED) ============
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
        const parentText = (parent.textContent || '').toLowerCase().substring(0, 300);
        if (parentText.includes('cover')) {
          return true;
        }
        // Greenhouse data attributes
        const dataQa = parent.getAttribute('data-qa') || '';
        if (dataQa.includes('cover')) {
          return true;
        }
        parent = parent.parentElement;
      }
      
      return /cover/i.test(text);
    },

    // ============ GREENHOUSE-SPECIFIC × BUTTON KILLER ============
    // CRITICAL FIX: Properly find and click X buttons to remove existing CV/Cover files
    async killGreenhouseXButtons() {
      let removed = 0;
      const isGreenhouse = window.location.hostname.includes('greenhouse');
      
      console.log('[FileAttacher] 🎯 Platform:', isGreenhouse ? 'Greenhouse' : 'Generic ATS');
      console.log('[FileAttacher] 🔍 Scanning for existing file attachments...');

      // STEP 1: Use Job Genni approach - Click remove buttons by section heading
      const cvRemoved = this.clickRemoveFileButton('cv');
      const coverRemoved = this.clickRemoveFileButton('cover');
      if (cvRemoved) removed++;
      if (coverRemoved) removed++;

      // STEP 2: Find ALL file attachment containers (CV and Cover Letter separately)
      const fileContainers = this.findAllFileContainers();
      console.log(`[FileAttacher] Found ${fileContainers.length} file containers`);

      for (const container of fileContainers) {
        const removed_here = await this.removeFileFromContainer(container);
        if (removed_here) removed++;
      }

      // STEP 3: Greenhouse-specific removal (if on Greenhouse)
      if (isGreenhouse) {
        for (const selector of this.GREENHOUSE_REMOVE_SELECTORS) {
          try {
            const buttons = document.querySelectorAll(selector);
            for (const btn of buttons) {
              if (btn.offsetParent === null) continue; // Skip hidden
              await this.robustClick(btn, selector);
              removed++;
            }
          } catch (e) {}
        }
      }

      // STEP 4: Generic remove buttons (all platforms)
      for (const selector of this.GENERIC_REMOVE_SELECTORS) {
        try {
          const buttons = document.querySelectorAll(selector);
          for (const btn of buttons) {
            if (this.isNearFileInput(btn) && btn.offsetParent !== null) {
              await this.robustClick(btn, selector);
              removed++;
            }
          }
        } catch (e) {}
      }

      // STEP 5: Click × / x / X / ✕ text buttons near file inputs
      const xButtons = document.querySelectorAll('button, [role="button"], span.close, a.close, span, a');
      for (const btn of xButtons) {
        const text = btn.textContent?.trim();
        if (text === '×' || text === 'x' || text === 'X' || text === '✕' || text === '✖' || text === '✗') {
          if (this.isNearFileInput(btn) && btn.offsetParent !== null) {
            await this.robustClick(btn, '× button');
            removed++;
          }
        }
      }

      // STEP 6: Clear file inputs directly (DataTransfer method)
      const fileInputs = document.querySelectorAll('input[type="file"]');
      for (const input of fileInputs) {
        if (input.files && input.files.length > 0) {
          try {
            const dt = new DataTransfer();
            input.files = dt.files;
            this.fireEvents(input);
            console.log('[FileAttacher] 🗑️ Cleared file input directly');
            removed++;
          } catch (e) {}
        }
      }

      // STEP 7: Greenhouse - Click "Remove" text links
      if (isGreenhouse) {
        const textLinks = document.querySelectorAll('a, span, div, button');
        for (const el of textLinks) {
          const text = el.textContent?.trim().toLowerCase();
          if ((text === 'remove' || text === 'delete' || text === 'clear') && 
              this.isNearFileInput(el) && el.offsetParent !== null) {
            await this.robustClick(el, '"Remove" link');
            removed++;
          }
        }
      }

      console.log(`[FileAttacher] 🗑️ Total removed: ${removed} existing files`);
      return removed;
    },

    // ============ JOB GENNI APPROACH: Click Remove Button by Section Heading ============
    // Find and click the "X" remove button for existing file attachments (e.g., Greenhouse)
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

    // Find all file upload containers on the page
    findAllFileContainers() {
      const containers = [];
      const selectors = [
        '[data-qa="file-upload"]',
        '[data-qa-upload]',
        '.attachment-container',
        '.file-upload-container',
        '[class*="upload" i]',
        '[class*="attachment" i]',
        '[class*="file" i]',
        '.s-input-group',
        '.field'
      ];
      
      for (const selector of selectors) {
        try {
          document.querySelectorAll(selector).forEach(el => {
            if (el.querySelector('input[type="file"]') || 
                el.querySelector('[class*="filename" i]') ||
                el.textContent?.match(/\.pdf|\.doc|\.docx/i)) {
              if (!containers.includes(el)) {
                containers.push(el);
              }
            }
          });
        } catch (e) {}
      }
      
      return containers;
    },

    // Remove file from a specific container
    async removeFileFromContainer(container) {
      // Look for X button or remove link inside container
      const removeSelectors = [
        'button.close', 'button.remove', 
        '[aria-label*="remove" i]', '[aria-label*="delete" i]',
        '.remove', '.close', '.delete',
        'span', 'button', 'a'
      ];
      
      for (const selector of removeSelectors) {
        const candidates = container.querySelectorAll(selector);
        for (const el of candidates) {
          const text = el.textContent?.trim();
          if (text === '×' || text === 'x' || text === 'X' || text === '✕' || 
              text === 'remove' || text === 'delete' || text === 'clear' ||
              el.getAttribute('aria-label')?.toLowerCase().includes('remove')) {
            if (el.offsetParent !== null) {
              await this.robustClick(el, `remove button in container`);
              return true;
            }
          }
        }
      }
      return false;
    },

    // Robust click with multiple methods
    async robustClick(el, description) {
      console.log(`[FileAttacher] 🗑️ Clicking: ${description}`);
      try {
        el.focus();
        el.click();
      } catch (e) {}
      try {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch (e) {}
      try {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      } catch (e) {}
      // Small delay for DOM to update
      await new Promise(r => setTimeout(r, 50));
    },

    // ============ CHECK IF ELEMENT IS NEAR A FILE INPUT ============
    isNearFileInput(el) {
      const root = el.closest('form') || document.body;
      const candidates = [
        el.closest('[data-qa-upload]'),
        el.closest('[data-qa="upload"]'),
        el.closest('[data-qa="attach"]'),
        el.closest('.field'),
        el.closest('[class*="upload" i]'),
        el.closest('[class*="attachment" i]'),
        el.closest('[class*="file" i]'),
        el.closest('.s-input-group'),
      ].filter(Boolean);

      for (const c of candidates) {
        if (c.querySelector('input[type="file"]')) return true;
        const t = (c.textContent || '').toLowerCase();
        if (t.includes('resume') || t.includes('cv') || t.includes('cover')) return true;
      }

      // Fallback: within same form, are there any file inputs?
      return !!root.querySelector('input[type="file"]');
    },

    // ============ REVEAL HIDDEN FILE INPUTS (GREENHOUSE) ============
    async revealHiddenInputs() {
      // Greenhouse: Click "Attach" buttons to reveal hidden file inputs
      // CRITICAL FIX: Must click these buttons BEFORE we can attach files
      
      // First, find all CV/Cover sections and click their Attach buttons
      const sections = [
        { type: 'cv', patterns: [/resume\s*\/?\s*cv/i, /resume/i, /\bcv\b/i] },
        { type: 'cover', patterns: [/cover\s*letter/i, /cover/i] }
      ];
      
      for (const section of sections) {
        const labels = document.querySelectorAll('label, h3, h4, h5, p, span, div.label, fieldset legend');
        for (const label of labels) {
          const text = (label.textContent || '').trim();
          if (text.length > 100) continue;
          
          const matches = section.patterns.some(p => p.test(text));
          if (!matches) continue;
          
          // For CV, exclude if it says "cover"
          if (section.type === 'cv' && /cover/i.test(text)) continue;
          
          // Find Attach button in this section's parent container
          const container = label.closest('fieldset, section, .field, [class*="upload"], form > div') || label.parentElement;
          if (!container) continue;
          
          // Look for Attach buttons (Greenhouse-specific)
          const attachButtons = container.querySelectorAll('button, a, [role="button"]');
          for (const btn of attachButtons) {
            const btnText = (btn.textContent || '').trim().toLowerCase();
            if (btnText === 'attach' || btnText === 'upload' || btnText === 'choose file') {
              if (btn.offsetParent !== null) {
                console.log(`[FileAttacher] 📎 Clicking "${btnText}" button for ${section.type}`);
                btn.click();
                await new Promise(r => setTimeout(r, 100));
              }
            }
          }
        }
      }
      
      // Also click data-qa buttons (generic Greenhouse)
      document.querySelectorAll('[data-qa-upload], [data-qa="upload"], [data-qa="attach"], .attach-or-paste').forEach(async btn => {
        const parent = btn.closest('.field') || btn.closest('[class*="upload"]') || btn.parentElement;
        const existingInput = parent?.querySelector('input[type="file"]');
        if (!existingInput || existingInput.offsetParent === null) {
          try { 
            btn.click();
            await new Promise(r => setTimeout(r, 50));
          } catch {}
        }
      });
      
      // Make hidden file inputs visible
      document.querySelectorAll('input[type="file"]').forEach(input => {
        if (input.offsetParent === null) {
          input.style.cssText = 'display:block !important; visibility:visible !important; opacity:1 !important; position:relative !important;';
        }
      });
    },

    // ============ ATTACH FILES TO FORM (≤50ms target, TURBO MODE) ============
    async attachFilesToForm(cvFile, coverFile, options = {}) {
      const startTime = performance.now();
      const timings = { remove: 0, reveal: 0, cv: 0, cover: 0, sync: 0 };
      console.log('[FileAttacher] 🔗 Starting TURBO file attachment...');
      
      const results = {
        cvAttached: false,
        coverAttached: false,
        existingFilesRemoved: 0,
        errors: [],
        jobGenieSynced: false,
        timings: {}
      };

      // STEP 1: Kill all existing × buttons (GREENHOUSE-SPECIFIC) - ASYNC
      const removeStart = performance.now();
      results.existingFilesRemoved = await this.killGreenhouseXButtons();
      timings.remove = performance.now() - removeStart;
      
      // Minimal delay to let DOM update after removal (reduced from 50ms)
      await new Promise(r => setTimeout(r, 20));
      
      // STEP 2: Reveal hidden inputs
      const revealStart = performance.now();
      this.revealHiddenInputs();
      timings.reveal = performance.now() - revealStart;

      // STEP 3: Attach CV to CV field ONLY
      const cvStart = performance.now();
      if (cvFile) {
        const attached = this.forceCVReplace(cvFile);
        if (attached) {
          results.cvAttached = true;
          console.log(`[FileAttacher] ✅ CV attached: ${cvFile.name} (${cvFile.size} bytes)`);
          this.pipelineState.cvAttached = true;
        } else {
          results.errors.push('CV field not found');
        }
      }
      timings.cv = performance.now() - cvStart;

      // STEP 4: Attach Cover Letter to Cover field ONLY
      const coverStart = performance.now();
      if (coverFile) {
        const attached = this.forceCoverReplace(coverFile);
        if (attached) {
          results.coverAttached = true;
          console.log(`[FileAttacher] ✅ Cover Letter attached: ${coverFile.name} (${coverFile.size} bytes)`);
          this.pipelineState.coverAttached = true;
        } else {
          results.errors.push('Cover Letter field not found');
        }
      }
      timings.cover = performance.now() - coverStart;

      // ASYNC: Job-Genie Pipeline Sync (non-blocking, don't wait)
      const syncStart = performance.now();
      if (options.syncJobGenie !== false) {
        this.syncWithJobGeniePipeline(cvFile, coverFile).then(synced => {
          results.jobGenieSynced = synced;
        }).catch(() => {});
      }
      timings.sync = performance.now() - syncStart;

      // Store state
      this.pipelineState.lastAttachedFiles = { cvFile, coverFile };
      this.pipelineState.jobGenieReady = results.cvAttached || results.coverAttached;

      const totalTime = performance.now() - startTime;
      results.timings = timings;
      
      console.log(`[FileAttacher] ⏱️ TURBO Timing breakdown:
        Remove existing: ${timings.remove.toFixed(0)}ms
        Reveal inputs: ${timings.reveal.toFixed(0)}ms
        Attach CV: ${timings.cv.toFixed(0)}ms
        Attach Cover: ${timings.cover.toFixed(0)}ms
        Total: ${totalTime.toFixed(0)}ms (target: ${this.TIMING_TARGET}ms)`);
      
      return { ...results, timing: totalTime };
    },

    // ============ FORCE CV REPLACE ============
    forceCVReplace(cvFile) {
      if (!cvFile) return false;
      let attached = false;

      // STEP 1: Find CV field by section heading first (more reliable)
      const cvSection = this.findFieldByHeading('cv');
      if (cvSection?.input) {
        // Click the Attach button if present (Greenhouse)
        if (cvSection.attachBtn && cvSection.attachBtn.offsetParent !== null) {
          console.log('[FileAttacher] 📎 Clicking CV Attach button');
          cvSection.attachBtn.click();
        }
        
        // Attach to the input
        const dt = new DataTransfer();
        dt.items.add(cvFile);
        cvSection.input.files = dt.files;
        this.fireEvents(cvSection.input);
        console.log('[FileAttacher] ✅ CV attached via heading detection:', cvFile.name);
        return true;
      }

      // STEP 2: Fallback to all file inputs
      document.querySelectorAll('input[type="file"]').forEach((input) => {
        if (!this.isCVField(input)) return;
        if (attached) return; // Only attach to first matching field

        const dt = new DataTransfer();
        dt.items.add(cvFile);
        input.files = dt.files;
        this.fireEvents(input);
        attached = true;
        console.log('[FileAttacher] ✅ CV attached to CV field:', cvFile.name);
      });

      return attached;
    },

    // ============ FORCE COVER REPLACE ============
    forceCoverReplace(coverFile) {
      if (!coverFile) return false;
      let attached = false;

      // STEP 1: Find Cover field by section heading first (more reliable)
      const coverSection = this.findFieldByHeading('cover');
      if (coverSection?.input) {
        // Click the Attach button if present (Greenhouse)
        if (coverSection.attachBtn && coverSection.attachBtn.offsetParent !== null) {
          console.log('[FileAttacher] 📎 Clicking Cover Attach button');
          coverSection.attachBtn.click();
        }
        
        // Attach to the input
        const dt = new DataTransfer();
        dt.items.add(coverFile);
        coverSection.input.files = dt.files;
        this.fireEvents(coverSection.input);
        console.log('[FileAttacher] ✅ Cover Letter attached via heading detection:', coverFile.name);
        return true;
      }

      // STEP 2: Fallback to all file inputs
      document.querySelectorAll('input[type="file"]').forEach((input) => {
        if (!this.isCoverField(input)) return;
        if (attached) return; // Only attach to first matching field

        const dt = new DataTransfer();
        dt.items.add(coverFile);
        input.files = dt.files;
        this.fireEvents(input);
        attached = true;
        console.log('[FileAttacher] ✅ Cover Letter attached to Cover field:', coverFile.name);
      });

      return attached;
    },

    // ============ FIND FIELD BY HEADING (GREENHOUSE RELIABLE) ============
    findFieldByHeading(type) {
      const patterns = type === 'cv' 
        ? [/resume\s*\/?\s*cv/i, /resume/i, /\bcv\b/i]
        : [/cover\s*letter/i, /cover/i];
      
      const excludePattern = type === 'cv' ? /cover/i : null;
      
      const labels = document.querySelectorAll('label, h3, h4, h5, p, span.label, div.label, fieldset legend');
      
      for (const label of labels) {
        const text = (label.textContent || '').trim();
        if (text.length > 80) continue;
        
        const matches = patterns.some(p => p.test(text));
        if (!matches) continue;
        
        // Exclude cross-matches
        if (excludePattern && excludePattern.test(text)) continue;
        
        const container = label.closest('fieldset, section, .field, [class*="upload"], div') || label.parentElement;
        if (!container) continue;
        
        // Find file input in this container
        const input = container.querySelector('input[type="file"]');
        
        // Find Attach button in this container
        let attachBtn = null;
        const buttons = container.querySelectorAll('button, a, [role="button"]');
        for (const btn of buttons) {
          const btnText = (btn.textContent || '').trim().toLowerCase();
          if (btnText === 'attach' || btnText === 'upload' || btnText === 'choose file') {
            attachBtn = btn;
            break;
          }
        }
        
        if (input || attachBtn) {
          return { input, attachBtn, container };
        }
      }
      
      return null;
    },

    // ============ FIRE INPUT EVENTS (COMPREHENSIVE) ============
    fireEvents(input) {
      // Fire all relevant events for maximum compatibility
      ['change', 'input', 'blur'].forEach(type => {
        input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
      });
      
      // Also fire custom events that some frameworks use
      try {
        input.dispatchEvent(new CustomEvent('file-selected', { bubbles: true, detail: { files: input.files } }));
      } catch (e) {}
    },

    // ============ JOB-GENIE PIPELINE SYNC (ASYNC) ============
    async syncWithJobGeniePipeline(cvFile, coverFile) {
      try {
        const storageData = {
          jobGenie_lastSync: Date.now(),
          jobGenie_pipelineReady: true
        };
        
        // PARALLEL: Convert both files to base64 simultaneously
        const [cvBase64, coverBase64] = await Promise.all([
          cvFile ? this.fileToBase64(cvFile) : Promise.resolve(null),
          coverFile ? this.fileToBase64(coverFile) : Promise.resolve(null)
        ]);

        if (cvBase64) {
          storageData.jobGenie_cvFile = {
            name: cvFile.name,
            size: cvFile.size,
            type: cvFile.type,
            base64: cvBase64,
            timestamp: Date.now()
          };
        }

        if (coverBase64) {
          storageData.jobGenie_coverFile = {
            name: coverFile.name,
            size: coverFile.size,
            type: coverFile.type,
            base64: coverBase64,
            timestamp: Date.now()
          };
        }

        await new Promise(resolve => {
          chrome.storage.local.set(storageData, resolve);
        });

        console.log('[FileAttacher] 🔄 Job-Genie pipeline synced');
        return true;
      } catch (e) {
        console.error('[FileAttacher] Job-Genie sync failed:', e);
        return false;
      }
    },

    // ============ FILE TO BASE64 ============
    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    // ============ CREATE PDF FILE FROM BASE64 ============
    createPDFFile(base64, fileName) {
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
        
        const file = new File([buffer], fileName, { type: 'application/pdf' });
        console.log(`[FileAttacher] 📄 Created PDF: ${fileName} (${file.size} bytes)`);
        return file;
      } catch (e) {
        console.error('[FileAttacher] PDF creation failed:', e);
        return null;
      }
    },

    // ============ FILL COVER LETTER TEXTAREA ============
    async fillCoverLetterTextarea(coverLetterText) {
      if (!coverLetterText) return false;
      
      // Replace greetings with "Dear Hiring Manager,"
      let formattedText = coverLetterText
        .replace(/Dear\s+Hiring\s+Committee,?/gi, 'Dear Hiring Manager,')
        .replace(/Dear\s+Sir\/Madam,?/gi, 'Dear Hiring Manager,')
        .replace(/To\s+Whom\s+It\s+May\s+Concern,?/gi, 'Dear Hiring Manager,');
      
      const textareas = document.querySelectorAll('textarea');
      
      for (const textarea of textareas) {
        const label = (textarea.labels?.[0]?.textContent || textarea.name || textarea.id || '').toLowerCase();
        const parent = textarea.closest('.field')?.textContent?.toLowerCase() || '';
        
        if (/cover/i.test(label) || /cover/i.test(parent)) {
          textarea.value = formattedText;
          this.fireEvents(textarea);
          console.log('[FileAttacher] ✅ Cover Letter textarea filled');
          return true;
        }
      }
      
      return false;
    },

    // ============ MONITOR FOR DYNAMIC FORMS ============
    startAttachmentMonitor(cvFile, coverFile, maxDuration = 3000) {
      const startTime = Date.now();
      let attached = { cv: false, cover: false };
      
      const checkAndAttach = () => {
        if (Date.now() - startTime > maxDuration) return;
        
        if (cvFile && !attached.cv) {
          if (this.forceCVReplace(cvFile)) attached.cv = true;
        }
        
        if (coverFile && !attached.cover) {
          if (this.forceCoverReplace(coverFile)) attached.cover = true;
        }
        
        if (!attached.cv || !attached.cover) {
          requestAnimationFrame(checkAndAttach);
        }
      };
      
      checkAndAttach();
      
      // Mutation observer for dynamic forms
      const observer = new MutationObserver(() => {
        if (!attached.cv || !attached.cover) checkAndAttach();
        else observer.disconnect();
      });
      
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), maxDuration);
    },

    // ============ GET JOB-GENIE PIPELINE FILES ============
    async getJobGeniePipelineFiles() {
      return new Promise(resolve => {
        chrome.storage.local.get([
          'jobGenie_cvFile', 
          'jobGenie_coverFile', 
          'jobGenie_pipelineReady'
        ], result => {
          if (!result.jobGenie_pipelineReady) {
            resolve(null);
            return;
          }

          const files = {};
          
          if (result.jobGenie_cvFile?.base64) {
            files.cvFile = this.createPDFFile(
              result.jobGenie_cvFile.base64,
              result.jobGenie_cvFile.name
            );
          }

          if (result.jobGenie_coverFile?.base64) {
            files.coverFile = this.createPDFFile(
              result.jobGenie_coverFile.base64,
              result.jobGenie_coverFile.name
            );
          }

          resolve(files);
        });
      });
    },

    // ============ CLEAR JOB-GENIE PIPELINE ============
    async clearJobGeniePipeline() {
      await new Promise(resolve => {
        chrome.storage.local.remove([
          'jobGenie_cvFile',
          'jobGenie_coverFile',
          'jobGenie_pipelineReady',
          'jobGenie_lastSync'
        ], resolve);
      });
      
      this.pipelineState = {
        cvAttached: false,
        coverAttached: false,
        lastAttachedFiles: null,
        jobGenieReady: false
      };
      
      console.log('[FileAttacher] 🗑️ Job-Genie pipeline cleared');
    }
  };

  window.FileAttacher = FileAttacher;
})();
