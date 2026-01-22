// file-attacher-turbo-fixed.js - ULTRA BLAZING: File attachment fix (≤0.5ms after receiving files)
// CRITICAL: Now receives blobs via message from popup and attaches to form inputs

(function() {
  'use strict';

  const FileAttacher = {
    // ============ TIMING TARGET (ULTRA BLAZING) ============
    TIMING_TARGET: 0.5,

    // ============ PIPELINE STATE ============
    pipelineState: {
      cvAttached: false,
      coverAttached: false,
      lastAttachedFiles: null,
      jobGenieReady: false,
      pendingCVBlob: null,
      pendingCoverBlob: null
    },

    // ============ CV FIELD DETECTION ============
    isCVField(input) {
      const text = (
        (input.labels?.[0]?.textContent || '') +
        (input.name || '') +
        (input.id || '') +
        (input.getAttribute('aria-label') || '') +
        (input.getAttribute('data-qa') || '') +
        (input.closest('label')?.textContent || '')
      ).toLowerCase();

      let parent = input.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const parentText = (parent.textContent || '').toLowerCase().substring(0, 200);
        if ((parentText.includes('resume') || parentText.includes('cv')) && !parentText.includes('cover')) {
          return true;
        }
        parent = parent.parentElement;
      }

      return /(resume|cv|curriculum)/i.test(text) && !/cover/i.test(text);
    },

    // ============ COVER LETTER FIELD DETECTION ============
    isCoverField(input) {
      const text = (
        (input.labels?.[0]?.textContent || '') +
        (input.name || '') +
        (input.id || '') +
        (input.getAttribute('aria-label') || '') +
        (input.getAttribute('data-qa') || '') +
        (input.closest('label')?.textContent || '')
      ).toLowerCase();

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

    // ============ BLOB-TO-FILE CONVERSION ============
    // CRITICAL: Convert base64 blob data to actual File object
    async blobFromBase64(base64Data, filename, mimeType) {
      try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        return new File([blob], filename, { type: mimeType });
      } catch (err) {
        console.error('[FileAttacher] Error converting base64 to file:', err);
        return null;
      }
    },

    // ============ ATTACH FILE TO INPUT ============
    // CRITICAL: This is the core attach mechanism
    async attachFileToInput(input, fileObj) {
      if (!input || !fileObj) {
        console.warn('[FileAttacher] Missing input or file object');
        return false;
      }

      try {
        // Create DataTransfer object with the file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(fileObj);
        input.files = dataTransfer.files;

        // Trigger change event so ATS detects the file
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        // Some ATS systems require additional events
        input.dispatchEvent(new Event('click', { bubbles: true }));

        console.log('[FileAttacher] ✓ File attached to input:', fileObj.name);
        return true;
      } catch (err) {
        console.error('[FileAttacher] Error attaching file:', err);
        return false;
      }
    },

    // ============ FIND AND ATTACH ALL FILES ============
    async attachAllFiles(cvFile, coverFile) {
      const formInputs = document.querySelectorAll('input[type="file"]');
      let cvAttached = false;
      let coverAttached = false;

      console.log('[FileAttacher] Found', formInputs.length, 'file inputs');

      for (const input of formInputs) {
        // Check if this is a CV field
        if (!cvAttached && this.isCVField(input) && cvFile) {
          console.log('[FileAttacher] Attempting to attach CV to field');
          cvAttached = await this.attachFileToInput(input, cvFile);
          if (cvAttached) {
            this.pipelineState.cvAttached = true;
          }
        }

        // Check if this is a cover letter field
        if (!coverAttached && this.isCoverField(input) && coverFile) {
          console.log('[FileAttacher] Attempting to attach cover letter to field');
          coverAttached = await this.attachFileToInput(input, coverFile);
          if (coverAttached) {
            this.pipelineState.coverAttached = true;
          }
        }

        // Early exit if both attached
        if (cvAttached && coverAttached) break;
      }

      console.log('[FileAttacher] Attachment complete - CV:', cvAttached, 'Cover:', coverAttached);
      return { cvAttached, coverAttached };
    },

    // ============ HANDLE MESSAGE FROM POPUP (CRITICAL ENTRY POINT) ============
    handleAttachmentMessage(message) {
      console.log('[FileAttacher] Received attachment message:', {
        hasCVData: !!message.cvData,
        hasCoverData: !!message.coverData,
        cvFilename: message.cvFilename,
        coverFilename: message.coverFilename
      });

      // Convert base64 to File objects and attach
      this.attachPendingFiles(message.cvData, message.cvFilename, message.coverData, message.coverFilename);
    },

    // ============ CONVERT AND ATTACH PENDING FILES ============
    async attachPendingFiles(cvBase64, cvFilename, coverBase64, coverFilename) {
      let cvFile = null;
      let coverFile = null;

      try {
        // Convert base64 to File objects
        if (cvBase64 && cvFilename) {
          cvFile = await this.blobFromBase64(cvBase64, cvFilename, 'application/pdf');
          if (!cvFile) {
            console.error('[FileAttacher] Failed to convert CV base64 to file');
          }
        }

        if (coverBase64 && coverFilename) {
          coverFile = await this.blobFromBase64(coverBase64, coverFilename, 'application/pdf');
          if (!coverFile) {
            console.error('[FileAttacher] Failed to convert cover letter base64 to file');
          }
        }

        // Now attach the files to form inputs
        if (cvFile || coverFile) {
          const result = await this.attachAllFiles(cvFile, coverFile);
          console.log('[FileAttacher] Final attachment result:', result);
        }
      } catch (err) {
        console.error('[FileAttacher] Error in attachPendingFiles:', err);
      }
    }
  };

  // ============ LISTEN FOR MESSAGES FROM POPUP ============
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ATTACH_TAILORED_FILES') {
      console.log('[FileAttacher] Received ATTACH_TAILORED_FILES message');
      FileAttacher.handleAttachmentMessage(message);
      sendResponse({ status: 'processing' });
      return true;
    }
  });

  // ============ AUTO-ATTACH WHEN CONTENT LOADS ============
  // Also check if there are pending files in storage on page load
  window.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get('pending_file_attachment', (result) => {
      if (result.pending_file_attachment) {
        console.log('[FileAttacher] Found pending file attachment in storage');
        const data = result.pending_file_attachment;
        FileAttacher.handleAttachmentMessage(data);
        // Clear the stored data after processing
        chrome.storage.local.remove('pending_file_attachment');
      }
    });
  });

  // Expose globally for debugging
  window.FileAttacher = FileAttacher;
})();
