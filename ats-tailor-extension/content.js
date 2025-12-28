// ATS Tailored CV & Cover Letter - Content Script
// Auto-start tailoring on supported ATS pages + attach generated PDFs to form inputs
// LAZYAPPLY CONFLICT PREVENTION: Waits 12s+, then monitors & re-attaches if overwritten

(function () {
  'use strict';

  console.log('[ATS Tailor] Content script loaded on:', window.location.hostname);

  // ============ LAZYAPPLY CONFLICT PREVENTION ============
  // LazyApply typically attaches CV at 8-12s mark. We wait until 14s to override.
  const PAGE_LOAD_TS = Date.now();
  const SAFE_CV_ATTACH_AFTER_MS = 14_000; // Wait 14s to let LazyApply finish
  const MONITOR_DURATION_MS = 30_000; // Monitor for 30s after our attach
  const MONITOR_INTERVAL_MS = 2_000; // Check every 2s

  // Track our attached files to detect overwrites
  let ourAttachedFiles = { cv: null, cover: null };
  let monitoringActive = false;

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
      // Greenhouse
      '#resume_file',
      '#s3_upload_for_resume',
      'input[name="resume"]',
      'input[id*="resume" i]',
      // Workday
      'input[data-automation-id="file-upload-input-ref"]',
      // Generic
      'input[type="file"][name*="resume" i]',
      'input[type="file"][name*="cv" i]',
      'input[type="file"][id*="cv" i]',
      'input[type="file"][accept*=".pdf"]',
      'input[type="file"]:first-of-type',
    ],
    coverLetter: [
      // Greenhouse
      '#cover_letter_file',
      '#s3_upload_for_cover_letter',
      'input[name="cover_letter"]',
      'input[id*="cover" i]',
      // Generic
      'input[type="file"][name*="cover" i]',
      'input[type="file"][name*="letter" i]',
      'input[type="file"]:nth-of-type(2)',
    ],
  };

  function findFileInput(type) {
    const selectors = type === 'cv' ? FILE_INPUT_SELECTORS.resume : FILE_INPUT_SELECTORS.coverLetter;

    for (const selector of selectors) {
      try {
        const input = document.querySelector(selector);
        if (input && input.type === 'file') {
          console.log(`[ATS Tailor] Found ${type} input:`, selector);
          return input;
        }
      } catch {
        // ignore invalid selectors
      }
    }

    // Label fallback
    const labels = document.querySelectorAll('label');
    for (const label of labels) {
      const text = (label.textContent || '').toLowerCase();
      const isMatch =
        type === 'cv' ? text.includes('resume') || text.includes('cv') : text.includes('cover');

      if (!isMatch) continue;

      const forId = label.getAttribute('for');
      if (forId) {
        const input = document.getElementById(forId);
        if (input?.type === 'file') return input;
      }

      const nested = label.querySelector('input[type="file"]');
      if (nested) return nested;
    }

    return null;
  }

  function base64ToFile(base64, filename, type = 'application/pdf') {
    const byteCharacters = atob(base64);
    const byteArray = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
    const blob = new Blob([byteArray], { type });
    return new File([blob], filename, { type });
  }

  function attachFileToInput(input, file) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;

    ['change', 'input', 'blur'].forEach((eventType) => {
      input.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
    });

    console.log('[ATS Tailor] File attached:', file.name);
    return true;
  }

  // Monitor file inputs and re-attach if LazyApply overwrites
  function startFileMonitoring(type, file, input) {
    if (monitoringActive) return;
    monitoringActive = true;

    const startTime = Date.now();
    const intervalId = setInterval(() => {
      if (Date.now() - startTime > MONITOR_DURATION_MS) {
        clearInterval(intervalId);
        monitoringActive = false;
        console.log('[ATS Tailor] Stopped monitoring for overwrites');
        return;
      }

      const currentFile = input?.files?.[0];
      const currentName = currentFile?.name;
      const ourName = ourAttachedFiles[type]?.name;

      if (currentName && ourName && currentName !== ourName) {
        // Another extension overwrote our file
        if (isLazyApplyFilename(currentName)) {
          console.log(`[ATS Tailor] LazyApply overwrite detected: "${currentName}" -> re-attaching "${ourName}"`);
          attachFileToInput(input, ourAttachedFiles[type]);
          showNotification(`LazyApply override blocked - using ATS-optimized ${type.toUpperCase()}`, 'success');
        } else {
          console.log(`[ATS Tailor] Unknown overwrite: "${currentName}" (not re-attaching)`);
        }
      }
    }, MONITOR_INTERVAL_MS);
  }

  async function attachWithMonitoring(input, file, type) {
    // Store our file for monitoring
    ourAttachedFiles[type] = file;

    attachFileToInput(input, file);

    // Wait a moment then check if immediately overwritten
    await sleep(1500);

    const currentName = input?.files?.[0]?.name;
    if (currentName && currentName !== file.name) {
      console.log('[ATS Tailor] Immediate overwrite detected, re-attaching:', { expected: file.name, found: currentName });
      attachFileToInput(input, file);
    }

    // Start continuous monitoring for LazyApply overwrites
    startFileMonitoring(type, file, input);
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

    return {
      title: title.substring(0, 200),
      company: company.substring(0, 100),
      location: location.substring(0, 100),
      description,
      url: window.location.href,
    };
  }

  async function autoTailorIfPossible() {
    console.log('[ATS Tailor] Attempting auto-tailor...');

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

    if (
      ats_lastTailoredUrl === job.url &&
      ats_lastTailoredAt &&
      now - ats_lastTailoredAt < AUTO_TAILOR_COOLDOWN_MS
    ) {
      console.log('[ATS Tailor] Cooldown active, skipping auto-tailor');
      return;
    }

    if (!ats_session?.access_token) {
      console.log('[ATS Tailor] Not logged in');
      showNotification('ATS Tailor: Please sign in (click extension icon)', 'error');
      return;
    }

    await storageSet({ ats_lastTailoredUrl: job.url, ats_lastTailoredAt: now });

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

      // Try to auto-attach if the form has file inputs
      const resumeInput = findFileInput('cv');
      const coverInput = findFileInput('cover');

      // Prefer filenames returned by backend (based on user profile)
      const resumeName = result.cvFileName || 'Tailored_CV.pdf';
      const coverName = result.coverLetterFileName || 'Tailored_Cover_Letter.pdf';

      let attachedAny = false;

      if (resumePdf && resumeInput) {
        // LazyApply attaches its CV early; we wait, then override + monitor.
        await waitForSafeCvWindow();
        await attachWithMonitoring(resumeInput, base64ToFile(resumePdf, resumeName), 'cv');
        attachedAny = true;
      }

      if (coverLetterPdf && coverInput) {
        await attachWithMonitoring(coverInput, base64ToFile(coverLetterPdf, coverName), 'cover');
        attachedAny = true;
      }

      if (attachedAny) {
        showNotification('✓ Tailored PDFs attached to the form!', 'success');
      } else {
        showNotification('✓ Done! Click extension icon to download/attach.', 'success');
      }
    } catch (e) {
      console.error('[ATS Tailor] Auto-tailor error:', e);
      showNotification('Tailoring failed - click extension for details', 'error');
    }
  }

  // Some ATS pages render content after load; try a few times quickly
  const tryTimes = [800, 2000, 4000];
  tryTimes.forEach((ms) => setTimeout(autoTailorIfPossible, ms));

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'attachDocument') {
      (async () => {
        try {
          const { type, pdf, text, filename } = message;

          const input = findFileInput(type);
          if (!input) {
            showNotification(
              `Could not find ${type === 'cv' ? 'resume' : 'cover letter'} upload field.`,
              'error'
            );
            sendResponse({ success: false, message: 'File input not found' });
            return;
          }

          // Ensure we override LazyApply CV if it attaches first.
          if (type === 'cv') {
            await waitForSafeCvWindow();
          }

          if (pdf) {
            const file = base64ToFile(pdf, filename, 'application/pdf');
            await attachWithMonitoring(input, file, type);
            showNotification(`${type === 'cv' ? 'CV' : 'Cover Letter'} attached!`, 'success');
            sendResponse({ success: true });
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

