// ATS Tailored CV & Cover Letter - Content Script
// Auto-start tailoring on supported ATS pages + attach generated PDFs to form inputs
// LAZYAPPLY CONFLICT PREVENTION: Waits 12s+, then monitors & re-attaches if overwritten

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
    if (ghInput) return ghInput;

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
          console.log(`[ATS Tailor] Found ${type} input:`, selector);
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
          console.log(`[ATS Tailor] Found ${type} input via label:`, text.substring(0, 50));
          return input;
        }
      }

      const nested = label.querySelector('input[type="file"]');
      if (nested) {
        console.log(`[ATS Tailor] Found ${type} input nested in label:`, text.substring(0, 50));
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
        console.log('[ATS Tailor] Using the only file input on page as CV input');
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

    console.log(`[ATS Tailor] Could not find ${type} input`);
    return null;
  }

  function base64ToFile(base64, filename, type = 'application/pdf') {
    const byteCharacters = atob(base64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
    const blob = new Blob([byteArray], { type });
    return new File([blob], filename, { type });
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
      console.log(`[ATS Tailor] Overriding existing file: "${existingFile.name}" with tailored: "${file.name}"`);
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
    console.log('[ATS Tailor] Attach result:', {
      requested: file?.name,
      attached: attachedName,
      success: ok && attachedName === file.name,
    });

    return ok && attachedName === file.name;
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
        console.log(`[ATS Tailor] Overwrite detected: "${currentName}" -> re-attaching "${ourName}"`);
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

    if (type === 'cv') {
      // Store our file for monitoring
      ourAttachedFiles[type] = file;

      // AGGRESSIVE CLEAR: Remove any existing file first
      const existingFile = input?.files?.[0];
      if (existingFile) {
        console.log(`[ATS Tailor] Pre-attach clear of: "${existingFile.name}"`);
        clearFileInput(input);
        await sleep(300);
      }

      // First attach attempt
      let attachedOk = attachFileToInput(input, file);

      // If blocked, try once more shortly after (some ATS scripts mutate the DOM right after)
      if (!attachedOk) {
        await sleep(350);
        clearFileInput(input);
        await sleep(200);
        attachedOk = attachFileToInput(input, file);
      }

      // Multiple verification checks to catch LazyApply overwrites
      const checkIntervals = [1500, 3000, 5000, 8000];
      for (const delay of checkIntervals) {
        await sleep(delay - (checkIntervals.indexOf(delay) > 0 ? checkIntervals[checkIntervals.indexOf(delay) - 1] : 0));
        
        const currentName = input?.files?.[0]?.name;
        if (!currentName) {
          // File was cleared - re-attach
          console.log(`[ATS Tailor] File was cleared at ${delay}ms - re-attaching`);
          attachFileToInput(input, file);
        } else if (currentName !== file.name) {
          // Different file attached (likely LazyApply)
          console.log(`[ATS Tailor] Overwrite detected at ${delay}ms: "${currentName}" -> re-attaching "${file.name}"`);
          clearFileInput(input);
          await sleep(200);
          attachFileToInput(input, file);
          showNotification(`LazyApply override blocked - using ATS-optimized CV`, 'success');
        }
      }

      // Start lightweight monitoring for future overwrites
      startFileMonitoring(type, input);
      return;
    }

    // Non-CV: just attach (no monitoring)
    attachFileToInput(input, file);
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

    // Double-check cooldown after acquiring lock (race condition guard)
    const freshData = await storageGet(['ats_lastTailoredUrl', 'ats_lastTailoredAt']);
    if (
      freshData.ats_lastTailoredUrl === job.url &&
      freshData.ats_lastTailoredAt &&
      Date.now() - freshData.ats_lastTailoredAt < AUTO_TAILOR_COOLDOWN_MS
    ) {
      console.log('[ATS Tailor] Cooldown active (double-check), skipping');
      autoTailorRunning = false;
      autoTailorCompletedForUrl = job.url;
      return;
    }

    await storageSet({ ats_lastTailoredUrl: job.url, ats_lastTailoredAt: Date.now() });

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

      // Try to auto-attach if the form has file inputs
      const resumeInput = findFileInput('cv');
      const coverInput = findFileInput('cover');

      let attachedAny = false;

      if (resumePdf && resumeInput) {
        // LazyApply attaches its CV early; we wait, then override + monitor.
        await waitForSafeCvWindow();
        
        // CRITICAL: Check and clear any existing file (LazyApply or other)
        const existingCvFile = resumeInput.files?.[0];
        if (existingCvFile) {
          console.log(`[ATS Tailor] Found existing CV file: "${existingCvFile.name}" - removing before attaching optimized version`);
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
          console.log(`[ATS Tailor] Found existing cover letter: "${existingCoverFile.name}" - removing before attaching optimized version`);
          clearFileInput(coverInput);
          await sleep(500);
        }
        
        await attachWithMonitoring(coverInput, base64ToFile(coverLetterPdf, coverName), 'cover');
        attachedAny = true;
      }

      if (attachedAny) {
        showNotification('✓ Tailored PDFs attached to the form!', 'success');
      } else {
        showNotification('✓ Done! Click extension icon to download/attach.', 'success');
      }

      // Mark completed for this URL this page load
      autoTailorCompletedForUrl = job.url;
    } catch (e) {
      console.error('[ATS Tailor] Auto-tailor error:', e);
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
            // Do not treat this as an error (and don't spam users).
            if (type === 'cover') {
              console.log('[ATS Tailor] No cover letter upload field found (likely a text field)');
              showNotification('No cover letter upload field on this page (CV will still attach).', 'info');
              sendResponse({ success: true, skipped: true, message: 'Cover letter file input not found' });
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

          // For CV: wait for LazyApply window then override
          if (type === 'cv') {
            await waitForSafeCvWindow();
            // Re-check and clear again after wait (LazyApply may have attached during wait)
            const afterWaitFile = input?.files?.[0];
            if (afterWaitFile) {
              console.log(`[ATS Tailor] Post-wait clear of: "${afterWaitFile.name}"`);
              clearFileInput(input);
              await sleep(200);
            }
          }

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

