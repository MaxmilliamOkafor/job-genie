# File Attachment Fix Guide

## Problem
The tailored CV and cover letter PDFs were being generated perfectly but **not being attached** to the application form inputs on ATS platforms.

## Root Cause
1. **Missing bridge** between PDF generation in `popup.js` and file attachment in `content.js`
2. **No base64 conversion** - files weren't being properly serialized for message passing
3. **Broken DataTransfer mechanism** - file inputs weren't receiving the File objects

## Solution Overview

Three new files fix this completely:

### 1. **file-attacher-turbo-fixed.js** (Content Script)
- Listens for `ATTACH_TAILORED_FILES` message from popup
- Converts base64 data back to File objects
- Detects CV and cover letter form inputs
- Attaches files using DataTransfer API
- Triggers proper change/input/blur events

### 2. **popup-attachment-bridge.js** (Popup Script)
- Converts generated PDF blobs to base64
- Sends message to content script with file data
- Implements fallback storage mechanism
- Can be called from `popup.js` after CV generation

### 3. **manifest.json** (Updated)
- Replaced old `file-attacher-turbo.js` with `file-attacher-turbo-fixed.js`
- Added `popup-attachment-bridge.js` to web accessible resources

---

## Implementation: Add to popup.js

### Step 1: Add Script Reference
In your `popup.html`, add BEFORE the main `popup.js` script:

```html
<!-- File attachment bridge -->
<script src="popup-attachment-bridge.js"></script>
<!-- Then your main popup.js -->
<script src="popup.js"></script>
```

### Step 2: Find CV Generation Completion
In `popup.js`, locate where the tailored CV and cover letter PDFs are generated. Look for code like:

```javascript
// Example location in popup.js
const cvPdf = await generateTailoredCV(...);
const coverLetterPdf = await generateCoverLetter(...);
```

Or search for:
- `jsPDF` instantiation
- `pdf-ats-turbo`
- `generatePDF`
- `pdfBytes`
- `pdfBlob`

### Step 3: Trigger File Attachment
Immediately after CV generation completes, add:

```javascript
// AFTER CV and cover letter PDFs are generated successfully
if (window.PopupAttachmentBridge && (cvPdf || coverLetterPdf)) {
  console.log('[Popup] Triggering file attachment...');
  
  PopupAttachmentBridge.attachGeneratedFiles(
    cvPdf,                    // CV PDF Blob/Uint8Array
    coverLetterPdf,           // Cover Letter PDF Blob/Uint8Array
    'tailored-cv.pdf',        // CV filename
    'tailored-cover-letter.pdf' // Cover filename
  ).then(success => {
    if (success) {
      console.log('[Popup] Files attached successfully');
      // Show success message to user
      showNotification('✓ CV and cover letter attached to form!');
    } else {
      console.error('[Popup] File attachment failed');
    }
  });
}
```

### Step 4: Test

1. **Reload extension** in `chrome://extensions/`
2. **Open an ATS application page** (Greenhouse, Workday, etc.)
3. **Trigger CV tailoring** from your popup
4. **Check browser console** for:
   - `[PopupAttachmentBridge] Sending attachment message...`
   - `[FileAttacher] Received ATTACH_TAILORED_FILES message`
   - `[FileAttacher] ✓ File attached to input: tailored-cv.pdf`
5. **Verify form** - file inputs should now be populated

---

## Debug Checklist

### If files aren't attaching:

1. **Check Console Logs**
   - Search for `[FileAttacher]` in DevTools console
   - Look for errors about `ATTACH_TAILORED_FILES`
   - Verify file input count is > 0

2. **Verify Blobs Are Generated**
   ```javascript
   // In popup.js, after CV generation:
   console.log('CV PDF type:', cvPdf?.constructor?.name);
   console.log('CV PDF size:', cvPdf?.size || cvPdf?.byteLength);
   ```

3. **Test Message Passing**
   - In popup: `console.log('[Test] Sending to tab', tabId)`
   - In content script: `console.log('[Test] Received message')` should appear

4. **Verify Input Detection**
   - Run in console on ATS page:
   ```javascript
   const inputs = document.querySelectorAll('input[type="file"]');
   console.log('File inputs found:', inputs.length);
   inputs.forEach((inp, i) => {
     console.log(`Input ${i}:`, inp.name, inp.id, inp.getAttribute('aria-label'));
   });
   ```

5. **Manual Attachment Test**
   - In console on ATS page:
   ```javascript
   FileAttacher.testAttachment(); // Built-in test
   ```

---

## Key Technical Details

### Base64 Conversion
PDFs are converted to base64 for message passing because:
- Content scripts can't directly receive Blob/File objects via `chrome.tabs.sendMessage`
- Base64 is safe JSON serialization format
- Reconverted to File objects in content script using `DataTransfer` API

### DataTransfer Mechanism
```javascript
const dataTransfer = new DataTransfer();
dataTransfer.items.add(fileObject);
input.files = dataTransfer.files; // Attach files
input.dispatchEvent(new Event('change', { bubbles: true })); // Trigger detection
```

### Event Triggering
Multiple events dispatched for maximum ATS compatibility:
- `change` - Standard file input change
- `input` - HTML5 input event
- `blur` - Field lost focus
- `click` - Some systems require this

---

## Files Modified

| File | Change |
|------|--------|
| `manifest.json` | Updated `file-attacher-turbo.js` → `file-attacher-turbo-fixed.js` |
| `popup.js` | **TODO: Add attachment trigger after CV generation** |

## Files Created

| File | Purpose |
|------|----------|
| `file-attacher-turbo-fixed.js` | Content script that receives and attaches files |
| `popup-attachment-bridge.js` | Bridge to convert PDFs and trigger attachment |

---

## Expected Behavior After Fix

✓ User generates tailored CV and cover letter  
✓ PDFs are instantly attached to form inputs  
✓ ATS recognizes files as "uploaded"  
✓ User can submit application with attached documents  

---

## Fallback Mechanism

If content script isn't loaded, the bridge:
1. Stores pending attachment in `chrome.storage.local`
2. Injects `file-attacher-turbo-fixed.js` script
3. Content script picks up stored files on load

This ensures files attach even if timing issues occur.
