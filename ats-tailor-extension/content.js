// content.js - ULTRA-FAST 500ms Replace (CV + Cover) v1.3.0
// PERMANENT FIX: Ultra-fast replacement, no LazyApply detection delays

(function() {
  'use strict';

  console.log('[ATS Tailor] ULTRA-FAST v1.3.0 loaded on:', window.location.hostname);

  // ============ CONFIGURATION ============
  const SUPPORTED_HOSTS = [
    'greenhouse.io', 'job-boards.greenhouse.io', 'boards.greenhouse.io',
    'workday.com', 'myworkdayjobs.com', 'smartrecruiters.com',
    'bullhornstaffing.com', 'bullhorn.com', 'teamtailor.com',
    'workable.com', 'apply.workable.com', 'icims.com',
    'oracle.com', 'oraclecloud.com', 'taleo.net'
  ];

  const isSupportedHost = (hostname) =>
    SUPPORTED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));

  if (!isSupportedHost(window.location.hostname)) {
    console.log('[ATS Tailor] Not a supported ATS host, skipping');
    return;
  }

  console.log('[ATS Tailor] Supported ATS detected - ULTRA-FAST MODE ACTIVE!');

  // ============ STATE ============
  let filesLoaded = false;
  let cvFile = null;
  let coverFile = null;
  let coverLetterText = '';
  const startTime = Date.now();

  // ============ STATUS OVERLAY ============
  function createStatusOverlay() {
    if (document.getElementById('ats-status')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'ats-status';
    overlay.innerHTML = `
      <style>
        #ats-status {
          position: fixed;
          top: 10px;
          right: 10px;
          z-index: 100000;
          background: linear-gradient(135deg, #ff0 0%, #ffa500 100%);
          padding: 12px 16px;
          border-radius: 8px;
          font: bold 12px monospace;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border: 2px solid #000;
        }
        #ats-status .title { font-size: 14px; margin-bottom: 6px; }
        #ats-status .stats { display: flex; gap: 12px; }
      </style>
      <div class="title">⚡ ATS TAILOR ULTRA-FAST 500ms</div>
      <div class="stats">
        <span>⏱️ <span id="ats-timer">0s</span></span>
        <span>📄 CV: <span id="ats-cv-status">🔄</span></span>
        <span>💌 Cover: <span id="ats-cover-status">🔄</span></span>
      </div>
    `;
    document.body.appendChild(overlay);

    // Update timer
    setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const timerEl = document.getElementById('ats-timer');
      if (timerEl) timerEl.textContent = elapsed + 's';
    }, 1000);
  }

  function updateStatus(type, status) {
    const el = document.getElementById(`ats-${type}-status`);
    if (el) el.textContent = status;
  }

  // ============ PDF FILE CREATION ============
  function createPDFFile(base64, name) {
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
      console.log(`[ATS Tailor] Created PDF: ${name} (${file.size} bytes)`);
      return file;
    } catch (e) {
      console.error('[ATS Tailor] PDF creation failed:', e);
      return null;
    }
  }

  // ============ FIELD DETECTION ============
  function isCVField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.getAttribute('aria-label') || '') +
      (input.closest('label')?.textContent || '')
    ).toLowerCase();
    
    // Check parent containers
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
      if ((parentText.includes('resume') || parentText.includes('cv')) && !parentText.includes('cover')) {
        return true;
      }
      parent = parent.parentElement;
    }
    
    return /(resume|cv|curriculum)/i.test(text) && !/cover/i.test(text);
  }

  function isCoverField(input) {
    const text = (
      (input.labels?.[0]?.textContent || '') +
      (input.name || '') +
      (input.id || '') +
      (input.getAttribute('aria-label') || '') +
      (input.closest('label')?.textContent || '')
    ).toLowerCase();
    
    // Check parent containers
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

  // ============ FIRE EVENTS ============
  function fireEvents(input) {
    ['change', 'input'].forEach(type => {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }

  // ============ KILL X BUTTONS ============
  function killXButtons() {
    // Target all possible remove/delete buttons
    const selectors = [
      'button[aria-label*="remove" i]',
      'button[aria-label*="Remove"]',
      'button[aria-label*="delete" i]',
      'button[aria-label*="Delete"]',
      'button[aria-label*="clear" i]',
      '.remove-file',
      '[data-qa-remove]',
      '[data-qa*="remove"]',
      '[data-qa*="delete"]',
      '.file-preview button',
      '.file-upload-remove',
      '.attachment-remove',
      '[class*="remove"]',
      '[class*="delete"]',
      '[class*="clear-file"]'
    ];
    
    document.querySelectorAll(selectors.join(', ')).forEach(btn => {
      try { btn.click(); } catch {}
    });

    // Also target buttons with X text
    document.querySelectorAll('button, [role="button"]').forEach(btn => {
      const text = btn.textContent?.trim();
      if (text === '×' || text === 'x' || text === 'X' || text === '✕') {
        try { btn.click(); } catch {}
      }
    });
  }

  // ============ FORCE CV REPLACE ============
  function forceCVReplace() {
    if (!cvFile) return false;
    let attached = false;
    
    document.querySelectorAll('input[type="file"]').forEach(input => {
      if (isCVField(input)) {
        const dt = new DataTransfer();
        dt.items.add(cvFile);
        input.files = dt.files;
        fireEvents(input);
        attached = true;
        updateStatus('cv', '✅');
      }
    });
    
    return attached;
  }

  // ============ FORCE COVER REPLACE ============
  function forceCoverReplace() {
    if (!coverFile && !coverLetterText) return false;
    let attached = false;
    
    // File inputs
    if (coverFile) {
      document.querySelectorAll('input[type="file"]').forEach(input => {
        if (isCoverField(input)) {
          const dt = new DataTransfer();
          dt.items.add(coverFile);
          input.files = dt.files;
          fireEvents(input);
          attached = true;
          updateStatus('cover', '✅');
        }
      });
    }

    // Textarea cover letters
    if (coverLetterText) {
      document.querySelectorAll('textarea').forEach(textarea => {
        const label = textarea.labels?.[0]?.textContent || textarea.name || textarea.id || '';
        if (/cover/i.test(label)) {
          textarea.value = coverLetterText;
          fireEvents(textarea);
          attached = true;
          updateStatus('cover', '✅');
        }
      });
    }
    
    return attached;
  }

  // ============ FORCE EVERYTHING ============
  function forceEverything() {
    // Force ALL upload buttons to reveal hidden inputs
    document.querySelectorAll('button, [role="button"]').forEach(btn => {
      const text = btn.textContent?.toLowerCase() || '';
      if (/attach|upload|add file|choose file|browse/i.test(text)) {
        try { btn.click(); } catch {}
      }
    });
    
    // Greenhouse specific
    document.querySelectorAll('[data-qa-upload], [data-qa="upload"]').forEach(btn => {
      try { btn.click(); } catch {}
    });
    
    forceCVReplace();
    forceCoverReplace();
  }

  // ============ ULTRA-FAST REPLACE LOOP ============
  function ultraFastReplace() {
    // ULTRA-FAST 500ms loop (catches EVERYTHING)
    setInterval(() => {
      if (!filesLoaded) return;
      
      // 1. X BUTTONS → INSTANT KILL
      killXButtons();
      
      // 2. CV/COVER REPLACE
      forceCVReplace();
      forceCoverReplace();
      
    }, 500); // 500ms = NO MISSES

    // Safety net every 2s - force click upload buttons
    setInterval(() => forceEverything(), 2000);
  }

  // ============ LOAD FILES AND START ============
  function loadFilesAndStart() {
    chrome.storage.local.get(['cvPDF', 'coverPDF', 'coverLetterText'], (data) => {
      cvFile = createPDFFile(data.cvPDF, 'Tailored_Resume.pdf');
      coverFile = createPDFFile(data.coverPDF, 'Tailored_Cover_Letter.pdf');
      coverLetterText = data.coverLetterText || '';
      filesLoaded = true;
      
      if (!cvFile) updateStatus('cv', '❌ No file');
      if (!coverFile && !coverLetterText) updateStatus('cover', '❌ No file');
      
      console.log('[ATS Tailor] Files loaded, starting ULTRA-FAST replace!');
      ultraFastReplace(); // IMMEDIATE START
    });
  }

  // ============ INIT ============
  setTimeout(createStatusOverlay, 300);
  setTimeout(loadFilesAndStart, 500);

})();
