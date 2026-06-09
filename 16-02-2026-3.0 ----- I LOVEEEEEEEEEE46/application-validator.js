/**
 * Job Genie - Application Completeness Validator
 *
 * Original implementation (no third-party code). Inspired by the
 * "mandatory field" concept common to job auto-appliers: an incomplete
 * application is the #1 silent killer of a submission -- ATS forms reject
 * or fail to submit when a required field is empty, and the candidate
 * never finds out why.
 *
 * This module is READ-ONLY with respect to form data: it inspects the
 * current page's form, finds REQUIRED fields that are still empty, and
 * reports them. It never fills, never submits, never clicks. That keeps
 * it completely decoupled from the tailoring + autofill pipelines, so it
 * cannot cause a regression there.
 *
 * Public API (window.ApplicationValidator):
 *   checkRequiredFields()  -> { complete, missing: [{label, type}], total, filled }
 *   summarise(report)      -> short human string for a banner/toast
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Validator]';

  // ---- visibility: a field the user can't see shouldn't be flagged ----
  function _isVisible(el) {
    if (!el) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.type === 'hidden') return false;
    // offsetParent is null for display:none (except position:fixed, handled below)
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  // ---- is this field required? Check the many ways ATS platforms mark it ----
  function _isRequired(el) {
    if (el.required) return true;
    if (el.getAttribute('aria-required') === 'true') return true;
    if (el.getAttribute('data-required') === 'true') return true;
    // Asterisk in the associated label is the most common visual convention.
    const label = _findLabel(el);
    if (label && /[*＊]/.test(label)) return true;
    // Greenhouse / Workday / Lever class conventions.
    const cls = (el.className || '') + ' ' + ((el.closest('[class]') || {}).className || '');
    if (/\brequired\b/i.test(cls)) return true;
    return false;
  }

  // ---- resolve a human-readable label for a field ----
  function _findLabel(el) {
    // 1. <label for="id">
    if (el.id) {
      const lbl = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl && lbl.textContent.trim()) return lbl.textContent.trim();
    }
    // 2. wrapping <label>
    const wrap = el.closest('label');
    if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
    // 3. aria-label / aria-labelledby
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = el.ownerDocument.getElementById(labelledBy);
      if (ref && ref.textContent.trim()) return ref.textContent.trim();
    }
    // 4. preceding label-ish element
    const prev = el.previousElementSibling;
    if (prev && /label|span|div|p/i.test(prev.tagName) && prev.textContent.trim()) {
      return prev.textContent.trim().slice(0, 80);
    }
    // 5. placeholder / name as last resort
    return (el.getAttribute('placeholder') || el.name || el.id || 'Unnamed field').trim();
  }

  // ---- is this field empty / unfilled? ----
  function _isEmpty(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      // empty when no option selected or the selected option has no value
      const opt = el.options[el.selectedIndex];
      return !opt || opt.value === '' || /select|choose|--/i.test(opt.textContent || '');
    }
    if (el.type === 'checkbox' || el.type === 'radio') {
      // for a required radio/checkbox GROUP, check if any in the group is checked
      const name = el.name;
      if (name) {
        const group = el.ownerDocument.querySelectorAll(
          `input[name="${CSS.escape(name)}"]`
        );
        return ![...group].some((g) => g.checked);
      }
      return !el.checked;
    }
    if (el.type === 'file') {
      return !el.files || el.files.length === 0;
    }
    return !String(el.value || '').trim();
  }

  function checkRequiredFields(root) {
    const doc = root || document;
    const fields = [...doc.querySelectorAll('input, select, textarea')];
    const seenRadioGroups = new Set();
    let total = 0;
    let filled = 0;
    const missing = [];

    for (const el of fields) {
      // de-dupe radio/checkbox groups by name
      if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
        if (seenRadioGroups.has(el.name)) continue;
        seenRadioGroups.add(el.name);
      }
      if (!_isVisible(el)) continue;
      if (!_isRequired(el)) continue;
      total++;
      if (_isEmpty(el)) {
        missing.push({
          label: _findLabel(el).replace(/\s*[*＊]\s*$/, '').slice(0, 80),
          type: el.type || el.tagName.toLowerCase(),
        });
      } else {
        filled++;
      }
    }

    return {
      complete: missing.length === 0 && total > 0,
      hasForm: total > 0,
      total,
      filled,
      missing,
    };
  }

  function summarise(report) {
    if (!report || !report.hasForm) return '';
    if (report.complete) {
      return `✅ All ${report.total} required fields complete — ready to submit.`;
    }
    const names = report.missing.slice(0, 5).map((m) => m.label).join(', ');
    const more = report.missing.length > 5 ? ` +${report.missing.length - 5} more` : '';
    return `⚠️ ${report.missing.length} required field(s) still empty: ${names}${more}`;
  }

  global.ApplicationValidator = { checkRequiredFields, summarise };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.ApplicationValidator;
  }
  console.log(TAG, 'loaded');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
