/**
 * Job Genie - Apply Verdict (pre-submission go/no-go)
 *
 * WHY THIS EXISTS
 * ---------------
 * The pipeline already computes a genuine qualification match, then
 * auto-injects gap-closing keywords to lift the score. That inflated
 * score was the only number the user ever saw -- and the honest
 * pre-tailoring fit was discarded. So an application with hard,
 * unfixable blockers (JD wants 8 years, CV shows 3) looked "100% match"
 * right up until the rejection.
 *
 * This module answers the question the user actually has:
 *   "Is this application worth sending, and what really blocks me?"
 *
 * It grades on GENUINE fit (pre-injection) and, above all, surfaces
 * KNOCKOUTS -- the criteria recruiters and ATS filters hard-filter on:
 *   * years of experience below the JD's stated minimum
 *   * unmet REQUIRED hard qualifications (degree, certification, core skill)
 * Keyword injection cannot fix a knockout; only a different application
 * or genuinely new experience can. Saying so plainly is the point.
 *
 * Pure logic, no DOM, no network. Never blocks an application -- it
 * informs. The user decides.
 */
(function (global) {
  'use strict';

  // Qualification types that function as hard filters. A missing
  // "soft_skill" rarely rejects anyone; a missing degree or a years
  // shortfall routinely does.
  const KNOCKOUT_TYPES = new Set([
    'experience_years', 'education', 'certification', 'technical_skill',
  ]);

  const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?\s*(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|hands[- ]on\s+)?(?:experience|background)/i;

  // ---- Years of experience --------------------------------------------
  // JD side: the LARGEST stated minimum is the real bar ("3+ years" in a
  // nice-to-have line and "8+ years" in requirements -> the bar is 8).
  function extractRequiredYears(jdText) {
    if (!jdText) return null;
    const re = new RegExp(YEARS_RE.source, 'gi');
    let m;
    let max = null;
    while ((m = re.exec(String(jdText))) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0 && n <= 40) max = max === null ? n : Math.max(max, n);
    }
    return max;
  }

  // CV side: prefer an explicit claim ("over 5 years of experience"); fall
  // back to the span between the earliest and latest years present, which
  // approximates career length without over-claiming.
  function extractCandidateYears(cvText) {
    if (!cvText) return null;
    const text = String(cvText);
    const explicit = text.match(new RegExp(YEARS_RE.source, 'i'));
    if (explicit) {
      const n = parseInt(explicit[1], 10);
      if (!isNaN(n) && n > 0 && n <= 40) return n;
    }
    const yearMatches = text.match(/\b(19[89]\d|20[0-4]\d)\b/g);
    if (yearMatches && yearMatches.length >= 2) {
      const years = yearMatches.map(Number);
      const earliest = Math.min.apply(null, years);
      const nowYear = new Date().getFullYear();
      const span = nowYear - earliest;
      if (span > 0 && span <= 40) return span;
    }
    return null;
  }

  /**
   * @param {object} o
   * @param {object} o.thresholdResult  autoTailorForThreshold(...) output
   * @param {string} o.jdText           raw job description
   * @param {string} o.originalCV       the user's GENUINE CV text (pre-tailoring)
   * @returns {{verdict,label,score,blockers,gaps,summary,advice}}
   */
  function evaluate({ thresholdResult = null, jdText = '', originalCV = '' } = {}) {
    const blockers = [];   // hard filters -- keyword tailoring cannot fix
    const gaps = [];       // soft gaps -- worth strengthening

    // 1. GENUINE fit score: the pre-injection number, never the inflated one.
    let score = null;
    if (thresholdResult && typeof thresholdResult.initialScore === 'number') {
      score = Math.round(thresholdResult.initialScore);
    }

    // 2. Years-of-experience knockout -- the most common silent rejection.
    const requiredYears = extractRequiredYears(jdText);
    const candidateYears = extractCandidateYears(originalCV);
    if (requiredYears !== null && candidateYears !== null && candidateYears + 1 < requiredYears) {
      blockers.push({
        kind: 'years',
        text: `JD asks for ${requiredYears}+ years; your CV evidences about ${candidateYears}. ` +
          `This is a hard filter on most ATS screens — tailoring cannot close it.`,
      });
    }

    // 3. Unmet REQUIRED qualifications, split by knockout vs soft gap.
    const breakdown = (thresholdResult && thresholdResult.matchResults &&
      thresholdResult.matchResults.qualificationBreakdown) || [];
    for (const q of breakdown) {
      if (q.met || q.type !== 'required') continue;
      const label = String(q.qualification || '').replace(/\s+/g, ' ').trim().slice(0, 110);
      if (!label) continue;
      if (KNOCKOUT_TYPES.has(q.qualType) && (q.confidence || 0) < 0.25) {
        blockers.push({ kind: q.qualType, text: label });
      } else {
        gaps.push(label);
      }
    }

    // 4. Verdict. Blockers dominate: a single hard filter sinks an
    //    otherwise-strong application, which is exactly the information
    //    the user needs BEFORE spending an hour on it.
    const hardBlockers = blockers.length;
    let verdict;
    if (hardBlockers >= 2 || (hardBlockers === 1 && score !== null && score < 55)) {
      verdict = 'unlikely';
    } else if (hardBlockers === 1 || (score !== null && score < 55)) {
      verdict = 'stretch';
    } else {
      verdict = 'strong';
    }

    const LABELS = {
      strong: '🟢 Strong match — worth applying',
      stretch: '🟡 Stretch — apply, but expect long odds',
      unlikely: '🔴 Likely auto-rejected — spend your time elsewhere',
    };

    const ADVICE = {
      strong: 'Genuine fit. Make sure your project links load and your bullets carry real numbers.',
      stretch: 'Apply if you want it, but treat it as a long shot — prioritise roles without a hard blocker.',
      unlikely: 'The blocker(s) below are hard filters that CV wording cannot fix. A closer-matched role is a better use of this hour.',
    };

    const parts = [];
    if (score !== null) parts.push(`Genuine fit ${score}% (before keyword tailoring)`);
    if (hardBlockers) parts.push(`${hardBlockers} hard blocker${hardBlockers > 1 ? 's' : ''}`);
    if (gaps.length) parts.push(`${gaps.length} soft gap${gaps.length > 1 ? 's' : ''}`);

    return {
      verdict,
      label: LABELS[verdict],
      score,
      requiredYears,
      candidateYears,
      blockers: blockers.slice(0, 4),
      gaps: gaps.slice(0, 4),
      summary: parts.join(' · '),
      advice: ADVICE[verdict],
    };
  }

  const ApplyVerdict = { evaluate, extractRequiredYears, extractCandidateYears };
  global.ApplyVerdict = ApplyVerdict;
  if (typeof module !== 'undefined' && module.exports) module.exports = ApplyVerdict;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
