// ATS Tailored CV & Cover Letter - Content Script
// PERMANENT FIX: MutationObserver + Continuous Force Attachment
// Works with Greenhouse hidden inputs, LazyApply conflict prevention, all ATS platforms

(function () {
  'use strict';

  console.log('[ATS Tailor] Content script loaded on:', window.location.hostname);

  // ============ CONFIGURATION ============
  const PAGE_LOAD_TS = Date.now();
  const SAFE_CV_ATTACH_AFTER_MS = 28_000; // Wait 28s to let LazyApply finish
  const MONITOR_DURATION_MS = 45_000; // Monitor for 45s after our attach
  const FORCE_ATTACH_INTERVAL_MS = 1000; // Re-attach every 1s (FASTER)
  const AUTO_TAILOR_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

  // Track our attached files
  let ourAttachedFiles = { cv: null, cover: null };
  let cvFile = null;
  let coverFile = null;
  let filesLoaded = false;
  let forceAttachActive = false;
  let forceAttachIntervalId = null;

  // Locks
  let autoTailorRunning = false;
  let autoTailorCompletedForUrl = null;

  const SUPABASE_URL = 'https://wntpldomgjutwufphnpg.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudHBsZG9tZ2p1dHd1ZnBobnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NDAsImV4cCI6MjA4MjE4MjQ0MH0.vOXBQIg6jghsAby2MA1GfE-MNTRZ9Ny1W2kfUHGUzNM';

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

  const isSupportedHost = (hostname) =>
    SUPPORTED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));

  if (!isSupportedHost(window.location.hostname)) {
    console.log('[ATS Tailor] Not a supported ATS host, skipping');
    return;
  }

  console.log('[ATS Tailor] Supported ATS detected!');

  // ============ UTILITIES ============
  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, (res) => resolve(res)));
  const storageSet = (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        }
        #ats-debug-close {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          cursor: pointer;
        }
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
        #ats-automation-step { font-weight: 400; font-size: 11px; margin-top: 4px; }
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
        .ats-log-time { color: #666; margin-right: 8px; }
        .ats-log-cat { background: #0f3460; color: #60a5fa; padding: 2px 6px; border-radius: 4px; margin-right: 8px; font-size: 10px; }
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
        #ats-debug-toggle.automating {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          animation: ats-pulse 1s infinite;
        }
      </style>
      <div id="ats-debug-header">
        <span>🔧 ATS Tailor Debug (Permanent Fix)</span>
        <button id="ats-debug-close">×</button>
      </div>
      <div id="ats-automation-banner">
        🤖 AUTOMATION IN PROGRESS
        <div id="ats-automation-step">Initializing...</div>
      </div>
      <div id="ats-debug-status">
        <div class="ats-status-row">
          <span>CV Input:</span>
          <span id="ats-cv-status" class="ats-status-value pending">Scanning...</span>
        </div>
        <div class="ats-status-row">
          <span>Cover Letter:</span>
          <span id="ats-cover-status" class="ats-status-value pending">Scanning...</span>
        </div>
        <div class="ats-status-row">
          <span>CV Attach:</span>
          <span id="ats-cv-attach" class="ats-status-value pending">—</span>
        </div>
        <div class="ats-status-row">
          <span>Cover Attach:</span>
          <span id="ats-cover-attach" class="ats-status-value pending">—</span>
        </div>
        <div class="ats-status-row">
          <span>Force Attach:</span>
          <span id="ats-force-status" class="ats-status-value pending">Inactive</span>
        </div>
      </div>
      <div id="ats-debug-logs"></div>
    `;
    document.body.appendChild(panel);

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

  function setAutomationStatus(active, stepText = '') {
    const banner = document.getElementById('ats-automation-banner');
    const stepEl = document.getElementById('ats-automation-step');
    const toggle = document.getElementById('ats-debug-toggle');
    const panel = document.getElementById('ats-tailor-debug-panel');

    if (banner) banner.classList.toggle('active', active);
    if (stepEl && stepText) stepEl.textContent = stepText;
    if (toggle) toggle.classList.toggle('automating', active);

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

  setTimeout(createDebugPanel, 500);

  // ============ PDF FILE CREATION ============
  function base64ToFile(base64, filename, type = 'application/pdf') {
    try {
      // Handle data URL format
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
      
      // Validate PDF magic bytes
      const pdfMagic = String.fromCharCode(view[0], view[1], view[2], view[3]);
      if (pdfMagic !== '%PDF') {
        console.warn('[ATS Tailor] Warning: File does not start with PDF magic bytes');
      }
      
      const blob = new Blob([buffer], { type });
      const file = new File([blob], filename, { type });
      console.log(`[ATS Tailor] Created PDF file: ${filename} (${file.size} bytes)`);
      return file;
    } catch (e) {
      console.error('[ATS Tailor] Failed to create PDF file:', e);
      return null;
    }
  }

  // ============ FIELD DETECTION ============
  function isResumeField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.closest('label')?.textContent || '') +
      (input.getAttribute('aria-label') || '')
    ).toLowerCase();
    
    // Check parent containers for context
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
      if ((parentText.includes('resume') || parentText.includes('cv')) && !parentText.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return (/(resume|cv|\bfiles?\b)/i.test(text) && !/cover/i.test(text));
  }

  function isCoverField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.closest('label')?.textContent || '') +
      (input.getAttribute('aria-label') || '')
    ).toLowerCase();
    
    // Check parent containers for context
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
      if (parentText.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return /cover/i.test(text);
  }

  // ============ GREENHOUSE SPECIFIC ============
  function clickAllUploadButtons() {
    // Click ALL upload/attach buttons to reveal hidden inputs
    const buttons = document.querySelectorAll('button, [role="button"], a, [data-qa-upload]');
    let clicked = 0;
    
    buttons.forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      if (/^(attach|upload|browse|choose file|select file)$/i.test(text) ||
          text === 'attach' ||
          ariaLabel.includes('attach') ||
          ariaLabel.includes('upload') ||
          btn.matches('[data-qa-upload]')) {
        try {
          btn.click();
          clicked++;
          debugLog('Greenhouse', `Clicked upload button: "${text || 'button'}"`, 'info');
        } catch (e) {
          // Ignore click errors
        }
      }
    });
    
    return clicked;
  }

  // ============ CV X BUTTON REMOVAL ============
  function clickRemoveFileButton(type = 'cv') {
    // Find and click X/remove buttons near CV or Cover sections
    const searchText = type === 'cv' ? /(resume|cv)/i : /cover/i;
    const excludeText = type === 'cv' ? /cover/i : null;
    
    // Look for file preview containers with remove buttons
    const containers = document.querySelectorAll(`
      .file-preview,
      [class*="uploaded"],
      [class*="file-item"],
      [class*="attachment"],
      [data-qa*="file"],
      [data-qa*="upload"],
      fieldset,
      section,
      .field
    `);
    
    let clicked = false;
    
    containers.forEach(container => {
      const containerText = (container.textContent || '').toLowerCase();
      
      // Check if this container is for our target type
      if (!searchText.test(containerText)) return;
      if (excludeText && excludeText.test(containerText)) return;
      
      // Find remove/X buttons within this container
      const removeButtons = container.querySelectorAll(`
        button[aria-label*="remove" i],
        button[aria-label*="delete" i],
        button[aria-label*="clear" i],
        button[class*="remove" i],
        button[class*="delete" i],
        button[class*="clear" i],
        [role="button"][aria-label*="remove" i],
        .remove-file,
        .delete-file,
        .clear-file,
        [data-qa*="remove"],
        [data-qa*="delete"]
      `);
      
      removeButtons.forEach(btn => {
        if (!btn.dataset.atsTailorClicked) {
          btn.click();
          btn.dataset.atsTailorClicked = 'true';
          clicked = true;
          debugLog('Remove', `Clicked remove button for ${type}`, 'success');
          // Reset after 2s to allow re-clicking if needed
          setTimeout(() => delete btn.dataset.atsTailorClicked, 2000);
        }
      });
      
      // Also check for X character buttons
      const allButtons = container.querySelectorAll('button, [role="button"]');
      allButtons.forEach(btn => {
        const btnText = (btn.textContent || '').trim();
        if ((btnText === '×' || btnText === 'x' || btnText === 'X' || btnText === '✕') && !btn.dataset.atsTailorClicked) {
          btn.click();
          btn.dataset.atsTailorClicked = 'true';
          clicked = true;
          debugLog('Remove', `Clicked X button for ${type}`, 'success');
          setTimeout(() => delete btn.dataset.atsTailorClicked, 2000);
        }
      });
    });
    
    // Also check globally for remove buttons near file inputs
    const allRemoveButtons = document.querySelectorAll(`
      button[aria-label*="remove" i],
      button[aria-label*="delete" i],
      [class*="remove-file"],
      [class*="delete-file"],
      svg[class*="remove"],
      svg[class*="delete"]
    `);
    
    allRemoveButtons.forEach(btn => {
      if (btn.dataset.atsTailorClicked) return;
      
      // Check if this button is near a CV/resume input
      const parent = btn.closest('fieldset, section, div[class*="upload"], div[class*="file"]');
      if (!parent) return;
      
      const parentText = (parent.textContent || '').toLowerCase();
      if (!searchText.test(parentText)) return;
      if (excludeText && excludeText.test(parentText)) return;
      
      const clickTarget = btn.closest('button') || btn;
      clickTarget.click();
      btn.dataset.atsTailorClicked = 'true';
      clicked = true;
      debugLog('Remove', `Clicked global remove for ${type}`, 'success');
      setTimeout(() => delete btn.dataset.atsTailorClicked, 2000);
    });
    
    return clicked;
  }

  // ============ FILE ATTACHMENT (CORE) ============
  function dispatchFileEvents(input) {
    if (!input) return;
    ['input', 'change', 'blur', 'focus'].forEach((eventType) => {
      input.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });
    
    // React-style change event
    try {
      const changeEvent = new Event('change', { bubbles: true });
      Object.defineProperty(changeEvent, 'target', { value: input, writable: false });
      input.dispatchEvent(changeEvent);
    } catch (e) {
      // ignore
    }
  }

  function safeSetFiles(input, fileList) {
    if (!input) return false;
    try {
      input.files = fileList;
      return true;
    } catch (e) {
      try {
        Object.defineProperty(input, 'files', {
          value: fileList,
          configurable: true,
        });
        return true;
      } catch (e2) {
        console.warn('[ATS Tailor] Could not set input.files', e2);
        return false;
      }
    }
  }

  function attachFileToInput(input, file) {
    if (!input || !file) return false;

    const dt = new DataTransfer();
    dt.items.add(file);
    
    const ok = safeSetFiles(input, dt.files);
    dispatchFileEvents(input);
    
    // For hidden inputs (Greenhouse), also trigger on parent container
    const isHidden = input.offsetParent === null || 
                    getComputedStyle(input).display === 'none' ||
                    getComputedStyle(input).visibility === 'hidden';
    
    if (isHidden) {
      const container = input.closest('[data-qa-upload], [class*="upload"], [class*="file"], fieldset, section');
      if (container) {
        ['change', 'input'].forEach(type => {
          container.dispatchEvent(new Event(type, { bubbles: true }));
        });
      }
    }
    
    const attached = input.files?.[0]?.name === file.name;
    return ok && attached;
  }

  // ============ PERMANENT FORCE ATTACHMENT ============
  function forceAttachAllFiles() {
    if (!filesLoaded || (!cvFile && !coverFile)) return;

    // First, click all upload buttons to reveal hidden inputs (Greenhouse)
    clickAllUploadButtons();

    // Find all file inputs
    const inputs = document.querySelectorAll('input[type="file"]');
    let cvAttached = false;
    let coverAttached = false;

    inputs.forEach(input => {
      // Skip if already has our file
      const currentFile = input.files?.[0];
      
      if (isResumeField(input) && cvFile && !cvAttached) {
        // Check if there's a different file (LazyApply) that needs removal
        if (currentFile && currentFile.name !== cvFile.name) {
          // Click X button to remove existing file first
          clickRemoveFileButton('cv');
          // Clear the input directly as well
          const dt = new DataTransfer();
          safeSetFiles(input, dt.files);
          dispatchFileEvents(input);
          debugLog('Force', `Cleared LazyApply CV: ${currentFile.name}`, 'warning');
        }
        
        // Now attach our CV
        if (!currentFile || currentFile.name !== cvFile.name) {
          // Small delay after removal to ensure UI updates
          setTimeout(() => {
            const ok = attachFileToInput(input, cvFile);
            if (ok) {
              cvAttached = true;
              ourAttachedFiles.cv = cvFile;
              debugLog('Force', `CV attached: ${cvFile.name}`, 'success');
              setDebugStatus('ats-cv-attach', 'Attached ✓', 'success');
            }
          }, 50);
        } else {
          cvAttached = true; // Already has our file
        }
      } else if (isCoverField(input) && coverFile && !coverAttached) {
        // Cover letter logic UNCHANGED - working as-is
        if (!currentFile || currentFile.name !== coverFile.name) {
          const ok = attachFileToInput(input, coverFile);
          if (ok) {
            coverAttached = true;
            ourAttachedFiles.cover = coverFile;
            debugLog('Force', `Cover attached: ${coverFile.name}`, 'success');
            setDebugStatus('ats-cover-attach', 'Attached ✓', 'success');
          }
        } else {
          coverAttached = true;
        }
      }
    });

    // Update force status
    if (cvAttached || coverAttached) {
      setDebugStatus('ats-force-status', 'Active ✓', 'success');
    }
  }

  function startPermanentMonitoring() {
    if (forceAttachActive) return;
    forceAttachActive = true;

    debugLog('Monitor', 'Starting permanent MutationObserver + force attach', 'info');
    setDebugStatus('ats-force-status', 'Starting...', 'pending');

    // MutationObserver - catches ALL dynamic inputs (Greenhouse, etc.)
    const observer = new MutationObserver((mutations) => {
      if (!filesLoaded) return;
      
      // Check if any file inputs were added
      let hasNewInputs = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
              if (node.matches?.('input[type="file"]') || node.querySelector?.('input[type="file"]')) {
                hasNewInputs = true;
                break;
              }
            }
          }
        }
        if (hasNewInputs) break;
      }
      
      if (hasNewInputs) {
        debugLog('Monitor', 'New file inputs detected - attaching', 'info');
        setTimeout(forceAttachAllFiles, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });

    // Force attach every 2s forever (catches LazyApply overwrites)
    forceAttachIntervalId = setInterval(() => {
      if (filesLoaded && (cvFile || coverFile)) {
        forceAttachAllFiles();
      }
    }, FORCE_ATTACH_INTERVAL_MS);

    // Initial force attach
    setTimeout(forceAttachAllFiles, 500);

    debugLog('Monitor', 'Permanent monitoring active', 'success');
    setDebugStatus('ats-force-status', 'Active', 'success');
  }

  function stopPermanentMonitoring() {
    if (forceAttachIntervalId) {
      clearInterval(forceAttachIntervalId);
      forceAttachIntervalId = null;
    }
    forceAttachActive = false;
    setDebugStatus('ats-force-status', 'Stopped', 'pending');
  }

  // ============ COVER LETTER TEXT FIELD ============
  function findCoverLetterTextField() {
    const headingRegex = /(cover\s*letter)/i;
    const nodes = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, h5, p, span, div'));
    
    for (const node of nodes) {
      const text = (node.textContent || '').trim();
      if (!text || text.length > 100) continue;
      if (!headingRegex.test(text)) continue;

      const container = node.closest('fieldset, section, form, div') || node.parentElement;
      if (!container) continue;

      const textarea = container.querySelector('textarea');
      if (textarea) return textarea;

      const textInput = container.querySelector('input[type="text"], input:not([type])');
      if (textInput) return textInput;
    }

    return null;
  }

  function setTextFieldValue(el, value) {
    if (!el) return false;
    try {
      el.focus();
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc?.set) desc.set.call(el, value);
      else el.value = value;

      ['input', 'change', 'blur'].forEach((eventType) => {
        el.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ============ JOB EXTRACTION ============
  const KNOWN_CITIES = [
    'New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Seattle', 'Austin', 'Boston', 'Denver', 'Atlanta', 'Dallas', 'Houston', 'Miami', 'Phoenix', 'Philadelphia', 'San Diego', 'San Jose', 'Portland', 'Minneapolis', 'Detroit', 'Washington DC',
    'London', 'Manchester', 'Birmingham', 'Edinburgh', 'Glasgow', 'Bristol', 'Cambridge', 'Oxford', 'Cardiff', 'Leeds', 'Liverpool', 'Newcastle', 'Belfast',
    'Dublin', 'Paris', 'Berlin', 'Amsterdam', 'Munich', 'Frankfurt', 'Vienna', 'Zurich', 'Barcelona', 'Madrid', 'Milan', 'Rome', 'Stockholm', 'Copenhagen',
    'Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary',
    'Singapore', 'Hong Kong', 'Tokyo', 'Sydney', 'Melbourne', 'Auckland', 'Bangalore', 'Mumbai'
  ];

  function extractJobCity(locationText, descriptionText, jobUrl) {
    if (locationText) {
      for (const city of KNOWN_CITIES) {
        if (new RegExp(`\\b${city}\\b`, 'i').test(locationText)) {
          return city;
        }
      }
    }
    if (descriptionText) {
      for (const city of KNOWN_CITIES) {
        if (new RegExp(`\\b${city}\\b`, 'i').test(descriptionText)) {
          return city;
        }
      }
    }
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
        } catch { }
      }
      return '';
    };

    const getMeta = (name) =>
      document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
      document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';

    const platformKey = (() => {
      if (hostname.includes('greenhouse.io')) return 'greenhouse';
      if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
      if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
      if (hostname.includes('teamtailor.com')) return 'teamtailor';
      if (hostname.includes('workable.com')) return 'workable';
      if (hostname.includes('icims.com')) return 'icims';
      return 'generic';
    })();

    const selectors = {
      greenhouse: {
        title: ['h1.app-title', 'h1.posting-headline', 'h1'],
        company: ['#company-name', '.company-name'],
        location: ['.location', '.posting-categories .location'],
        description: ['#content', '.posting-description'],
      },
      workday: {
        title: ['h1[data-automation-id="jobPostingHeader"]', 'h1'],
        company: ['div[data-automation-id="jobPostingCompany"]'],
        location: ['div[data-automation-id="locations"]'],
        description: ['div[data-automation-id="jobPostingDescription"]'],
      },
      generic: {
        title: ['h1'],
        company: ['[class*="company" i]'],
        location: ['[class*="location" i]'],
        description: ['main', '[class*="description" i]'],
      }
    };

    const s = selectors[platformKey] || selectors.generic;

    let title = getText(s.title) || getMeta('og:title') || document.title?.split('|')?.[0]?.trim() || '';
    if (!title || title.length < 2) return null;

    let company = getText(s.company) || getMeta('og:site_name') || '';
    if (!company && document.title.includes(' at ')) {
      company = document.title.split(' at ').pop()?.split('|')[0]?.trim() || '';
    }

    const location = getText(s.location) || '';
    const raw = getText(s.description);
    const description = raw?.length > 80 ? raw.slice(0, 3000) : '';
    const extractedCity = extractJobCity(location, description, window.location.href);

    return {
      title: title.substring(0, 200),
      company: company.substring(0, 100),
      location: location.substring(0, 100),
      extractedCity,
      description,
      url: window.location.href,
    };
  }

  function isWorkableApplicationPage() {
    if (!window.location.hostname.includes('workable.com')) return true;
    const pageText = document.body?.textContent || '';
    const hasAutofillText = pageText.includes('Autofill application') || pageText.includes('importing your resume');
    const hasFileInputs = document.querySelector('input[type="file"]') !== null;
    return hasAutofillText || hasFileInputs;
  }

  // ============ NOTIFICATIONS ============
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
      font-family: -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 999999;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      max-width: 360px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 4000);
  }

  // ============ MAIN AUTO-TAILOR ============
  async function autoTailorIfPossible() {
    if (autoTailorRunning) return;
    if (autoTailorCompletedForUrl === window.location.href) return;

    if (!isWorkableApplicationPage()) return;

    const job = extractJobInfoFromDom();
    if (!job) return;

    console.log('[ATS Tailor] Job found:', job.title, 'at', job.company);

    const now = Date.now();
    const { ats_lastTailoredUrl, ats_lastTailoredAt, ats_session } = await storageGet([
      'ats_lastTailoredUrl',
      'ats_lastTailoredAt',
      'ats_session',
    ]);

    if (
      ats_lastTailoredUrl === job.url &&
      ats_lastTailoredAt &&
      now - ats_lastTailoredAt < AUTO_TAILOR_COOLDOWN_MS
    ) {
      autoTailorCompletedForUrl = job.url;
      return;
    }

    if (!ats_session?.access_token) {
      showNotification('ATS Tailor: Please sign in (click extension icon)', 'error');
      return;
    }

    autoTailorRunning = true;
    setAutomationStatus(true, 'Starting tailoring...');
    debugLog('Auto', `Starting for: ${job.title} @ ${job.company}`, 'info');

    try {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    } catch (e) { }

    await storageSet({ ats_lastTailoredUrl: job.url, ats_lastTailoredAt: Date.now() });

    setAutomationStatus(true, 'Generating tailored CV & cover letter...');
    showNotification('ATS Tailor: Generating CV & cover letter...', 'info');

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
          extractedCity: job.extractedCity,
          jobDescription: job.description,
          jobUrl: job.url,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text() || 'Tailor request failed');
      }

      const result = await response.json();
      if (result?.error) throw new Error(result.error);

      const resumePdf = result.resumePdf;
      const coverLetterPdf = result.coverLetterPdf;
      const resumeName = result.cvFileName || 'Tailored_CV.pdf';
      const coverName = result.coverLetterFileName || 'Tailored_Cover_Letter.pdf';

      // Store documents for popup viewing
      await storageSet({
        ats_lastGeneratedDocuments: {
          cv: result.tailoredResume || null,
          coverLetter: result.tailoredCoverLetter || null,
          cvPdf: resumePdf || null,
          coverPdf: coverLetterPdf || null,
          cvFileName: resumeName,
          coverFileName: coverName,
          matchScore: result.matchScore || 0,
        },
        ats_lastJob: job
      });

      // Create File objects and store globally
      if (resumePdf) {
        cvFile = base64ToFile(resumePdf, resumeName);
        ourAttachedFiles.cv = cvFile;
      }
      if (coverLetterPdf) {
        coverFile = base64ToFile(coverLetterPdf, coverName);
        ourAttachedFiles.cover = coverFile;
      }

      filesLoaded = true;

      setAutomationStatus(true, 'Starting permanent attachment monitoring...');

      // Wait for LazyApply window (28s)
      const elapsed = Date.now() - PAGE_LOAD_TS;
      if (elapsed < SAFE_CV_ATTACH_AFTER_MS) {
        const waitMs = SAFE_CV_ATTACH_AFTER_MS - elapsed;
        debugLog('Auto', `Waiting ${Math.round(waitMs/1000)}s for LazyApply window...`, 'info');
        setAutomationStatus(true, `Waiting ${Math.round(waitMs/1000)}s for optimal timing...`);
        await sleep(waitMs);
      }

      // Start permanent monitoring (MutationObserver + force attach every 2s)
      startPermanentMonitoring();

      // Initial force attach
      forceAttachAllFiles();

      // Handle cover letter text field if no file input
      if (result?.tailoredCoverLetter && !document.querySelector('input[type="file"][name*="cover" i], input[type="file"][id*="cover" i]')) {
        const textField = findCoverLetterTextField();
        if (textField) {
          setTextFieldValue(textField, result.tailoredCoverLetter);
          showNotification('✓ Cover letter filled in text field!', 'success');
        }
      }

      setAutomationStatus(true, 'Complete! Monitoring for overwrites...');
      debugLog('Auto', 'Automation complete - permanent monitoring active', 'success');
      showNotification('✓ Tailored PDFs attached! Monitoring for overwrites.', 'success');

      setTimeout(() => setAutomationStatus(false), 3000);
      try {
        chrome.runtime.sendMessage({ action: 'clearBadge' });
      } catch (e) { }

      autoTailorCompletedForUrl = job.url;
    } catch (e) {
      console.error('[ATS Tailor] Auto-tailor error:', e);
      debugLog('Auto', `Error: ${e.message || 'Unknown error'}`, 'error');
      setAutomationStatus(true, `Error: ${e.message?.substring(0, 40) || 'Failed'}`);
      setTimeout(() => setAutomationStatus(false), 5000);
      showNotification('Tailoring failed - click extension for details', 'error');
    } finally {
      autoTailorRunning = false;
    }
  }

  // Trigger auto-tailor at different intervals
  [1000, 3000, 6000].forEach((ms) => setTimeout(autoTailorIfPossible, ms));

  // ============ MESSAGE LISTENER ============
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'attachDocument') {
      (async () => {
        try {
          const { type, pdf, text, filename } = message;

          // Store the file globally and start permanent monitoring
          if (type === 'cv' && pdf) {
            cvFile = base64ToFile(pdf, filename);
            ourAttachedFiles.cv = cvFile;
            filesLoaded = true;
          } else if (type === 'cover' && pdf) {
            coverFile = base64ToFile(pdf, filename);
            ourAttachedFiles.cover = coverFile;
            filesLoaded = true;
          }

          // Start permanent monitoring if not already active
          if (!forceAttachActive && filesLoaded) {
            startPermanentMonitoring();
          }

          // Force immediate attach
          forceAttachAllFiles();

          // Check if cover letter needs text field
          if (type === 'cover' && text) {
            const textField = findCoverLetterTextField();
            if (textField) {
              setTextFieldValue(textField, text);
              showNotification('Cover letter filled in the form!', 'success');
              sendResponse({ success: true, filled: true });
              return;
            }
          }

          showNotification(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached!`, 'success');
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, message: err?.message || 'Attach failed' });
        }
      })();
      return true;
    }

    if (message.action === 'ping') {
      sendResponse({ pong: true });
      return true;
    }

    return true;
  });
})();
