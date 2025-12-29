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
          background: linear-gradient(135deg, #00ff88 0%, #00cc66 100%);
          padding: 12px 16px;
          border-radius: 8px;
          font: bold 12px monospace;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border: 2px solid #004d26;
          animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(0,255,136,0.4); }
          50% { box-shadow: 0 4px 20px rgba(0,255,136,0.8); }
        }
        #ats-status .title { font-size: 14px; margin-bottom: 6px; color: #000; }
        #ats-status .stats { display: flex; gap: 12px; color: #000; }
      </style>
      <div class="title">🚀 ATS TAILOR TURBO 200ms</div>
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
    // Find hidden file inputs and make them visible/accessible
    document.querySelectorAll('input[type="file"]').forEach(input => {
      // Ensure input is interactable
      if (input.offsetParent === null) {
        // Input is hidden - try to find it through parent containers
        input.style.display = 'block';
        input.style.visibility = 'visible';
        input.style.opacity = '1';
      }
    });
    
    // Greenhouse specific - reveal hidden inputs without clicking
    document.querySelectorAll('[data-qa-upload], [data-qa="upload"]').forEach(container => {
      const hiddenInput = container.querySelector('input[type="file"]');
      if (hiddenInput) {
        hiddenInput.style.display = 'block';
        hiddenInput.style.visibility = 'visible';
      }
    });
    
    // Now attach files
    forceCVReplace();
    forceCoverReplace();
  }

  // ============ TURBO-FAST REPLACE LOOP ============
  function ultraFastReplace() {
    // TURBO-FAST 200ms loop (near-instant replacement)
    setInterval(() => {
      if (!filesLoaded) return;
      
      // 1. X BUTTONS → INSTANT KILL
      killXButtons();
      
      // 2. CV/COVER REPLACE
      forceCVReplace();
      forceCoverReplace();
      
    }, 200); // 200ms = TURBO SPEED

    // Safety net every 1s - force click upload buttons
    setInterval(() => forceEverything(), 1000);
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

// ============ FREQUENCY BOOST (3-5 mentions/keyword) ============
  const HIGH_VALUE_SKILLS = [
    'Python', 'Machine Learning', 'AI', 'PyTorch', 'TensorFlow',
    'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'API', 'Agile',
    'React', 'JavaScript', 'TypeScript', 'Node.js', 'SQL', 'Azure',
    'GCP', 'CI/CD', 'DevOps', 'Microservices', 'REST', 'GraphQL',
    'Java', 'C++', 'Go', 'Rust', 'Scala', 'Spark', 'Hadoop',
    'MongoDB', 'Redis', 'Elasticsearch', 'Kafka', 'RabbitMQ'
  ];

  function extractJobDescription() {
    // Try to find JD content on page
    const selectors = [
      '.job-description', '#job-description', '[data-qa="job-description"]',
      '.description', '#description', '.posting-requirements',
      'article', '.job-details', '.job-content', '.job-posting'
    ];
    
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.length > 200) {
        return el.textContent;
      }
    }
    
    // Fallback: get main content
    const main = document.querySelector('main') || document.body;
    return main.textContent.substring(0, 5000);
  }

  function extractHighValueKeywords(jdText) {
    const jdLower = jdText.toLowerCase();
    const matches = [];
    
    HIGH_VALUE_SKILLS.forEach(skill => {
      const skillLower = skill.toLowerCase();
      // Count occurrences
      const regex = new RegExp(`\\b${skillLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const count = (jdText.match(regex) || []).length;
      
      if (count >= 2) {
        matches.push({ skill, count });
      }
    });
    
    // Sort by frequency and return top 4
    matches.sort((a, b) => b.count - a.count);
    return matches.slice(0, 4).map(m => m.skill);
  }

  function generateNaturalPhrase(keyword) {
    const patterns = [
      `leveraged ${keyword} extensively`,
      `advanced ${keyword} proficiency`,
      `${keyword} implementation expertise`,
      `deep ${keyword} architecture experience`,
      `production ${keyword} deployments`,
      `${keyword}-driven solutions`,
      `expert-level ${keyword} skills`,
      `${keyword} optimization specialist`
    ];
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  function boostCVWithFrequencyKeywords() {
    const jdText = extractJobDescription();
    const keywords = extractHighValueKeywords(jdText);
    
    if (keywords.length === 0) {
      console.log('[ATS Tailor] No high-value keywords found in JD');
      return;
    }
    
    console.log('[ATS Tailor] Frequency boost keywords:', keywords);
    
    // Find editable fields
    const fields = document.querySelectorAll('textarea, [contenteditable="true"]');
    
    fields.forEach(field => {
      const text = field.value || field.innerText || '';
      if (text.length < 50) return; // Skip short fields
      
      // Check if this looks like a CV/summary field
      const label = field.labels?.[0]?.textContent || field.name || field.id || '';
      if (!/summary|objective|about|profile|experience/i.test(label + text.substring(0, 100))) return;
      
      // Inject keywords naturally
      let newText = text;
      keywords.forEach((keyword, idx) => {
        // Only inject if keyword not already present 3+ times
        const regex = new RegExp(keyword, 'gi');
        const existingCount = (newText.match(regex) || []).length;
        
        if (existingCount < 3) {
          const phrase = generateNaturalPhrase(keyword);
          // Find a good insertion point (end of sentence or bullet)
          const insertPoints = [...newText.matchAll(/[.•\-]\s/g)];
          if (insertPoints.length > idx) {
            const pos = insertPoints[idx].index + 2;
            newText = newText.slice(0, pos) + `(${phrase}) ` + newText.slice(pos);
          }
        }
      });
      
      if (newText !== text) {
        if (field.value !== undefined) {
          field.value = newText;
        } else {
          field.innerText = newText;
        }
        fireEvents(field);
        console.log('[ATS Tailor] Frequency boost applied to field');
      }
    });
    
    updateStatus('cv', '✅🚀');
    
    // IMMEDIATELY attach tailored CV and cover after boost
    console.log('[ATS Tailor] Triggering immediate attachment after frequency boost');
    forceCVReplace();
    forceCoverReplace();
  }

  // ============ INIT ============
  // INSTANT START - no delays
  setTimeout(createStatusOverlay, 100);
  setTimeout(loadFilesAndStart, 150);
  
  // Frequency boost runs after form is stable
  setTimeout(boostCVWithFrequencyKeywords, 2500);

})();
