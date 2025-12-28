// ATS Tailored CV & Cover Letter - Content Script
// Handles file attachment to job application forms
// Works alongside LazyApply - does NOT handle autofill or submission

(function() {
  'use strict';

  console.log('[ATS Tailor] Content script loaded');

  // File input selectors for different platforms
  const FILE_INPUT_SELECTORS = {
    resume: [
      'input[type="file"][name*="resume" i]',
      'input[type="file"][name*="cv" i]',
      'input[type="file"][id*="resume" i]',
      'input[type="file"][id*="cv" i]',
      'input[type="file"][accept*=".pdf"][name*="resume" i]',
      'input[type="file"][data-automation-id*="resume" i]',
      'input[type="file"][aria-label*="resume" i]',
      'input[type="file"][aria-label*="cv" i]',
      // Greenhouse
      '#resume_file',
      '#s3_upload_for_resume',
      'input[name="resume"]',
      // Lever
      'input[name="resume"]',
      'input.resume-upload',
      // Workday
      'input[data-automation-id="file-upload-input-ref"]',
      // Generic
      'input[type="file"]:first-of-type'
    ],
    coverLetter: [
      'input[type="file"][name*="cover" i]',
      'input[type="file"][name*="letter" i]',
      'input[type="file"][id*="cover" i]',
      'input[type="file"][aria-label*="cover" i]',
      // Greenhouse
      '#cover_letter_file',
      '#s3_upload_for_cover_letter',
      'input[name="cover_letter"]',
      // Lever
      'input[name="coverLetter"]',
      // Generic fallback - second file input
      'input[type="file"]:nth-of-type(2)'
    ]
  };

  // Find file input element
  function findFileInput(type) {
    const selectors = type === 'cv' ? FILE_INPUT_SELECTORS.resume : FILE_INPUT_SELECTORS.coverLetter;
    
    for (const selector of selectors) {
      try {
        const input = document.querySelector(selector);
        if (input && input.type === 'file') {
          console.log(`[ATS Tailor] Found ${type} input:`, selector);
          return input;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // Fallback: search by labels
    const labels = document.querySelectorAll('label');
    for (const label of labels) {
      const text = label.textContent.toLowerCase();
      const isMatch = type === 'cv' 
        ? (text.includes('resume') || text.includes('cv'))
        : text.includes('cover');
      
      if (isMatch) {
        // Check for associated input
        const forId = label.getAttribute('for');
        if (forId) {
          const input = document.getElementById(forId);
          if (input?.type === 'file') {
            console.log(`[ATS Tailor] Found ${type} input via label:`, forId);
            return input;
          }
        }
        
        // Check for nested input
        const nestedInput = label.querySelector('input[type="file"]');
        if (nestedInput) {
          console.log(`[ATS Tailor] Found ${type} input nested in label`);
          return nestedInput;
        }
      }
    }

    console.log(`[ATS Tailor] No ${type} input found`);
    return null;
  }

  // Convert base64 to File object
  function base64ToFile(base64, filename, type = 'application/pdf') {
    try {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type });
      return new File([blob], filename, { type });
    } catch (e) {
      console.error('[ATS Tailor] Error converting base64:', e);
      return null;
    }
  }

  // Attach file to input
  function attachFileToInput(input, file) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;

    // Trigger change events
    const events = ['change', 'input'];
    events.forEach(eventType => {
      const event = new Event(eventType, { bubbles: true, cancelable: true });
      input.dispatchEvent(event);
    });

    // React-specific handling
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      const changeEvent = new Event('change', { bubbles: true });
      input.dispatchEvent(changeEvent);
    }

    console.log(`[ATS Tailor] File attached:`, file.name);
    return true;
  }

  // Handle document attachment
  async function handleAttachDocument(data) {
    const { type, pdf, text, filename } = data;
    
    console.log(`[ATS Tailor] Attaching ${type}:`, filename);

    // Find the appropriate input
    const input = findFileInput(type);
    
    if (!input) {
      console.error(`[ATS Tailor] No file input found for ${type}`);
      showNotification(`Could not find ${type === 'cv' ? 'resume' : 'cover letter'} upload field. Please attach manually.`, 'error');
      return { success: false, message: 'File input not found' };
    }

    // Create file from base64 PDF or text
    let file;
    if (pdf) {
      file = base64ToFile(pdf, filename, 'application/pdf');
    } else if (text) {
      // Create a text file if no PDF
      const blob = new Blob([text], { type: 'text/plain' });
      const txtFilename = filename.replace('.pdf', '.txt');
      file = new File([blob], txtFilename, { type: 'text/plain' });
    }

    if (!file) {
      console.error('[ATS Tailor] Could not create file');
      return { success: false, message: 'Could not create file' };
    }

    // Attach the file
    const success = attachFileToInput(input, file);
    
    if (success) {
      showNotification(`${type === 'cv' ? 'Resume' : 'Cover Letter'} attached successfully!`, 'success');
      return { success: true };
    } else {
      return { success: false, message: 'Failed to attach file' };
    }
  }

  // Show notification
  function showNotification(message, type = 'success') {
    // Remove existing notification
    const existing = document.getElementById('ats-tailor-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'ats-tailor-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#10b981' : '#ef4444'};
      color: white;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);

    // Auto remove
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[ATS Tailor] Message received:', message.action);

    if (message.action === 'attachDocument') {
      handleAttachDocument(message)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, message: error.message }));
      return true; // Keep channel open for async response
    }

    if (message.action === 'ping') {
      sendResponse({ pong: true });
      return true;
    }
  });

  // Notify that content script is ready
  console.log('[ATS Tailor] Content script ready for file attachment');

})();
