/**
 * Job Genie - Gmail compose attachment bridge
 *
 * WHY THIS EXISTS
 *   Gmail's compose URL (?view=cm&to=...&su=...&body=...) can prefill the
 *   recipient, subject and body, but it has NO parameter for files. So the
 *   no-setup send path could not carry the tailored CV and cover letter,
 *   and attachments were left needing the full OAuth/Gmail API setup.
 *
 *   The compose window is still just a web page, though, and this
 *   extension can act on it. So instead of asking Gmail to accept files
 *   through a URL, we attach them the same way a person does: by dropping
 *   them onto the compose window.
 *
 * HOW
 *   1. The popup stashes the files (base64 + filename) in extension
 *      storage under a one-shot key, then opens the compose URL.
 *   2. This script runs on mail.google.com, waits for a compose window,
 *      reconstructs real File objects, and attaches them.
 *   3. The payload is deleted immediately after use, and expires on its
 *      own, so documents never linger in storage.
 *
 * ATTACHMENT STRATEGIES, in order
 *   a. drop event carrying a DataTransfer -- what Gmail's own drag-to-
 *      attach listens for, and the most reliable.
 *   b. assigning .files on the hidden <input type="file"> behind the
 *      paperclip, then firing change.
 *   Each is verified by looking for the attachment chip Gmail renders, so
 *   a silent failure is reported rather than assumed to have worked.
 *
 * NOTHING LEAVES THE MACHINE. The files are read from local storage and
 * handed to the page; no network request is made here.
 */
(function () {
  'use strict';

  if (window.__JG_GMAIL_ATTACH__) return;
  window.__JG_GMAIL_ATTACH__ = true;

  const TAG = '[JG-GmailAttach]';
  const KEY = 'followup_pending_attachments';
  const MAX_AGE_MS = 5 * 60 * 1000;      // a stale payload must never attach
  const log = (...a) => { try { console.log(TAG, ...a); } catch (e) {} };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getPending() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([KEY], (r) => resolve((r && r[KEY]) || null));
      } catch (e) {
        resolve(null);
      }
    });
  }

  function clearPending() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove([KEY], () => resolve(true));
      } catch (e) {
        resolve(true);
      }
    });
  }

  // base64 -> File. Chunked because a single fromCharCode.apply over a
  // multi-hundred-KB array blows the argument limit.
  function base64ToFile(b64, filename, mimeType) {
    const binary = atob(String(b64 || '').replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: mimeType || mimeFor(filename) });
  }

  function mimeFor(filename) {
    const ext = String(filename || '').toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'doc') return 'application/msword';
    return 'application/octet-stream';
  }

  // The compose dialog. Gmail marks it role="dialog" and it contains the
  // editable body; both together avoid matching other Gmail dialogs.
  function findCompose() {
    for (const d of document.querySelectorAll('div[role="dialog"], div.nH.Hd, div.AD')) {
      try {
        if (!d.offsetParent && getComputedStyle(d).position !== 'fixed') continue;
        if (d.querySelector('[g_editable="true"], div[role="textbox"][contenteditable="true"], textarea[name="to"]')) {
          return d;
        }
      } catch (e) {}
    }
    return null;
  }

  function attachmentCount(compose) {
    try {
      return compose.querySelectorAll(
        '[class*="dL"] [role="listitem"], .aQH > div, [aria-label*="attachment" i], .dL'
      ).length;
    } catch (e) {
      return 0;
    }
  }

  function makeDataTransfer(files) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt;
  }

  // Strategy A: emulate the drag-and-drop Gmail already supports.
  function tryDrop(compose, files) {
    const target = compose.querySelector('[g_editable="true"], div[role="textbox"][contenteditable="true"]') || compose;
    const dt = makeDataTransfer(files);
    const ev = (type) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(ev(type));
    return true;
  }

  // Strategy B: hand the files to the paperclip's hidden file input.
  function tryFileInput(compose, files) {
    const input = compose.querySelector('input[type="file"]')
      || document.querySelector('input[type="file"]');
    if (!input) return false;
    try {
      input.files = makeDataTransfer(files).files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) {
      log('file input strategy failed:', e && e.message);
      return false;
    }
  }

  async function attachInto(compose, files) {
    const before = attachmentCount(compose);

    tryDrop(compose, files);
    for (let i = 0; i < 16; i++) {                 // up to ~4s
      await sleep(250);
      if (attachmentCount(compose) > before) return { ok: true, via: 'drop' };
    }

    if (tryFileInput(compose, files)) {
      for (let i = 0; i < 16; i++) {
        await sleep(250);
        if (attachmentCount(compose) > before) return { ok: true, via: 'file-input' };
      }
    }
    return { ok: false, via: 'none' };
  }

  async function run() {
    const pending = await getPending();
    if (!pending || !Array.isArray(pending.files) || !pending.files.length) return;

    // One-shot and short-lived: an old payload must never attach itself to
    // an unrelated email the user happens to be writing later.
    if (!pending.at || Date.now() - pending.at > MAX_AGE_MS) {
      log('pending attachments expired, discarding');
      await clearPending();
      return;
    }

    // Wait for the compose window this was opened for.
    let compose = null;
    for (let i = 0; i < 40; i++) {                 // up to ~10s
      compose = findCompose();
      if (compose) break;
      await sleep(250);
    }
    if (!compose) { log('no compose window appeared'); return; }

    // Claim the payload BEFORE attaching, so a re-render or a second frame
    // cannot attach the same documents twice.
    await clearPending();

    let files;
    try {
      files = pending.files.map((f) => base64ToFile(f.base64, f.filename, f.mimeType));
    } catch (e) {
      log('could not rebuild files:', e && e.message);
      return;
    }

    await sleep(600);                              // let compose settle
    const res = await attachInto(compose, files);
    log(res.ok ? 'attached ' + files.length + ' file(s) via ' + res.via : 'attach failed');

    try {
      chrome.runtime.sendMessage({
        action: 'JG_GMAIL_ATTACH_RESULT',
        ok: res.ok,
        via: res.via,
        count: files.length,
        names: files.map((f) => f.name),
      });
    } catch (e) {}

    if (!res.ok) {
      // Say so in the page rather than leaving the user to notice a
      // missing attachment after sending.
      try {
        const note = document.createElement('div');
        note.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:2147483647;'
          + 'background:#8a1c1c;color:#fff;padding:10px 14px;border-radius:8px;'
          + 'font:13px system-ui,sans-serif;max-width:340px;box-shadow:0 4px 14px rgba(0,0,0,.4)';
        note.textContent = 'Job Genie could not attach your CV automatically. '
          + 'The files were downloaded, so you can drag them in.';
        document.body.appendChild(note);
        setTimeout(() => note.remove(), 12000);
      } catch (e) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { run(); });
  } else {
    run();
  }

  // Gmail is a SPA: a compose opened later should still pick up a fresh
  // payload written while this page was already loaded.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY] && changes[KEY].newValue) run();
    });
  } catch (e) {}

  log('ready');
})();
