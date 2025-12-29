// ATS Tailored CV & Cover Letter - Content Script
// Auto-start tailoring on supported ATS pages + attach generated PDFs to form inputs
// LAZYAPPLY CONFLICT PREVENTION: Waits 28s+, then monitors & re-attaches if overwritten

(function () {
  'use strict';

  console.log('[ATS Tailor] Content script loaded on:', window.location.hostname);

  // ============ LAZYAPPLY CONFLICT PREVENTION ============
  // LazyApply typically attaches CV around 26s mark. We wait until 28s to override.
  const PAGE_LOAD_TS = Date.now();
  const SAFE_CV_ATTACH_AFTER_MS = 28_000; // Wait 28s to let LazyApply finish
  const MONITOR_DURATION_MS = 45_000; // Monitor for 45s after our attach

  // Track our attached files to detect overwrites
  let ourAttachedFiles = { cv: null, cover: null };

  // ============ DEBUG PANEL ============
  let debugPanelVisible = false;
  let debugLogs = [];
  const MAX_DEBUG_LOGS = 30;

  function debugLog(category, message, status = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, category, message, status };
    debugLogs.push(entry);
    if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.shift();
    console.log(`[ATS Tailor] [${category}] ${message}`);
    updateDebugPanel();
  }

  function createDebugPanel() {
    if (document.getElementById('ats-tailor-debug-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'ats-tailor-debug-panel';
    panel.innerHTML = `
      <style>
        #ats-tailor-debug-panel {
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 420px;
          max-height: 450px;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid #0f3460;
          border-radius: 12px;
          font-family: 'SF Mono', 'Consolas', monospace;
          font-size: 11px;
          z-index: 999998;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          overflow: hidden;
          display: none;
        }
        #ats-tailor-debug-panel.visible { display: block; }
        #ats-debug-header {
          background: linear-gradient(90deg, #e94560 0%, #0f3460 100%);
          color: white;
          padding: 10px 14px;
          font-weight: 600;
          font-size: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: move;
        }
        #ats-debug-header span { display: flex; align-items: center; gap: 8px; }
        #ats-debug-close {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
        }
        #ats-debug-close:hover { background: rgba(255,255,255,0.3); }
        #ats-automation-banner {
          display: none;
          padding: 12px 14px;
          background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
          color: #000;
          font-weight: 700;
          font-size: 13px;
          text-align: center;
          animation: ats-pulse 1.5s infinite;
        }
        #ats-automation-banner.active { display: block; }
        @keyframes ats-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        #ats-automation-step {
          font-weight: 400;
          font-size: 11px;
          margin-top: 4px;
          opacity: 0.9;
        }
        #ats-debug-status {
          padding: 10px 14px;
          background: rgba(0,0,0,0.2);
          border-bottom: 1px solid #0f3460;
        }
        .ats-status-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          color: #a0a0a0;
        }
        .ats-status-row:last-child { margin-bottom: 0; }
        .ats-status-label { color: #888; }
        .ats-status-value { font-weight: 600; }
        .ats-status-value.success { color: #22c55e; }
        .ats-status-value.error { color: #ef4444; }
        .ats-status-value.pending { color: #f59e0b; }
        .ats-status-value.info { color: #60a5fa; }
        #ats-debug-logs {
          max-height: 200px;
          overflow-y: auto;
          padding: 10px 14px;
        }
        .ats-log-entry {
          padding: 6px 8px;
          margin-bottom: 4px;
          background: rgba(255,255,255,0.03);
          border-radius: 6px;
          border-left: 3px solid #444;
        }
        .ats-log-entry.success { border-left-color: #22c55e; }
        .ats-log-entry.error { border-left-color: #ef4444; }
        .ats-log-entry.warning { border-left-color: #f59e0b; }
        .ats-log-entry.info { border-left-color: #60a5fa; }
        .ats-log-time { color: #666; margin-right: 8px; }
        .ats-log-cat { 
          background: #0f3460;
          color: #60a5fa;
          padding: 2px 6px;
          border-radius: 4px;
          margin-right: 8px;
          font-size: 10px;
        }
        .ats-log-msg { color: #e0e0e0; }
        #ats-debug-toggle {
          position: fixed;
          bottom: 20px;
          left: 20px;
          width: 48px;
          height: 48px;
          background: linear-gradient(135deg, #e94560 0%, #0f3460 100%);
          border: none;
          border-radius: 50%;
          color: white;
          font-size: 20px;
          cursor: pointer;
          z-index: 999997;
          box-shadow: 0 4px 20px rgba(233, 69, 96, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #ats-debug-toggle:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 25px rgba(233, 69, 96, 0.5);
        }
        #ats-debug-toggle.automating {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          animation: ats-pulse 1s infinite;
        }
      </style>
      <div id="ats-debug-header">
        <span>🔧 ATS Tailor Debug</span>
        <button id="ats-debug-close">×</button>
      </div>
      <div id="ats-automation-banner">
        🤖 AUTOMATION IN PROGRESS
        <div id="ats-automation-step">Initializing...</div>
      </div>
      <div id="ats-debug-status">
        <div class="ats-status-row">
          <span class="ats-status-label">CV Input:</span>
          <span id="ats-cv-status" class="ats-status-value pending">Scanning...</span>
        </div>
        <div class="ats-status-row">
          <span class="ats-status-label">Cover Letter:</span>
          <span id="ats-cover-status" class="ats-status-value pending">Scanning...</span>
        </div>
        <div class="ats-status-row">
          <span class="ats-status-label">CV Attach:</span>
          <span id="ats-cv-attach" class="ats-status-value pending">—</span>
        </div>
        <div class="ats-status-row">
          <span class="ats-status-label">Cover Attach:</span>
          <span id="ats-cover-attach" class="ats-status-value pending">—</span>
        </div>
      </div>
      <div id="ats-debug-logs"></div>
    `;
    document.body.appendChild(panel);

    // Toggle button
    const toggle = document.createElement('button');
    toggle.id = 'ats-debug-toggle';
    toggle.innerHTML = '🐛';
    toggle.title = 'Toggle ATS Tailor Debug Panel';
    document.body.appendChild(toggle);

    toggle.addEventListener('click', () => {
      debugPanelVisible = !debugPanelVisible;
      panel.classList.toggle('visible', debugPanelVisible);
      toggle.style.display = debugPanelVisible ? 'none' : 'flex';
    });

    document.getElementById('ats-debug-close').addEventListener('click', () => {
      debugPanelVisible = false;
      panel.classList.remove('visible');
      toggle.style.display = 'flex';
    });
  }

  // Show/hide automation banner and auto-open panel during automation
  function setAutomationStatus(active, stepText = '') {
    const banner = document.getElementById('ats-automation-banner');
    const stepEl = document.getElementById('ats-automation-step');
    const toggle = document.getElementById('ats-debug-toggle');
    const panel = document.getElementById('ats-tailor-debug-panel');

    if (banner) {
      banner.classList.toggle('active', active);
    }
    if (stepEl && stepText) {
      stepEl.textContent = stepText;
    }
    if (toggle) {
      toggle.classList.toggle('automating', active);
    }

    // Auto-open panel when automation starts
    if (active && panel && !debugPanelVisible) {
      debugPanelVisible = true;
      panel.classList.add('visible');
      if (toggle) toggle.style.display = 'none';
    }
  }

  function updateDebugPanel() {
    const logsContainer = document.getElementById('ats-debug-logs');
    if (!logsContainer) return;

    logsContainer.innerHTML = debugLogs
      .slice()
      .reverse()
      .map(
        (log) => `
        <div class="ats-log-entry ${log.status}">
          <span class="ats-log-time">${log.timestamp}</span>
          <span class="ats-log-cat">${log.category}</span>
          <span class="ats-log-msg">${log.message}</span>
        </div>
      `
      )
      .join('');
  }

  function setDebugStatus(id, text, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `ats-status-value ${status}`;
  }

  // Initialize debug panel on supported pages
  setTimeout(createDebugPanel, 500);


  // Detect LazyApply-style filenames (ALL CAPS with underscores)
  function isLazyApplyFilename(filename) {
    if (!filename) return false;
    // LazyApply uses patterns like "FIRSTNAME_LASTNAME CV.pdf" or "FIRSTNAME_LASTNAME_CV.pdf"
    const upperPattern = /^[A-Z_\s]+\.pdf$/i;
    const hasAllCapsName = filename.split(/[_\s]/)[0] === filename.split(/[_\s]/)[0].toUpperCase();
    const hasSpaceBeforeCV = / CV\.pdf$/i.test(filename);
    return hasAllCapsName && (hasSpaceBeforeCV || upperPattern.test(filename));
  }

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

  const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

  const isSupportedHost = (hostname) =>
    SUPPORTED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));

  if (!isSupportedHost(window.location.hostname)) {
    console.log('[ATS Tailor] Not a supported ATS host, skipping');
    return;
  }

  console.log('[ATS Tailor] Supported ATS detected!');

  // Prevent re-tailoring the same URL too frequently
  const AUTO_TAILOR_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  // Lock to prevent concurrent/duplicate auto-tailor runs
  let autoTailorRunning = false;
  let autoTailorCompletedForUrl = null; // Track URL we successfully processed this page load

  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, (res) => resolve(res)));
  const storageSet = (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitForSafeCvWindow() {
    const elapsed = Date.now() - PAGE_LOAD_TS;
    if (elapsed >= SAFE_CV_ATTACH_AFTER_MS) return;
    const waitMs = SAFE_CV_ATTACH_AFTER_MS - elapsed;
    console.log(`[ATS Tailor] Waiting ${waitMs}ms to override LazyApply CV...`);
    await sleep(waitMs);
  }

  const FILE_INPUT_SELECTORS = {
    resume: [
      // Greenhouse - specific
      '#resume_file',
      '#s3_upload_for_resume',
      'input[name="resume"]',
      // Workday
      'input[data-automation-id="file-upload-input-ref"]',
      // Specific ID/name patterns (avoid matching cover letter)
      'input[type="file"][id*="resume" i]:not([id*="cover" i])',
      'input[type="file"][name*="resume" i]:not([name*="cover" i])',
      'input[type="file"][id*="cv" i]:not([id*="cover" i])',
      'input[type="file"][name*="cv" i]:not([name*="cover" i])',
    ],
    coverLetter: [
      // Greenhouse - specific
      '#cover_letter_file',
      '#s3_upload_for_cover_letter',
      'input[name="cover_letter"]',
      // Specific patterns
      'input[type="file"][id*="cover" i]',
      'input[type="file"][name*="cover" i]',
      'input[type="file"][id*="letter" i]',
      'input[type="file"][name*="letter" i]',
    ],
  };

  // Check if input is likely for cover letter based on context
  function isLikelyCoverLetterInput(input) {
    // Check input attributes
    const id = (input.id || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    if (id.includes('cover') || name.includes('cover') || id.includes('letter') || name.includes('letter')) {
      return true;
    }

    // Check parent/ancestor labels and text
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const text = (parent.textContent || '').toLowerCase();
      if (text.includes('cover letter') || text.includes('cover_letter')) {
        return true;
      }
      parent = parent.parentElement;
    }

    // Check associated label
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        const labelText = (label.textContent || '').toLowerCase();
        if (labelText.includes('cover')) return true;
      }
    }

    return false;
  }

  // Check if input is likely for resume/CV based on context
  function isLikelyResumeInput(input) {
    const id = (input.id || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    if (id.includes('resume') || name.includes('resume') || id.includes('cv') || name.includes('cv')) {
      return true;
    }

    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const text = (parent.textContent || '').toLowerCase();
      if ((text.includes('resume') || text.includes('cv') || text.includes('curriculum')) && !text.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }

    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        const labelText = (label.textContent || '').toLowerCase();
        if ((labelText.includes('resume') || labelText.includes('cv')) && !labelText.includes('cover')) {
          return true;
        }
      }
    }

    return false;
  }

  function findGreenhouseFileInput(type) {
    const isGreenhouse = window.location.hostname.includes('greenhouse.io');
    if (!isGreenhouse) return null;

    const headingRegex =
      type === 'cv'
        ? /(resume\s*\/\s*cv|resume\b|\bcv\b|curriculum)/i
        : /(cover\s*letter)/i;

    // Look for a section heading like "Resume/CV" or "Cover Letter" and then find a file input within that section.
    const nodes = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, h5, p, span, div'));
    for (const node of nodes) {
      const text = (node.textContent || '').trim();
      if (!text || text.length > 80) continue;
      if (!headingRegex.test(text)) continue;

      // Avoid cross-matching
      if (type === 'cv' && /cover\s*letter/i.test(text)) continue;
      if (type === 'cover' && /(resume\s*\/\s*cv|resume\b|\bcv\b)/i.test(text)) continue;

      const container = node.closest('fieldset, section, form, [role="group"], div') || node.parentElement;
      if (!container) continue;

      const input = container.querySelector('input[type="file"]');
      if (input) {
        console.log(`[ATS Tailor] Found ${type} input via Greenhouse section heading:`, text);
        return input;
      }
    }

    return null;
  }

  function findFileInput(type) {
    // Greenhouse pages often use a custom uploader UI; section-heading lookup is the most reliable.
    const ghInput = findGreenhouseFileInput(type);
    if (ghInput) {
      const inputInfo = ghInput.id || ghInput.name || 'Greenhouse section';
      debugLog('Detect', `${type.toUpperCase()} input found via Greenhouse: ${inputInfo}`, 'success');
      setDebugStatus(type === 'cv' ? 'ats-cv-status' : 'ats-cover-status', `Found (${inputInfo})`, 'success');
      return ghInput;
    }

    const selectors = type === 'cv' ? FILE_INPUT_SELECTORS.resume : FILE_INPUT_SELECTORS.coverLetter;

    // First pass: try specific selectors
    for (const selector of selectors) {
      try {
        const input = document.querySelector(selector);
        if (input && input.type === 'file') {
          // Double-check we're not attaching CV to cover letter field
          if (type === 'cv' && isLikelyCoverLetterInput(input)) {
            console.log(`[ATS Tailor] Skipping ${selector} - appears to be cover letter field`);
            continue;
          }
          if (type === 'cover' && isLikelyResumeInput(input)) {
            console.log(`[ATS Tailor] Skipping ${selector} - appears to be resume field`);
            continue;
          }
          debugLog('Detect', `${type.toUpperCase()} input found: ${selector}`, 'success');
          setDebugStatus(type === 'cv' ? 'ats-cv-status' : 'ats-cover-status', `Found (${selector.substring(0, 30)})`, 'success');
          return input;
        }
      } catch {
        // ignore invalid selectors
      }
    }

    // Label-based fallback with strict matching
    const labels = document.querySelectorAll('label');
    for (const label of labels) {
      const text = (label.textContent || '').toLowerCase().trim();

      let isMatch = false;
      if (type === 'cv') {
        // Match resume/CV but NOT cover letter
        isMatch = (text.includes('resume') || text.includes('cv') || text.includes('curriculum')) && !text.includes('cover');
      } else {
        // Match cover letter specifically
        isMatch = text.includes('cover');
      }

      if (!isMatch) continue;

      const forId = label.getAttribute('for');
      if (forId) {
        const input = document.getElementById(forId);
        if (input?.type === 'file') {
          debugLog('Detect', `${type.toUpperCase()} input found via label: "${text.substring(0, 30)}"`, 'success');
          setDebugStatus(type === 'cv' ? 'ats-cv-status' : 'ats-cover-status', `Found (label)`, 'success');
          return input;
        }
      }

      const nested = label.querySelector('input[type="file"]');
      if (nested) {
        debugLog('Detect', `${type.toUpperCase()} input nested in label: "${text.substring(0, 30)}"`, 'success');
        setDebugStatus(type === 'cv' ? 'ats-cv-status' : 'ats-cover-status', `Found (nested)`, 'success');
        return nested;
      }
    }

    // Last resort: find all file inputs and pick by position
    const allFileInputs = Array.from(document.querySelectorAll('input[type="file"]'));

    // If only one file input exists on the page, it's almost always the resume/CV.
    // Many ATS pages have a cover letter TEXT field (not a file upload), so don't fail CV detection.
    if (allFileInputs.length === 1) {
      const only = allFileInputs[0];
      if (type === 'cv') {
        debugLog('Detect', 'CV input: using only file input on page', 'success');
        setDebugStatus('ats-cv-status', 'Found (only input)', 'success');
        return only;
      }
      // For cover letter, don't assume the only input is cover
    }

    if (allFileInputs.length >= 2) {
      // Typically: first = resume, second = cover letter
      if (type === 'cv') {
        const resumeInput = allFileInputs.find((inp) => isLikelyResumeInput(inp) && !isLikelyCoverLetterInput(inp));
        if (resumeInput) return resumeInput;
        // Fall back to first non-cover-letter input
        const firstNonCover = allFileInputs.find((inp) => !isLikelyCoverLetterInput(inp));
        if (firstNonCover) return firstNonCover;
      } else {
        const coverInput = allFileInputs.find((inp) => isLikelyCoverLetterInput(inp));
        if (coverInput) return coverInput;
      }
    }

    debugLog('Detect', `${type.toUpperCase()} input NOT found`, 'error');
    setDebugStatus(type === 'cv' ? 'ats-cv-status' : 'ats-cover-status', 'Not found', 'error');
    return null;
  }

  function base64ToFile(base64, filename, type = 'application/pdf') {
    const byteCharacters = atob(base64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
    const blob = new Blob([byteArray], { type });
    return new File([blob], filename, { type });
  }

  // Cover letter is often a TEXT field (not a file upload). Try to find a suitable textarea.
  function findCoverLetterTextField() {
    const headingRegex = /(cover\s*letter)/i;

    // Prefer Greenhouse-like sections: find the "Cover Letter" heading then search nearby
    const nodes = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, h5, p, span, div'));
    for (const node of nodes) {
      const text = (node.textContent || '').trim();
      if (!text || text.length > 100) continue;
      if (!headingRegex.test(text)) continue;

      const container = node.closest('fieldset, section, form, [role="group"], div') || node.parentElement;
      if (!container) continue;

      const textarea = container.querySelector('textarea');
      if (textarea) return textarea;

      const textInput = container.querySelector('input[type="text"], input:not([type])');
      if (textInput) return textInput;
    }

    // Fallback: first textarea with an aria/placeholder hint
    const candidates = Array.from(document.querySelectorAll('textarea'));
    return (
      candidates.find((t) => /(cover\s*letter|letter)/i.test(t.getAttribute('aria-label') || '')) ||
      candidates.find((t) => /(cover\s*letter|letter)/i.test(t.getAttribute('placeholder') || '')) ||
      null
    );
  }

  function setTextFieldValue(el, value) {
    if (!el) return false;
    try {
      el.focus();
      // Some React-based forms track value via property setter
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc?.set) desc.set.call(el, value);
      else el.value = value;

      ['input', 'change', 'blur'].forEach((eventType) => {
        el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
      });
      return true;
    } catch (e) {
      console.warn('[ATS Tailor] Failed to set text field value', e);
      return false;
    }
  }


  function safeSetFiles(input, fileList) {
    if (!input) return false;
    try {
      // Preferred (works in Chrome extensions on most ATS forms)
      input.files = fileList;
      return true;
    } catch (e) {
      // Fallback for sites that block direct assignment
      try {
        Object.defineProperty(input, 'files', {
          value: fileList,
          configurable: true,
        });
        return true;
      } catch (e2) {
        console.warn('[ATS Tailor] Could not set input.files (blocked by page)', e2);
        return false;
      }
    }
  }

  function dispatchFileEvents(input) {
    if (!input) return;
    ['input', 'change', 'blur'].forEach((eventType) => {
      input.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });
  }

  // Find and click the "X" remove button for existing file attachments (e.g., Greenhouse)
  function clickRemoveFileButton(type) {
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
      const removeButtons = container.querySelectorAll('button, a, span, div[role="button"], [class*="remove"], [class*="delete"], [class*="close"], [aria-label*="remove" i], [aria-label*="delete" i], [title*="remove" i], [title*="delete" i]');
      
      for (const btn of removeButtons) {
        const btnText = (btn.textContent || '').trim().toLowerCase();
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const title = (btn.getAttribute('title') || '').toLowerCase();
        const className = (btn.className || '').toLowerCase();
        
        // Check if it's a remove/delete/X button
        const isRemoveBtn = 
          btnText === 'x' || 
          btnText === '×' || 
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
        
        if (isRemoveBtn) {
          console.log(`[ATS Tailor] Found remove button for ${type}:`, btnText || ariaLabel || 'X button');
          try {
            btn.click();
            console.log(`[ATS Tailor] Clicked remove button for ${type}`);
            return true;
          } catch (e) {
            console.warn('[ATS Tailor] Failed to click remove button:', e);
          }
        }
      }
      
      // Also look for SVG close icons (common pattern)
      const svgCloseIcons = container.querySelectorAll('svg');
      for (const svg of svgCloseIcons) {
        const parent = svg.closest('button, a, span, div[role="button"]');
        if (parent) {
          const parentText = (parent.textContent || '').trim();
          // If SVG's parent is clickable and has minimal text (likely an icon button)
          if (parentText.length <= 3) {
            console.log(`[ATS Tailor] Found SVG close icon for ${type}`);
            try {
              parent.click();
              console.log(`[ATS Tailor] Clicked SVG remove button for ${type}`);
              return true;
            } catch (e) {
              console.warn('[ATS Tailor] Failed to click SVG remove button:', e);
            }
          }
        }
      }
    }
    
    console.log(`[ATS Tailor] No remove button found for ${type}`);
    return false;
  }

  function clearFileInput(input) {
    if (!input) return;

    const existingFile = input.files?.[0];
    if (existingFile) {
      console.log('[ATS Tailor] Clearing existing file:', existingFile.name);
    }

    const emptyTransfer = new DataTransfer();
    safeSetFiles(input, emptyTransfer.files);

    try {
      input.value = '';
    } catch {
      // ignore
    }

    dispatchFileEvents(input);
  }

  function attachFileToInput(input, file, forceOverride = true) {
    // ALWAYS clear any existing file first - this is the ONLY CV that should be attached
    const existingFile = input?.files?.[0];
    if (existingFile) {
      debugLog('Attach', `Overriding "${existingFile.name}" with "${file.name}"`, 'warning');
    }
    
    // Forcefully clear the input
    clearFileInput(input);

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const ok = safeSetFiles(input, dataTransfer.files);
    
    // Dispatch multiple event types to ensure all ATS systems recognize the change
    ['input', 'change', 'blur', 'focus'].forEach((eventType) => {
      input.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });
    
    // Also dispatch a more detailed change event for React-based forms
    try {
      const changeEvent = new Event('change', { bubbles: true });
      Object.defineProperty(changeEvent, 'target', { value: input, writable: false });
      input.dispatchEvent(changeEvent);
    } catch (e) {
      // ignore
    }

    const attachedName = input?.files?.[0]?.name;
    const success = ok && attachedName === file.name;
    
    if (success) {
      debugLog('Attach', `SUCCESS: "${file.name}" attached`, 'success');
    } else {
      debugLog('Attach', `FAILED: wanted "${file.name}", got "${attachedName || 'nothing'}"`, 'error');
    }

    return success;
  }

  // Monitor file inputs and re-attach if LazyApply overwrites (event-based to avoid polling)
  const activeMonitors = new Map(); // key: input element, value: cleanup()

  function startFileMonitoring(type, input) {
    if (!input) return;
    if (activeMonitors.has(input)) return;

    const startTime = Date.now();

    const onChange = () => {
      if (Date.now() - startTime > MONITOR_DURATION_MS) return;

      const currentFile = input?.files?.[0];
      const currentName = currentFile?.name;
      const ourName = ourAttachedFiles[type]?.name;

      if (!currentName || !ourName) return;

      if (currentName !== ourName && isLazyApplyFilename(currentName)) {
        debugLog('Monitor', `Overwrite detected: "${currentName}" -> re-attaching "${ourName}"`, 'warning');
        const ok = attachFileToInput(input, ourAttachedFiles[type]);
        if (ok) {
          showNotification(`LazyApply override blocked - using ATS-optimized ${type.toUpperCase()}`, 'success');
        }
      }
    };

    input.addEventListener('change', onChange, true);

    const timeoutId = setTimeout(() => {
      const cleanup = activeMonitors.get(input);
      if (cleanup) cleanup();
    }, MONITOR_DURATION_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
      input.removeEventListener('change', onChange, true);
      activeMonitors.delete(input);
      console.log('[ATS Tailor] Stopped monitoring for overwrites');
    };

    activeMonitors.set(input, cleanup);
  }

  async function attachWithMonitoring(input, file, type) {
    // Only CV needs LazyApply overwrite protection.
    // Cover letter is often NOT a file upload and we should avoid interfering with other autofill tools.

    debugLog('Attach', `Starting ${type.toUpperCase()} attachment: "${file.name}"`, 'info');
    setDebugStatus(type === 'cv' ? 'ats-cv-attach' : 'ats-cover-attach', 'Attaching...', 'pending');

  if (type === 'cv') {
      // Store our file for monitoring
      ourAttachedFiles[type] = file;

      // STEP 1: Click the "X" remove button if there's an existing file displayed in the UI
      debugLog('Attach', 'Clicking remove button for existing CV...', 'info');
      const clickedRemove = clickRemoveFileButton('cv');
      if (clickedRemove) {
        debugLog('Attach', 'Remove button clicked, attaching immediately...', 'success');
        await sleep(50); // Minimal wait - attach IMMEDIATELY after remove
      }

      // STEP 2: Clear the file input programmatically as backup
      const existingFile = input?.files?.[0];
      if (existingFile) {
        debugLog('Attach', `Pre-attach clear of: "${existingFile.name}"`, 'warning');
        clearFileInput(input);
        await sleep(50); // Minimal wait
      }

      // First attach attempt - IMMEDIATELY
      let attachedOk = attachFileToInput(input, file);

      // If blocked, try once more shortly after (some ATS scripts mutate the DOM right after)
      if (!attachedOk) {
        debugLog('Attach', 'First attempt failed, retrying...', 'warning');
        await sleep(100);
        clickRemoveFileButton('cv'); // Try clicking remove again
        await sleep(50);
        clearFileInput(input);
        await sleep(50);
        attachedOk = attachFileToInput(input, file);
      }

      // Update status
      if (attachedOk) {
        setDebugStatus('ats-cv-attach', 'Attached ✓', 'success');
      } else {
        setDebugStatus('ats-cv-attach', 'Failed ✗', 'error');
      }

      // Multiple verification checks to catch LazyApply overwrites
      const checkIntervals = [1500, 3000, 5000, 8000];
      for (const delay of checkIntervals) {
        await sleep(delay - (checkIntervals.indexOf(delay) > 0 ? checkIntervals[checkIntervals.indexOf(delay) - 1] : 0));
        
        const currentName = input?.files?.[0]?.name;
        if (!currentName) {
          // File was cleared - re-attach IMMEDIATELY
          debugLog('Monitor', `File was cleared at ${delay}ms - re-attaching`, 'warning');
          attachFileToInput(input, file);
        } else if (currentName !== file.name) {
          // Different file attached (likely LazyApply) - click X button first, then re-attach FAST
          debugLog('Monitor', `Overwrite at ${delay}ms: "${currentName}" -> re-attaching`, 'warning');
          clickRemoveFileButton('cv');
          await sleep(50); // Fast removal
          clearFileInput(input);
          await sleep(50);
          attachFileToInput(input, file);
          showNotification(`LazyApply override blocked - using ATS-optimized CV`, 'success');
        }
      }

      // Start lightweight monitoring for future overwrites
      debugLog('Monitor', 'Starting overwrite monitoring for 45s...', 'info');
      startFileMonitoring(type, input);
      return;
    }

    // Non-CV: Click remove button first, clear input, then attach IMMEDIATELY
    debugLog('Attach', `Clicking remove button for existing ${type}...`, 'info');
    const clickedRemove = clickRemoveFileButton(type);
    if (clickedRemove) {
      debugLog('Attach', 'Remove button clicked, attaching immediately...', 'success');
      await sleep(50); // Minimal wait - attach IMMEDIATELY after remove
    }
    
    // Clear input programmatically as backup
    clearFileInput(input);
    await sleep(50); // Minimal wait
    
    // Now attach the tailored file IMMEDIATELY
    const ok = attachFileToInput(input, file);
    
    if (ok) {
      setDebugStatus('ats-cover-attach', 'Attached ✓', 'success');
    } else {
      setDebugStatus('ats-cover-attach', 'Failed ✗', 'error');
    }
  }

  function showNotification(message, type = 'success') {
    const existing = document.getElementById('ats-tailor-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'ats-tailor-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 14px 20px;
      background: ${type === 'success' ? '#22c55e' : type === 'info' ? '#818cf8' : '#ef4444'};
      color: white;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 999999;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      max-width: 360px;
      animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    if (!document.getElementById('ats-tailor-styles')) {
      style.id = 'ats-tailor-styles';
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  // ============ CITY EXTRACTION FOR ATS LOCATION OPTIMIZATION ============
  // Extract city from job location/description/URL for CV summary: "[CITY] | open to relocation"
  const KNOWN_CITIES = [
    // Major US cities
    'New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Seattle', 'Austin', 'Boston', 'Denver', 'Atlanta', 'Dallas', 'Houston', 'Miami', 'Phoenix', 'Philadelphia', 'San Diego', 'San Jose', 'Portland', 'Minneapolis', 'Detroit', 'Washington DC', 'D.C.',
    // Major UK cities  
    'London', 'Manchester', 'Birmingham', 'Edinburgh', 'Glasgow', 'Bristol', 'Cambridge', 'Oxford', 'Cardiff', 'Leeds', 'Liverpool', 'Newcastle', 'Belfast', 'Southampton', 'Nottingham', 'Sheffield',
    // Major EU cities
    'Dublin', 'Paris', 'Berlin', 'Amsterdam', 'Munich', 'Frankfurt', 'Vienna', 'Zurich', 'Barcelona', 'Madrid', 'Milan', 'Rome', 'Stockholm', 'Copenhagen', 'Oslo', 'Helsinki', 'Brussels', 'Lisbon', 'Prague', 'Warsaw',
    // Major Canadian cities
    'Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary', 'Edmonton',
    // Major APAC cities
    'Singapore', 'Hong Kong', 'Tokyo', 'Sydney', 'Melbourne', 'Auckland', 'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Seoul', 'Shanghai', 'Beijing',
    // Ireland cities
    'Cork', 'Galway', 'Limerick', 'Waterford'
  ];

  function extractJobCity(locationText, descriptionText, jobUrl) {
    // Priority 1: Extract from location field
    if (locationText && locationText.trim().length > 0) {
      const locText = locationText.trim();
      
      // Check for direct city match
      for (const city of KNOWN_CITIES) {
        if (new RegExp(`\\b${city}\\b`, 'i').test(locText)) {
          console.log(`[ATS Tailor] Extracted city from location: ${city}`);
          return city;
        }
      }
      
      // If location is simple and not primarily "Remote", use first part
      if (!/^remote$/i.test(locText) && !locText.includes(',') && locText.length < 50) {
        console.log(`[ATS Tailor] Using location as city: ${locText}`);
        return locText;
      }
      
      // Extract first city from "City, State" or "City or Remote" patterns
      const firstCityMatch = locText.match(/^([A-Za-z\s]+?)(?:,|\s+or\s+|\s*\|)/i);
      if (firstCityMatch && firstCityMatch[1].length > 2) {
        console.log(`[ATS Tailor] Extracted city from pattern: ${firstCityMatch[1].trim()}`);
        return firstCityMatch[1].trim();
      }
    }
    
    // Priority 2: Extract from URL params (e.g., ?city=London)
    if (jobUrl) {
      try {
        const url = new URL(jobUrl);
        const cityParam = url.searchParams.get('city') || url.searchParams.get('location');
        if (cityParam) {
          for (const city of KNOWN_CITIES) {
            if (new RegExp(`\\b${city}\\b`, 'i').test(cityParam)) {
              console.log(`[ATS Tailor] Extracted city from URL param: ${city}`);
              return city;
            }
          }
          console.log(`[ATS Tailor] Using URL city param: ${cityParam}`);
          return cityParam;
        }
      } catch (e) {
        // URL parsing failed
      }
    }
    
    // Priority 3: Extract from job description
    if (descriptionText) {
      // Look for "Based in [City]" pattern
      const basedInMatch = descriptionText.match(/based in\s+([A-Za-z\s]+?)(?:\.|,|\s+and|\s+or|$)/i);
      if (basedInMatch && basedInMatch[1].length > 2) {
        const potentialCity = basedInMatch[1].trim();
        for (const city of KNOWN_CITIES) {
          if (new RegExp(`\\b${city}\\b`, 'i').test(potentialCity)) {
            console.log(`[ATS Tailor] Extracted city from "based in" pattern: ${city}`);
            return city;
          }
        }
      }
      
      // Check for any known city in description
      for (const city of KNOWN_CITIES) {
        if (new RegExp(`\\b${city}\\b`, 'i').test(descriptionText)) {
          console.log(`[ATS Tailor] Extracted city from description: ${city}`);
          return city;
        }
      }
    }
    
    console.log('[ATS Tailor] No city extracted');
    return null;
  }

  function extractJobInfoFromDom() {
    const hostname = window.location.hostname;

    const getText = (selectors) => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          const t = el?.textContent?.trim();
          if (t) return t;
        } catch {
          // ignore
        }
      }
      return '';
    };

    const getMeta = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
      '';

    const platformKey = (() => {
      if (hostname.includes('greenhouse.io')) return 'greenhouse';
      if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
      if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
      if (hostname.includes('teamtailor.com')) return 'teamtailor';
      if (hostname.includes('workable.com')) return 'workable';
      if (hostname.includes('icims.com')) return 'icims';
      if (hostname.includes('bullhorn')) return 'bullhorn';
      if (hostname.includes('oracle') || hostname.includes('taleo.net') || hostname.includes('oraclecloud'))
        return 'oracle';
      return 'generic';
    })();

    const selectorsByPlatform = {
      greenhouse: {
        title: ['h1.app-title', 'h1.posting-headline', 'h1', '[data-test="posting-title"]'],
        company: ['#company-name', '.company-name', '[data-test="company-name"]'],
        location: ['.location', '.posting-categories .location', '[data-test="location"]'],
        description: ['#content', '.posting-description', '.posting', '[data-test="description"]'],
      },
      workday: {
        title: [
          'h1[data-automation-id="jobPostingHeader"]',
          'h1[data-automation-id="jobPostingTitle"]',
          'h1',
        ],
        company: ['div[data-automation-id="jobPostingCompany"]', '[data-automation-id="companyName"]'],
        location: ['div[data-automation-id="locations"]', '[data-automation-id="jobPostingLocation"]'],
        description: [
          'div[data-automation-id="jobPostingDescription"]',
          '[data-automation-id="jobDescription"]',
        ],
      },
      smartrecruiters: {
        title: ['h1[data-test="job-title"]', 'h1'],
        company: ['[data-test="job-company-name"]', '[class*="company" i]'],
        location: ['[data-test="job-location"]', '[class*="location" i]'],
        description: ['[data-test="job-description"]', '[class*="job-description" i]'],
      },
      teamtailor: {
        title: ['h1', '[data-qa="job-title"]'],
        company: ['[data-qa="job-company"]', '[class*="company" i]'],
        location: ['[data-qa="job-location"]', '[class*="location" i]'],
        description: ['[data-qa="job-description"]', 'main'],
      },
      workable: {
        title: ['h1', '[data-ui="job-title"]'],
        company: ['[data-ui="company-name"]', '[class*="company" i]'],
        location: ['[data-ui="job-location"]', '[class*="location" i]'],
        description: ['[data-ui="job-description"]', '[class*="description" i]'],
      },
      icims: {
        title: ['h1', '.iCIMS_Header'],
        company: ['[class*="company" i]'],
        location: ['[class*="location" i]'],
        description: ['#job-content', '[class*="description" i]', 'main'],
      },
      oracle: {
        title: ['h1', '[class*="job-title" i]'],
        company: ['[class*="company" i]'],
        location: ['[class*="location" i]'],
        description: ['[class*="description" i]', 'main'],
      },
      bullhorn: {
        title: ['h1', '[class*="job-title" i]'],
        company: ['[class*="company" i]'],
        location: ['[class*="location" i]'],
        description: ['[class*="description" i]', 'main'],
      },
      generic: {
        title: ['h1', '[data-test*="title" i]'],
        company: ['[class*="company" i]'],
        location: ['[class*="location" i]'],
        description: ['main', '[class*="description" i]'],
      },
    };

    const s = selectorsByPlatform[platformKey] || selectorsByPlatform.generic;

    let title =
      getText(s.title) ||
      getMeta('og:title') ||
      document.title?.split('|')?.[0]?.split('-')?.[0]?.trim() ||
      '';

    if (!title || title.length < 2) return null;

    let company = getText(s.company) || getMeta('og:site_name') || '';

    // Try to extract company from title if format is "Role at Company"
    if (!company && document.title.includes(' at ')) {
      const parts = document.title.split(' at ');
      if (parts.length > 1) {
        company = parts[parts.length - 1].split('|')[0].split('-')[0].trim();
      }
    }

    const location = getText(s.location) || '';

    const raw = getText(s.description);
    const description = raw && raw.trim().length > 80 ? raw.trim().slice(0, 3000) : '';
    
    // Extract city for ATS location optimization
    const extractedCity = extractJobCity(location, description, window.location.href);

    return {
      title: title.substring(0, 200),
      company: company.substring(0, 100),
      location: location.substring(0, 100),
      extractedCity: extractedCity, // For "[CITY] | open to relocation" format in CV
      description,
      url: window.location.href,
    };
  }

  // Check if we're on a Workable page but NOT on the actual application form
  function isWorkableApplicationPage() {
    const hostname = window.location.hostname;
    if (!hostname.includes('workable.com')) return true; // Not Workable, proceed normally
    
    // Look for the specific text that indicates the actual application form
    const pageText = document.body?.textContent || '';
    const hasAutofillText = pageText.includes('Autofill application') || 
                            pageText.includes('importing your resume') ||
                            pageText.includes('.pdf, .doc, .docx, .odt, or .rtf');
    
    // Also check for file upload inputs which indicate application form
    const hasFileInputs = document.querySelector('input[type="file"]') !== null;
    
    if (hasAutofillText || hasFileInputs) {
      console.log('[ATS Tailor] Workable application form detected');
      return true;
    }
    
    console.log('[ATS Tailor] Workable page but not application form - waiting for apply page');
    return false;
  }

  async function autoTailorIfPossible() {
    // Prevent concurrent runs (multiple setTimeout triggers)
    if (autoTailorRunning) {
      console.log('[ATS Tailor] Auto-tailor already running, skipping duplicate call');
      return;
    }

    // Already completed for this URL this page load
    if (autoTailorCompletedForUrl === window.location.href) {
      console.log('[ATS Tailor] Already completed for this URL, skipping');
      return;
    }

    console.log('[ATS Tailor] Attempting auto-tailor...');

    // For Workable, only proceed if we're on the actual application form
    if (!isWorkableApplicationPage()) {
      return;
    }

    const job = extractJobInfoFromDom();
    if (!job) {
      console.log('[ATS Tailor] No job detected on this page');
      return;
    }

    console.log('[ATS Tailor] Job found:', job.title, 'at', job.company);

    const now = Date.now();
    const { ats_lastTailoredUrl, ats_lastTailoredAt, ats_session } = await storageGet([
      'ats_lastTailoredUrl',
      'ats_lastTailoredAt',
      'ats_session',
    ]);

    // Check cooldown BEFORE acquiring lock to avoid unnecessary blocking
    if (
      ats_lastTailoredUrl === job.url &&
      ats_lastTailoredAt &&
      now - ats_lastTailoredAt < AUTO_TAILOR_COOLDOWN_MS
    ) {
      console.log('[ATS Tailor] Cooldown active, skipping auto-tailor');
      autoTailorCompletedForUrl = job.url; // Mark as done so future calls skip immediately
      return;
    }

    if (!ats_session?.access_token) {
      console.log('[ATS Tailor] Not logged in');
      showNotification('ATS Tailor: Please sign in (click extension icon)', 'error');
      return;
    }

    // Acquire lock
    autoTailorRunning = true;

    // Show automation panel and notify background to show badge
    setAutomationStatus(true, 'Checking cooldown...');
    debugLog('Auto', `Starting automation for: ${job.title} @ ${job.company}`, 'info');
    
    // Signal background script to show automation badge on extension icon
    try {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    } catch (e) {
      // Ignore if background is not ready
    }

    // Double-check cooldown after acquiring lock (race condition guard)
    const freshData = await storageGet(['ats_lastTailoredUrl', 'ats_lastTailoredAt']);
    if (
      freshData.ats_lastTailoredUrl === job.url &&
      freshData.ats_lastTailoredAt &&
      Date.now() - freshData.ats_lastTailoredAt < AUTO_TAILOR_COOLDOWN_MS
    ) {
      debugLog('Auto', 'Cooldown active, skipping', 'warning');
      setAutomationStatus(false);
      autoTailorRunning = false;
      autoTailorCompletedForUrl = job.url;
      return;
    }

    await storageSet({ ats_lastTailoredUrl: job.url, ats_lastTailoredAt: Date.now() });

    setAutomationStatus(true, 'Generating tailored CV & cover letter...');
    showNotification('ATS Tailor: Generating CV & cover letter...', 'info');
    
    // Log extracted city for debugging
    if (job.extractedCity) {
      console.log(`[ATS Tailor] Using extracted city for CV location: "${job.extractedCity} | open to relocation"`);
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/tailor-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ats_session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          extractedCity: job.extractedCity, // For "[CITY] | open to relocation" CV optimization
          jobDescription: job.description,
          jobUrl: job.url,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Tailor request failed');
      }

      const result = await response.json();
      if (result?.error) throw new Error(result.error);

      const resumePdf = result.resumePdf;
      const coverLetterPdf = result.coverLetterPdf;

      // Prefer filenames returned by backend (FirstName_LastName format)
      const resumeName = result.cvFileName || result.resumePdfFileName || 'Tailored_CV.pdf';
      const coverName = result.coverLetterFileName || result.coverLetterPdfFileName || 'Tailored_Cover_Letter.pdf';

      // CRITICAL: Store generated documents for popup viewing
      const generatedDocuments = {
        cv: result.tailoredResume || null,
        coverLetter: result.tailoredCoverLetter || null,
        cvPdf: resumePdf || null,
        coverPdf: coverLetterPdf || null,
        cvFileName: resumeName,
        coverFileName: coverName,
        matchScore: result.matchScore || 0,
        matchedKeywords: result.keywordsMatched || [],
        missingKeywords: result.keywordsMissing || []
      };

      await storageSet({
        ats_lastGeneratedDocuments: generatedDocuments,
        ats_lastJob: job
      });

      console.log('[ATS Tailor] Documents saved for popup viewing:', {
        hasCv: !!resumePdf,
        hasCover: !!coverLetterPdf,
        cvFileName: resumeName,
        coverFileName: coverName
      });

      setAutomationStatus(true, 'Finding upload fields...');

      // Try to auto-attach if the form has file inputs
      const resumeInput = findFileInput('cv');
      const coverInput = findFileInput('cover');

      let attachedAny = false;

      setAutomationStatus(true, 'Attaching tailored documents...');

      if (resumePdf && resumeInput) {
        // Attach immediately; overwrite monitoring will handle LazyApply if it attaches later.

        // CRITICAL: Check and clear any existing file (LazyApply or other)
        const existingCvFile = resumeInput.files?.[0];
        if (existingCvFile) {
          console.log(
            `[ATS Tailor] Found existing CV file: "${existingCvFile.name}" - removing before attaching optimized version`
          );
          clearFileInput(resumeInput);
          await sleep(500); // Give form time to process the clear
        }

        await attachWithMonitoring(resumeInput, base64ToFile(resumePdf, resumeName), 'cv');
        attachedAny = true;
      }

      if (coverLetterPdf && coverInput) {
        // Check and clear any existing cover letter
        const existingCoverFile = coverInput.files?.[0];
        if (existingCoverFile) {
          console.log(
            `[ATS Tailor] Found existing cover letter: "${existingCoverFile.name}" - removing before attaching optimized version`
          );
          clearFileInput(coverInput);
          await sleep(500);
        }

        await attachWithMonitoring(coverInput, base64ToFile(coverLetterPdf, coverName), 'cover');
        attachedAny = true;
      } else if (!coverInput && result?.tailoredCoverLetter) {
        const textField = findCoverLetterTextField();
        if (textField) {
          const ok = setTextFieldValue(textField, result.tailoredCoverLetter);
          if (ok) {
            showNotification('✓ Tailored cover letter filled in the form!', 'success');
            attachedAny = true;
          }
        }
      }

      if (attachedAny) {
        setAutomationStatus(true, 'Complete! Documents attached ✓');
        debugLog('Auto', 'Automation complete - documents attached', 'success');
        showNotification('✓ Tailored PDFs attached to the form!', 'success');
      } else {
        setAutomationStatus(true, 'Complete! Click extension to download.');
        debugLog('Auto', 'Automation complete - no inputs found for attach', 'warning');
        showNotification('✓ Done! Click extension icon to download/attach.', 'success');
      }

      // Hide automation banner after 3s and clear badge
      try {
        chrome.runtime.sendMessage({ action: 'clearBadge' });
      } catch (e) {
        // Ignore
      }
      setTimeout(() => setAutomationStatus(false), 3000);

      // Mark completed for this URL this page load
      autoTailorCompletedForUrl = job.url;
    } catch (e) {
      console.error('[ATS Tailor] Auto-tailor error:', e);
      debugLog('Auto', `Error: ${e.message || 'Unknown error'}`, 'error');
      setAutomationStatus(true, `Error: ${e.message?.substring(0, 40) || 'Failed'}`);
      setTimeout(() => setAutomationStatus(false), 5000);
      showNotification('Tailoring failed - click extension for details', 'error');
    } finally {
      // Always release the lock
      autoTailorRunning = false;
    }
  }

  // Some ATS pages render content after load; try a few times quickly
  // The lock prevents duplicate API calls if multiple triggers fire
  const tryTimes = [1000, 3000, 6000];
  tryTimes.forEach((ms) => setTimeout(autoTailorIfPossible, ms));

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'attachDocument') {
      (async () => {
        try {
          const { type, pdf, text, filename } = message;

           const input = findFileInput(type);
           if (!input) {
             // Cover letter is very often a TEXT field, not a file upload.
             if (type === 'cover') {
               const textField = findCoverLetterTextField();
               if (textField && text) {
                 const ok = setTextFieldValue(textField, text);
                 if (ok) {
                   showNotification('Cover letter filled in the form!', 'success');
                   sendResponse({ success: true, filled: true });
                   return;
                 }
               }

               console.log('[ATS Tailor] No cover letter upload field found (and no text field detected)');
               showNotification('No cover letter field found on this page.', 'info');
               sendResponse({ success: true, skipped: true, message: 'Cover letter field not found' });
               return;
             }

             showNotification('Could not find resume/CV upload field.', 'error');
             sendResponse({ success: false, message: 'CV file input not found' });
             return;
           }

          // ALWAYS clear any existing file before attaching tailored version
          // This ensures we override LazyApply or any other tool's attachment
          const existingFile = input?.files?.[0];
          if (existingFile) {
            console.log(`[ATS Tailor] Clearing existing ${type} file: "${existingFile.name}"`);
            clearFileInput(input);
            await sleep(300); // Give form time to register the clear
          }

          // For CV: attach immediately; overwrite monitoring handles LazyApply if it attaches later.


          if (pdf) {
            const file = base64ToFile(pdf, filename, 'application/pdf');
            await attachWithMonitoring(input, file, type);
            
            // Verify attachment succeeded
            const finalFile = input?.files?.[0];
            if (finalFile?.name === filename) {
              showNotification(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached!`, 'success');
              sendResponse({ success: true });
            } else {
              console.warn('[ATS Tailor] Attachment verification failed:', { expected: filename, got: finalFile?.name });
              showNotification(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached (verify in form)`, 'success');
              sendResponse({ success: true, warning: 'Verification unclear' });
            }
            return;
          }

          if (text) {
            const blob = new Blob([text], { type: 'text/plain' });
            const txtFilename = filename.replace(/\.pdf$/i, '.txt');
            await attachWithMonitoring(input, new File([blob], txtFilename, { type: 'text/plain' }), type);
            showNotification(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached!`, 'success');
            sendResponse({ success: true });
            return;
          }

          sendResponse({ success: false, message: 'No document provided' });
        } catch (err) {
          sendResponse({ success: false, message: err?.message || 'Attach failed' });
        }
      })();

      return true; // keep sendResponse async
    }

    if (message.action === 'ping') {
      sendResponse({ pong: true });
      return true;
    }

    return true;
  });
})();

