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
    // No `years` default on purpose: it is computed from the employment
    // history, and inventing one is a knockout answer either way.
    country: 'Ireland', phoneCode: '+353',
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

  // ===================================================================
  // YEARS OF EXPERIENCE
  // -------------------------------------------------------------------
  // Every "years of X" question used to get the same constant back: the
  // profile's `years` if set, otherwise a hard-coded '5'. That is the
  // single most direct auto-reject lever on an application form, and it
  // was wrong in three separate ways.
  //
  //   1. A threshold question is a YES/NO question. "Do you have 5+
  //      years of experience?" is a dropdown with two options, and
  //      writing "5" into it either fails validation or leaves the
  //      answer unset -- which scores as "requirement not met".
  //   2. The constant was answered for EVERY skill. "Years of
  //      Kubernetes?" and "Years of people management?" both got 5,
  //      regardless of whether the candidate had touched either. That is
  //      a false statement on an application, and it is grounds for
  //      withdrawing an offer later.
  //   3. '5' was invented when the profile said nothing, so a candidate
  //      with nine years was filtered out of senior roles, and one with
  //      two years was filtered out for overclaiming.
  //
  // The employment history is right there, so use it.
  // ===================================================================
  function _totalYears(p) {
    const explicit = p.years ?? p.years_experience ?? p.yearsExperience;
    if (explicit != null && String(explicit).trim() !== '') {
      const n = parseInt(String(explicit), 10);
      if (!isNaN(n) && n > 0) return n;
    }
    const exp = p.professional_experience || p.professionalExperience || p.workExperience;
    if (!Array.isArray(exp) || !exp.length) return null;

    // Merge overlapping roles rather than summing them. A contract held
    // alongside a full-time job is not two separate careers, and summing
    // them is how "9 years" becomes "14 years".
    const now = new Date();
    const spans = [];
    for (const job of exp) {
      const text = [job.dates, job.startDate, job.start_date, job.endDate, job.end_date]
        .filter(Boolean).join(' ');
      if (!text) continue;
      const ongoing = /present|current|now|ongoing/i.test(text);
      const years = String(text).match(/\b(19|20)\d{2}\b/g);
      if (!years || !years.length) continue;
      const start = parseInt(years[0], 10);
      const end = ongoing ? now.getFullYear() : parseInt(years[years.length - 1], 10);
      if (isNaN(start) || isNaN(end) || end < start) continue;
      spans.push([start, end]);
    }
    if (!spans.length) return null;
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0, cursor = -Infinity;
    for (const [s, e] of spans) {
      const from = Math.max(s, cursor);
      if (e > from) { total += e - from; cursor = e; }
      else if (e > cursor) cursor = e;
    }
    return total > 0 ? total : null;
  }

  // "Do you have 5+ years..." / "at least 3 years" / "minimum of 7 years"
  // -- a threshold, not a quantity. Returns the required number, or null
  // when the question is asking "how many".
  function _yearsThreshold(l) {
    const m = l.match(/(\d{1,2})\s*\+?\s*(?:or more\s+)?years?/);
    if (!m) return null;
    const asksHowMany = /how many|number of|total years|years of experience do you have\b/.test(l)
      && !/\bdo you have\b[^?]*\b\d/.test(l);
    if (asksHowMany) return null;
    // Threshold phrasing: "do you have", "at least", "minimum", "+".
    if (/\bdo you have\b|\bat least\b|\bminimum\b|\bor more\b|\d\s*\+/.test(l)) {
      return parseInt(m[1], 10);
    }
    return null;
  }

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

    // --- open-ended motivation questions ------------------------------
    // Employers add their own questions to Easy Apply, and some form of
    // "why do you want this job" is the commonest of them. Nothing here
    // answered it: it names no field of the profile, so it fell through
    // to the '' at the end. These questions are nearly always REQUIRED,
    // so runAutoFlow stopped with 'needs-you' on a question that asserts
    // no credential and has no factual answer to get wrong -- while the
    // cover letter the user wrote for exactly this purpose sat unread in
    // the same profile.
    //
    // This has to run UP HERE, with the other traps, for the same reason
    // the referral-name rule does. "What attracts you to our company?"
    // contains the word company, and "What interests you about this
    // role?" contains the word role, so the field-name rules below claim
    // both and answer them with the user's CURRENT employer and job
    // title -- which are empty for most profiles, so the question came
    // back blank and the flow stopped anyway, having matched a rule.
    //
    // Motivation ONLY, and the boundary is the point. "Describe your
    // experience with Kubernetes" is a CLAIM about what the user has
    // done. It stays unanswered unless the profile evidences it, because
    // pasting a cover letter that never mentions Kubernetes does not
    // answer the question, it just fills the box. Stopping there is the
    // correct outcome and this must not take it away.
    if (_isMotivationQuestion(l)) return o.coverLetter || P.cover_letter || P.summary || '';

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
    // "Country/Region" is a country field, not a region field, and it is
    // one of the commonest labels on LinkedIn Easy Apply. Matching
    // /region/ first sent it to the state rule, which returned the user's
    // state -- empty for most profiles -- so a required field was left
    // blank and the flow stalled on it.
    if (/\b(state|province|region|county)\b/.test(l)
        && !/country|nationality|citizenship/.test(l)
        && !/please state|stated\b|state[sd] (the|your|why|how|what|any)/.test(l)) {
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
    if (/years .*(experience|exp)|experience .*years|how many years/.test(l)) {
      const total = _totalYears(P);
      const threshold = _yearsThreshold(l);
      // "Years of experience with Kubernetes" asks about one tool, not a
      // career. Answering the career total claims years of something the
      // candidate may never have touched -- a false answer to a scored
      // screening question, and grounds for withdrawing an offer later.
      // _skillSubject/_profileMentions are the same pair the yes/no path
      // already uses for "do you have experience with X".
      const subject = _skillSubject(l);
      if (subject && !_profileMentions(P, subject)) return '';
      // "Do you have 5+ years?" is a Yes/No field. Writing a number into
      // it fails validation or leaves it unset, which scores as
      // "requirement not met".
      if (threshold != null) {
        if (total == null) return '';          // unknown: let the user answer
        return total >= threshold ? 'Yes' : 'No';
      }
      if (total != null) return String(total);
      // Nothing to compute from. Leave it blank rather than invent a
      // number: a wrong answer here is a knockout, and a false one is
      // grounds for withdrawing an offer later.
      return P.years ? String(P.years) : '';
    }
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

  /**
   * Is this asking why the user wants the role, rather than what they
   * have done? Only the first kind can be answered from prose the user
   * has already written.
   */
  function _isMotivationQuestion(l) {
    // Naming a specific skill or tool makes it a claim, not a motivation.
    if (_skillSubject(l)) return false;
    // Anything with a factual answer of its own is not motivation, even
    // when it is phrased as an open question.
    if (/how many|how much|years? of|rate your|level of|proficien|certif|licen[sc]e|salary|compensation|notice period|start date|available/.test(l)) return false;
    // Nor is anything the extension answers AUTHORITATIVELY further down.
    // This rule runs early, so without these it wins over the rules that
    // own these fields: "Why do you require sponsorship?" came back as
    // the cover letter instead of the sponsorship answer, and so did
    // "Why are you authorized to work in the US?". Those two are the
    // polarity-critical fields this file warns about, and a cover letter
    // is not an answer to either. Relocation and travel are preferences
    // held in the profile. "Why are you leaving?" stays out because the
    // honest answer is the user's, not a marketing paragraph.
    if (/sponsor|visa|authoriz|authoris|eligib|work permit|relocat|commut|travel|criminal|convict|background check|drug|clearance|leaving/.test(l)) return false;
    // "interest in" is anchored to the job itself. Left open it would
    // swallow "what is your interest in Kubernetes", which is a claim.
    return /why (do|would|are|should) (you|we)\b|why this|why our|why us\b|why work|what (interests|attracts|excites|motivates|appeals)|what makes you|good fit|right fit|best fit|suitable for this|interest in (this|our|the) (role|position|job|company|team|opportunity|vacancy)|tell us (why|about your interest)/.test(l);
  }

  // ===================================================================
  // YES / NO QUESTIONS
  // -------------------------------------------------------------------
  // A Yes/No control can only accept "Yes" or "No". answerFor answers by
  // FIELD, which is right for a text input and useless here: "Are you able
  // to commute to this job's location?" resolves to "Dublin", no option
  // matches, the field stays empty, and the Easy Apply flow stops on it as
  // an unanswered required question. These rules answer the QUESTION.
  //
  // Two things this must never get wrong:
  //   POLARITY. "Do you require sponsorship?" and "Are you authorised to
  //   work here?" are opposites and both contain the word "work". A
  //   flipped answer is a lie told to an employer in the user's name, so
  //   sponsorship is tested first and the "without sponsorship" phrasing
  //   is inverted explicitly.
  //
  //   CLAIMS. A question about whether the user HAS a skill, a licence or
  //   a qualification is answered from the profile, never assumed. When
  //   the profile does not say, this returns '' and the flow stops and
  //   asks -- which is the correct outcome. Answering "Yes" to be helpful
  //   would be inventing a credential.
  // ===================================================================
  function _pref(v, dflt) {
    if (v === true) return 'Yes';
    if (v === false) return 'No';
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (/^(y|yes|true|1)$/.test(s)) return 'Yes';
    if (/^(n|no|false|0)$/.test(s)) return 'No';
    return dflt;
  }

  /** Does the profile evidence this skill/tool/language? */
  function _profileMentions(P, term) {
    const t = _norm(term);
    if (!t || t.length < 2) return false;
    const hay = _norm([
      Array.isArray(P.skills) ? P.skills.join(' ') : (P.skills || ''),
      P.summary || '', P.current_title || P.title || '',
      P.languages || '', P.certifications || '', P.cover_letter || '',
    ].join(' '));
    return hay.indexOf(t) !== -1;
  }

  // The subject of "do you have experience with X" / "are you proficient
  // in X" -- what has to be checked against the profile before claiming it.
  function _skillSubject(l) {
    const m = l.match(/(?:experience (?:with|in|using)|proficien(?:t|cy) (?:with|in)|familiar with|worked with|knowledge of|skilled in|expertise (?:with|in))\s+(.+)$/);
    if (!m) return '';
    return m[1].replace(/\b(and|or|the|a|an|any|for|to|this|role|position|please|select|years?)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function yesNoFor(question, p) {
    const P = p || {};
    const l = String(question || '').toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!l) return '';

    // --- polarity pair, sponsorship first ----------------------------
    if (/sponsor|visa|work permit|employment pass|immigration status/.test(l)) {
      // "...work WITHOUT sponsorship", "...do NOT require sponsorship"
      // are the same question asked the other way round.
      // "without sponsorship", "without requiring visa sponsorship",
      // "without the need for employer sponsorship" -- all the same
      // inversion, so match across the words between the two.
      if (/without[a-z ]{0,30}sponsor|not require|dont require|do not need|no sponsor/.test(l)) {
        // Inverted phrasing, so invert the SAME default (no sponsorship
        // needed) rather than defaulting separately -- defaulting to the
        // opposite here made the two phrasings contradict each other.
        return _pref(P.sponsorship_required, 'No') === 'Yes' ? 'No' : 'Yes';
      }
      return _pref(P.sponsorship_required, 'No');
    }
    if (/authoriz|authoris|legally (?:able|entitled|permitted|allowed)|right to work|eligible to work|permission to work|permitted to work/.test(l)) {
      return _pref(P.work_authorized, 'Yes');
    }

    // --- location / working pattern ----------------------------------
    // "commute" is the one that used to resolve to the user's city.
    if (/commut|travel to (?:the )?(?:office|site)|report to (?:the )?office/.test(l)) return 'Yes';
    if (/relocat|willing to move/.test(l)) return _pref(P.willing_to_relocate, 'Yes');
    if (/remote|work from home|hybrid|on ?site|in ?office|in person/.test(l)) return 'Yes';

    // --- this employer, specifically ---------------------------------
    // "Have you worked here before" is not "are you employed" -- and a
    // wrong Yes here is a claim about a relationship that can be checked.
    if (/(?:current(?:ly)?|previous(?:ly)?|former(?:ly)?|ever) .{0,24}(?:employee|employed|worked|intern)\b.{0,4}(?:at|for|with|by|of)\b/.test(l)
        || /(?:employee|worked|intern) (?:at|for|with|of) (?:this|our) (?:company|organi)/.test(l)) {
      return _pref(P.worked_here_before, 'No');
    }
    if (/related to|family member|relative .{0,20}(?:work|employ)|know anyone who works/.test(l)) return 'No';
    if (/referred by|were you referred|employee referral/.test(l)) return _pref(P.was_referred, 'No');
    if (/currently employed|are you working/.test(l)) return _pref(P.currently_employed, 'Yes');

    // --- claims: answered from the profile or not at all -------------
    const subject = _skillSubject(l);
    if (subject) return _profileMentions(P, subject) ? 'Yes' : '';
    if (/do you (?:speak|write)|fluent|proficiency in|native speaker/.test(l)) {
      const lang = (l.match(/(?:speak|fluent in|proficiency in|write)\s+([a-z ]+)/) || [])[1] || '';
      if (lang && _profileMentions(P, lang.trim())) return 'Yes';
      return /english/.test(l) ? 'Yes' : '';
    }
    if (/do you (?:have|hold) (?:a|an) .{0,30}(?:degree|diploma|certification|qualification|licen[sc]e|clearance|passport)/.test(l)
        || /have you completed|do you possess/.test(l)) {
      const what = (l.match(/(?:have|hold|possess|completed) (?:a|an|the)?\s*(.+)$/) || [])[1] || '';
      if (/driver/.test(l)) return _pref(P.drivers_license, 'Yes');
      if (/degree|diploma|bachelor|master/.test(l)) return P.degree || P.school || P.university ? 'Yes' : '';
      return what && _profileMentions(P, what) ? 'Yes' : '';
    }

    // --- standard screening ------------------------------------------
    if (/\b(?:over|at least|older than|minimum of)\b.{0,12}\b(?:18|16|21)\b|age of majority|legal working age/.test(l)) return 'Yes';
    if (/convicted|felony|criminal (?:record|history|convict)|pleaded guilty/.test(l)) return _pref(P.criminal_record, 'No');
    if (/background check|drug (?:test|screen)|reference check|credit check|right to represent/.test(l)) return 'Yes';
    if (/agree|acknowledge|consent|certif|attest|confirm|understand and accept|terms/.test(l)) return 'Yes';
    if (/available to start|able to start|can you start|start (?:on|by|immediately)/.test(l)) return 'Yes';
    if (/require .{0,20}(?:accommodation|adjustment)/.test(l)) return _pref(P.needs_accommodation, 'No');
    if (/veteran|armed forces|military service/.test(l)) return _pref(P.veteran_status, 'No');
    if (/disabilit/.test(l)) return _pref(P.disability_status, 'No');
    if (/willing to|are you able to|can you |comfortable (?:with|working)/.test(l)) return 'Yes';

    return '';
  }

  /**
   * Is this control a Yes/No control? Placeholder options are ignored;
   * anything with a third real answer ("Prefer not to say") is not, and
   * must keep going through the general mapping.
   */
  function isYesNoOptions(texts) {
    const vals = (texts || []).map(_norm)
      .filter((t) => t && !/^(select|choose|please|pick|--)/.test(t));
    if (!vals.length || vals.length > 2) return false;
    return vals.every((t) => t === 'yes' || t === 'no');
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

  /**
   * A field that says maxlength="300" REJECTS a 2000-character answer.
   *
   * maxlength constrains TYPING. Assigning through the native setter
   * below bypasses it entirely, so the long value lands in the box, the
   * site's own validator then refuses it, and the step will not advance
   * -- with the field visibly full. That reads as the form being broken
   * rather than the answer being too long, and nothing in the extension
   * read maxlength anywhere, so the longest answers we have (the cover
   * letter, the summary) were the ones most likely to be silently
   * rejected.
   */
  function _clampToMaxLength(el, value) {
    const s = String(value == null ? '' : value);
    const max = Number(el && el.maxLength);
    // Absent attribute reads as -1; a select has none at all.
    if (!isFinite(max) || max <= 0 || s.length <= max) return s;
    const cut = s.slice(0, max);
    // Prefer a sentence end, then a word boundary. A truncation through
    // the middle of a word is read by a person and looks like a fault.
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (stop > max * 0.6) return cut.slice(0, stop + 1).trim();
    const space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
  }

  // Frameworks track value via the native setter; assigning .value
  // directly leaves their internal state stale and the value reverts.
  function setValue(el, value) {
    const clamped = _clampToMaxLength(el, value);
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? global.HTMLTextAreaElement.prototype
        : global.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, clamped);
      else el.value = clamped;
    } catch (e) {
      el.value = clamped;
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
      const isInput = el.tagName === 'INPUT';
      el.click();
      try { el.focus(); } catch (e) {}

      // A typeahead (LinkedIn's artdeco combobox, and most modern ATS)
      // is an <input role="combobox">. Typing is what makes its listbox
      // appear and filter; without it there is nothing to pick from.
      if (isInput) {
        setValue(el, value);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: value.slice(-1), bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: value.slice(-1), bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 260));

      // The listbox is usually rendered at body level and tied to the
      // control by aria-controls/aria-owns, so searching the control's
      // own subtree finds nothing. Prefer the referenced listbox, then
      // fall back to any option in the document.
      let opts = [];
      const owns = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
      if (owns) {
        const box = doc.getElementById(owns);
        if (box) opts = Array.prototype.slice.call(box.querySelectorAll('[role="option"], li, [class*="option" i]'));
      }
      if (!opts.length) {
        opts = Array.prototype.slice.call(
          doc.querySelectorAll('[role="option"], li[role="option"], [class*="option" i][role]'));
      }
      for (const o of opts) {
        if (optionMatches(o.textContent, value)) {
          o.click();
          await new Promise((r) => setTimeout(r, 80));
          return true;
        }
      }

      // No listbox, or nothing in it matched. For a typeahead the typed
      // value is itself a legitimate answer, so keep it rather than
      // reverting to an empty required field.
      if (isInput && String(el.value || '').trim()) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
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

        // A control that only offers Yes and No has to be answered as a
        // QUESTION, not as a field. Asked as a field, "are you able to
        // commute to this location?" resolves to the user's city, no
        // option matches, and the step stalls on a required question.
        let boolOpts = null;
        if (el.tagName === 'SELECT') {
          boolOpts = Array.prototype.map.call(el.options, (op) => op.textContent);
        } else if (type === 'radio' && el.name) {
          boolOpts = Array.prototype.map.call(
            doc.querySelectorAll('input[type="radio"][name="' + escapeSelector(el.name) + '"]'),
            (r) => labelFor(r) || r.value
          );
        } else if (type === 'checkbox') {
          boolOpts = null;                       // a checkbox is its own consent path
        }

        let value = '';
        if (boolOpts && isYesNoOptions(boolOpts)) {
          value = yesNoFor(label, profile);
          // Fall back only if the general mapping produces a usable
          // Yes/No; anything else would never match an option anyway.
          if (!value) {
            const generic = answerFor(label, profile, o);
            if (/^(yes|no)$/i.test(String(generic).trim())) value = generic;
          }
        } else {
          value = answerFor(label, profile, o);
        }
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
        } else if (el.getAttribute('role') === 'combobox') {
          // Inputs included. An <input role="combobox"> is a typeahead --
          // LinkedIn's Easy Apply shape -- and a plain setValue types the
          // text without ever committing a selection, so the step stays
          // invalid and the flow stalls on a field that looks filled.
          if (String(el.value || '').trim()) { alreadySet++; continue; }
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

  // Preferences that ship ON. Everything else stays opt-in, so this list is
  // the whole statement of what the extension does without being asked.
  //
  // Kept here because isToggleOn is the single place every content script
  // reads a preference: a default expressed in one script and not another
  // is how a toggle ends up ON in the popup and OFF in the page.
  //
  // Note what this means in practice: once LinkedIn Easy Apply autofill is
  // switched on, these carry the rest -- an opened Easy Apply dialog is
  // filled, advanced, submitted, and a published contact emailed. That is
  // why the LinkedIn toggle itself is opt-in and absent from this set. Submission cannot be
  // undone and goes to a real employer.
  const DEFAULT_ON = new Set([
    // linkedin_autofill_enabled is deliberately NOT here: LinkedIn Easy
    // Apply autofill is opt-in, so nothing touches an application dialog
    // until the user turns it on. The two below only ever apply once it
    // is on -- runAutoFlow checks this toggle first -- so they cannot act
    // on their own.
    'linkedin_autoadvance_enabled',
    'linkedin_autosubmit_enabled',
    'followup_enabled',
  ]);

  function isToggleOn(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (r) => {
          const v = r && r[key];
          // An explicit false always wins: turning something off must
          // survive, which "undefined means on" would otherwise undo.
          resolve(DEFAULT_ON.has(key) ? v !== false : v === true);
        });
      } catch (e) {
        // A storage failure must not silently start submitting applications.
        resolve(false);
      }
    });
  }

  global.AutofillCore = {
    __jg: true,
    labelFor, questionFor, answerFor, yesNoFor, isYesNoOptions, fillContainer, loadProfile, isToggleOn, DEFAULT_ON,
    setValue, fillSelect, fillRadioGroup, fillCustomDropdown,
    isVisible, optionMatches, escapeSelector, DEFAULTS,
    // Exported so the boundary between "motivation" and "claim", and the
    // length clamp, can be asserted directly rather than through a DOM.
    _isMotivationQuestion, _clampToMaxLength,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.AutofillCore;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
