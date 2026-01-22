// popup-attachment-bridge.js - Bridge between CV generation and file attachment
// CRITICAL: Converts generated PDFs to base64 and sends to content script for attachment

const PopupAttachmentBridge = {
  // ============ CONVERT BLOB/UINT8ARRAY TO BASE64 ============
  toBase64(data) {
    return new Promise((resolve, reject) => {
      if (data instanceof Uint8Array) {
        // Direct Uint8Array conversion
        let binary = '';
        const bytes = new Uint8Array(data);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        resolve(btoa(binary));
      } else if (data instanceof Blob) {
        // Blob to base64
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(data);
      } else {
        reject(new Error('Unsupported data type'));
      }
    });
  },

  // ============ MAIN TRIGGER FUNCTION ============
  // Call this AFTER CV and cover letter are generated
  async attachGeneratedFiles(cvPdfData, coverLetterPdfData, cvFilename = 'tailored-cv.pdf', coverFilename = 'tailored-cover.pdf') {
    console.log('[PopupAttachmentBridge] Starting file attachment process');
    console.log('[PopupAttachmentBridge] CV data type:', cvPdfData?.constructor?.name);
    console.log('[PopupAttachmentBridge] Cover data type:', coverLetterPdfData?.constructor?.name);

    try {
      // Convert PDFs to base64
      let cvBase64 = null;
      let coverBase64 = null;

      if (cvPdfData) {
        console.log('[PopupAttachmentBridge] Converting CV to base64...');
        cvBase64 = await this.toBase64(cvPdfData);
        console.log('[PopupAttachmentBridge] CV base64 length:', cvBase64?.length);
      }

      if (coverLetterPdfData) {
        console.log('[PopupAttachmentBridge] Converting cover letter to base64...');
        coverBase64 = await this.toBase64(coverLetterPdfData);
        console.log('[PopupAttachmentBridge] Cover base64 length:', coverBase64?.length);
      }

      // Get the active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab?.id) {
        console.error('[PopupAttachmentBridge] No active tab found');
        return false;
      }

      console.log('[PopupAttachmentBridge] Active tab ID:', activeTab.id);
      console.log('[PopupAttachmentBridge] Active tab URL:', activeTab.url);

      // Send message to content script with base64 data
      const message = {
        action: 'ATTACH_TAILORED_FILES',
        cvData: cvBase64,
        cvFilename: cvFilename,
        coverData: coverBase64,
        coverFilename: coverFilename,
        timestamp: Date.now()
      };

      console.log('[PopupAttachmentBridge] Sending attachment message to tab', activeTab.id);

      // Try to send message directly
      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, message);
        console.log('[PopupAttachmentBridge] Content script response:', response);
        return true;
      } catch (err) {
        console.warn('[PopupAttachmentBridge] Could not reach content script directly:', err.message);
        
        // Fallback: Store in chrome.storage for the content script to pick up
        console.log('[PopupAttachmentBridge] Using fallback storage method');
        await chrome.storage.local.set({
          pending_file_attachment: message
        });
        console.log('[PopupAttachmentBridge] Message stored in chrome.storage.local');
        
        // Try injecting the content script if it's not loaded
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['file-attacher-turbo-fixed.js']
          });
          console.log('[PopupAttachmentBridge] Injected file-attacher-turbo-fixed.js');
        } catch (injErr) {
          console.error('[PopupAttachmentBridge] Could not inject script:', injErr);
        }
        
        return true; // Still considered success since we stored it
      }
    } catch (err) {
      console.error('[PopupAttachmentBridge] Error in attachGeneratedFiles:', err);
      return false;
    }
  },

  // ============ INTEGRATION POINT FOR POPUP.JS ============
  // Add this to popup.js after CV generation completes:
  // if (window.PopupAttachmentBridge) {
  //   PopupAttachmentBridge.attachGeneratedFiles(cvPdfBlob, coverLetterPdfBlob, 'cv-tailored.pdf', 'cover-tailored.pdf');
  // }

  // ============ TEST/DEBUG METHOD ============
  async testAttachment() {
    console.log('[PopupAttachmentBridge] Running test...');
    
    // Create test PDF blobs
    const testPdfCV = new Blob(['Test CV Content'], { type: 'application/pdf' });
    const testPdfCover = new Blob(['Test Cover Letter Content'], { type: 'application/pdf' });

    return this.attachGeneratedFiles(testPdfCV, testPdfCover, 'test-cv.pdf', 'test-cover.pdf');
  }
};

// Make globally accessible
if (typeof window !== 'undefined') {
  window.PopupAttachmentBridge = PopupAttachmentBridge;
}
