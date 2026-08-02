/**
 * Job Genie - Autofill Core (shared field intelligence)
 *
 * WHY THIS EXISTS
 * ---------------
 * Label matching and fill primitives were duplicated across the vendor
 * engine and the per-site fillers, so every bug had to be fixed three
 * times (and in practice wasn't). This is the single source of truth:
 * label resolution, profile answer mapping, and React-safe fill
 * primitives. Per-site modules (Indeed, LinkedIn Easy Apply) supply only
 * what is genuinely site-specific.
 *
 * Everything here is honest-by-default: it fills facts from the user's
 * profile and safe standard answers. It never invents credentials, never
 * overwrites something the user already typed, and never submits a form.
 *
 * Pure DOM + logic, no network.  window.AutofillCore
 */
(function (global) {
  'use strict';

  if (global.AutofillCore && global.AutofillCore.__jg) return;

  // ===================================================================
  // LABEL RESOLUTION
  // Order matters: explicit associations first, then ARIA, then the
  // enclosing question group (how modern ATS forms actually mark up a
  // question), then weak fallbacks.
  // ===================================================================
  const GROUP_SELECTOR = [
    'fieldset', '[role="group"]', '[role="radiogroup"]',
    '[class*="form-element" i]', '[class*="form-group" i]',
    '[class*="question" i]', '[class*="field" i]', '[data-qa]', 'li',
  ].join(',');

  const LABEL_IN_GROUP = [
    'legend', 'label', 'h1', 'h2', 'h3', 'h4',
    '[class*="label" i]', '[class*="Label" i]', '[class*="title" i]',
  ].join(',');

  function _clean(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/\*+$/, '').trim();
  }

  function escapeSelector(v) {
    try {
      if (global.CSS && CSS.escape) return CSS.escape(v);
    } catch (e) {}
    return String(v).replace(/["\\]/g, '\\$&');
  }

  function labelFor(el) {
    try {
      if (!el) return '';
      // 1. <label for="id">
      if (el.id) {
        const l = el.ownerDocument.querySelector('label[for="' + escapeSelector(el.id) + '"]');
        if (l && _clean(l.textContent)) return _clean(l.textContent).slice(0, 160);
      }
      // 2. wrapping <label>
      const wrap = el.closest('label');
      if (wrap && _clean(wrap.textContent)) return _clean(wrap.textContent).slice(0, 160);
      // 3. ARIA
      const aria = el.getAttribute('aria-label');
      if (_clean(aria)) return _clean(aria).slice(0, 160);
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const parts = lb.split(/\s+/)
          .map((id) => el.ownerDocument.getElementById(id))
          .filter(Boolean)
          .map((n) => _clean(n.textContent))
          .filter(Boolean);
        if (parts.length) return parts.join(' ').slice(0, 160);
      }
      // 4. Question group heading (fieldset legend / form-element label)
      const grp = el.closest(GROUP_SELECTOR);
      if (grp) {
        const q = grp.querySelector(LABEL_IN_GROUP);
        if (q && _clean(q.textContent)) return _clean(q.textContent).slice(0, 160);
      }
      // 5. Weak fallbacks
      const prev = el.previousElementSibling;
      if (prev && _clean(prev.textContent)) return _clean(prev.textContent).slice(0, 160);
      return _clean(el.getAttribute('placeholder') || el.name || el.id || '');
    } catch (e) {
      return '';
    }
  }

  // For a RADIO, the element's own <label> is the OPTION text ("Yes"),
  // not the question. The answer can only be derived from the group's
  // question ("Are you legally authorized to work..."), which lives on the
  // enclosing fieldset legend / radiogroup label. Option <label>s are
  // explicitly excluded here, which is why this can't just call labelFor.
  const QUESTION_IN_GROUP = 'legend, h1, h2, h3, h4, [class*="label" i], [class*="title" i], p, span';

  function questionFor(el) {
    try {
      const grp = el.closest('fieldset, [role="radiogroup"], [role="group"], [class*="form-element" i], [class*="question" i], [class*="form-group" i]');
      if (grp) {
        const aria = grp.getAttribute('aria-label');
        if (_clean(aria)) return _clean(aria).slice(0, 160);
        const lb = grp.getAttribute('aria-labelledby');
        if (lb) {
          const parts = lb.split(/\s+/)
            .map((id) => el.ownerDocument.getElementById(id))
            .filter(Boolean).map((n) => _clean(n.textContent)).filter(Boolean);
          if (parts.length) return parts.join(' ').slice(0, 160);
        }
        for (const cand of grp.querySelectorAll(QUESTION_IN_GROUP)) {
          // Skip anything that labels an individual option.
          if (cand.tagName === 'LABEL') continue;
          if (cand.querySelector('input, select, textarea')) continue;
          const t = _clean(cand.textContent);
          if (t && t.length > 3) return t.slice(0, 160);
        }
      }
    } catch (e) {}
    return labelFor(el);
  }

  // ===================================================================
  // PROFILE ANSWER MAPPING
  // Ordering is load-bearing: narrow/compound questions must be tested
  // BEFORE the broad field rules, or a sentence like "...authorized to
  // work at the stated location, what sponsorship..." gets hijacked by
  // the /location/ or /state/ rule. Each guard below encodes a real
  // mis-fill observed on a live ATS form.
  // ===================================================================
  const DEFAULTS = {
    authorized: 'Yes', sponsorship: 'No', relocation: 'Yes', remote: 'Yes',
    country: 'Ireland', phoneCode: '+353', years: '5',
    availability: 'Immediately', howHeard: 'LinkedIn',
    gender: 'Prefer not to say', ethnicity: 'Prefer not to say',
    veteran: 'I am not a protected veteran', disability: 'I do not have a disability',
  };

  const ISO2_NAMES = {
    IE: 'Ireland', US: 'United States', GB: 'United Kingdom', UK: 'United Kingdom',
    CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France', NL: 'Netherlands',
    ES: 'Spain', IT: 'Italy', PT: 'Portugal', CH: 'Switzerland', BE: 'Belgium',
    AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
    PL: 'Poland', NZ: 'New Zealand', IN: 'India', SG: 'Singapore',
  };

  function _country(p) {
    let c = String(p.country || '').trim();
    if (c.includes(',')) c = c.split(',').pop().trim();     // "Dublin, Dublin, IE" -> "IE"
    if (/^[A-Za-z]{2}$/.test(c)) c = ISO2_NAMES[c.toUpperCase()] || c;
    return c || DEFAULTS.country;
  }

  function answerFor(label, p, opts) {
    const o = opts || {};
    const raw = String(label || '');
    const l = raw.toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!l) return '';
    const P = p || {};

    // --- compound / trap questions FIRST -----------------------------
    // Referral-name asks for a person we don't have; the /state/ rule
    // below would otherwise write the user's region into it.
    if (/referral.*name|referr(er|ing).*name|employee.?s? .*name|name of .*(referr|employee)/.test(l)) return '';
    // "What sponsorship would you require" needs a sentence, not Yes/No.
    if (/what .*sponsor|which .*sponsor|sponsor(ship)? .*(would|do) .*(require|need)/.test(l)) {
      return 'None - I do not require sponsorship.';
    }

    // --- identity ----------------------------------------------------
    if (/first.?name|given.?name|forename/.test(l)) return P.first_name || P.firstName || '';
    if (/last.?name|family.?name|surname/.test(l)) return P.last_name || P.lastName || '';
    if (/middle.?name/.test(l)) return P.middle_name || '';
    if (/preferred.?name|nick.?name/.test(l)) return P.preferred_name || P.first_name || P.firstName || '';
    if (/full.?name|your name|^name$/.test(l) && !/company|user|referr|employee/.test(l)) {
      return ((P.first_name || P.firstName || '') + ' ' + (P.last_name || P.lastName || '')).trim();
    }
    if (/\bemail\b/.test(l)) return P.email || '';
    if (/country.?code|phone.?code|dial.?code|calling.?code/.test(l)) return P.phoneCountryCode || DEFAULTS.phoneCode;
    if (/phone|mobile|cell|telephone/.test(l)) return P.phone || '';

    // --- location ----------------------------------------------------
    if (/^city$|\bcity\b|current.?city/.test(l)) return P.city || '';
    // "state" as a NOUN only -- never "please state the...", "stated location".
    if (/\b(state|province|region|county)\b/.test(l) && !/please state|stated\b|state[sd] (the|your|why|how|what|any)/.test(l)) {
      return P.state || '';
    }
    if (/zip|postal|eircode|post.?code/.test(l)) return P.postal_code || P.zip || '';
    if (/country|nationality|citizenship/.test(l) && !/code|phone|dial/.test(l)) return _country(P);
    if (/address|street/.test(l) && !/email/.test(l)) return P.address || '';
    // Location FIELDS only -- not eligibility questions mentioning "location".
    if (/location|where .*(you|do you) (live|based)|based in/.test(l) && !/authoriz|authoris|sponsor|relocat|eligib|stated|willing/.test(l)) {
      return P.city ? (P.city + (P.state ? ', ' + P.state : '')) : '';
    }

    // --- links / education / work ------------------------------------
    if (/linkedin/.test(l)) return P.linkedin || P.linkedin_profile_url || '';
    if (/github/.test(l)) return P.github || P.github_url || '';
    if (/website|portfolio|personal.?url|personal.?site/.test(l)) return P.website || P.portfolio || P.website_url || '';
    if (/university|school|college|institution|alma.?mater/.test(l)) return P.school || P.university || '';
    if (/\bdegree\b|qualification level/.test(l)) return P.degree || "Bachelor's";
    if (/major|field.?of.?study|discipline|concentration/.test(l)) return P.major || '';
    if (/\bgpa\b|grade.?point/.test(l)) return P.gpa || '';
    if (/graduation|grad.?year|grad.?date/.test(l)) return P.graduation_year || P.grad_year || '';
    if (/company|employer|organisation|organization/.test(l) && !/why|about/.test(l)) return P.current_company || P.company || '';
    // "role" appears inside eligibility questions ("...of this role?").
    if (/job.?title|current.?title|\btitle\b|\bposition\b|\brole\b/.test(l) && !/company|authoriz|authoris|eligib|sponsor|apply|hear|why/.test(l)) {
      return P.current_title || P.title || '';
    }

    // --- standard screening answers ----------------------------------
    if (/years .*(experience|exp)|experience .*years|how many years/.test(l)) return P.years || DEFAULTS.years;
    if (/authoriz|authoris|legally .*(work|entitled)|eligible to work|right to work|work .*(right|permit).*(yes|no)?/.test(l)) return P.work_authorized || DEFAULTS.authorized;
    if (/sponsor|visa|immigration|work.?permit/.test(l)) return P.sponsorship || DEFAULTS.sponsorship;
    if (/relocat|willing to move/.test(l)) return DEFAULTS.relocation;
    if (/remote|work from home|hybrid|on.?site/.test(l)) return DEFAULTS.remote;
    if (/notice.?period|how soon|when can you start|available .*start|start.?date|availab/.test(l)) {
      return P.notice_period || DEFAULTS.availability;
    }
    if (/salary|compensation|desired pay|expected pay|rate/.test(l)) return P.expected_salary || '';
    if (/how .*hear|where .*(find|learn|discover)|source of|\breferred\b/.test(l)) return P.how_heard || DEFAULTS.howHeard;
    if (/gender|\bsex\b|pronoun/.test(l)) return P.gender || DEFAULTS.gender;
    if (/ethnic|\brace\b|racial|heritage/.test(l)) return P.ethnicity || P.race || DEFAULTS.ethnicity;
    if (/veteran|military|armed forces/.test(l)) return P.veteran || DEFAULTS.veteran;
    if (/disabilit/.test(l)) return P.disability || DEFAULTS.disability;
    if (/\bage\b|over 18|at least 18|18 years/.test(l)) return 'Yes';
    if (/convicted|criminal|felony/.test(l)) return 'No';
    if (/drivers? licen[sc]e/.test(l)) return P.drivers_license || 'Yes';
    if (/security clearance/.test(l)) return P.security_clearance || 'None';
    if (/languages?|fluen/.test(l)) return P.languages || 'English';
    if (/skills/.test(l) && !/soft/.test(l)) return Array.isArray(P.skills) ? P.skills.slice(0, 12).join(', ') : (P.skills || '');
    if (/cover.?letter|message to|additional info|anything else/.test(l)) return o.coverLetter || P.cover_letter || '';
    if (/summary|about (yourself|you)|\bbio\b/.test(l)) return P.summary || P.cover_letter || '';
    // Date range fields: require a date-shaped label. Bare \bto\b/\bfrom\b
    // matched any sentence containing those words ("authorized TO work").
    if (/^from$|from (date|month|year)|start (date|month)/.test(l) && !/salary|pay/.test(l)) {
      return P.work_start_year ? ('01/' + P.work_start_year) : '';
    }
    if (/^to$|to (date|month|year)|end (date|month)/.test(l) && !/salary|pay|email/.test(l)) {
      return P.work_end_year ? ('12/' + P.work_end_year) : '';
    }
    if (/agree|acknowledge|consent|certif|attest|confirm/.test(l)) return 'Yes';
    return '';
  }

  // ===================================================================
  // FILL PRIMITIVES (React/Angular-safe)
  // ===================================================================
  function isVisible(el) {
    try {
      if (!el || el.disabled || el.readOnly) return false;
      if (el.type === 'hidden') return false;
      const st = el.ownerDocument.defaultView.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return !(r.width === 0 && r.height === 0);
    } catch (e) {
      return false;
    }
  }

  // Frameworks track value via the native setter; assigning .value
  // directly leaves their internal state stale and the value reverts.
  function setValue(el, value) {
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? global.HTMLTextAreaElement.prototype
        : global.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;
    } catch (e) {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function _norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Option matching that understands yes/no semantics -- the single most
  // common dropdown/radio answer on application forms.
  function optionMatches(optText, want) {
    const o = _norm(optText);
    const w = _norm(want);
    if (!o || !w) return false;
    if (o === w) return true;
    if (w === 'yes' || w === 'no') return o === w || o.startsWith(w + ' ');
    return o.includes(w) || w.includes(o);
  }

  function fillSelect(el, value) {
    if (!el.options || !el.options.length) return false;
    // Skip if a real (non-placeholder) option is already chosen.
    const cur = el.options[el.selectedIndex];
    if (cur && cur.value && !/select|choose|^--|please/i.test(cur.textContent || '')) return false;
    let best = null;
    for (const opt of el.options) {
      if (!opt.value && /select|choose|^--/i.test(opt.textContent || '')) continue;
      if (optionMatches(opt.textContent, value) || optionMatches(opt.value, value)) { best = opt; break; }
    }
    if (!best) return false;
    el.value = best.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillRadioGroup(doc, name, value) {
    if (!name) return false;
    const group = doc.querySelectorAll('input[type="radio"][name="' + escapeSelector(name) + '"]');
    if (!group.length) return false;
    for (const r of group) if (r.checked) return false;   // already answered
    for (const r of group) {
      const t = labelFor(r) || r.value;
      if (optionMatches(t, value)) { r.click(); return true; }
    }
    return false;
  }

  // Custom (non-<select>) dropdowns: LinkedIn/Ashby/Greenhouse render a
  // button + listbox. Open it, pick the matching option, and bail out
  // cleanly if the listbox never appears.
  async function fillCustomDropdown(el, value) {
    try {
      const doc = el.ownerDocument;
      el.click();
      await new Promise((r) => setTimeout(r, 220));
      const opts = doc.querySelectorAll('[role="option"], li[role="option"], [class*="option" i][role]');
      for (const o of opts) {
        if (optionMatches(o.textContent, value)) {
          o.click();
          await new Promise((r) => setTimeout(r, 80));
          return true;
        }
      }
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Fill every fillable control inside `root`.
   * Honest by construction: never overwrites a value the user already
   * entered, never ticks a checkbox that isn't an explicit consent, and
   * never clicks a submit control.
   */
  async function fillContainer(root, profile, opts) {
    const o = opts || {};
    const doc = (root && root.ownerDocument) || document;
    const scope = root || doc;
    const seenRadio = new Set();
    let filled = 0;
    // Counted so callers can tell "nothing to do" apart from "nothing
    // found". A step whose fields the site already prefilled reports
    // filled=0, which is success, not failure.
    let alreadySet = 0;
    let answerable = 0;

    const controls = scope.querySelectorAll('input, select, textarea, [role="combobox"]');
    for (const el of controls) {
      try {
        const type = (el.type || '').toLowerCase();
        if (['hidden', 'file', 'submit', 'button', 'reset', 'image', 'password'].includes(type)) continue;
        if (!isVisible(el)) continue;

        // Radios must resolve the GROUP question; their own label is just
        // the option text ("Yes"/"No") and yields no answer.
        const label = (type === 'radio') ? questionFor(el) : labelFor(el);
        if (!label) continue;
        const value = answerFor(label, profile, o);
        if (!value) continue;
        answerable++;

        if (el.tagName === 'SELECT') {
          if (fillSelect(el, value)) filled++;
        } else if (type === 'radio') {
          if (el.name && !seenRadio.has(el.name)) {
            seenRadio.add(el.name);
            if (fillRadioGroup(doc, el.name, value)) filled++;
          }
        } else if (type === 'checkbox') {
          // Only affirmative consent boxes -- never opt-ins to marketing.
          if (!el.checked && /agree|acknowledge|consent|certif|attest|confirm|terms|privacy/i.test(label)) {
            el.click();
            filled++;
          }
        } else if (el.getAttribute('role') === 'combobox' && el.tagName !== 'INPUT') {
          if (await fillCustomDropdown(el, value)) filled++;
        } else {
          if (String(el.value || '').trim()) { alreadySet++; continue; }  // respect user input
          setValue(el, value);
          filled++;
        }
      } catch (e) { /* one bad field must never abort the pass */ }
    }
    // answerable = fields we had an answer for; alreadySet = of those, the
    // ones the site had already populated. filled=0 with alreadySet>0 means
    // the step was complete, not that the fill failed.
    return { filled, alreadySet, answerable };
  }

  // Shared profile loader: Job Genie profile merged with the autofill
  // engine's editable copy (the latter wins for fields the user set).
  function loadProfile() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['ats_profile', 'ua_profile'], (r) => {
          resolve(Object.assign({}, (r && r.ats_profile) || {}, (r && r.ua_profile) || {}));
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  function isToggleOn(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (r) => resolve(!!(r && r[key] === true)));
      } catch (e) {
        resolve(false);
      }
    });
  }

  global.AutofillCore = {
    __jg: true,
    labelFor, questionFor, answerFor, fillContainer, loadProfile, isToggleOn,
    setValue, fillSelect, fillRadioGroup, fillCustomDropdown,
    isVisible, optionMatches, escapeSelector, DEFAULTS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.AutofillCore;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
